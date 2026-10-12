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

User registration no longer requires email verification. Public registration at `/register` creates a `user` account immediately. There is no public staff or admin registration.

Optional: Configure Resend for transactional emails (password reset, notifications) by setting `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `backend/.env`. Create an API key at https://resend.com/api-keys and verify a domain. If unset, email sending is skipped.

If an existing user account needs administrator access, stop the local app and run `npm run admin:promote -- your-admin-email@example.com` from the project root, then restart and sign in again. For Neon, you can instead run `UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';` in the database console. Promote only trusted administrator accounts. Customers submit the GCash transaction reference after scanning the static InstaPay QR; reservations remain pending until a staff member checks the payment and approves it in Payments. The QR does not send automatic payment confirmations.

Administrator email/password changes require the verified Account Security flow; admin email/password fields cannot be changed through the ordinary profile-update endpoint. If the current email is inaccessible, there is no self-service bypass: a trusted system operator must verify the person's identity and administrator authorization offline, then run `npm run admin:change-email -- old-admin@example.com new-admin@example.com --verified-authorized` from the project root. This operator-only command revokes existing sessions.

The dev server creates the local database tables and demo memorial records automatically. For local development, it also seeds a default administrator if no admin account exists:

- Email: `admin@cemetery.gov`
- Password: `password123`

To create the database tables manually:

```powershell
npm run db:setup
```

To create or reseed that default admin account manually:

```powershell
npm run admin:seed
```

### Real accounts and staff access

The system runs on real data. There are three actors: **User**, **Staff**, and **Administrator**. Public registration at `/register` creates a `user` account immediately (no email verification); there is no public staff or admin registration.

To bootstrap the first real accounts, stop the app and create them directly:

```powershell
npm run user:create -- "Admin Name" admin@example.com StrongPassword123 admin
npm run user:create -- "Staff Name" staff@example.com StrongPassword123 staff
```

To grant staff access to an existing registered account instead, stop the app and run:

```powershell
npm run staff:promote -- staff@example.com
```

Sign-in pages: users at `/login`, staff at `/staff/login`, administrators at `/admin/login`. Staff manage memorial records, reservations, reports, and payment verification, but cannot access User Management or Account Security; those stay administrator-only. Role changes (promote/demote) are operator-only CLI commands; the User Management screen is read-only and cannot grant access.

### Removing demo content (one-time cutover)

Older databases may still contain sample burial records (`is_demo = TRUE`) and `@memorialmap.demo` accounts. An administrator can preview and then delete them without stopping the app:

1. Sign in as administrator and preview with `{ "confirm": false }`:

```powershell
curl -X POST http://localhost:5001/api/admin/maintenance/purge-demo `
  -H "Authorization: Bearer <admin-token>" `
  -H "Content-Type: application/json" `
  -d '{ "confirm": false }'
```

2. Re-send with `{ "confirm": true }` to delete the listed demo burial records, demo accounts, and their verification codes in one transaction.

The same purge can run with the app stopped via `npm run db:purge-demo` (dry run) or `npm run db:purge-demo -- --confirm` (delete). The memorial site catalog is intentionally kept because reservations reference it. After purging, sign in with a real account created above.

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

Public users register at `/register` and get immediate access (no email verification). They can then use Home, Search, Memorial Record, Map, Reservations, Saved Memorials, and Profile; their reservations, payments, and saved memorials are real operational data. Staff sign in at `/staff/login` and work in the Staff Console: Dashboard, Memorial Records, Cemetery Map/Plots, Reservations, Reports, and payment verification. Administrators use `/admin/login` for the same operational screens plus User Management and Account Security. There is no public staff or admin registration page or endpoint. A trusted operator grants staff access with `npm run staff:promote -- email` and administrator access with `npm run admin:promote -- email`; the User Management screen is read-only and cannot grant access.

New burial records are saved as real data (`is_demo = FALSE`) by default. Rows left over from earlier demo seeding stay labeled **Sample / Demo Data** in public views until purged or re-verified, and their locations are not presented as verified cemetery placement. Saving a record as real requires confirming verification and publication authorization in the record form; tick the sample box only for test entries.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check API and database status |
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/admin/login` | Log in to the admin portal with an existing admin account |
| POST | `/api/auth/staff/login` | Log in to the staff console with an existing staff account |
| GET | `/api/users/profile` | Get the signed-in user's profile |
| PUT | `/api/users/update` | Update the signed-in user's profile |
| POST | `/api/users/onboarding-complete` | Mark onboarding complete |
| GET | `/api/memorials` | List/search memorials |
| GET | `/api/memorials/:id` | Get a memorial |
| GET | `/api/burials?search=name&cemetery=Cogon%20Cemetery` | Search by name, lot, death date, record ID, or section |
| GET | `/api/reservations/user-reservations` | List the signed-in user's reservations |
| POST | `/api/reservations/create` | Create a reservation |
| GET | `/api/favorites` | List saved memorials |
| POST | `/api/favorites/add` | Save a memorial |
| DELETE | `/api/favorites/remove/:id` | Remove a saved memorial |
| GET | `/api/payments` | List payment history |
| POST | `/api/payments/create` | Submit a GCash reference for verification |
| GET | `/api/payments/admin/pending` | List GCash payments awaiting verification (staff or admin) |
| POST | `/api/payments/admin/:id/verify` | Approve or reject a submitted payment reference (staff or admin) |
| GET | `/api/admin/dashboard` | Administrator dashboard counts |
| GET | `/api/admin/records` | List cemetery memorial records (admin only) |
| POST | `/api/admin/records` | Create a cemetery memorial record (admin only) |
| PUT | `/api/admin/records/:id` | Update a cemetery memorial record and its demo/verified label (admin only) |
| GET | `/api/admin/reservations` | List all reservations (admin only) |
| GET | `/api/admin/reports` | Reservation totals and monthly summaries (admin only) |
| GET | `/api/admin/users` | List user accounts and usage counts (admin only) |
| POST | `/api/admin/maintenance/purge-demo` | Preview (`{ "confirm": false }`) or delete (`{ "confirm": true }`) demo burial records and demo accounts (admin only) |
| GET | `/api/staff/dashboard` | Staff workspace counts (staff or admin) |
| GET | `/api/staff/records` | List cemetery memorial records (staff or admin) |
| POST | `/api/staff/records` | Create a cemetery memorial record (staff or admin) |
| PUT | `/api/staff/records/:id` | Update a cemetery memorial record (staff or admin) |
| GET | `/api/staff/reservations` | List all reservations (staff or admin) |
| GET | `/api/staff/reports` | Reservation totals and monthly summaries (staff or admin) |

The Memorial Sites view includes an interactive OpenStreetMap centered on the Cogon cemetery location, the supplied Cogon/Cordova map as an optional reference, a separate interactive view of saved memorial-site coordinates, and an Add Reservation action for each site. The cemetery pin uses the mapped Cordova Catholic Cemetery location in Cogon; the sample memorial-site coordinates remain in their separate map view. The four supplied cemetery photos are stored in `frontend/public/cemetery-images` and assigned to the Heritage, Peaceful Gardens, Riverside, and Sunset memorial records in the database seed.

Login and registration use a responsive split-panel layout over the supplied Cogon cemetery photo. The original memorial logo is reused in the authentication header, landing page, and application sidebar.

The GCash checkout displays the supplied static InstaPay QR and collects the GCash transaction reference for manual staff verification; it does not log into GCash or automatically detect transfers. A reservation is confirmed only after an authorized staff member or administrator verifies and approves the submitted reference. The cemetery plot map uses a grave record's `grave_reference` when it is in section/lot form (for example, `A-03`). Records without a grave reference are placed in a clearly labeled schematic layout; these placements are not verified burial locations, so staff should enter the real grave reference for every record. Reservations are not currently linked to cemetery plots, so reserved-plot status is not tracked on the map.

Authenticated endpoints require `Authorization: Bearer <token>`.
