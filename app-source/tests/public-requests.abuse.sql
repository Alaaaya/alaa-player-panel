begin;
set local role anon;
select public.submit_subscription_request('FEED77777777','{"name":"test","type":"m3u","url":"https://example.invalid"}');
select public.submit_subscription_request('FEED77777777','{"name":"test","type":"m3u","url":"https://example.invalid"}');
select public.submit_subscription_request('FEED77777777','{"name":"test","type":"m3u","url":"https://example.invalid"}');
do $$begin
 if public.submit_subscription_request('FEED77777777','{"name":"test","type":"m3u","url":"https://example.invalid"}')->>'status'<>'rate_limited' then raise exception 'rate limit broken';end if;
 begin perform public.submit_subscription_request('FEED77777777','{"name":"test","type":"m3u","url":"javascript:alert(1)"}');raise exception 'bad URL accepted';exception when invalid_parameter_value then null;end;
end $$;
select 'PASS rate limit and malicious URL rejected' result;
rollback;
