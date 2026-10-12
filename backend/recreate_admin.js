const path = require('path');
const bcrypt = require('bcryptjs');

// Remove data directory to force PGlite fresh start
const fs = require('fs');
const dataDir = path.resolve(__dirname, 'data');
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log('Data directory removed');
} catch (err) {
  console.log('Data dir may not exist, continuing...');
}

// Wait a moment for file system to sync
setTimeout(() => {
  // Load the db config which will set up PGlite
  require('./config/db');
  
  // Now we need to query - but PGlite doesn't have a standard pool.query
  // Let's use the setup approach instead
  console.log('PGlite initialized. Creating admin account...');
  
  // Read the schema and insert manually approach
  const { exec } = require('./config/db');
  
  // Hash password
  const passwordHash = bcrypt.hashSync('password123', 10);
  
  // Try inserting via the pool that might be exported
  // Since PGlite is different, let's try a different approach
  
  // Check what's exported
  const db = require('./config/db');
  console.log('db.isLocal:', db.isLocal);
  console.log('db.query type:', typeof db.query);
  
  if (db.query) {
    db.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
       VALUES ('Admin User', 'admin@cemetery.gov', '${passwordHash}', 'admin', TRUE, 0)
       RETURNING id, name, email, role`,
      (err, res) => {
        if (err) {
          console.error('Query error:', err.message);
        } else {
          console.log('Created admin:', res.rows);
        }
      }
    );
  }
  
}, 500);