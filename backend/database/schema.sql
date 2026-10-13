-- Schema is applied automatically at server startup (and by `npm run db:setup`). It is idempotent.

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  profile_image_url TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  auth_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
-- One-time legacy migration: only touches rows still labeled 'visitor'.
UPDATE users SET role = 'user' WHERE role = 'visitor';

CREATE TABLE IF NOT EXISTS user_registration_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS password_reset_codes_user_created_idx
  ON password_reset_codes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memorials (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  category VARCHAR(100),
  image_url TEXT,
  price DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE memorials ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE memorials ALTER COLUMN is_demo SET DEFAULT FALSE;
-- Demo data has been retired: every site is real data.
ALTER TABLE memorials DROP COLUMN IF EXISTS is_demo;

CREATE TABLE IF NOT EXISTS cemeteries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  barangay VARCHAR(100) NOT NULL,
  municipality VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, barangay, municipality, province)
);

CREATE TABLE IF NOT EXISTS burial_records (
  id SERIAL PRIMARY KEY,
  cemetery_id INTEGER NOT NULL REFERENCES cemeteries(id) ON DELETE CASCADE,
  full_name VARCHAR(200) NOT NULL,
  grave_reference VARCHAR(100),
  birth_date DATE,
  death_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cemetery_id, full_name)
);

ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE burial_records ALTER COLUMN is_demo SET DEFAULT FALSE;
-- Demo data has been retired: every record is real data.
ALTER TABLE burial_records DROP COLUMN IF EXISTS is_demo;

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  memorial_id INTEGER REFERENCES memorials(id) ON DELETE CASCADE,
  cemetery_id INTEGER REFERENCES cemeteries(id) ON DELETE CASCADE,
  plot_section VARCHAR(10),
  plot_number INTEGER,
  visitor_name VARCHAR(100) NOT NULL,
  contact VARCHAR(100) NOT NULL,
  reservation_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  total_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS cemetery_id INTEGER REFERENCES cemeteries(id) ON DELETE CASCADE;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS plot_section VARCHAR(10);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS plot_number INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS reservations_active_plot_unique
  ON reservations (cemetery_id, UPPER(plot_section), plot_number)
  WHERE plot_section IS NOT NULL AND status IN ('pending', 'confirmed');

CREATE TABLE IF NOT EXISTS saved_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  memorial_id INTEGER REFERENCES memorials(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, memorial_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  reservation_id INTEGER REFERENCES reservations(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(30) DEFAULT 'GCash',
  payment_reference VARCHAR(64),
  payment_status VARCHAR(50) DEFAULT 'pending',
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'GCash';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(64);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS payments_payment_reference_unique
  ON payments (LOWER(payment_reference))
  WHERE payment_reference IS NOT NULL;

-- Official receipts are issued automatically when a payment is approved.
-- One receipt per payment; receipt numbers are deterministic (OR-YYYY-000000)
-- so approval retries stay idempotent.
CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  payment_id INTEGER UNIQUE NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  receipt_no VARCHAR(32) UNIQUE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Remittance log: records transfers of collected GCash money from the
-- cemetery wallet to the bank/treasury account. Money movement itself
-- happens off-system; this table is the accountability trail.
CREATE TABLE IF NOT EXISTS settlement_transfers (
  id SERIAL PRIMARY KEY,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  from_wallet VARCHAR(100) NOT NULL DEFAULT 'GCash',
  to_account VARCHAR(200) NOT NULL,
  transfer_ref VARCHAR(64),
  transferred_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  transferred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (period_from <= period_to)
);

-- Money destination: every verified payment sits in the GCash wallet
-- (settlement_id IS NULL) until an administrator remits it to the
-- treasury/bank via a settlement transfer, which attaches the covered
-- payments in the same transaction.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS settlement_id INTEGER REFERENCES settlement_transfers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payments_settlement_id_idx ON payments (settlement_id);

-- Optional reviewer note on payments (e.g. rejection reason) and plot reviews.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS review_note TEXT;

-- Soft account status: inactive accounts cannot sign in and their
-- sessions are rejected by the auth middleware.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Constraints are added NOT VALID so existing rows never block startup; new writes are checked.
-- Run `npm run db:setup` once to VALIDATE them after legacy data is cleaned.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'staff', 'admin')) NOT VALID;
  END IF;
  -- Recreate to include 'cancelled' (customer/staff cancellation).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_check') THEN
    ALTER TABLE reservations DROP CONSTRAINT reservations_status_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_check') THEN
    ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
      CHECK (status IN ('pending', 'confirmed', 'rejected', 'completed', 'cancelled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_status_check') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_status_check
      CHECK (payment_status IN ('pending', 'pending_verification', 'completed', 'rejected')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reservations_user_id_idx ON reservations (user_id);
CREATE INDEX IF NOT EXISTS payments_reservation_id_idx ON payments (reservation_id);
CREATE INDEX IF NOT EXISTS saved_items_memorial_id_idx ON saved_items (memorial_id);
CREATE INDEX IF NOT EXISTS user_registration_codes_user_id_idx ON user_registration_codes (user_id);

-- Seed data is inserted only once so running database setup is safe to repeat.
INSERT INTO memorials (name, description, latitude, longitude, category, image_url, price)
SELECT seed.name, seed.description, seed.latitude, seed.longitude, seed.category, seed.image_url, seed.price
FROM (VALUES
  ('Peaceful Gardens Memorial', 'A serene memorial park with beautiful landscaping.', 14.5995, 120.9842, 'Garden', '/cemetery-images/peaceful-gardens.png', 500.00),
  ('Heritage Memorial Park', 'Historic memorial site preserving local heritage.', 14.5547, 121.0244, 'Historic', '/cemetery-images/heritage-memorial.png', 750.00),
  ('Sunset Hills Cemetery', 'Peaceful hillside memorial with panoramic views.', 14.6760, 121.0437, 'Cemetery', '/cemetery-images/sunset-hills.png', 600.00),
  ('Riverside Memorial', 'Memorial along the riverside with tranquil atmosphere.', 14.6507, 121.0494, 'Riverside', '/cemetery-images/riverside-memorial.png', 450.00)
) AS seed(name, description, latitude, longitude, category, image_url, price)
WHERE NOT EXISTS (
  SELECT 1 FROM memorials existing WHERE existing.name = seed.name
);

-- Only fills in missing images, so administrator edits are not reverted on every restart.
UPDATE memorials
SET image_url = CASE name
  WHEN 'Heritage Memorial Park' THEN '/cemetery-images/heritage-memorial.png'
  WHEN 'Peaceful Gardens Memorial' THEN '/cemetery-images/peaceful-gardens.png'
  WHEN 'Riverside Memorial' THEN '/cemetery-images/riverside-memorial.png'
  WHEN 'Sunset Hills Cemetery' THEN '/cemetery-images/sunset-hills.png'
END
WHERE image_url IS NULL AND name IN (
  'Heritage Memorial Park',
  'Peaceful Gardens Memorial',
  'Riverside Memorial',
  'Sunset Hills Cemetery'
);

INSERT INTO cemeteries (name, barangay, municipality, province)
VALUES ('Cogon Cemetery', 'Cogon', 'Cordova', 'Cebu')
ON CONFLICT (name, barangay, municipality, province) DO NOTHING;

-- Burial records are real operational data. Staff and administrators add them
-- through the console; the schema no longer seeds sample names.
