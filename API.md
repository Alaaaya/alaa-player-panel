# Device API v2 · live verified, 2026-10-28

## Backend verification
Live original project https://jytjcdlmygwqizgydeyp.supabase.co. The v2 migration has been committed to this project and tested through its real public REST endpoints. No migration to czrypjsgjjmjzyyjhyxd occurred. Actual API tests verified pending registration, admin-only atomic activation, authorized dummy-provider retrieval, wrong/missing token denial, legacy code-only lockout, inactive/expired secrecy, rate limits and effective database privileges. Original devices/playlists remain intact; old code-only clients must upgrade and re-pair.

Public anon key (intended for both TV apps, not a service key)

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5dGpjZGxteWd3cWl6Z3lkZXlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMzQzODUsImV4cCI6MjEwNjYxMDM4NX0.zcr_TaxhweaScYeHxuSNzwBtHj0cgkp9JSfbsmkIr4Y
```

GitHub Pages panel https://alaaaya.github.io/alaa-player-panel/ uses this same original project. SQL is deployed and verified; Pages rollout is recorded separately in DEPLOYMENT-FINAL.md. Never embed the Management PAT, service-role key, admin password or backups in either app.

## Requests
HTTPS POST {project}/rest/v1/rpc/{function}. Headers apikey: public anon key, Content-Type: application/json. Do not place device tokens in URLs, analytics, screenshots or logs. Do not embed a service role key in either app or panel.

### register_device_v2
JSON {"p_device_code":"A1B2C3D4E5F6","p_device_token":"64_lowercase_hex_characters","p_app_type":"universe","p_model":"Android TV"}

Before the first request, TV generates 6 random bytes for the 12-character uppercase hex display code and 32 random bytes for a 256-bit token using SecureRandom. Save both atomically in Android Keystore-backed storage BEFORE sending. Do not use MAC/serial or a short pseudo-random token. App type universe is displayed exactly as universe; existing devices default to alaa_player and display Alaa Player.

Returns status registered plus code/app_type. Existing code can be used only with its bound token. unavailable means collision or existing binding; generate a new code only if this is a brand-new installation, not a previously paired device. invalid means malformed input. rate_limited includes retry_after seconds. Retry registration uses the SAME stored token. Never try code-only fallback.

### get_device_config_v2
JSON {"p_device_code":"A1B2C3D4E5F6","p_device_token":"64_lowercase_hex_characters"}

Returns status active with device_code, app_type, expires_at (ISO8601 or null), playlists array. Each playlist has id,name,type,url,epg_url,server,username,password. Fields not applicable to type are null. Cache securely on-device. status inactive/expired/unauthorized/rate_limited never includes playlists. Expired includes expires_at. Treat inactive/expired as authoritative and stop playback, not as permission to use cached credentials. On temporary network failure preserve cache according to the existing app's explicitly documented offline policy. Never print provider credentials in logs. Clear cached credentials when token is revoked/re-paired or user removes subscription.

Fetch cache-first on open, refresh silently every open; do not poll rapidly. Limit 30 authenticated config requests/device/minute, 300 invalid-token config requests globally/minute; 100 new registrations globally/hour. Honor retry_after and exponential backoff with jitter. A device code alone cannot retrieve credentials. Lost token requires admin-assisted pairing, never automatic takeover.

### Admin operations (authenticated admin JWT required)
admin_save_subscription {p_device_id:UUID,p_playlist_id:UUID|null,p_playlist:{name,type,url|server/username/password}} updates/inserts the selected playlist and activates device in ONE database transaction. Device expiration is preserved; an expired subscription does not silently extend. Existing extra playlists remain unchanged. Backend validates and verifies playlist belongs to device. Returns {status:"saved",playlist_id:UUID}.

admin_pair_legacy_device {p_device_id:UUID,p_device_token:64-char-token} binds only an unpaired existing device; refuses overwrite. Requires physical verification of the TV by owner and a secure admin-only transfer of its new token. The token must never be entered as a publicly visible device code. admin_revoke_device_token {p_device_id:UUID} removes binding; explicit admin action, then re-pair. A short code alone is never pairing authorization. A friendlier one-time QR pairing UX is a future enhancement, not implemented here.

## Existing Alaa Player migration
Existing device UUIDs, short codes, playlists, activity and expiry are preserved. Update the old Alaa Player client to generate/store tokens and call v2, then physically verify and bind its token through authenticated admin tooling. Android universe can register itself through v2. Existing legacy installations must be upgraded/coordinated BEFORE deploying the lockdown, or they lose remote refresh. It is impossible to both keep a code-only credential oracle publicly working and claim this leak is fixed. The old code-only functions become upgrade_required with no playlists. The panel still manages legacy device records.

## Deployment and recovery
Owner approved the coordinated lockdown and accepts legacy client upgrade/re-pair. An owner-authorized application logical backup was taken via the Management SQL API before writes. All public tables, DDL, functions, grants, policies, defaults and dependencies were captured privately and restored into isolated PostgreSQL16. Exact public data and objects verified; the compatibility test omits PostgreSQL17-only MAINTAIN grants, while the original PG17 restore script retains them. This is not a full managed-Supabase-cluster backup. Private restore paths and hashes are in the operator deployment report, never in the Pages payload.

Old device UUIDs, codes, playlists, activity and expiry were preserved. The live legacy RPC returns only {"status":"upgrade_required","api_version":2}. New universe clients auto-register pending. Existing Alaa Player clients still require the separate signed app release and physically verified admin re-pair; deploying this panel does not update TV binaries.

## Rate-limit boundary
SQL budgets are atomic and have bounded key creation (only valid devices get a per-device budget; failed guesses share one bucket). They limit credential responses and registration growth, but do NOT prevent bandwidth/DB-load denial-of-service or anonymous attackers exhausting the global registration budget. Configure Supabase gateway/Edge or external WAF per-IP throttling before public rollout. Secrets hash with native PostgreSQL SHA256, never stored plaintext in token table; provider credentials remain in RLS-protected playlists and are necessarily delivered to authorized TVs.

## Files
Forward supabase/migrations/20261028_secure_devices.sql. Fail-closed rollback supabase/migrations/20261028_secure_devices.rollback.sql revokes v2/admin operations but retains data/token bindings and the legacy lockout. This is intentionally NOT a return to insecure code-only access. Reapply forward migration to recover. Full schema rollback requires verified pre-change DB backup and security review.

## Automatic discovery update
On first TV launch create and securely persist random display code + 256-bit token, then call register_device_v2 automatically. No operator code typing. Device is inactive/pending and shows its code on TV. Authenticated panel reads pending rows with app_type, refreshes every 30 seconds while editor is closed, shows pending first and big تفعيل. That button opens the subscription editor; only authenticated admin Save activates atomically with the playlist. The server never accepts active/expiry/provider data from anon registration. Authenticated admin policy remains the sole activation authority.

Unactivated, playlist-free registrations expire after 24h. Config then returns registration_expired. Registration sweeps expired pending records and token hashes; active devices and devices with playlists are not deleted. This is lazy expiry/cleanup rather than a cron job; the panel hides expired pending rows immediately. Registration attempts with another device's token/code cannot claim that row. A registration_expired TV may delete its stale local pending identity and generate a fresh code/token, only after confirming it was never activated. Expiry cleanup does not apply to active subscriptions. Global registration limits also cap new DB rows; edge/IP controls still required against abuse.

This panel deployment does NOT modify either TV app binary. Automatic registration, pending discovery and admin activation were verified against the real backend using an isolated dummy device. Android universe and legacy Alaa Player must ship their separate client upgrades against this live v2 contract. No claim of real TV hardware testing is made.

## Exact live response shapes

JSON object order is not significant. UUIDs, dates, codes and subscription values vary. Field names and nullability below were verified live using a dummy provider, not customer credentials.

register_device_v2 success
```json
{"status":"registered","device_code":"A1B2C3D4E5F6","app_type":"universe"}
```
get_device_config_v2 pending
```json
{"status":"pending","device_code":"A1B2C3D4E5F6","app_type":"universe","pending_expires_at":"2026-10-29T09:54:21.650419+00:00"}
```
get_device_config_v2 active
```json
{"status":"active","device_code":"A1B2C3D4E5F6","app_type":"universe","expires_at":null,"playlists":[{"id":"00000000-0000-0000-0000-000000000000","name":"Subscription","type":"xtream","url":null,"epg_url":null,"server":"https://provider.invalid","username":"dummy-user","password":"dummy-password"}]}
```
get_device_config_v2 inactive
```json
{"status":"inactive","device_code":"A1B2C3D4E5F6","app_type":"universe","pending_expires_at":"2026-10-29T09:54:21.650419+00:00"}
```
The inactive response includes pending_expires_at even when playlists exist; it does not mean those subscription rows are deleted. Only unactivated playlist-free registration rows are swept after 24h.

get_device_config_v2 expired
```json
{"status":"expired","device_code":"A1B2C3D4E5F6","expires_at":"2026-10-27T09:54:21.650419+00:00"}
```
Credential-free status-only responses
```json
{"status":"unauthorized"}
```
```json
{"status":"registration_expired"}
```
```json
{"status":"rate_limited","retry_after":60}
```
Registration can also return {"status":"invalid"}, {"status":"unavailable"}, or {"status":"rate_limited","retry_after":3600}. These statuses do not include a playlist. Registration returns registered even if an existing bound device is active; call get_device_config_v2 for current state.

Admin save success returns {"status":"saved","playlist_id":"<uuid>"}. Nonadmins get HTTP403 for admin RPCs; anon without execute grants gets HTTP401/403, never a playlist. Omitting p_device_token entirely is an HTTP404 PostgREST function-resolution failure; sending an empty/wrong token returns HTTP200 with status unauthorized. Legacy get_device_config and register_device return {"status":"upgrade_required","api_version":2} without device metadata or playlists.

WAF/IP-level DoS controls are not configured by this deployment. Per-device rate behavior was verified by seeding ONLY a disposable test device's private budget then fetching config; global anonymous budgets were not exhaustion-tested on production. No legacy migration token is transferred through the public code field.

## Admin device deletion, 2026-10-28

`admin_delete_device {"p_device_id":"<device UUID>"}` requires an authenticated admin JWT and explicit confirmation. Anonymous callers have no execute grant; authenticated nonadmins fail `is_admin()`. Direct REST DELETE on devices remains revoked for browser roles. Success returns `{"status":"deleted","deleted_playlists":N}`. An absent/already-removed UUID returns `{"status":"not_found"}`.

Owner changed the previous preserve-playlists behavior. Deletion now removes this device's playlist rows (including credentials), private pairing token and device-specific budget, atomically. Only playlists associated with the selected device at deletion are candidates. Pre-existing unassigned playlists and other devices' subscription rows remain untouched, even when they contain identical provider credentials.

Live schema inspection of every foreign key found only `playlists.device_id` and the private token FK referencing devices; there are no junction/link tables or foreign keys referencing playlists. `playlists.device_id` is a single nullable UUID, so sharing ONE playlist UUID across devices is not representable today. No new sharing model/UI is introduced by this change. The current safe behavior preserves another device's independent subscription row, not a fictional many-to-many association. If a shared-link model is introduced later, this RPC MUST be revised to detach the selected link and delete a playlist only after checking all remaining references.

Device FOR UPDATE locks serialize activation and new FK references; playlist locks in UUID order serialize edits/reassignment. DELETE rechecks device_id after waiting. FK constraints remain enforced. Orphans unrelated to this deletion are never swept. A cached subscription already delivered to a TV cannot be remotely erased by database deletion; revoke it with the provider if necessary. Registering again requires admin activation. Deployment tests use disposable fixtures only, never customer devices.

Forward migration `supabase/migrations/20261028_delete_device_subscription.sql` replaces the previous preserve-only RPC. The nullable SET NULL FK is retained as defense against unrelated service operations; the RPC explicitly deletes only its selected device's rows before removing the device. A Pages rollback does not restore deleted records or roll back SQL. Private snapshot/manual verified restore is required after an accidental deletion.
