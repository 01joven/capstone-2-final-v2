const pool = require('../config/db');

const main = async () => {
  console.log('=== DATABASE AUDIT ===\n');

  // 1. Tables
  const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  console.log('TABLES:', tables.rows.map(r => r.tablename).join(', '));

  // 2. User counts
  const users = await pool.query("SELECT role, COUNT(*) as count FROM users GROUP BY role ORDER BY role");
  console.log('\nUSERS:', users.rows.map(r => `${r.role}: ${r.count}`).join(', '));

  // 3. Burial records by section
  const burials = await pool.query(`
    SELECT 
      SUBSTRING(grave_reference FROM 1 FOR 1) AS section,
      COUNT(*) AS count
    FROM burial_records
    WHERE grave_reference IS NOT NULL
    GROUP BY section
    ORDER BY section
  `);
  console.log('\nBURIAL RECORDS BY SECTION:');
  burials.rows.forEach(r => console.log(`  Section ${r.section}: ${r.count} records`));

  const totalBurials = await pool.query('SELECT COUNT(*) as total FROM burial_records');
  console.log(`  TOTAL: ${totalBurials.rows[0].total}`);

  // 4. Cemeteries
  const cemeteries = await pool.query('SELECT * FROM cemeteries');
  console.log('\nCEMETERIES:', JSON.stringify(cemeteries.rows));

  // 5. Memorials (sites)
  const memorials = await pool.query('SELECT id, name, category, price FROM memorials ORDER BY id');
  console.log('\nMEMORIAL SITES:');
  memorials.rows.forEach(r => console.log(`  ${r.id}: ${r.name} (${r.category}) - ₱${r.price}`));

  // 6. Reservations
  const reservations = await pool.query("SELECT status, COUNT(*) as count FROM reservations GROUP BY status");
  console.log('\nRESERVATIONS:', reservations.rows.length === 0 ? 'None' : reservations.rows.map(r => `${r.status}: ${r.count}`).join(', '));

  // 7. Payments
  const payments = await pool.query("SELECT payment_status, COUNT(*) as count FROM payments GROUP BY payment_status");
  console.log('PAYMENTS:', payments.rows.length === 0 ? 'None' : payments.rows.map(r => `${r.payment_status}: ${r.count}`).join(', '));

  // 8. Submissions
  const subs = await pool.query("SELECT status, COUNT(*) as count FROM burial_submissions GROUP BY status");
  console.log('SUBMISSIONS:', subs.rows.length === 0 ? 'None' : subs.rows.map(r => `${r.status}: ${r.count}`).join(', '));

  // 9. Check for duplicate grave references
  const dupes = await pool.query(`
    SELECT grave_reference, COUNT(*) as cnt 
    FROM burial_records 
    WHERE grave_reference IS NOT NULL 
    GROUP BY grave_reference 
    HAVING COUNT(*) > 1
  `);
  console.log('\nDUPLICATE GRAVE REFERENCES:', dupes.rows.length === 0 ? 'None ✓' : JSON.stringify(dupes.rows));

  console.log('\n=== AUDIT COMPLETE ===');
};

main()
  .catch(e => console.error('Error:', e.message))
  .finally(() => pool.end());
