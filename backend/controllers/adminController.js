const pool = require('../config/db');
const { purgeDemoData } = require('../database/purgeDemoData');
const bcrypt = require('bcryptjs');
const {
  parsePlotReference,
  isBurialPlotOccupied,
  getActivePlotReservation,
} = require('../services/plotAvailability');

const validateRecord = (body = {}) => {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const graveReference = typeof body.grave_reference === 'string' ? body.grave_reference.trim() : '';
  const birthDate = body.birth_date || null;
  const deathDate = body.death_date || null;

  if (!fullName || fullName.length > 200) {
    return { error: 'Full name must contain 1 to 200 characters.' };
  }
  if (graveReference.length > 100) {
    return { error: 'Grave reference must be 100 characters or fewer.' };
  }
  for (const [label, value] of [['Birth date', birthDate], ['Death date', deathDate]]) {
    if (value !== null && (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
    )) {
      return { error: `${label} must be a valid date.` };
    }
  }

  return {
    values: {
      fullName,
      graveReference: graveReference || null,
      birthDate,
      deathDate,
      isDemo: body.is_demo === true,
    },
  };
};

const getDashboard = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM burial_records) AS records,
        (SELECT COUNT(*) FROM reservations) AS reservations,
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM payments WHERE payment_status = 'pending_verification') AS pending_payments,
        (SELECT COUNT(*) FROM burial_records WHERE is_demo = TRUE) AS demo_records`
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get admin dashboard error:', error);
    res.status(500).json({ message: 'Unable to load administrator dashboard.' });
  }
};

const getRecords = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.full_name, b.grave_reference, b.birth_date, b.death_date, b.is_demo,
              c.name AS cemetery_name, c.barangay, c.municipality, c.province
       FROM burial_records b
       JOIN cemeteries c ON c.id = b.cemetery_id
       ORDER BY b.full_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get admin records error:', error);
    res.status(500).json({ message: 'Unable to load memorial records.' });
  }
};

const createRecord = async (req, res) => {
  const validated = validateRecord(req.body);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }
  if (!validated.values.isDemo && (req.body || {}).verified_authorized !== true) {
    return res.status(400).json({ message: 'Explicit verification and publication authorization are required.' });
  }

  let client;
  let transactionStarted = false;
  try {
    const { fullName, graveReference, birthDate, deathDate, isDemo } = validated.values;
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const cemeteryResult = await client.query(
      `SELECT id FROM cemeteries
       WHERE name = 'Cogon Cemetery' AND barangay = 'Cogon'
         AND municipality = 'Cordova' AND province = 'Cebu'
       FOR UPDATE`
    );
    const cemeteryId = cemeteryResult.rows[0]?.id;
    if (!cemeteryId) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'Cogon Cemetery is not configured in the database.' });
    }

    const plot = parsePlotReference(graveReference);
    if (plot) {
      if (await isBurialPlotOccupied(client, cemeteryId, plot.section, plot.lotNumber)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'That plot is already occupied by another memorial record.' });
      }
      const reservation = await getActivePlotReservation(client, cemeteryId, plot.section, plot.lotNumber);
      if (reservation?.status === 'pending') {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'That plot has a pending reservation request. Review the request before assigning it.' });
      }
    }

    const result = await client.query(
      `INSERT INTO burial_records (cemetery_id, full_name, grave_reference, birth_date, death_date, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, grave_reference, birth_date, death_date, is_demo`,
      [cemeteryId, fullName, graveReference, birthDate, deathDate, isDemo]
    );
    if (plot) {
      await client.query(
        `UPDATE reservations SET status = 'completed'
         WHERE cemetery_id = $1 AND UPPER(plot_section) = $2 AND plot_number = $3 AND status = 'confirmed'`,
        [cemeteryId, plot.section, plot.lotNumber]
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Create memorial record rollback error:', rollbackError);
      });
    }
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A record with this name already exists for Cogon Cemetery.' });
    }
    console.error('Create admin record error:', error);
    res.status(500).json({ message: 'Unable to create memorial record.' });
  } finally {
    if (client) client.release();
  }
};

const updateRecord = async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isSafeInteger(recordId) || recordId < 1) {
    return res.status(400).json({ message: 'A valid record ID is required.' });
  }
  if (typeof (req.body || {}).is_demo !== 'boolean') {
    return res.status(400).json({ message: 'Confirm whether this record is demo data or verified authorized data.' });
  }
  if (req.body.is_demo === false && req.body.verified_authorized !== true) {
    return res.status(400).json({ message: 'Explicit verification and publication authorization are required.' });
  }
  const validated = validateRecord(req.body);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }

  let client;
  let transactionStarted = false;
  try {
    const { fullName, graveReference, birthDate, deathDate, isDemo } = validated.values;
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const recordResult = await client.query(
      'SELECT cemetery_id FROM burial_records WHERE id = $1 FOR UPDATE',
      [recordId]
    );
    if (recordResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Memorial record not found.' });
    }
    const cemeteryId = recordResult.rows[0].cemetery_id;
    await client.query('SELECT id FROM cemeteries WHERE id = $1 FOR UPDATE', [cemeteryId]);

    const plot = parsePlotReference(graveReference);
    if (plot) {
      if (await isBurialPlotOccupied(client, cemeteryId, plot.section, plot.lotNumber, recordId)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'That plot is already occupied by another memorial record.' });
      }
      const reservation = await getActivePlotReservation(client, cemeteryId, plot.section, plot.lotNumber);
      if (reservation?.status === 'pending') {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'That plot has a pending reservation request. Review the request before assigning it.' });
      }
    }

    const result = await client.query(
      `UPDATE burial_records
       SET full_name = $1, grave_reference = $2, birth_date = $3,
           death_date = $4, is_demo = $5
       WHERE id = $6
       RETURNING id, full_name, grave_reference, birth_date, death_date, is_demo`,
      [fullName, graveReference, birthDate, deathDate, isDemo, recordId]
    );
    if (plot) {
      await client.query(
        `UPDATE reservations SET status = 'completed'
         WHERE cemetery_id = $1 AND UPPER(plot_section) = $2 AND plot_number = $3 AND status = 'confirmed'`,
        [cemeteryId, plot.section, plot.lotNumber]
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    res.json(result.rows[0]);
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Update memorial record rollback error:', rollbackError);
      });
    }
    if (error.code === '23505') {
      return res.status(409).json({ message: 'A record with this name already exists for Cogon Cemetery.' });
    }
    console.error('Update admin record error:', error);
    res.status(500).json({ message: 'Unable to update memorial record.' });
  } finally {
    if (client) client.release();
  }
};

const getReservations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.visitor_name, r.contact, r.reservation_date, r.status, r.total_price,
              r.plot_section, r.plot_number, c.name AS cemetery_name,
              CASE WHEN r.plot_section IS NOT NULL THEN 'plot' ELSE 'memorial' END AS reservation_type,
              u.name AS account_name, u.email AS account_email, m.name AS memorial_name,
              (SELECT p.payment_status FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC LIMIT 1) AS payment_status
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN memorials m ON m.id = r.memorial_id
       LEFT JOIN cemeteries c ON c.id = r.cemetery_id
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get admin reservations error:', error);
    res.status(500).json({ message: 'Unable to load reservations.' });
  }
};

const getReports = async (req, res) => {
  try {
    const [totals, reservations, monthly] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_reservations,
                COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_reservations,
                COUNT(*) FILTER (WHERE status = 'pending') AS pending_reservations,
                COALESCE(SUM(total_price) FILTER (WHERE status = 'confirmed'), 0) AS confirmed_value
         FROM reservations`
      ),
      pool.query(
        `SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS total
         FROM reservations GROUP BY status ORDER BY status`
      ),
      pool.query(
        `SELECT TO_CHAR(month_start, 'YYYY-MM') AS month, COUNT(r.id) AS total
         FROM generate_series(
           DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months',
           DATE_TRUNC('month', CURRENT_DATE),
           INTERVAL '1 month'
         ) AS months(month_start)
         LEFT JOIN reservations r ON DATE_TRUNC('month', r.created_at) = month_start
         GROUP BY month_start ORDER BY month_start`
      ),
    ]);
    res.json({ totals: totals.rows[0], reservations_by_status: reservations.rows, monthly_reservations: monthly.rows });
  } catch (error) {
    console.error('Get admin reports error:', error);
    res.status(500).json({ message: 'Unable to load reports.' });
  }
};

const getUsers = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COUNT(DISTINCT r.id) AS reservations,
              COUNT(DISTINCT s.id) AS saved_memorials
       FROM users u
       LEFT JOIN reservations r ON r.user_id = u.id
       LEFT JOIN saved_items s ON s.user_id = u.id
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({ message: 'Unable to load user accounts.' });
  }
};

const createUser = async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  const role = body.role;

  if (!name || !email || typeof password !== 'string' || !role) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  if (name.length > 100) {
    return res.status(400).json({ message: 'Name must be 100 characters or fewer.' });
  }

  const validRoles = ['staff', 'admin'];
  if (typeof role !== 'string' || !validRoles.includes(role.trim().toLowerCase())) {
    return res.status(400).json({ message: 'Role must be staff or admin.' });
  }
  const userRole = role.trim().toLowerCase();

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, onboarding_completed, auth_version)
       VALUES ($1, $2, $3, $4, TRUE, 0)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, userRole]
    );

    const user = result.rows[0];
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Unable to create user account.' });
  }
};

const purgeDemo = async (req, res) => {
  try {
    const result = await purgeDemoData(pool, { confirm: (req.body || {}).confirm === true });
    if (!result.confirmed) {
      return res.status(400).json({
        message: 'Confirmation required. Re-send this request with { "confirm": true } to delete the demo content listed in the preview.',
        preview: result.preview,
      });
    }
    res.json({
      message: 'Demo content removed. The system now runs on real data only.',
      deleted: result.deleted,
      remaining: result.remaining,
    });
  } catch (error) {
    console.error('Purge demo data error:', error);
    res.status(500).json({ message: 'Unable to remove demo data.' });
  }
};

module.exports = {
  getDashboard,
  getRecords,
  createRecord,
  updateRecord,
  getReservations,
  getReports,
  getUsers,
  createUser,
  purgeDemo,
};