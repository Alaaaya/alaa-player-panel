begin;
insert into public.devices(id,device_code,active,expires_at) values('00000000-1111-4222-8333-000000000001','FEED1234ABCD',false,now()-interval '1 day');
set local role anon;
do $$begin
 if public.submit_subscription_request('FEED1234ABCD','{"name":"test","type":"m3u","url":"https://example.invalid"}')->>'status'<>'unavailable' then raise exception 'expiry overwritten';end if;
 begin perform public.submit_subscription_request('FEED1234ABCD','{"name":"test","type":"m3u","url":"javascript:alert(1)"}');raise exception 'unsafe accepted';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update public.devices set expires_at=null where id='00000000-1111-4222-8333-000000000001';
insert into device_private.public_activations(device_id) values('00000000-1111-4222-8333-000000000001');
set local role anon;
do $$begin
 if public.submit_subscription_request('FEED1234ABCD','{"name":"test","type":"m3u","url":"https://example.invalid"}')->>'status'<>'unavailable' then raise exception 'ledger bypass';end if;
 if has_table_privilege('anon','public.devices','UPDATE') or has_table_privilege('anon','public.playlists','SELECT') then raise exception 'unsafe grants';end if;
end $$;
reset role;
select 'PASS expired denied; permanent activation ledger denied; unsafe URL denied; table grants unchanged' result;
rollback;
