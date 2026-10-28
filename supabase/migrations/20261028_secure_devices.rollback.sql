-- REVIEW ONLY. Rollback is fail-closed and preserves devices/playlists and tokens.
-- Restore the UI/app release separately. Do not restore the vulnerable anon RPC.
-- Live function definitions and DB dump MUST be backed up before deployment.
begin;
revoke execute on function public.register_device_v2(text,text,text,text), public.get_device_config_v2(text,text) from anon,authenticated;
revoke execute on function public.admin_pair_legacy_device(uuid,text), public.admin_revoke_device_token(uuid), public.admin_save_subscription(uuid,uuid,jsonb) from authenticated;
-- Leave schema and app_type intact to avoid losing pairing and universe metadata.
-- Code-only config remains upgrade_required, not a credential oracle.
commit;
-- Recovery after app fix: reapply the forward migration (idempotent).
-- A full schema downgrade requires the verified pre-change dump, downtime,
-- and a security review. Never re-grant insecure get_device_config to anon.
