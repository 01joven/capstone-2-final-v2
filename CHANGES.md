# Security and correctness fixes

## Policy change
- Administrator self-service email reset is now enabled (`/admin/recovery` works like staff/user, 12-character minimum enforced server-side). The operator CLI reset remains as fallback. Demo-data system removed: `is_demo` columns dropped, purge-demo endpoint/CLI deleted, all records are real data.

## Critical
- Removed the hardcoded default admin password (`password123`) from the seed script, scripts, and README. Seeding now needs `ADMIN_SEED_PASSWORD` (12+ chars).
- Deleted dev scripts that created admins with a known password or wiped the data directory: `create_admin.js`, `reset_and_create.js`, `recreate_admin.js`, `test_login.js`, `debug.js`, `list_users.js`, `test_users_page.js`.
- In production (`NODE_ENV=production`) the server refuses to start without a real `DATABASE_URL` and never runs on the embedded database.

## High
- Password reset no longer reveals whether an account exists (the 503 on delivery failure is gone; email is sent after the response decision).
- Reset codes are stored as HMAC-SHA256 keyed with `JWT_SECRET`. Per-account caps: 5 requests/hour, 10 failed attempts/hour across all codes.
- Administrator self-service email reset is disabled (matches the README's operator-only policy). Admin recovery page shows an operator notice.
- Rate limiting (in-memory) on login (per IP and per email), admin/staff login, registration, reset request, and reset confirm.
- Login compares against a dummy hash for unknown emails, so response timing does not reveal accounts.
- Profile changes: email or password changes require the current password; password changes and email changes revoke existing sessions and return a fresh token.
- New `POST /api/auth/logout` revokes the session server-side; the client calls it on logout.
- Only administrators can create or mark records as demo. Staff can no longer bypass the authorization check.
- `purgeDemoData` no longer queries nonexistent `email` columns; the purge-demo endpoint works.
- `render.yaml` sets the Resend variables and `NODE_ENV=production`, and drops the unused SMTP settings.

## Medium
- `GET /api/burials` requires sign-in, caps results at 50, requires 2+ character searches, and omits birth dates.
- Records without a grave reference no longer get invented plot positions; they show as unassigned.
- Plot and section SQL bounds lot numbers to 5 digits before the integer cast, and record writes reject lot numbers above 10000.
- Database TLS verification is on by default (`DATABASE_SSL_REJECT_UNAUTHORIZED=false` to opt out).
- CORS restricted to `CORS_ORIGINS`. Security headers added (nosniff, frame DENY, referrer policy, no-store on API).
- Body limit reduced to 100kb.
- Admin-created admin accounts require 12-character passwords. Bcrypt cost raised to 12 for new hashes.
- Passwords are limited to 72 bytes at registration and profile update, not only at reset.

## Low
- Reservation dates use the Asia/Manila calendar (`APP_TIMEZONE`), server and client.
- Reservation detail shows an error instead of hanging on "Loading..." if the memorial fails to load.
- Removed dead email-change API methods.
- Replaced third-party placeholder images with a local image.
- Schema: CHECK constraints on role, reservation status, and payment status (added NOT VALID), indexes on foreign-key columns, seed images only filled when empty (no longer reverted on each restart).
- Added unit tests (`npm test --workspace=memorial-map-backend`) for the limiter and plot parsing.

## Not changed (see notes)
- Tokens remain in `localStorage`. Moving to httpOnly cookies is a larger refactor.
- No CSP or SRI for Leaflet from unpkg. Add these as deployment headers after testing the map.
- Rate limiter is per instance and resets on restart.
- Manual GCash verification has no amount check (by design).
- No duplicate-booking rule for memorial sites.
