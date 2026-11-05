# Stop before production

No live write or live backup has occurred. Management access returned 401.

Owner must provide access to project jytjcdlmygwqizgydeyp, verify it is the intended production DB, and authorize the deployment window. Before applying anything, use dashboard/CLI to obtain a full schema+data dump plus pg_get_functiondef for all public/device_private functions and their ACLs, policies and grants. Protect the dump (contains provider passwords); never commit it to the public Pages repo. Verify restore into isolated Postgres. Compare actual live tables and functions to schema.sql. Then test migration and rollback on that restored copy.

Local PostgreSQL fixtures are NOT a production backup. Fixture tests do not establish production schema compatibility. Coordinate legacy client updates before lockdown. Do not publish src/, supabase/, tests or private dumps on Pages; publish only reviewed dist/ assets after explicit approval.
