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

User registration requires Gmail email verification. In `backend/.env`, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` to the sending Gmail address, `SMTP_APP_PASSWORD` to that account's Google App Password, and `SMTP_FROM` to the sending address. Create a Google App Password in the Google Account security settings; do not use the normal Gmail password. If `backend/.env` already exists, add these settings without overwriting the existing JWT or database settings. Never commit or share the app password. Restart the backend after changing `.env`. User accounts are created only after the emailed six-digit code is verified. Codes expire in 10 minutes, can be resent once per minute, allow at most five attempts, and are limited to five sends per client IP per hour.

If an existing user account needs administrator access, stop the local app and run `npm run admin:promote -- your-admin-email@example.com` from the project root, then restart and sign in again. For Neon, you can instead run `UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';` in the database console. Promote only trusted administrator accounts. Customers submit the GCash transaction reference after scanning the static InstaPay QR; reservations remain pending until an administrator checks the payment and approves it in Payments. The QR does not send automatic payment confirmations.

Administrators can use **Forgot Password / Account Recovery** on the Admin Login page. Password reset requires a one-time code sent to the registered admin email, expires after 10 minutes, and allows at most five code attempts. In **Account Security**, changing the admin email requires the current password plus separate codes delivered to both the current and proposed email addresses. Admin email/password fields cannot be changed through the ordinary profile-update endpoint. If the current email is inaccessible, there is no self-service bypass: a trusted system operator must verify the person's identity and administrator authorization offline, then run `npm run admin:change-email -- old-admin@example.com new-admin@example.com --verified-authorized` from the project root. This operator-only command revokes existing sessions. Configure Gmail SMTP as described above for recovery code delivery.

The dev server creates the local database tables and demo memorial records automatically. To create them manually:

```powershell
npm run db:setup
```

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

Public users verify their email during registration before an account is created, then use Home, Search, Memorial Record, Map, Reservations, Saved Memorials, and Profile. Administrators use the separate Administrator Access page at `/admin/login` with existing authorized admin credentials, then access the protected Dashboard, Memorial Records, Cemetery Map/Plots, Reservations, Reports, User Management, and payment verification screens. There is no public admin registration page or endpoint. A trusted operator grants administrator access to an existing account using `npm run admin:promote -- email`; the User Management screen is read-only and cannot grant admin access.

Burial records and memorial sites are marked `is_demo` by default. The app labels those entries **Sample / Demo Data** in public views and keeps their locations out of any claim of verified cemetery placement. An administrator may mark a burial record verified only after confirming both the record and authorization to publish it; the admin form asks for confirmation before saving that change. New or existing data without that confirmation must remain marked as demo.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Check API and database status |
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/register-code` | Send a one-time email code for public user registration |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/admin/login` | Log in to the admin portal with an existing admin account |
| POST | `/api/auth/admin/recovery/request` | Request an admin password recovery code |
| POST | `/api/auth/admin/recovery/reset` | Verify a recovery code and reset the admin password |
| POST | `/api/users/admin/email-change/request` | Request verification codes for both old and new admin email addresses (admin only) |
| POST | `/api/users/admin/email-change/confirm` | Verify both addresses and change admin email (admin only) |
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
| GET | `/api/payments/admin/pending` | List GCash payments awaiting admin verification |
| POST | `/api/payments/admin/:id/verify` | Approve or reject a submitted payment reference |
| GET | `/api/admin/dashboard` | Administrator dashboard counts |
| GET | `/api/admin/records` | List cemetery memorial records (admin only) |
| POST | `/api/admin/records` | Create a cemetery memorial record (admin only) |
| PUT | `/api/admin/records/:id` | Update a cemetery memorial record and its demo/verified label (admin only) |
| GET | `/api/admin/reservations` | List all reservations (admin only) |
| GET | `/api/admin/reports` | Reservation totals and monthly summaries (admin only) |
| GET | `/api/admin/users` | List user accounts and usage counts (admin only) |

The Memorial Sites view includes an interactive OpenStreetMap centered on the Cogon cemetery location, the supplied Cogon/Cordova map as an optional reference, a separate interactive view of saved memorial-site coordinates, and an Add Reservation action for each site. The cemetery pin uses the mapped Cordova Catholic Cemetery location in Cogon; the sample memorial-site coordinates remain in their separate map view. The four supplied cemetery photos are stored in `frontend/public/cemetery-images` and assigned to the Heritage, Peaceful Gardens, Riverside, and Sunset memorial records in the database seed.

Login and registration use a responsive split-panel layout over the supplied Cogon cemetery photo. The original memorial logo is reused in the authentication header, landing page, and application sidebar.

The GCash checkout displays the supplied static InstaPay QR and collects the GCash transaction reference for manual administrator verification; it does not log into GCash or automatically detect transfers. A reservation is confirmed only after an allowlisted administrator verifies and approves the submitted reference. The cemetery plot map uses a grave record's `grave_reference` when it is in section/lot form (for example, `A-03`). Seed records without a grave reference are placed in a clearly labeled schematic demo layout so the search-to-map interaction can be demonstrated; these demo placements are not verified burial locations. Reservations are not currently linked to cemetery plots, so reserved-plot status is not tracked on the map.

Authenticated endpoints require `Authorization: Bearer <token>`.
