-- Durable, atomic cross-instance admission. Gateway secret is provisioned privately,
-- never shipped in browser code or migration source. No service_role runtime key.
begin;
create table device_private.category_gateway_secret (
 singleton boolean primary key default true check(singleton),
 token_hash bytea not null check(octet_length(token_hash)=32)
);
create table device_private.category_gateway_budgets (
 scope text primary key,
 expires_at timestamptz not null,
 hits integer not null check(hits between 1 and 60)
);
create table device_private.category_gateway_leases (
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null,
 expires_at timestamptz not null
);
create index category_gateway_leases_expiry on device_private.category_gateway_leases(expires_at);
alter table device_private.category_gateway_secret enable row level security;
alter table device_private.category_gateway_budgets enable row level security;
alter table device_private.category_gateway_leases enable row level security;
revoke all on device_private.category_gateway_secret,device_private.category_gateway_budgets,device_private.category_gateway_leases from public,anon,authenticated;
create function public.category_gateway_acquire(p_gateway_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare uid uuid:=auth.uid(); t timestamptz; k text; n int; cap int; lease uuid;
begin
 if uid is null or not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 if p_gateway_token is null or octet_length(p_gateway_token)>256 or not exists(select 1 from device_private.category_gateway_secret where token_hash=sha256(convert_to(p_gateway_token,'UTF8'))) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 -- One transaction-wide fixed lock makes global+per-user budget+lease admission atomic.
 perform pg_advisory_xact_lock(783401692813::bigint);
 t:=clock_timestamp();
 delete from device_private.category_gateway_leases where expires_at<=t;
 delete from device_private.category_gateway_budgets where expires_at<=t;
 if (select count(*) from device_private.category_gateway_leases)>=8 then
  return jsonb_build_object('status','rate_limited','retry_after',45);
 end if;
 foreach k in array array['global','user:'||uid::text] loop
  cap:=case when k='global' then 60 else 20 end;
  select hits into n from device_private.category_gateway_budgets where scope=k;
  if coalesce(n,0)>=cap then return jsonb_build_object('status','rate_limited','retry_after',60); end if;
 end loop;
 foreach k in array array['global','user:'||uid::text] loop
  insert into device_private.category_gateway_budgets(scope,expires_at,hits) values(k,t+interval '60 seconds',1)
  on conflict(scope) do update set hits=category_gateway_budgets.hits+1;
 end loop;
 insert into device_private.category_gateway_leases(admin_id,expires_at) values(uid,t+interval '45 seconds') returning id into lease;
 return jsonb_build_object('status','admitted','lease_id',lease);
end $$;
create function public.category_gateway_release(p_gateway_token text,p_lease_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
begin
 if auth.uid() is null or not public.is_admin() or p_gateway_token is null or octet_length(p_gateway_token)>256 or not exists(select 1 from device_private.category_gateway_secret where token_hash=sha256(convert_to(p_gateway_token,'UTF8'))) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 delete from device_private.category_gateway_leases where id=p_lease_id and admin_id=auth.uid();
end $$;
revoke all on function public.category_gateway_acquire(text),public.category_gateway_release(text,uuid) from public,anon,authenticated;
grant execute on function public.category_gateway_acquire(text),public.category_gateway_release(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
