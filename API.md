# Device API v2 · local proposal, not deployed

## Backend verification
Production GitHub Pages main 78b2e11 embeds https://jytjcdlmygwqizgydeyp.supabase.co, NOT czrypjsgjjmjzyyjhyxd. Public GET /auth/v1/health returned 200 with the bundled anon key, reporting GoTrue v2.197.0. The old project is reachable; these checks do not prove database availability or its dashboard pause status. REST root without key returned 401/no key; with anon returned 401/service-role-only. No device config RPC or write was called. Management PAT returned 401 Unauthorized. Do not switch projects based on the account list.

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

## Required deployment gate
Do NOT deploy this UI alone: its simplified Save depends on admin_save_subscription. Do NOT apply SQL alone without updated clients and owner's coordinated migration plan. Parent/owner must approve screenshot and migration. Obtain access to the ACTUAL old project's Supabase dashboard, back up data/function definitions/grants, and verify live schema matches local migration assumptions. The management PAT supplied is unauthorized; a valid owner session/token with access to old project is required. No backup of live DB has been obtained yet, so this is a blocker, not completed protection.

## Rate-limit boundary
SQL budgets are atomic and have bounded key creation (only valid devices get a per-device budget; failed guesses share one bucket). They limit credential responses and registration growth, but do NOT prevent bandwidth/DB-load denial-of-service or anonymous attackers exhausting the global registration budget. Configure Supabase gateway/Edge or external WAF per-IP throttling before public rollout. Secrets hash with native PostgreSQL SHA256, never stored plaintext in token table; provider credentials remain in RLS-protected playlists and are necessarily delivered to authorized TVs.

## Files
Forward supabase/migrations/20261028_secure_devices.sql. Fail-closed rollback supabase/migrations/20261028_secure_devices.rollback.sql revokes v2/admin operations but retains data/token bindings and the legacy lockout. This is intentionally NOT a return to insecure code-only access. Reapply forward migration to recover. Full schema rollback requires verified pre-change DB backup and security review.

## Automatic discovery update
On first TV launch create and securely persist random display code + 256-bit token, then call register_device_v2 automatically. No operator code typing. Device is inactive/pending and shows its code on TV. Authenticated panel reads pending rows with app_type, refreshes every 30 seconds while editor is closed, shows pending first and big تفعيل. That button opens the subscription editor; only authenticated admin Save activates atomically with the playlist. The server never accepts active/expiry/provider data from anon registration. Authenticated admin policy remains the sole activation authority.

Unactivated, playlist-free registrations expire after 24h. Config then returns registration_expired. Registration sweeps expired pending records and token hashes; active devices and devices with playlists are not deleted. This is lazy expiry/cleanup rather than a cron job; the panel hides expired pending rows immediately. Registration attempts with another device's token/code cannot claim that row. A registration_expired TV may delete its stale local pending identity and generate a fresh code/token, only after confirming it was never activated. Expiry cleanup does not apply to active subscriptions. Global registration limits also cap new DB rows; edge/IP controls still required against abuse.

This panel change does NOT modify either TV app binary. Android universe must implement these launch/register/token requests against the deployed v2 contract. Legacy Alaa Player requires its own client upgrade and verified admin token binding. Until both client and SQL are released, auto-discovery is demonstrated with local fixtures only.
