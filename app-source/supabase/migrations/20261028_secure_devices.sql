-- REVIEW ONLY. Never deploy without a live backup and coordinated app rollout.
begin;
create schema if not exists device_private;
revoke all on schema device_private from public, anon, authenticated;
alter table public.devices add column if not exists app_type text not null default 'alaa_player' check (app_type in ('alaa_player','universe'));
create table if not exists device_private.tokens (
 device_id uuid primary key references public.devices on delete cascade,
 token_hash bytea unique not null,
 paired_at timestamptz not null default now()
);
create table if not exists device_private.budgets (
 scope text primary key, bucket timestamptz not null, hits int not null
);
alter table device_private.tokens enable row level security;
alter table device_private.budgets enable row level security;
revoke all on all tables in schema device_private from public, anon, authenticated;
create or replace function device_private.take_budget(p_scope text, p_limit int, p_seconds int) returns boolean
language plpgsql security definer set search_path=pg_catalog,device_private as $$
declare n int; b timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp())/p_seconds)*p_seconds);
begin
 delete from device_private.budgets where bucket < now() - interval '2 hours';
 insert into device_private.budgets as r(scope,bucket,hits) values(p_scope,b,1)
 on conflict(scope) do update set bucket=b, hits=case when r.bucket=b then least(r.hits+1,p_limit+1) else 1 end returning hits into n;
 return n <= p_limit;
end $$;
revoke all on function device_private.take_budget(text,int,int) from public,anon,authenticated;

-- A display code is an address, never a secret. The TV creates a 256-bit token.
create or replace function public.register_device_v2(p_device_code text,p_device_token text,p_app_type text,p_model text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare d public.devices; h bytea; existing bytea; code text := upper(trim(p_device_code));
begin
 if code is null or code !~ '^[A-F0-9]{12}$' or p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' or p_app_type not in ('alaa_player','universe') or p_app_type is null then return jsonb_build_object('status','invalid'); end if;
 -- Expired pending rows are removed on registration; active subscriptions are never swept.
 delete from public.devices dv using device_private.tokens tk where tk.device_id=dv.id and not dv.active and tk.paired_at < now()-interval '24 hours' and not exists(select 1 from public.playlists p where p.device_id=dv.id);
 h := sha256(convert_to(p_device_token,'UTF8'));
 select * into d from public.devices where device_code=code;
 if d.id is not null then
  select token_hash into existing from device_private.tokens where device_id=d.id;
  if existing is distinct from h then return jsonb_build_object('status','unavailable'); end if;
  return jsonb_build_object('status','registered','device_code',code,'app_type',d.app_type);
 end if;
 if not device_private.take_budget('register-global',100,3600) then return jsonb_build_object('status','rate_limited','retry_after',3600); end if;
 -- Never upsert an existing code or allow a token to claim more than one device.
 begin
  insert into public.devices(device_code,model,app_type,last_seen) values(code,left(p_model,120),p_app_type,now()) returning * into d;
  insert into device_private.tokens(device_id,token_hash) values(d.id,h);
 exception when unique_violation then return jsonb_build_object('status','unavailable');
 end;
 return jsonb_build_object('status','registered','device_code',code,'app_type',d.app_type);
end $$;

create or replace function public.get_device_config_v2(p_device_code text,p_device_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare d public.devices; h bytea;
begin
 if p_device_code is null or length(p_device_code)>64 or p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status','unauthorized'); end if;
 h := sha256(convert_to(p_device_token,'UTF8'));
 select dv.* into d from public.devices dv join device_private.tokens tk on tk.device_id=dv.id where dv.device_code=upper(trim(p_device_code)) and tk.token_hash=h;
 if d.id is null then
  if not device_private.take_budget('config-invalid-global',300,60) then return jsonb_build_object('status','rate_limited','retry_after',60); end if;
  return jsonb_build_object('status','unauthorized');
 end if;
 if not device_private.take_budget('device:'||d.id,30,60) then return jsonb_build_object('status','rate_limited','retry_after',60); end if;
 update public.devices set last_seen=now() where id=d.id;
 if not d.active and d.created_at < now()-interval '24 hours' and not exists(select 1 from public.playlists where device_id=d.id) then return jsonb_build_object('status','registration_expired'); end if;
 if not d.active then return jsonb_build_object('status',case when not exists(select 1 from public.playlists where device_id=d.id) then 'pending' else 'inactive' end,'device_code',d.device_code,'app_type',d.app_type,'pending_expires_at',d.created_at+interval '24 hours'); end if;
 if d.expires_at is not null and d.expires_at < now() then return jsonb_build_object('status','expired','device_code',d.device_code,'expires_at',d.expires_at); end if;
 return jsonb_build_object('status','active','device_code',d.device_code,'app_type',d.app_type,'expires_at',d.expires_at,'playlists',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'type',p.type,'url',p.url,'epg_url',p.epg_url,'server',p.server,'username',p.username,'password',p.password) order by p.position,p.created_at) from public.playlists p where p.device_id=d.id),'[]'::jsonb));
end $$;

-- Existing IDs, playlists and expiry dates survive. Only an authenticated admin can
-- bind a 256-bit token generated by the upgraded TV, after verifying physical TV access.
create or replace function public.admin_pair_legacy_device(p_device_id uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_device_token is null or p_device_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid token'; end if;
 if not exists(select 1 from public.devices where id=p_device_id) then raise exception 'device not found'; end if;
 -- Pairing cannot silently replace an existing token. Re-pair needs explicit revoke.
 insert into device_private.tokens(device_id,token_hash) values(p_device_id,sha256(convert_to(p_device_token,'UTF8')));
 return jsonb_build_object('status','paired');
end $$;
create or replace function public.admin_revoke_device_token(p_device_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 delete from device_private.tokens where device_id=p_device_id;
end $$;

-- Old code-only RPC is deliberately status-only. An insecure compatibility route
-- would negate the fix. Upgraded clients use v2; old cached playlists are untouched.
create or replace function public.get_device_config(p_device_code text)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select jsonb_build_object('status','upgrade_required','api_version',2) $$;
create or replace function public.register_device(p_device_code text,p_mac text default null,p_model text default null)
returns jsonb language sql security definer set search_path=pg_catalog as $$ select jsonb_build_object('status','upgrade_required','api_version',2) $$;

create or replace function public.admin_save_subscription(p_device_id uuid,p_playlist_id uuid,p_playlist jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid uuid; ty text := p_playlist->>'type';
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.devices where id=p_device_id for update;
 if not found then raise exception 'device not found'; end if;
 if ty is null or ty not in ('m3u','xtream') or coalesce(trim(p_playlist->>'name'),'')='' then raise exception 'invalid playlist'; end if;
 if ty='m3u' and coalesce(p_playlist->>'url','') !~ '^https?://[^[:space:]/?#]+' then raise exception 'invalid URL'; end if;
 if ty='xtream' and (coalesce(p_playlist->>'server','') !~ '^https?://[^[:space:]/?#]+' or coalesce(trim(p_playlist->>'username'),'')='' or coalesce(trim(p_playlist->>'password'),'')='') then raise exception 'invalid Xtream'; end if;
 if p_playlist_id is not null then
  update public.playlists set name=p_playlist->>'name',type=ty,url=case when ty='m3u' then p_playlist->>'url' end,server=case when ty='xtream' then p_playlist->>'server' end,username=case when ty='xtream' then p_playlist->>'username' end,password=case when ty='xtream' then p_playlist->>'password' end where id=p_playlist_id and device_id=p_device_id returning id into pid;
  if pid is null then raise exception 'playlist not found'; end if;
 else
  insert into public.playlists(device_id,name,type,url,server,username,password,position) values(p_device_id,p_playlist->>'name',ty,case when ty='m3u' then p_playlist->>'url' end,case when ty='xtream' then p_playlist->>'server' end,case when ty='xtream' then p_playlist->>'username' end,case when ty='xtream' then p_playlist->>'password' end,coalesce((select max(position)+1 from public.playlists where device_id=p_device_id),0)) returning id into pid;
 end if;
 update public.devices set active=true where id=p_device_id;
 return jsonb_build_object('status','saved','playlist_id',pid);
end $$;
revoke all on function public.register_device_v2(text,text,text,text),public.get_device_config_v2(text,text),public.get_device_config(text),public.register_device(text,text,text),public.admin_pair_legacy_device(uuid,text),public.admin_revoke_device_token(uuid),public.admin_save_subscription(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_device_v2(text,text,text,text),public.get_device_config_v2(text,text),public.get_device_config(text),public.register_device(text,text,text) to anon,authenticated;
grant execute on function public.admin_pair_legacy_device(uuid,text),public.admin_revoke_device_token(uuid),public.admin_save_subscription(uuid,uuid,jsonb) to authenticated;
-- Production inventory exposed TRUNCATE via legacy default privileges; RLS does not protect TRUNCATE.
-- Give the browser only the operations its admin-gated policies require.
revoke all on public.admins,public.devices,public.playlists from public,anon,authenticated;
grant select on public.admins to authenticated;
grant select,insert,update,delete on public.devices,public.playlists to authenticated;
revoke execute on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
commit;
