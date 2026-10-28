\set ON_ERROR_STOP on
select public.register_device_v2('111122223333',repeat('e',64),'universe','Old pending');
update public.devices set created_at=now()-interval '25 hours' where device_code='111122223333';
update device_private.tokens set paired_at=now()-interval '25 hours' where device_id=(select id from public.devices where device_code='111122223333');
set role anon;
do $$ declare r jsonb; begin
 r:=public.get_device_config_v2('111122223333',repeat('e',64)); assert r->>'status'='registration_expired' and not r ? 'playlists';
 r:=public.register_device_v2('444455556666',repeat('f',64),'alaa_player','New TV'); assert r->>'status'='registered';
end $$;
reset role;
do $$ begin
 assert not exists(select 1 from public.devices where device_code='111122223333'),'expired pending removed';
 assert exists(select 1 from public.devices where device_code='A1B2C3D4E5F6' and active),'active preserved';
end $$;
select 'EXPIRY CHECKS PASSED';
