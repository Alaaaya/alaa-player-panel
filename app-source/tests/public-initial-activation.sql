begin;
insert into public.devices(id,device_code,active) values('00000000-1111-4222-8333-000000000001','FEED1234ABCD',false);
set local role anon;
do $$begin
 if public.submit_subscription_request('FEED1234ABCD','{"name":"initial","type":"m3u","url":"https://example.invalid/list"}')->>'status'<>'activated' then raise exception 'activation failed';end if;
 if public.submit_subscription_request('FEED1234ABCD','{"name":"overwrite","type":"m3u","url":"https://example.invalid/new"}')->>'status'<>'unavailable' then raise exception 'active replay allowed';end if;
 if public.submit_subscription_request('FEED00000000','{"name":"unknown","type":"m3u","url":"https://example.invalid/list"}')->>'status'<>'unavailable' then raise exception 'unknown';end if;
end $$;
reset role;
do $$begin
 if (select count(*) from public.playlists where device_id='00000000-1111-4222-8333-000000000001')<>1 then raise exception 'playlist count';end if;
 if (select name from public.playlists where device_id='00000000-1111-4222-8333-000000000001')<>'initial' then raise exception 'overwrite';end if;
 if not (select active from public.devices where id='00000000-1111-4222-8333-000000000001') then raise exception 'inactive';end if;
end $$;
update public.devices set active=false where id='00000000-1111-4222-8333-000000000001';
set local role anon;
do $$begin
 if public.submit_subscription_request('FEED1234ABCD','{"name":"second","type":"m3u","url":"https://example.invalid/list"}')->>'status'<>'unavailable' then raise exception 'inactive existing playlist changed';end if;
end $$;
reset role;
-- Simulate admin removing its playlist: permanent replay ledger still prevents public reactivation.
delete from public.playlists where device_id='00000000-1111-4222-8333-000000000001';
set local role anon;
do $$begin
 if public.submit_subscription_request('FEED1234ABCD','{"name":"second","type":"m3u","url":"https://example.invalid/list"}')->>'status' not in ('unavailable','rate_limited') then raise exception 'ledger replay';end if;
end $$;
reset role;
select 'PASS immediate anonymous activation; active replay and existing playlist denial; one playlist only; no overwrite' result;
rollback;
