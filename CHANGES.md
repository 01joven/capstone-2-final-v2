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

## Payment authorization and anonymous search hardening
- Removed the legacy `POST /api/payments/create` endpoint. It marked a payment `completed`, confirmed the reservation, and issued a receipt with no staff verification step, and nothing in the UI called it.
- `POST /api/payments/admin/:id/verify` now refuses to approve a payment whose reservation is cancelled or rejected, and refuses a second completed payment for the same reservation (409). Rejection stays allowed so cancelled reservations can still be cleared from the queue.
- New partial unique index `payments_one_completed_per_reservation` enforces at most one completed payment per reservation, even under concurrent approvals. It is created defensively: if legacy duplicates exist the index is skipped with a warning instead of blocking startup.
- Receipts (`GET /api/payments/:id/receipt`) now require the reservation owner or a staff/admin account, and a denied read no longer issues a receipt.
- Anonymous burial search: LIKE wildcards (`%`, `_`, `\`) in `search` and `cemetery` are escaped and every affected query uses `ESCAPE '\'`; anonymous callers are limited to 25 rows and a 3-character minimum; the public rate limit dropped from 300 to 120 requests per 15 minutes. Authenticated search is unchanged (50 rows, 2 characters).
- The guest UI mirrors the 3-character rule with an inline message.
- Tests: the backend suite now runs every `*.test.js` in `backend/test` (`node --test`) and includes payment integration tests against an in-memory embedded database (`PGLITE_DATA_DIR=:memory:`) covering approval integrity and receipt authorization.

## Cash-only payments
- Retired the manual GCash verification queue: `GET /api/payments/admin/pending` and `POST /api/payments/admin/:id/verify`, their controller functions, and the unused frontend `paymentAPI` methods (`getPendingVerifications`, `verify`) are removed. Cash (walk-in) recorded via `POST /api/payments/record-cash` is the only payment path.
- `pending_verification` stays in the `payment_status` schema values and its CHECK constraint only so legacy rows remain valid; nothing writes it anymore.
- The guarantees going forward are the `payments_one_completed_per_reservation` unique index (at most one completed payment per reservation) and `recordCashPayment`, the only writer of completed payments and the only issuer of receipts.
- Renamed the remaining GCash labels to cash-neutral wording (README, schema defaults `payment_method` -> 'Cash' and settlement `from_wallet` -> 'Cash on hand', and the backend collections/settlements messages/comments). The collections and settlement-transfer feature itself is unchanged.

## Dependencies and CI
- Applied `npm audit fix` for the root workspace: axios (many advisories) and form-data updated, shell-quote (via concurrently) resolved. Remaining: 3 high in the dev-only nodemon -> chokidar -> braces chain (no non-breaking fix exists) and 2 moderate in react-router 6.30.4 (fix requires the react-router-dom 7 major upgrade).
- `frontend/package-lock.json` was stale (it still recorded the vite 4-era `@vitejs/plugin-react@^4.3.3`); regenerated so it matches `frontend/package.json`, with axios raised to `^1.20.0` in both the manifest and the lock so the deployed frontend cannot resolve a vulnerable version.
- Added `.github/workflows/ci.yml`: install with `npm ci`, run the backend tests, build the frontend, and fail on high or critical advisories in production dependencies.

## Not changed (see notes)
- Tokens remain in `localStorage`. Moving to httpOnly cookies is a larger refactor.
- No CSP or SRI for Leaflet from unpkg. Add these as deployment headers after testing the map.
- Rate limiter is per instance and resets on restart.
- No duplicate-booking rule for memorial sites.
