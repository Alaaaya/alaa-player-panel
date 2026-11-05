-- PROPOSAL v2.1, LOCAL PREVIEW ONLY. NO LIVE DEPLOY AUTHORIZATION.
-- Requires current secure v2 schema. Only admin delta RPC writes settings.
begin;
alter table public.playlists add column category_provider_generation uuid not null default gen_random_uuid();
alter table public.playlists add constraint playlists_id_device_unique unique(id,device_id);
create table public.device_category_settings (
 device_id uuid not null references public.devices(id) on delete cascade,
 playlist_id uuid primary key,
 hidden_category_ids jsonb not null default '{"live":[],"vod":[],"series":[]}',
 category_versions jsonb not null default '{"live":{},"vod":{},"series":{}}',
 foreign key(playlist_id,device_id) references public.playlists(id,device_id) on delete cascade
);
alter table public.device_category_settings enable row level security;
revoke all on public.device_category_settings from public,anon,authenticated;
grant select on public.device_category_settings to authenticated;
create policy admin_category_read on public.device_category_settings for select to authenticated using (public.is_admin());
-- Category IDs are stable only within one provider subscription. Never carry an
-- old device/provider's hidden IDs into a reassigned or replaced subscription.
create function device_private.clear_category_settings_on_provider_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if row(old.device_id,old.type,old.server,old.username,old.password,old.url) is distinct from row(new.device_id,new.type,new.server,new.username,new.password,new.url) then
  delete from public.device_category_settings where playlist_id=old.id;
  new.category_provider_generation := gen_random_uuid();
 else
  new.category_provider_generation := old.category_provider_generation;
 end if;
 return new;
end $$;
revoke all on function device_private.clear_category_settings_on_provider_change() from public,anon,authenticated;
create trigger clear_category_settings_on_provider_change before update on public.playlists for each row execute function device_private.clear_category_settings_on_provider_change();
-- NO direct INSERT/UPDATE grants: even admin clients must use an atomic leaf delta.
create function public.admin_set_category_hidden(p_device_id uuid,p_playlist_id uuid,p_media_type text,p_category_id text,p_hidden boolean,p_expected_version bigint,p_provider_generation uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare ids jsonb; v bigint; old boolean; row public.device_category_settings; generation uuid;
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_media_type is null or p_media_type not in ('live','vod','series') or p_category_id is null or p_category_id !~ '^[0-9]{1,64}$' or p_hidden is null or p_expected_version is null or p_expected_version<0 then return jsonb_build_object('status','invalid'); end if;
 -- Same parent-first order as save/delete RPCs. Lock ensures affiliation cannot change.
 perform 1 from public.devices where id=p_device_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select category_provider_generation into generation from public.playlists where id=p_playlist_id and device_id=p_device_id and type='xtream' for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p_provider_generation is null or generation<>p_provider_generation then return jsonb_build_object('status','provider_changed'); end if;
 insert into public.device_category_settings(device_id,playlist_id) values(p_device_id,p_playlist_id) on conflict do nothing;
 select * into row from public.device_category_settings where playlist_id=p_playlist_id and device_id=p_device_id for update;
 ids := row.hidden_category_ids->p_media_type;
 if not (row.category_versions->p_media_type ? p_category_id) and (select count(*) from jsonb_object_keys(row.category_versions->p_media_type))>=10000 then return jsonb_build_object('status','limit_reached'); end if;
 v := coalesce((row.category_versions->p_media_type->>p_category_id)::bigint,0);
 old := ids ? p_category_id;
 if v <> p_expected_version then return jsonb_build_object('status','conflict','hidden',old,'version',v); end if;
 if old is distinct from p_hidden then
  if p_hidden and jsonb_array_length(ids)>=10000 then return jsonb_build_object('status','limit_reached'); end if;
  if p_hidden then ids := ids || jsonb_build_array(p_category_id); else ids := ids - p_category_id; end if;
  v := v+1;
  update public.device_category_settings set hidden_category_ids=jsonb_set(hidden_category_ids,array[p_media_type],ids), category_versions=jsonb_set(category_versions,array[p_media_type,p_category_id],to_jsonb(v)) where playlist_id=p_playlist_id and device_id=p_device_id;
 end if;
 return jsonb_build_object('status','saved','hidden',p_hidden,'version',v);
end $$;
revoke all on function public.admin_set_category_hidden(uuid,uuid,text,text,boolean,bigint,uuid) from public,anon,authenticated;
grant execute on function public.admin_set_category_hidden(uuid,uuid,text,text,boolean,bigint,uuid) to authenticated;
-- One consistent provider identity + visibility snapshot, no credentials returned.
create function public.admin_get_category_snapshot(p_device_id uuid,p_playlist_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare snapshot jsonb;
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object('provider_generation',p.category_provider_generation,'hidden_category_ids',coalesce(s.hidden_category_ids,'{"live":[],"vod":[],"series":[]}'::jsonb),'category_versions',coalesce(s.category_versions,'{"live":{},"vod":{},"series":{}}'::jsonb)) into snapshot
 from public.playlists p left join public.device_category_settings s on s.playlist_id=p.id and s.device_id=p.device_id
 where p.id=p_playlist_id and p.device_id=p_device_id and p.type='xtream';
 return snapshot;
end $$;
revoke all on function public.admin_get_category_snapshot(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_get_category_snapshot(uuid,uuid) to authenticated;
-- Keep original v2 auth, token, rate, pending/expiry behavior byte-for-byte inside
-- a non-exposed function. Augment ACTIVE playlists only, never denied responses.
alter function public.get_device_config_v2(text,text) set schema device_private;
alter function device_private.get_device_config_v2(text,text) rename to get_device_config_v2_base;
revoke all on function device_private.get_device_config_v2_base(text,text) from public,anon,authenticated;
create function public.get_device_config_v2(p_device_code text,p_device_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare result jsonb; lists jsonb;
begin
 result := device_private.get_device_config_v2_base(p_device_code,p_device_token);
 if result->>'status' <> 'active' then return result; end if;
 select coalesce(jsonb_agg(p || jsonb_build_object('category_settings_version',1,'category_provider_generation',(select category_provider_generation from public.playlists where id=(p->>'id')::uuid),'category_config_revision','hc1_' || encode(sha256(convert_to(jsonb_build_object('playlist_id',p->>'id','provider_generation',(select category_provider_generation from public.playlists where id=(p->>'id')::uuid),'hidden_category_ids',coalesce(s.hidden_category_ids,'{"live":[],"vod":[],"series":[]}'::jsonb))::text,'UTF8')),'hex'),'hidden_category_ids',coalesce(s.hidden_category_ids,'{"live":[],"vod":[],"series":[]}'::jsonb)) order by n),'[]'::jsonb) into lists
 from jsonb_array_elements(result->'playlists') with ordinality a(p,n)
 left join public.device_category_settings s on s.playlist_id=(p->>'id')::uuid
 and s.device_id=(select id from public.devices where device_code=result->>'device_code');
 return jsonb_set(result,'{playlists}',lists);
end $$;
revoke all on function public.get_device_config_v2(text,text) from public,anon,authenticated;
grant execute on function public.get_device_config_v2(text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
