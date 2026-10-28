-- Requires a private production backup first. Playlists survive device removal,
-- unassigned (device_id NULL), with their UUID and subscription fields unchanged.
begin;
alter table public.playlists alter column device_id drop not null;
alter table public.playlists drop constraint playlists_device_id_fkey;
alter table public.playlists add constraint playlists_device_id_fkey foreign key (device_id) references public.devices(id) on delete set null;
-- Never expose the old direct-delete route, even to authenticated admins.
revoke delete on public.devices from public,anon,authenticated;
create or replace function public.admin_delete_device(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare kept integer;
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from public.devices where id=p_device_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 select count(*) into kept from public.playlists where device_id=p_device_id;
 -- SET NULL preserves all subscription data; token FK cascades only the secret.
 delete from device_private.budgets where scope='device:'||p_device_id;
 delete from public.devices where id=p_device_id;
 return jsonb_build_object('status','deleted','preserved_playlists',kept);
end $$;
revoke all on function public.admin_delete_device(uuid) from public,anon,authenticated;
grant execute on function public.admin_delete_device(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
