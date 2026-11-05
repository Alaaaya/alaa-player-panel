-- Owner-authorized change after private repeatable-read backup.
-- The live schema has exactly ONE association: playlists.device_id.
-- A playlist UUID cannot belong to two devices; duplicate provider logins in
-- another device's own playlist are separate rows and MUST remain untouched.
begin;
create or replace function public.admin_delete_device(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,device_private as $$
declare removed integer;
begin
 if not public.is_admin() then raise exception 'forbidden' using errcode='42501'; end if;
 -- Parent first, matching admin_save_subscription. This also blocks new FK links.
 perform 1 from public.devices where id=p_device_id for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 -- Deterministic order serializes playlist edits/reassignment with deletion.
 perform 1 from public.playlists where device_id=p_device_id order by id for update;
 -- Recheck ownership after any wait. Never sweep pre-existing NULL/orphan rows
 -- or compare provider credentials to decide which unrelated rows to remove.
 delete from public.playlists where device_id=p_device_id;
 get diagnostics removed = row_count;
 delete from device_private.budgets where scope='device:'||p_device_id;
 delete from public.devices where id=p_device_id;
 return jsonb_build_object('status','deleted','deleted_playlists',removed);
end $$;
revoke all on function public.admin_delete_device(uuid) from public,anon,authenticated;
grant execute on function public.admin_delete_device(uuid) to authenticated;
revoke delete on public.devices from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
