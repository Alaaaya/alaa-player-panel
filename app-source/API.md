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


# Category visibility extension v2.1, PROPOSAL ONLY

Not live. No app-side implementation or hardware testing. Current live Device API v2 remains unchanged until owner approves screenshots, an operator verifies a fresh backup, and the server plus SQL migration are separately authorized/deployed. Do not ship app expectations against this proposal yet.

## Identity and scope

A hidden category is identified by `(device_id UUID, playlist_id UUID, media_type, category_id string)`. Media names are exactly `live`, `vod`, `series`; the panel labels them مباشر / أفلام / مسلسلات. Xtream actions map respectively to get_live_categories / get_vod_categories / get_series_categories. Category IDs are provider ID strings, never translated names, indexes, numbers coerced by the client, or generated hashes. They match `^[0-9]{1,64}$`. String `007` stays `007`. IDs overlap across media and across providers, so never merge those namespaces. Each playlist belongs to one device in the current schema; multiple subscriptions use a playlist selector, not a merged list. Provider edits or playlist reassignment clear prior visibility settings through a local proposal trigger to avoid hiding unrelated categories in a replacement provider. Subscription deletion cascades settings.

M3U group-title is not an Xtream ID. This version explicitly returns unsupported_m3u; it does not enumerate, hide, infer media type, or invent IDs for M3U groups. Both apps ignore this extension on M3U until a separate versioned group contract is approved.

## Secure enumeration proposal

POST `${VITE_CATEGORY_API_BASE}/api/admin/device-categories` with HTTPS, Authorization Bearer admin Supabase access JWT and Content-Type application/json. Body is only `{ "device_id": "UUID", "playlist_id": "UUID", "media_type": "live" }`. Unknown fields, including browser-supplied provider URLs/credentials/actions, are rejected. Browser sends no provider credential to this endpoint. Existing admin playlist editor independently retains its existing credential-editing capability; this change is not a claim that admins cannot view credentials.

Server validates the JWT against the project's Auth server using getUser(token), rejects anonymous sessions, then checks is_admin using that validated bearer token. Its RLS-protected playlist query filters BOTH stored device and playlist IDs; no service role is required. Missing/mismatched subscription returns HTTP404 with status not_found. Nonadmins get 403 forbidden; missing/invalid JWT gets 401 unauthorized. M3U returns 422 unsupported_m3u. Success HTTP200 is `{ "status":"ok", "playlist_id":"UUID", "media_type":"live", "provider_generation":"UUID", "hidden_category_ids":{"live":[],"vod":[],"series":[]}, "category_versions":{"live":{},"vod":{},"series":{}}, "categories":[{"id":"7","name":"Sports"}] }`. Empty categories is a successful empty array, not failure. The server reads a consistent admin_get_category_snapshot(device_id,playlist_id) after category fetch and compares its provider_generation UUID to the fetched subscription generation; a provider change returns HTTP409 provider_changed, never mismatched categories/settings. Snapshot exposes no credentials. Category values and settings therefore belong to the same provider generation. Superseded/closed UI loads are forbidden to mutate cache/model, even before rendering. Errors are generic and contain no URL, username, password, response body, request dump or stack trace. All responses Cache-Control no-store; exact panel-origin CORS, no wildcard credentialed access, Origin required. This endpoint never proxies arbitrary URLs, images, EPG or stream payloads.

The Node implementation requires real server hosting. GitHub Pages cannot run it. It is intentionally NOT a stock Supabase Edge fetch with DNS pre-check, because pre-check followed by ordinary fetch is vulnerable to DNS rebinding. Before approval select authenticated Node hosting or an equivalent controlled egress proxy that can pin the verified destination to the actual socket.

The proposal uses maintained ipaddr.js 2.5.0 IP range classification, resolves all DNS answers on EVERY provider request, rejects the entire answer if any destination is not public unicast (IPv4/IPv6, mapped IPv4, loopback/private/linklocal/metadata/CGNAT/multicast/reserved/transition ranges), then pins the selected IP using Node HTTPS lookup with a fresh non-pooled agent. TLS verifies the original hostname. Redirects are NEVER followed. HTTPS root-origin servers only; ports 443/default and 8443. HTTP/custom paths/other ports are intentionally rejected, even if an existing TV subscription works using them. Do not weaken this rule silently. A safe additional port allowlist or owner-approved egress deployment is needed for incompatible providers.

Upstream request is limited to eight seconds including DNS/socket/body, 16KiB response headers, 2MiB raw body, identity encoding only, JSON content type, 10000 categories maximum, category name maximum 300 characters. No gzip decompression bombs. Username/password appear only in the upstream Xtream query string, not public API input/output. HTTPS proxy/access logs and APM must redact or disable URL/query/header/body logging for upstream calls and redact Authorization on incoming calls. Code itself emits no logs. Infrastructure logging cannot be verified in a local preview.

Per-process admin enumeration budget is 20 requests/minute, maximum eight simultaneous requests globally and maximum 1000 unexpired admin keys. Return 429 rate_limited with retry_after 60. Before production, shared gateway/WAF per-IP and per-admin limits plus header/whole-request deadlines are REQUIRED (the handler also imposes a 3-second JSON body-read deadline), since a process-local map does not provide a multi-replica distributed limit and authentication itself consumes resources. Never deploy a public unauthenticated provider fetcher. Enforce HTTPS, no-store and redaction at ingress too.

## Atomic immediate save proposal

POST existing project `/rest/v1/rpc/admin_set_category_hidden`, apikey public anon key, Authorization Bearer admin JWT. Body exactly `{ "p_device_id":"UUID", "p_playlist_id":"UUID", "p_media_type":"live", "p_category_id":"7", "p_hidden":true, "p_expected_version":0, "p_provider_generation":"UUID" }`.

Settings stored in admin-readable RLS-protected device_category_settings with keys device_id + playlist_id. `hidden_category_ids` is exactly `{ "live":[], "vod":[], "series":[] }` by default. Each array contains ID strings. Internal admin-only category_versions tracks per-ID CAS counters, default 0. No browser direct INSERT/UPDATE grant exists, even for admin, so stale whole objects cannot overwrite other tabs/devices. RPC authenticates is_admin, locks device then associated Xtream playlist then settings row, rechecks both IDs, and changes only one ID in one media array in one transaction.

Success `{ "status":"saved", "hidden":true, "version":1 }`. A no-op with correct expected_version returns saved without increment. The RPC also compares p_provider_generation UUID under the playlist lock; provider replacement/reassignment rotates a persistent category_provider_generation UUID even when the settings row was absent. An old dialog receives status provider_changed and must discard cached enumeration/settings and reload, never retry using old IDs against the new provider. A stale request returns `{ "status":"conflict", "hidden":false, "version":2 }` from authoritative stored state and performs no mutation. Conflicts are NOT silently retried; UI adopts the authoritative state and shows a retry message. Explicit next user tap uses that new version. Other statuses invalid / not_found / limit_reached do not acknowledge a successful change. Anonymous execution denied; authenticated nonadmin forbidden. A maximum 10000 hidden IDs and 10000 distinct edited category IDs per playlist/media bounds arrays and version maps. Requests may only set a leaf, never toggle an unknown server state.

The UI optimistically updates the tapped row; only that row has a spinner and aria-disabled=true / aria-busy=true. Duplicate clicks on a saving row are suppressed. Other rows remain usable. Hidden rows grey out and move to the bottom with stable original provider order within visible/hidden partitions. Search string, active tab and keyboard focus survive saving/reordering. On network/error the row rolls back; on CAS conflict it adopts the returned authoritative value. Two requests on different rows/types/devices never overwrite each other. A lost response may have committed server-side; a retry with stale version yields a conflict and reconciles state. This is deliberate, not a claim of transport exactly-once execution.

## Device config proposal, exact application contract

Owner goal is a faster TV, not merely a shorter menu. This is a REQUIRED implementation contract for BOTH Alaa Player Android and universe; this task contains docs and a panel preview only, with NO app code changes or measured TV speed improvement.

Existing get_device_config_v2 request/code/private-token authentication remains unchanged. Only each playlist in an ACTIVE response gets these additive typed fields:

```ts
type MediaType = 'live' | 'vod' | 'series';
type HiddenCategoryIds = { live: string[]; vod: string[]; series: string[] };
type CategoryPolicyV1 = {
  category_provider_generation: string; // UUID, provider identity epoch
  category_settings_version: 1; // schema version, NOT an update revision
  category_config_revision: string; // opaque hc1_ + 64 lowercase SHA-256 hex digits
  hidden_category_ids: HiddenCategoryIds;
};
```

IDs are exact provider category ID strings matching `^[0-9]{1,64}$`, scoped by securely paired device identity, playlist UUID and media type. Never combine IDs across those scopes or convert `007` into `7`. Example ACTIVE playlist fragment is `{ "id":"playlist UUID", "type":"xtream", "category_provider_generation":"provider UUID", "category_settings_version":1, "category_config_revision":"hc1_<64 lowercase hex digits>", "hidden_category_ids":{"live":["7"],"vod":[],"series":["21"]} }`, alongside its existing credential fields. Hidden IDs are not a top-level device aggregate. No category settings or playlist data is added to unauthorized/pending/inactive/expired/rate_limited/registration_expired responses. Authorized device reads ONLY its own settings through its private token; anon cannot read/write the settings table. Admin JWT is never given to a TV.

`category_config_revision` is a content hash over PostgreSQL canonical JSONB text of exactly `{ "playlist_id": playlist UUID string, "provider_generation": provider UUID string, "hidden_category_ids": HiddenCategoryIds }`, UTF-8 encoded, calculated server-side as `hc1_` concatenated with lowercase SHA-256 hex. Clients treat it as OPAQUE and compare only equality, never recalculate from differently serialized JSON or infer time/order from it. It changes when any authoritative media array changes; no-op saves keep it. Returning to the same full policy can return the same hash. Missing settings row is an authoritative all-empty policy with its corresponding revision. Provider replacement/reassignment clears settings; existing provider-identity/credential cache invalidation remains mandatory and a rotated provider-generation UUID also changes the category revision even for two empty policies. Revision is a cache policy identity, NOT an authorization token, timestamp, provider-content revision or replacement for token expiry.

A new successful revision invalidates the old derived category/stream/search/home/favorites/recent projections for that device+playlist as ONE transaction or serialized snapshot swap. It is sufficient to diff the three arrays and evict only newly hidden categories, but no reader may observe a mix of old policy/new catalog or vice versa. The app must serialize secure config refreshes per device or discard responses from superseded request generations; a hash cannot order out-of-order network responses. A stale catalog job must carry its initiating device+playlist+policy generation and must not commit, display or refill a cache once that generation is obsolete. Recheck visibility before starting EACH item/episode/poster request and again before committing its result.

Missing category fields in a successful compatible legacy config mean `{ "live":[], "vod":[], "series":[] }` for backward compatibility, not an exception. Missing revision in such a legacy response uses a local legacy-empty policy sentinel, never a fabricated server revision. A recognized v1 policy must validate all three arrays and ID strings. Explicit successful v1 empty arrays authoritatively clear prior hides. Unknown schema version or malformed v1 data preserves last-known valid policy and is NOT interpreted as authoritative empty; with no valid policy, defer provider catalog fetching until a supported valid/legacy config is established. Keep that behavior separate from a temporary network failure, which never clears known hides. M3U ignores the Xtream-ID extension until its separate contract exists.

## Required category-first fetching, caching and reconciliation

On startup, restore the last-known valid policy from secure storage under the EXACT paired device identity and playlist UUID BEFORE exposing any cached catalog. Apply that policy to a coherent cache snapshot first; never flash an unfiltered cache while waiting for the network. Begin secure get_device_config_v2 refresh first/as early as possible, before launching provider catalog synchronization. Cache-first display may use last-known policy while the refresh is in flight, but it cannot know changes made while offline until a new config arrives. With no established valid/legacy config, hold provider content behind loading/pairing rather than expose an unrestricted prior device cache. If any existing persisted catalog has unknown category membership, do not expose/prefetch it under a known hide policy until membership can be determined without fetching hidden-category items. Existing pairing/expiry/revocation/offline rules still apply, with authoritative inactive/expired/revoked responses stopping playback as already required by v2. Re-pair/remove subscription clears that identity's policy and projections.

After receiving `get_live_categories`, `get_vod_categories` or `get_series_categories`, IMMEDIATELY subtract the matching hidden ID set for that playlist/media BEFORE scheduling ANY stream-list, series-info, episode, poster, artwork, prefetch or cache work. Fetching the small category-name/ID list is allowed and necessary; fetching the hidden categories' contents is not. Recheck latest policy after category response and before dispatch, since the policy may change while categories are loading. Unknown/deleted hidden IDs are harmless. Do not request hidden categories to verify whether they contain anything.

Where the provider supports category filtering, use ONLY visible-category requests: `player_api.php?action=get_live_streams&category_id=<visible ID>`, `action=get_vod_streams&category_id=<visible ID>`, or `action=get_series&category_id=<visible ID>`, with the normal securely stored Xtream credentials. Do NOT use their unfiltered fullcatalog forms for initial sync, refresh, count calculation or prefetch. An empty visible-category set means ZERO stream/catalog requests. For a visible series, lazily fetch `get_series_info&series_id=<ID>` only when needed and only while its parent category remains visible. An absent category_id must NEVER mean accidentally fetch everything. Membership-aware shared items may be displayed only if none of their known category memberships is hidden; retain per-category ownership references so cache cleanup does not resurrect a shared hidden item.

If a provider ignores category_id and returns a full catalog, validate category membership before display/cache and discard hidden contents immediately; never persist or prefetch them. Mark that provider/media capability as fullcatalog-only so future UI and diagnostics do not claim per-category transfer savings. A provider with only fullcatalog/M3U necessarily may transfer hidden content within a bulk response; the app CANNOT promise avoiding that network transfer. Do not silently turn a failed category request into an unfiltered fullcatalog request. Default to a visible unavailable/retry state; an explicitly documented capability-specific fullcatalog fallback must separately disclose the unavoidable transfer and still filter before any persistence/rendering/downstream detail/poster requests. M3U hiding is UNSUPPORTED in this version and group-title is not an Xtream ID. No invented IDs or speed guarantees. The strict never-fetch-hidden-content guarantee applies only when provider category-filtered APIs actually honor it, not to data already included in their unavoidable bulk response.

When a valid refreshed policy newly hides a category, atomically publish the new visibility snapshot, cancel queued/inflight stream-list, detail/episode, poster/artwork and prefetch tasks for that category, and reject late responses using generation checks. Evict its existing cached channel/VOD/series/episode records and their owned artwork/poster entries, plus derived search indexes/home rails/favorites/recent display entries. Cancel/evict even if that category is not on the currently visible screen. Remove or stop an actively displayed/playing item that becomes hidden, preventing a stale player/deep link from exposing it. Shared physical poster files may remain only if still referenced by allowed visible items; remove every hidden item's own cache reference. Preserve minimal user favorite/reorder/history metadata as opaque stable IDs where appropriate, but it must not contain retained hidden item payloads/poster blobs or expose hidden titles in display/search. User metadata must not trigger hidden item/detail retrieval just to resolve a favorite or history entry.

When a category becomes visible again, do NOT bulk-refetch the entire subscription or all unhidden categories immediately. Lazily fetch that newly visible category only when its screen/content is requested, using its category_id and the normal bounded provider concurrency. Existing favorite/reorder/history metadata can reconnect after allowed items arrive. Do not repopulate from a stale hidden-generation cache. Other still-visible category caches can remain valid unless a separate provider-content refresh requires updating them.

Refresh silently on every open using current v2 cadence; no new aggressive polling. The panel's save is immediate on the SERVER, not an assertion that an offline/running TV receives an instant push. Device applies it when its next secure config refresh succeeds. On a new revision, reconcile before exposing or fetching newly affected content as above. App-team acceptance must verify request traces contain no hidden category_id calls, no unfiltered catalog requests for category-capable providers, no hidden posters/details/prefetch, cache-first no-flash, cancellation/late-result rejection, media/device/playlist isolation, and unhide lazy fetching. No such device-side tests or speed measurements are claimed by this panel preview.

This is presentation/performance configuration, NOT server-side content authorization or DRM: a paired TV still has provider credentials and a modified client can bypass it.

## Local verification and rollout gate

Screenshots contain explicit Arabic mock-data preview label. No real provider was fetched and no live DB was modified. Local PostgreSQL clone exercises actual proposed schema/RPC, RLS, two-session races, media/playlist/device isolation, unauthorized tokens, defaults, expiry/inactivity and provider replacement. Browser harness mocks admin/backend/provider responses only. Node transport tests use mocked sockets, so real hosting DNS, TLS, egress/WAF, log redaction and device playback remain deployment/hardware gates, not established facts.

Apply SQL once, after verified private backup, to the original jytjcdlmygwqizgydeyp project ONLY when approved. The preview migration is not idempotent and intentionally fails on duplicate application. It relocates existing config implementation into the unexposed private schema and wraps its result, preserving existing function privileges; verify ownership matches the production migration operator. Local restored-clone compatibility grants were needed because backup restore assigned private table/schema ownership to kit while functions retained postgres. These grants are clone-only, never a reason to add broad grants in production. Existing migration default grants are explicitly revoked for every new public function/table.
