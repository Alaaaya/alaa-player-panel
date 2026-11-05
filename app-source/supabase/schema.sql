create table if not exists public.admins (user_id uuid primary key references auth.users on delete cascade, created_at timestamptz default now());
create table if not exists public.devices (
 id uuid primary key default gen_random_uuid(),
 device_code text unique not null,
 mac text, model text, customer text, note text,
 active boolean not null default false,
 expires_at timestamptz,
 last_seen timestamptz,
 created_at timestamptz not null default now());
create table if not exists public.playlists (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references public.devices on delete cascade,
 name text not null default 'Playlist',
 type text not null check (type in ('m3u','xtream')),
 url text, epg_url text, server text, username text, password text,
 position int not null default 0,
 created_at timestamptz not null default now());
alter table public.admins enable row level security;
alter table public.devices enable row level security;
alter table public.playlists enable row level security;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from public.admins where user_id = auth.uid()) $$;
drop policy if exists a_self on public.admins; create policy a_self on public.admins for select to authenticated using (user_id = auth.uid());
drop policy if exists d_admin on public.devices; create policy d_admin on public.devices for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists p_admin on public.playlists; create policy p_admin on public.playlists for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.admins, public.devices, public.playlists from anon;
grant select on public.admins to authenticated;
grant select,insert,update,delete on public.devices, public.playlists to authenticated;
create or replace function public.register_device(p_device_code text, p_mac text default null, p_model text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.devices;
begin
 if p_device_code is null or length(p_device_code) < 4 or length(p_device_code) > 64 then raise exception 'invalid device code'; end if;
 insert into public.devices(device_code, mac, model) values (upper(trim(p_device_code)), left(p_mac,32), left(p_model,120))
 on conflict (device_code) do update set mac = coalesce(public.devices.mac, excluded.mac), model = coalesce(excluded.model, public.devices.model), last_seen = now()
 returning * into d;
 return jsonb_build_object('device_code', d.device_code, 'active', d.active, 'expires_at', d.expires_at);
end $$;
create or replace function public.get_device_config(p_device_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.devices;
begin
 update public.devices set last_seen = now() where device_code = upper(trim(p_device_code)) returning * into d;
 if d.id is null then return jsonb_build_object('status','unknown'); end if;
 if not d.active then return jsonb_build_object('status','inactive','device_code',d.device_code); end if;
 if d.expires_at is not null and d.expires_at < now() then return jsonb_build_object('status','expired','device_code',d.device_code,'expires_at',d.expires_at); end if;
 return jsonb_build_object('status','active','device_code',d.device_code,'expires_at',d.expires_at,
  'playlists', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'type',p.type,'url',p.url,'epg_url',p.epg_url,'server',p.server,'username',p.username,'password',p.password) order by p.position, p.created_at) from public.playlists p where p.device_id=d.id),'[]'::jsonb));
end $$;
revoke all on function public.register_device(text,text,text), public.get_device_config(text) from public;
grant execute on function public.register_device(text,text,text), public.get_device_config(text) to anon, authenticated;
grant execute on function public.is_admin() to authenticated;
