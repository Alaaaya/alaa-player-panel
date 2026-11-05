# Category gateway production deployment

Node 22+ on Render Free. No persistent local storage required. Free idle spin-down causes cold starts; browser category loading may need retry. No paid plan authorized. HTTPS only at Render; provider egress uses node:https DNS-pinned public sockets, no redirects or HTTP downgrade.

Runtime environment, set privately through hosting API
SUPABASE_URL is original project https://jytjcdlmygwqizgydeyp.supabase.co
SUPABASE_ANON_KEY is public anon key, never service_role.
PANEL_ORIGIN is https://alaaaya.github.io
CATEGORY_GATEWAY_TOKEN is 32+ cryptographically random bytes base64url, server-only.
PORT is assigned by Render.

First backup original public/auth/device_private data/schema/functions/grants in repeatable-read snapshot. Apply hidden-category migration and gateway migration, provisioning only SHA256 of fresh gateway token into device_private.category_gateway_secret singleton through privileged management SQL. No raw token in migration/history/browser. Table has no anon/auth access or RLS policy. Only a validated real admin JWT combined with server secret can acquire/release. No endpoint accepts arbitrary user scope, limit amount or URL.

Durable PostgreSQL transaction advisory lock serializes admission across processes/restarts. Global 60 and per-admin20 fixed rolling-start60-second budgets; global8 concurrent45-second leases; failed/denied requests never fall back to memory. One user can only spend its own quota. Lease release authenticates same user and server secret; crash lease expires in DB. Global limit continues through process restarts even if all leases released. Error details, tokens, credentials, URLs never logged.

Server local caps are defense in depth, not authoritative quotas. Inbound body1024B, headers16KiB,3-second body timeout,16 active requests,128 connections. Provider timeout8s, response2MiB,10000 categories. Supabase calls8-second timeout. No owner real provider call is needed for verification; dummy fixtures only.

Health GET /healthz, category POST /api/admin/device-categories. No query strings accepted by runtime route. CORS exact GitHub Pages origin. Missing/invalid origin denied before Auth. DB failure returns503 without provider fetch. Network/protocol provider failures return generic502.

Render build npm ci --omit=dev, start npm run start:gateway. Bind0.0.0.0:$PORT. No background server setup on sandbox. Auto deploy off, branch kat/categories-production explicitly selected. Deploy gateway first, verify, then build panel with VITE_CATEGORY_API_BASE=gateway HTTPS URL after frontend final counter fix. Tag previous Pages main rollback before any push to main. No app changes in scope.

SQL rollback requires review of current state, no blind dropping tables. Restore original get_device_config_v2 from timestamped snapshot and restore grants before removing wrapper/base; remove category trigger/column and new objects only after backup of any newly saved owner settings. Use GitHub Pages rollback tag for panel, suspend new gateway if necessary. Preserve original Render service.
