begin;
insert into public.devices(id,device_code,active) values('00000000-1111-4222-8333-000000000001','FEED1234ABCD',false);
set local role anon;
select public.submit_subscription_request('FEED 1234 ABCD','{"name":"Security test","type":"m3u","url":"https://example.invalid/list.m3u"}') as submitted;
select public.submit_subscription_request('FEED00000000','{"name":"Unknown test","type":"m3u","url":"https://example.invalid/list.m3u"}') as unknown;
reset role;
do $$begin
 if (select count(*) from public.subscription_requests where device_id='00000000-1111-4222-8333-000000000001')<>1 then raise exception 'queue failure'; end if;
 if (select active from public.devices where id='00000000-1111-4222-8333-000000000001') then raise exception 'public activated'; end if;
 if exists(select 1 from public.playlists where device_id='00000000-1111-4222-8333-000000000001') then raise exception 'public wrote playlists'; end if;
 if has_table_privilege('anon','public.subscription_requests','SELECT') or has_table_privilege('authenticated','public.subscription_requests','INSERT') then raise exception 'queue grants unsafe';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-1111-4222-8333-000000000099',true);
do $$begin
 if exists(select 1 from public.subscription_requests) then raise exception 'nonadmin queue visible';end if;
 if exists(select 1 from public.devices) then raise exception 'nonadmin devices visible';end if;
 if exists(select 1 from public.playlists) then raise exception 'nonadmin playlists visible';end if;
 begin perform public.review_subscription_request('00000000-1111-4222-8333-000000000001',true);raise exception 'nonadmin review allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','5fa5b70c-d585-4f3e-8b9e-04a00f027b8c',true);
select public.review_subscription_request(id,true) approved from public.subscription_requests where device_id='00000000-1111-4222-8333-000000000001';
reset role;
do $$begin
 if not (select active from public.devices where id='00000000-1111-4222-8333-000000000001') then raise exception 'approval failed'; end if;
 if (select count(*) from public.playlists where device_id='00000000-1111-4222-8333-000000000001')<>1 then raise exception 'approval playlist missing';end if;
 if exists(select 1 from public.subscription_requests where device_id='00000000-1111-4222-8333-000000000001' and payload<>'{}'::jsonb) then raise exception 'review payload not cleared';end if;
end $$;
select 'PASS public submission only, unknown same response, nonadmin RLS isolation, admin approval atomic' result;
rollback;
