# Memorial Map Service

A full-stack memorial-site discovery and reservation app built with React, Express, and PostgreSQL.

## Requirements

- Node.js 20.19+ or 22.12+
- No separate database install is required for local development

## Setup

Run these commands from the project root (`capstone-2-final`):

```powershell
npm install
```

The app works without a hosted database: by default, it creates a persistent local PostgreSQL database in `backend/data`. You can start the app immediately; copy the optional config file only if you want to connect to Neon:

```powershell
Copy-Item backend/.env.example backend/.env
```

To use Neon, uncomment `DATABASE_URL` in `backend/.env` and replace the example with your real PostgreSQL connection string. With `DATABASE_URL` unset, the app selects local mode and creates its own private JWT secret. For Neon, set `JWT_SECRET` to a private random value at least 32 characters long. Do not commit or share `backend/.env`.

User registration no longer requires email verification. Account creation is administrator-only; new staff and administrator accounts are created in User Management. There is no public registration page or endpoint.

Configure Resend with `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `backend/.env` to enable email delivery. This is required for self-service password resets. Set `CORS_ORIGINS` to the frontend origin(s) allowed to call the API. Create an API key at https://resend.com/api-keys and verify a sending domain. If reset email delivery is unavailable, an administrator can use the operator reset command below.

If an existing user account needs administrator access, stop the local app and run `npm run admin:promote -- your-admin-email@example.com` from the project root, then restart and sign in again. For Neon, you can instead run `UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';` in the database console. Promote only trusted administrator accounts. Payment is Cash (walk-in) recorded by staff in Payments; the static InstaPay QR is shown for reference and does not send automatic payment confirmations.

Authenticated users (staff or administrator) can reset their password from their login screens using a six-digit code sent to the registered email. Codes expire after 10 minutes, allow at most five attempts each, and accounts are limited to one request per minute and five per hour. After 10 failed attempts within an hour, the account must wait before trying again. Codes are stored as keyed HMACs, not plain hashes. Password resets, password changes, and sign-outs revoke existing sessions. Administrator passwords must be at least 12 characters. To change an administrator email, run `npm run admin:change-email -- old-admin@example.com new-admin@example.com --verified-authorized`. As a recovery fallback, run `npm run admin:reset-password -- admin@example.com --verified-authorized` and enter the new password in the private terminal prompt.

The dev server creates the local database tables and memorial site records automatically. For local development it seeds an administrator only if you set a password in `backend/.env`:
- `ADMIN_SEED_PASSWORD` (required, at least 12 characters). Nothing is seeded if it is unset.
- `ADMIN_SEED_EMAIL` (optional, defaults to `admin@cemetery.gov`).

No default password exists in the code.

To create the database tables manually:

```powershell
npm run db:setup
```

To create the seeded admin account manually (uses `ADMIN_SEED_PASSWORD`):

```powershell
npm run admin:seed
```

### Real accounts and staff access

The system runs on real data. There are two actors: **Staff** and **Administrator**. Public registration is not available; staff and administrator accounts are created by administrators in User Management.

To bootstrap the first real accounts, stop the app and create them directly:

```powershell
npm run user:create -- "Admin Name" admin@example.com StrongPassword123 admin
npm run user:create -- "Staff Name" staff@example.com StrongPassword123 staff
```

To create a staff account from an existing account that does not yet have staff access, stop the app and run:

```powershell
npm run staff:promote -- staff@example.com
```

To grant staff access to an existing registered account instead, stop the app and run:

```powershell
npm run staff:promote -- staff@example.com
```

Sign-in pages: staff at `/staff/login`, administrators at `/admin/login`. Staff manage memorial records, memorial sites, reservations, reports, collections, and cash payment recording, but cannot access User Management; that stays administrator-only. Administrators can create staff or administrator accounts in User Management and change roles, deactivate, or delete accounts there (never their own, and never the last administrator). There is no public registration. Administrator credential recovery and email changes are performed by a trusted operator, not from self-service account screens.

Start the backend and frontend together:

```powershell
npm run dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:5000`; check `http://localhost:5000/api/health` to confirm its database connection.

If PowerShell blocks `npm.ps1`, run `npm.cmd install`, `npm.cmd run db:setup`, and `npm.cmd run dev` instead. Alternatively, allow scripts only in the current terminal session:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The backend checks its configuration, database connection, and required tables before starting. If tables are missing, run `npm run db:setup` from the project root.

## User and administrator flows

Authenticated users (staff or administrator) can use Home, Search, Memorial Record, Map, Reservations, Saved Memorials, Submit Memorial, and Profile. Staff manage memorial records, memorial sites, reservations, reports, and cash payment recording, including reviewing plot requests. Staff sign in at `/staff/login` and work in the Staff Console: Dashboard, Memorial Records, Cemetery Map/Plots, Reservations, Reports, and cash payment recording, including reviewing plot requests. Administrators use `/admin/login` for the same operational screens plus User Management. Administrators can create staff and administrator accounts in User Management and change roles, deactivate, or delete accounts there (never their own, and never the last administrator). There is no public registration. Administrator credential recovery and email changes are performed by a trusted operator, not from self-service account screens.

New burial records are always real data and are published only by approving a customer memorial submission (staff or admin). The record form is used to correct an existing record, and every edit still requires confirming verification and publication authorization.

Authenticated pages refresh shared records, reservations, plot availability, payment records, saved memorials, and dashboard totals every 10 seconds while visible. Returning to a browser tab refreshes immediately. This is near-real-time polling, not instant push notifications; users need an active connection to the same running backend to see updates.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check API and database status |
| POST | `/api/auth/password-reset/request` | Request a password reset code by email |
| POST | `/api/auth/password-reset/confirm` | Verify a reset code and set a new password |
| GET | `/api/users/profile` | Get the signed-in user's profile |
| PUT | `/api/users/update` | Update the signed-in user's profile |
| POST | `/api/users/onboarding-complete` | Mark onboarding complete |
| GET | `/api/memorials` | List/search memorials |
| GET | `/api/memorials/:id` | Get a memorial |
| GET | `/api/burials?search=name&cemetery=Cogon%20Cemetery` | Search by name, lot, death date, record ID, or section |
| GET | `/api/reservations/user-reservations` | List the signed-in user's reservations |
| POST | `/api/reservations/create` | Create a reservation |
| POST | `/api/reservations/:id/cancel` | Cancel a pending or approved (awaiting-cash) reservation (owner, staff, or admin) |
| POST | `/api/submissions` | Submit memorial information for review (signed-in users) |
| GET | `/api/submissions/mine` | List my submissions and their review status |
| GET | `/api/submissions/all` | List all submissions, pending first (staff or admin) |
| POST | `/api/submissions/:id/review` | Approve or reject with optional `{ "note" }` (staff or admin). Approving publishes the memorial record; for a plot submission the plot's reservation must already be `confirmed` (cash recorded), otherwise it refuses with 409 |
| GET | `/api/reservations/plots` | List occupied plot reservations for the Cogon map (signed-in users) |
| POST | `/api/reservations/plots/:id/review` | Approve or reject a plot request with optional `{ "note" }` (staff or admin); approving marks the reservation `approved` (awaiting cash) and never confirms it. The customer is emailed if Resend is configured |
| GET | `/api/favorites` | List saved memorials |
| POST | `/api/favorites/add` | Save a memorial |
| DELETE | `/api/favorites/remove/:saved_id` | Remove a saved memorial by `saved_id` (returned as `saved_id` by `GET /api/favorites`) |
| GET | `/api/payments` | List payment history |
| GET | `/api/payments/:id/receipt` | Official receipt for a recorded cash payment (owner, staff, or admin) |
| POST | `/api/payments/record-cash` | Record a walk-in cash payment and issue the receipt (staff or admin). This is the only path that confirms a reservation (`pending` or `approved` → `confirmed`); a reservation already confirmed or completed returns 409 |
| GET | `/api/admin/dashboard` | Administrator dashboard counts |
| GET | `/api/admin/records` | List cemetery memorial records (admin only) |
| PUT | `/api/admin/records/:id` | Update a cemetery memorial record (admin only) |
| DELETE | `/api/admin/records/:id` | Delete a cemetery memorial record (admin only) |
| GET | `/api/admin/sites` | List memorial sites (admin only) |
| POST | `/api/admin/sites` | Create a memorial site (admin only) |
| PUT | `/api/admin/sites/:id` | Update a memorial site (admin only) |
| GET | `/api/admin/reservations` | List all reservations (admin only) |
| GET | `/api/admin/reports` | Reservation totals and monthly summaries (admin only) |
| GET | `/api/admin/collections?from=YYYY-MM-DD&to=YYYY-MM-DD` | Recorded cash collections by day and recorder (admin only) |
| GET | `/api/admin/settlements` | List collections-to-treasury settlement transfers (admin only) |
| POST | `/api/admin/settlements` | Record a collections-to-treasury settlement transfer (admin only) |
| GET | `/api/admin/users` | List user accounts and usage counts (admin only) |
| POST | `/api/admin/users` | Create a staff or administrator account (admin only) |
| PUT | `/api/admin/users/:id/role` | Change an account role (admin only, not self) |
| PUT | `/api/admin/users/:id/status` | Deactivate or reactivate an account (admin only, not self) |
| DELETE | `/api/admin/users/:id` | Delete an account (admin only, not self or last admin) |
| GET | `/api/staff/dashboard` | Staff workspace counts (staff or admin) |
| GET | `/api/staff/records` | List cemetery memorial records (staff or admin) |
| PUT | `/api/staff/records/:id` | Update a cemetery memorial record (staff or admin) |
| DELETE | `/api/staff/records/:id` | Delete a cemetery memorial record (staff or admin) |
| GET | `/api/staff/sites` | List memorial sites (staff or admin) |
| POST | `/api/staff/sites` | Create a memorial site (staff or admin) |
| PUT | `/api/staff/sites/:id` | Update a memorial site (staff or admin) |
| GET | `/api/staff/reservations` | List all reservations (staff or admin) |
| GET | `/api/staff/reports` | Reservation totals and monthly summaries (staff or admin) |
| GET | `/api/staff/collections?from=YYYY-MM-DD&to=YYYY-MM-DD` | Recorded cash collections by day and recorder (staff or admin) |

The Memorial Sites view includes an interactive OpenStreetMap centered on the Cogon cemetery location, the supplied Cogon/Cordova map as an optional reference, a separate interactive view of saved memorial-site coordinates, and an Add Reservation action for each site. The cemetery pin uses the mapped Cordova Catholic Cemetery location in Cogon; the memorial-site coordinates are shown separately in Site Pins. The four supplied cemetery photos are stored in `frontend/public/cemetery-images` and assigned to the Heritage, Peaceful Gardens, Riverside, and Sunset memorial records in the database seed.

Login and registration use a responsive split-panel layout over the supplied Cogon cemetery photo. The original memorial logo is reused in the authentication header, landing page, and application sidebar.

Payments are Cash (walk-in) only: a staff member or administrator records the payment in Payments, which confirms the reservation and issues the official receipt (`OR-YYYY-000001`) automatically for the customer to view and print. No online payment integration is used: nothing is transferred, detected, or reconciled automatically. Recorded cash stays in the unremitted balance until an administrator records a settlement transfer to the bank/treasury account; recording a transfer attaches every recorded-but-unremitted payment in its period in one transaction, so each payment shows exactly where it is: unremitted or settled. Collections in Reports show recorded totals plus the still-unremitted balance. Recording a cash payment requires a positive amount at least equal to the reservation's quoted fee; a reduced amount is only accepted with a note, which is stored on the payment for the audit trail.

A reservation moves through four states: `pending` (awaiting staff review) → `approved` (awaiting cash payment) → `confirmed` (cash recorded) → `completed` (burial record published). Customers choose a vacant plot from the schematic cemetery map and submit a no-payment request for staff review; approving that request marks it `approved` and does not confirm it, so a plot is only paid for once the cash is recorded. Pending, approved, and confirmed requests all hold that plot on the map; rejected and cancelled requests release it. Memorial records are added only by approving a submission, and for a plot submission the plot's reservation must already be `confirmed`, so nothing is published before the cash is recorded. Editing a record onto a plot (new assignment or plot change) also requires a `confirmed` reservation; keeping the same plot or editing non-plot fields stays allowed. Once the record is published the map marks the plot occupied. Plot selection is based on a grave record's `grave_reference` when it is in section/lot form (for example, `A-03`). Records without a grave reference are listed separately, so staff should enter the real grave reference for every record.

Authenticated endpoints require `Authorization: Bearer <token>`.

## Production and security notes

- Set `NODE_ENV=production` and a real `DATABASE_URL`. The server refuses to start in production on the embedded database.
- `JWT_SECRET` must be a random value of at least 32 characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- Login, registration, and password-reset endpoints are rate-limited per IP and per account. The limiter is in memory, so it resets on restart and applies per instance.
- Burial record search requires sign-in and returns no birth dates.
- Every saved record is live cemetery data. Saving or updating a record needs explicit verification confirmation.
- Database TLS certificates are verified by default. Set `DATABASE_SSL_REJECT_UNAUTHORIZED=false` only if your provider's certificate cannot be verified.
- Run the unit tests with `npm test --workspace=memorial-map-backend`.

