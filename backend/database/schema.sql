-- Run this SQL in your Neon PostgreSQL console to create tables

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
UPDATE users SET role = 'user' WHERE role = 'visitor';

CREATE TABLE IF NOT EXISTS user_registration_codes (
  email VARCHAR(255) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(40) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  pending_email VARCHAR(255),
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS memorials (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  category VARCHAR(100),
  image_url TEXT,
  price DECIMAL(10, 2) DEFAULT 0,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE memorials ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT TRUE;

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
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (cemetery_id, full_name)
);

ALTER TABLE burial_records ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  memorial_id INTEGER REFERENCES memorials(id) ON DELETE CASCADE,
  visitor_name VARCHAR(100) NOT NULL,
  contact VARCHAR(100) NOT NULL,
  reservation_date DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  total_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

UPDATE memorials
SET image_url = CASE name
  WHEN 'Heritage Memorial Park' THEN '/cemetery-images/heritage-memorial.png'
  WHEN 'Peaceful Gardens Memorial' THEN '/cemetery-images/peaceful-gardens.png'
  WHEN 'Riverside Memorial' THEN '/cemetery-images/riverside-memorial.png'
  WHEN 'Sunset Hills Cemetery' THEN '/cemetery-images/sunset-hills.png'
END
WHERE name IN (
  'Heritage Memorial Park',
  'Peaceful Gardens Memorial',
  'Riverside Memorial',
  'Sunset Hills Cemetery'
);

INSERT INTO cemeteries (name, barangay, municipality, province)
VALUES ('Cogon Cemetery', 'Cogon', 'Cordova', 'Cebu')
ON CONFLICT (name, barangay, municipality, province) DO NOTHING;

UPDATE burial_records record
SET full_name = 'Rogelio P. Torresjas'
FROM cemeteries cemetery
WHERE record.cemetery_id = cemetery.id
  AND cemetery.name = 'Cogon Cemetery'
  AND cemetery.barangay = 'Cogon'
  AND cemetery.municipality = 'Cordova'
  AND cemetery.province = 'Cebu'
  AND record.full_name = 'Rogelio P. Torrejas'
  AND NOT EXISTS (
    SELECT 1
    FROM burial_records existing
    WHERE existing.cemetery_id = cemetery.id
      AND existing.full_name = 'Rogelio P. Torresjas'
  );

UPDATE burial_records record
SET full_name = 'Ethan Cullen A Escabas'
FROM cemeteries cemetery
WHERE record.cemetery_id = cemetery.id
  AND cemetery.name = 'Cogon Cemetery'
  AND cemetery.barangay = 'Cogon'
  AND cemetery.municipality = 'Cordova'
  AND cemetery.province = 'Cebu'
  AND record.full_name = 'Ethan Cullen A. Escabas'
  AND NOT EXISTS (
    SELECT 1
    FROM burial_records existing
    WHERE existing.cemetery_id = cemetery.id
      AND existing.full_name = 'Ethan Cullen A Escabas'
  );

DELETE FROM burial_records record
USING cemeteries cemetery
WHERE record.cemetery_id = cemetery.id
  AND cemetery.name = 'Cogon Cemetery'
  AND cemetery.barangay = 'Cogon'
  AND cemetery.municipality = 'Cordova'
  AND cemetery.province = 'Cebu'
  AND record.full_name = 'Ethan Cullen A. Escabas'
  AND EXISTS (
    SELECT 1
    FROM burial_records existing
    WHERE existing.cemetery_id = cemetery.id
      AND existing.full_name = 'Ethan Cullen A Escabas'
  );

INSERT INTO burial_records (cemetery_id, full_name)
SELECT cemetery.id, seed.full_name
FROM cemeteries cemetery
CROSS JOIN (VALUES
  ('Dennis B. Ebon'),
  ('Amparo D. Ebon'),
  ('Bernandino C. Gorro'),
  ('Robarl P. Diangga'),
  ('Lurohama M. Mepieza'),
  ('Susana B. Manago'),
  ('Claire Y. Bantong'),
  ('Florencio T. Jumao-as'),
  ('Luciana M. Antiya'),
  ('Aniceto T. Sablano'),
  ('Leodegario A. Tecson'),
  ('Marjorie Mae J. Pacaldo'),
  ('Antonio Bacus'),
  ('Marina B. Orito'),
  ('Proceso D. Pogoy'),
  ('Jasmin U. Generalao'),
  ('Efren D. Urot'),
  ('Gregoriod Wahing'),
  ('Juliana T. Pogoy'),
  ('Silvestra D. Wahing'),
  ('Romero B. Salera'),
  ('Richard P. Bonghanoy'),
  ('Francisca G. Anzano'),
  ('Joseph Bladelino B. Berido'),
  ('Renaldo A. Damaigo'),
  ('Lavian O. Sebusa'),
  ('Ranilo C. Andales'),
  ('Marites I. Denlauso'),
  ('Francisca A. Tirol'),
  ('Welma T. Ornopia'),
  ('Antonio S. Montecillo'),
  ('Welfrido T. Pogoy'),
  ('Renerio P. Amoren'),
  ('Catherine L. Abad'),
  ('Dolores S. Silawan'),
  ('Esterlita Benigay'),
  ('Cirilo Pungcol Jr'),
  ('Dominga C. Placencia'),
  ('Leonilo I. Cañete'),
  ('Maximo Guzman Roca Jr'),
  ('Nathalie Grace P. Reffule'),
  ('Apolonio P. Cañete'),
  ('Avangeline C. Cañete'),
  ('Zayden Jireh B. Dinoy'),
  ('Fujiko P. Ligan'),
  ('Ethan Cullen A Escabas'),
  ('Rogelio P. Torresjas'),
  ('Esabela Arong Pogoy'),
  ('Circiaca B. Racal'),
  ('Mary Clarie G. Libre'),
  ('James B. Bayta'),
  ('Vicente S. Andales'),
  ('Merlita C. Ylanan'),
  ('Bienvenido Celadis'),
  ('Lareauno C. Abalde'),
  ('Teresita P. Torrejas'),
  ('Sherwin D. Bioco'),
  ('Jenny P. Mativo'),
  ('MaryJane C. Mintalar'),
  ('Federico T. Espinosa'),
  ('Princess Rhiana T. Cañete'),
  ('Antonio C. Wahing'),
  ('Basilisa Maislim Esparcia'),
  ('Juana Miano'),
  ('Grechen Simangca'),
  ('Alfredo M. Seno'),
  ('Guilermo N. Dinoy'),
  ('Ferdinan I. Escabas'),
  ('Crisanto N. Dinoy'),
  ('Timoteo O. Baguio'),
  ('Antero A. Baguio'),
  ('Lewey T. Deguilmo')
) AS seed(full_name)
WHERE cemetery.name = 'Cogon Cemetery'
  AND cemetery.barangay = 'Cogon'
  AND cemetery.municipality = 'Cordova'
  AND cemetery.province = 'Cebu'
ON CONFLICT (cemetery_id, full_name) DO NOTHING;
