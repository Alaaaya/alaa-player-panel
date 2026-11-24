-- Preserve EPG fields for atomic detail subscription save and activation.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_save_subscription(p_device_id uuid, p_playlist_id uuid, p_playlist jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare pid uuid; ty text := p_playlist->>'type';
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.devices where id=p_device_id for update;
 if not found then raise exception 'device not found'; end if;
 if ty is null or ty not in ('m3u','xtream') or coalesce(trim(p_playlist->>'name'),'')='' then raise exception 'invalid playlist'; end if;
 if ty='m3u' and coalesce(p_playlist->>'url','') !~ '^https?://[^[:space:]/?#]+' then raise exception 'invalid URL'; end if;
 if ty='xtream' and (coalesce(p_playlist->>'server','') !~ '^https?://[^[:space:]/?#]+' or coalesce(trim(p_playlist->>'username'),'')='' or coalesce(trim(p_playlist->>'password'),'')='') then raise exception 'invalid Xtream'; end if;
 if nullif(trim(p_playlist->>'epg_url'),'') is not null and trim(p_playlist->>'epg_url') !~ '^https?://[^[:space:]/?#]+' then raise exception 'invalid EPG URL'; end if;
 if p_playlist_id is not null then
  update public.playlists set name=p_playlist->>'name',type=ty,epg_url=case when p_playlist ? 'epg_url' then nullif(trim(p_playlist->>'epg_url'),'') else epg_url end,url=case when ty='m3u' then p_playlist->>'url' end,server=case when ty='xtream' then p_playlist->>'server' end,username=case when ty='xtream' then p_playlist->>'username' end,password=case when ty='xtream' then p_playlist->>'password' end where id=p_playlist_id and device_id=p_device_id returning id into pid;
  if pid is null then raise exception 'playlist not found'; end if;
 else
  insert into public.playlists(device_id,name,type,epg_url,url,server,username,password,position) values(p_device_id,p_playlist->>'name',ty,nullif(trim(p_playlist->>'epg_url'),''),case when ty='m3u' then p_playlist->>'url' end,case when ty='xtream' then p_playlist->>'server' end,case when ty='xtream' then p_playlist->>'username' end,case when ty='xtream' then p_playlist->>'password' end,coalesce((select max(position)+1 from public.playlists where device_id=p_device_id),0)) returning id into pid;
 end if;
 update public.devices set active=true where id=p_device_id;
 return jsonb_build_object('status','saved','playlist_id',pid);
end $function$;

COMMIT;
