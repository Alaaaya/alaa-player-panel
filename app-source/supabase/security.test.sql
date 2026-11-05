\set ON_ERROR_STOP on
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.admins(user_id) values('00000000-0000-0000-0000-000000000001');
set role anon;
do $$ declare r jsonb; begin
 r:=public.register_device_v2('A1B2C3D4E5F6',repeat('a',64),'universe','Test TV');
 assert r->>'status'='registered','register';
 r:=public.register_device_v2('A1B2C3D4E5F6',repeat('b',64),'universe','Hostile TV');
 assert r->>'status'='unavailable','cannot claim token';
 r:=public.get_device_config_v2('A1B2C3D4E5F6',repeat('b',64));
 assert r->>'status'='unauthorized' and not r ? 'playlists','wrong token no credentials';
 r:=public.get_device_config('A1B2C3D4E5F6');
 assert r->>'status'='upgrade_required' and not r ? 'playlists','legacy no credentials';
 r:=public.get_device_config_v2('A1B2C3D4E5F6',repeat('a',64));
 assert r->>'status'='pending' and not r ? 'playlists','inactive no credentials';
 begin perform 1 from device_private.tokens; raise exception 'table leaked'; exception when insufficient_privilege then null; end;
 begin perform public.admin_save_subscription(gen_random_uuid(),null,'{}'); raise exception 'admin RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 begin perform public.admin_save_subscription(gen_random_uuid(),null,'{}'); raise exception 'nonadmin allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ declare did uuid; r jsonb; pid uuid; begin
 select id into did from public.devices where device_code='A1B2C3D4E5F6';
 r:=public.admin_save_subscription(did,null,'{"name":"Private","type":"xtream","server":"https://provider.invalid","username":"sample-user","password":"sample-secret"}');
 assert r->>'status'='saved';
 pid:=(r->>'playlist_id')::uuid;
 assert (select active from public.devices where id=did),'atomic activate';
 begin perform public.admin_save_subscription(did,pid,'{"name":"Bad","type":"xtream","server":"javascript:bad"}'); raise exception 'bad input accepted'; exception when raise_exception then assert sqlerrm='invalid Xtream'; end;
 assert (select password from public.playlists where id=pid)='sample-secret','failed save preserves credentials';
end $$;
reset role;
set role anon;
do $$ declare r jsonb; begin
 r:=public.get_device_config_v2('A1B2C3D4E5F6',repeat('a',64));
 assert r->>'status'='active' and r->>'app_type'='universe','active universe';
 assert r->'playlists'->0->>'password'='sample-secret','authorized credentials';
 for i in 1..30 loop r:=public.get_device_config_v2('A1B2C3D4E5F6',repeat('a',64)); end loop;
 assert r->>'status'='rate_limited' and not r ? 'playlists','per-device rate limit';
 for i in 1..305 loop r:=public.get_device_config_v2('A1B2C3D4E5F6',repeat('b',64)); end loop;
 assert r->>'status'='rate_limited','invalid rate limit';
end $$;
reset role;
insert into public.devices(device_code,active,expires_at) values('LEGACY01',true,now()+interval '1 year');
set role authenticated;
do $$ declare did uuid; begin
 select id into did from public.devices where device_code='LEGACY01';
 perform public.admin_pair_legacy_device(did,repeat('c',64));
 begin perform public.admin_pair_legacy_device(did,repeat('d',64)); raise exception 'token overwritten'; exception when unique_violation then null; end;
 assert (select active from public.devices where id=did),'legacy activation preserved';
end $$;
reset role;
set role anon;
do $$ declare r jsonb; begin
 r:=public.get_device_config_v2('LEGACY01',repeat('c',64)); assert r->>'status'='active','legacy paired';
end $$;
reset role;
update public.devices set expires_at=now()-interval '1 day' where device_code='LEGACY01';
set role anon;
do $$ declare r jsonb; begin
 r:=public.get_device_config_v2('LEGACY01',repeat('c',64)); assert r->>'status'='expired' and not r ? 'playlists','expired no creds';
end $$;
reset role;
select 'SECURITY CHECKS PASSED' as result;
