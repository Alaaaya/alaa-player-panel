# Public and admin separation

Public root accepts manual 12-hex device code plus M3U/Xtream details. It only queues a request; no device lookup, existing subscription retrieval, activation, expiry mutation or playlist writes are granted to visitors. Unknown codes return the same submitted response. A submitted response is not confirmation that a device exists or will be activated.

Admin route /alaa-player-panel/admin/ uses existing Supabase email/password login and verified admins table. Every review RPC independently checks is_admin. Admin must verify the customer/device owner before approval. Approval adds a new playlist and activates using existing atomic admin_save_subscription; it never replaces a playlist or extends expiration. Rejection changes no device. Both review decisions clear queued credentials. Existing admin management and themes remain.

Abuse controls are database-enforced 60 well-formed submissions/hour globally, 3/code/hour (including unknown codes), 3 pending/device, 200 pending globally, bounded payload and field sizes, strict type/code/URL validation. These controls limit queue abuse but are NOT per-IP edge/WAF protection and can be exhausted by an attacker. No claim of CAPTCHA or IP throttling is made. Pending requests remain until reviewed. Provider credentials necessarily exist in protected database storage, as in the original playlists table. Never log request bodies.

Migration 20261105_public_requests.sql adds only the queue and two functions; existing policies remain unchanged. Public queue table privileges revoked. Authenticated users can SELECT only via admin RLS, with no table write privileges. Approval/rejection is row-locked and transactional. Existing five devices and fourteen playlists were unchanged on deployment.

Security tests run through the live database inside rollback transactions, using an isolated dummy device and emulated anon/nonadmin/admin roles. They verify submit does not activate or create playlist, unknown-code response equivalence, table and RLS denial, nonadmin review denial, real admin approval creates exactly one playlist and activates, payload clearing, rate limit, unsafe URL rejection. REST anonymous SELECT requests to devices/playlists/queue all returned 401. Seven existing playlist unit tests passed.

Build with npm ci followed by scripts/build-pages.sh. dist/admin/index.html supports real /admin/ and refresh; Pages redirects directory /admin to /admin/. 404.html uses absolute asset paths for deep fallback. Theme background paths target /alaa-player-panel/. Deployment stays main root GitHub Pages, complete reproducible source under app-source.

Logged-in browser review with owner's password was not performed; no credentials guessed and no real customer request submitted during testing. Backend admin review was verified transactionally without persistent test data. No TV/iOS/Mirsa changes.
