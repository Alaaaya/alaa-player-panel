begin;
-- Owner explicitly permits anyone holding the public code to activate an eligible device.
-- This is an open activation policy, NOT proof of ownership.
create table device_private.public_activations (
 device_id uuid primary key references public.devices(id) on delete cascade,
 activated_at timestamptz not null default now()
);
alter table device_private.public_activations enable row level security;
revoke all on device_private.public_activations from public,anon,authenticated;
create or replace function public.submit_subscription_request(p_code text,p_playlist jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare did uuid; ty text:=p_playlist->>'type'; code text:=upper(regexp_replace(trim(p_code),'[ -]','','g'));
begin
 if code is null or code !~ '^[A-F0-9]{12}$' or p_playlist is null or jsonb_typeof(p_playlist)<>'object' or octet_length(p_playlist::text)>12000 then raise exception 'invalid request' using errcode='22023'; end if;
 if ty is null or ty not in ('m3u','xtream') or length(coalesce(trim(p_playlist->>'name'),'')) not between 1 and 120 then raise exception 'invalid playlist' using errcode='22023'; end if;
 if ty='m3u' and (length(coalesce(p_playlist->>'url',''))>4096 or coalesce(p_playlist->>'url','') !~ '^https?://[^[:space:]/?#]+') then raise exception 'invalid URL' using errcode='22023'; end if;
 if ty='xtream' and (length(coalesce(p_playlist->>'server',''))>2048 or coalesce(p_playlist->>'server','') !~ '^https?://[^[:space:]/?#]+' or length(coalesce(trim(p_playlist->>'username'),'')) not between 1 and 512 or length(coalesce(p_playlist->>'password','')) not between 1 and 512) then raise exception 'invalid Xtream' using errcode='22023'; end if;
 if not device_private.take_budget('public-submit-global',60,3600) then return jsonb_build_object('status','rate_limited'); end if;
 if not device_private.take_budget('public-submit:'||code,3,3600) then return jsonb_build_object('status','rate_limited'); end if;
 select id into did from public.devices where device_code=code for update;
 -- Active devices and devices with any existing playlist/expiry stay admin-only.
 if did is null or exists(select 1 from public.devices where id=did and (active or expires_at is not null)) or exists(select 1 from public.playlists where device_id=did) or exists(select 1 from device_private.public_activations where device_id=did) then
 return jsonb_build_object('status','unavailable');
 end if;
 insert into device_private.public_activations(device_id) values(did);
 insert into public.playlists(device_id,name,type,url,server,username,password,position)
 values(did,trim(p_playlist->>'name'),ty,case when ty='m3u' then p_playlist->>'url' end,case when ty='xtream' then p_playlist->>'server' end,case when ty='xtream' then p_playlist->>'username' end,case when ty='xtream' then p_playlist->>'password' end,0);
 update public.devices set active=true where id=did;
 return jsonb_build_object('status','activated');
end $$;
revoke all on function public.submit_subscription_request(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_subscription_request(text,jsonb) to anon,authenticated;
commit;
