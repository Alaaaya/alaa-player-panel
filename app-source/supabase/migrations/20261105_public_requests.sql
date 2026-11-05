begin;
create table public.subscription_requests (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references public.devices(id) on delete cascade,
 payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id)
);
alter table public.subscription_requests enable row level security;
revoke all on public.subscription_requests from public,anon,authenticated;
grant select on public.subscription_requests to authenticated;
create policy request_admin_read on public.subscription_requests for select to authenticated using (public.is_admin());

create function public.submit_subscription_request(p_code text,p_playlist jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare did uuid; ty text:=p_playlist->>'type'; code text:=upper(regexp_replace(trim(p_code),'[ -]','','g'));
begin
 if code is null or code !~ '^[A-F0-9]{12}$' or p_playlist is null or jsonb_typeof(p_playlist)<>'object' or octet_length(p_playlist::text)>12000 then raise exception 'invalid request' using errcode='22023'; end if;
 if ty is null or ty not in ('m3u','xtream') or length(coalesce(trim(p_playlist->>'name'),'')) not between 1 and 120 then raise exception 'invalid playlist' using errcode='22023'; end if;
 if ty='m3u' and (length(coalesce(p_playlist->>'url',''))>4096 or coalesce(p_playlist->>'url','') !~ '^https?://[^[:space:]/?#]+') then raise exception 'invalid URL' using errcode='22023'; end if;
 if ty='xtream' and (length(coalesce(p_playlist->>'server',''))>2048 or coalesce(p_playlist->>'server','') !~ '^https?://[^[:space:]/?#]+' or length(coalesce(trim(p_playlist->>'username'),'')) not between 1 and 512 or length(coalesce(p_playlist->>'password','')) not between 1 and 512) then raise exception 'invalid Xtream' using errcode='22023'; end if;
 -- Every well-formed attempt consumes the global budget, including unknown codes.
 if not device_private.take_budget('public-submit-global',60,3600) then return jsonb_build_object('status','rate_limited'); end if;
 if not device_private.take_budget('public-submit:'||code,3,3600) then return jsonb_build_object('status','rate_limited'); end if;
 select id into did from public.devices where device_code=code for update;
 -- Identical response for unknown codes, full queue and accepted requests.
 if did is not null and (select count(*) from public.subscription_requests where device_id=did and status='pending')<3 and (select count(*) from public.subscription_requests where status='pending')<200 then
 insert into public.subscription_requests(device_id,payload) values(did,jsonb_build_object('name',trim(p_playlist->>'name'),'type',ty,'url',case when ty='m3u' then p_playlist->>'url' end,'server',case when ty='xtream' then p_playlist->>'server' end,'username',case when ty='xtream' then p_playlist->>'username' end,'password',case when ty='xtream' then p_playlist->>'password' end));
 end if;
 return jsonb_build_object('status','submitted');
end $$;
revoke all on function public.submit_subscription_request(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_subscription_request(text,jsonb) to anon,authenticated;

create function public.review_subscription_request(p_request_id uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.subscription_requests; result jsonb;
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_approve is null then raise exception 'decision required'; end if;
 select * into r from public.subscription_requests where id=p_request_id for update;
 if r.id is null or r.status<>'pending' then raise exception 'request unavailable'; end if;
 -- Always ADD a playlist, never overwrite another customer's existing subscription.
 if p_approve then result:=public.admin_save_subscription(r.device_id,null,r.payload); end if;
 update public.subscription_requests set status=case when p_approve then 'approved' else 'rejected' end,payload='{}'::jsonb,reviewed_at=now(),reviewed_by=auth.uid() where id=r.id;
 return jsonb_build_object('status',case when p_approve then 'approved' else 'rejected' end);
end $$;
revoke all on function public.review_subscription_request(uuid,boolean) from public,anon,authenticated;
grant execute on function public.review_subscription_request(uuid,boolean) to authenticated;
commit;
