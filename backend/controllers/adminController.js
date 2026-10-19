const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const {
  parsePlotReference,
  isBurialPlotOccupied,
  getActivePlotReservation,
} = require('../services/plotAvailability');

const validateRecord = (body = {}, role = 'staff') => {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const graveReference = typeof body.grave_reference === 'string' ? body.grave_reference.trim() : '';
  const birthDate = body.birth_date || null;
  const deathDate = body.death_date || null;
  const epitaph = typeof body.epitaph === 'string' && body.epitaph.trim()
    ? body.epitaph.trim().slice(0, 500)
    : null;

  if (!fullName || fullName.length > 200) {
    return { error: 'Full name must contain 1 to 200 characters.' };
  }
  if (graveReference.length > 100) {
    return { error: 'Grave reference must be 100 characters or fewer.' };
  }
  const looksLikePlot = graveReference.match(/^([A-Za-z]{1,10})-?(\d+)$/);
  if (looksLikePlot && (looksLikePlot[2].length > 5 || Number(looksLikePlot[2]) > 10000)) {
    return { error: 'Plot numbers must be between 1 and 10000.' };
  }
  if (typeof body.epitaph === 'string' && body.epitaph.trim().length > 500) {
    return { error: 'Epitaph must be 500 characters or fewer.' };
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
      epitaph,
    },
  };
};

const getDashboard = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM burial_records) AS records,
        (SELECT COUNT(*) FROM reservations) AS reservations,
        (SELECT COUNT(*) FROM users WHERE role IN ('staff', 'admin')) AS users,
        (SELECT COUNT(*) FROM reservations r LEFT JOIN payments p ON p.reservation_id = r.id AND p.payment_status = 'completed' WHERE r.status IN ('pending', 'approved') AND p.id IS NULL) AS pending_payments,
        (SELECT COUNT(*) FROM reservations WHERE status = 'pending') AS pending_reservations`
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
      `SELECT b.id, b.full_name, b.grave_reference, b.birth_date, b.death_date, b.epitaph,
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

// Walk-in creation. Since public registration is gone, the process is entirely
// at the counter: staff/admin encode the record directly. The money gate still
// applies: assigning a plot requires that plot's reservation to be 'confirmed'
// (cash recorded), and publishing completes the reservation — the same strict
// rule the edit path enforces. A record without a plot reference needs no
// reservation at all.
const createRecord = async (req, res) => {
  if ((req.body || {}).verified_authorized !== true) {
    return res.status(400).json({ message: 'Explicit verification and publication authorization are required.' });
  }
  const validated = validateRecord(req.body, req.user.role);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }
  // Optional scheduled burial/funeral date, published with the record.
  const burialDate = (req.body || {}).burial_date || null;
  if (burialDate !== null && (
    typeof burialDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(burialDate) ||
    Number.isNaN(new Date(`${burialDate}T00:00:00.000Z`).getTime()) ||
    new Date(`${burialDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== burialDate
  )) {
    return res.status(400).json({ message: 'Enter a valid burial date (YYYY-MM-DD).' });
  }

  let client;
  let transactionStarted = false;
  try {
    const { fullName, graveReference, birthDate, deathDate, epitaph } = validated.values;
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const cemeteryResult = await client.query(
      `SELECT id FROM cemeteries WHERE name = 'Cogon Cemetery' AND barangay = 'Cogon'
       AND municipality = 'Cordova' AND province = 'Cebu' FOR UPDATE`
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
      if (!reservation || reservation.status !== 'confirmed') {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          message: !reservation
            ? 'That plot has no confirmed (paid) reservation. Create a reservation, review the request, record the cash payment, then publish the record.'
            : reservation.status === 'approved'
              ? 'That plot request is still awaiting cash payment. Record the payment before publishing the record.'
              : 'That plot has a pending reservation request. Review the request before publishing the record.',
        });
      }
    }

    try {
      const result = await client.query(
        `INSERT INTO burial_records (cemetery_id, full_name, grave_reference, birth_date, death_date, burial_date, epitaph)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, full_name, grave_reference, birth_date, death_date, burial_date, epitaph`,
        [cemeteryId, fullName, graveReference, birthDate, deathDate, burialDate, epitaph]
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
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'A record with this name already exists for Cogon Cemetery.' });
      }
      throw error;
    }
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Create record rollback error:', rollbackError);
      });
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
  if ((req.body || {}).verified_authorized !== true) {
    return res.status(400).json({ message: 'Explicit verification and publication authorization are required.' });
  }
  const validated = validateRecord(req.body, req.user.role);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }

  let client;
  let transactionStarted = false;
  try {
    const { fullName, graveReference, birthDate, deathDate, epitaph } = validated.values;
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const recordResult = await client.query(
      'SELECT cemetery_id, grave_reference FROM burial_records WHERE id = $1 FOR UPDATE',
      [recordId]
    );
    if (recordResult.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Memorial record not found.' });
    }
    const cemeteryId = recordResult.rows[0].cemetery_id;
    const previousPlot = parsePlotReference(recordResult.rows[0].grave_reference);
    await client.query('SELECT id FROM cemeteries WHERE id = $1 FOR UPDATE', [cemeteryId]);

    const plot = parsePlotReference(graveReference);
    if (plot) {
      if (await isBurialPlotOccupied(client, cemeteryId, plot.section, plot.lotNumber, recordId)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'That plot is already occupied by another memorial record.' });
      }
      const reservation = await getActivePlotReservation(client, cemeteryId, plot.section, plot.lotNumber);
      // An active reservation holds the plot: only a confirmed (cash paid)
      // reservation may be assigned, and assigning completes it.
      if (reservation && reservation.status !== 'confirmed') {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          message: reservation.status === 'approved'
            ? 'That plot request is still awaiting cash payment. Record the payment before assigning it.'
            : 'That plot has a pending reservation request. Review the request before assigning it.',
        });
      }
      // Strict gate: moving a record onto a plot (new assignment or a change
      // of plot) requires a paid reservation. Keeping the same plot, or
      // editing non-plot fields, stays allowed so legacy records remain
      // maintainable. Without this, staff could bypass the
      // reservation -> cash -> publish money gate via Edit.
      const plotChanged = !previousPlot
        || previousPlot.section !== plot.section
        || previousPlot.lotNumber !== plot.lotNumber;
      if (plotChanged && !reservation) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({
          message: 'That plot has no confirmed (paid) reservation. Create a reservation, have staff approve it, record the cash payment, then assign it.',
        });
      }
    }

    const result = await client.query(
      `UPDATE burial_records
       SET full_name = $1, grave_reference = $2, birth_date = $3,
           death_date = $4, epitaph = $5
       WHERE id = $6
       RETURNING id, full_name, grave_reference, birth_date, death_date, epitaph`,
      [fullName, graveReference, birthDate, deathDate, epitaph, recordId]
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

const deleteRecord = async (req, res) => {
  const recordId = Number(req.params.id);
  if (!Number.isSafeInteger(recordId) || recordId < 1) {
    return res.status(400).json({ message: 'A valid record ID is required.' });
  }
  try {
    const result = await pool.query('DELETE FROM burial_records WHERE id = $1 RETURNING id', [recordId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Memorial record not found.' });
    }
    res.json({ message: 'Memorial record deleted.' });
  } catch (error) {
    console.error('Delete admin record error:', error);
    res.status(500).json({ message: 'Unable to delete memorial record.' });
  }
};

const getReservations = async (req, res) => {
  try {
    // Optional ?status= filter (e.g. 'pending') powers the dedicated
    // Pendings view; the unfiltered listing stays the default.
    const allowedStatuses = ['pending', 'approved', 'confirmed', 'completed', 'rejected', 'cancelled'];
    const statusFilter = allowedStatuses.includes(String(req.query.status || '').toLowerCase())
      ? String(req.query.status).toLowerCase()
      : null;
    const params = statusFilter ? [statusFilter] : [];
    const result = await pool.query(
      `SELECT r.id, r.visitor_name, r.deceased_name, r.contact, r.reservation_date, r.status, r.total_price,
              r.plot_section, r.plot_number, r.review_note, r.created_at, c.name AS cemetery_name,
              CASE WHEN r.plot_section IS NOT NULL THEN 'plot' ELSE 'memorial' END AS reservation_type,
              u.name AS account_name, u.email AS account_email, m.name AS memorial_name,
              (SELECT p.payment_status FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC LIMIT 1) AS payment_status,
              (SELECT p.payment_reference FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC LIMIT 1) AS payment_reference,
              (SELECT rc.receipt_no FROM receipts rc
               JOIN payments p ON p.id = rc.payment_id
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC LIMIT 1) AS receipt_no,
              (SELECT s.to_account FROM payments p
               LEFT JOIN settlement_transfers s ON s.id = p.settlement_id
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC LIMIT 1) AS remitted_to
       FROM reservations r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN memorials m ON m.id = r.memorial_id
       LEFT JOIN cemeteries c ON c.id = r.cemetery_id
       ${statusFilter ? 'WHERE r.status = $1' : ''}
       ORDER BY r.created_at DESC`,
      params
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
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at,
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

  const minimumLength = userRole === 'admin' ? 12 : 8;
  if (password.length < minimumLength || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({
      message: `Password must be at least ${minimumLength} characters and no more than 72 bytes.`,
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
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

const updateUserRole = async (req, res) => {
  const userId = Number(req.params.id);
  const role = typeof (req.body || {}).role === 'string' ? req.body.role.trim().toLowerCase() : '';
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user ID is required.' });
  }
  if (!['staff', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Role must be staff or admin.' });
  }
  if (userId === req.user.id) {
    return res.status(403).json({ message: 'You cannot change your own role.' });
  }
  try {
    const target = await pool.query('SELECT role, is_active FROM users WHERE id = $1', [userId]);
    if (target.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (target.rows[0].role === 'admin' && target.rows[0].is_active !== false && role !== 'admin') {
      const remaining = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active IS NOT FALSE AND id <> $1",
        [userId]
      );
      if (Number(remaining.rows[0].count) === 0) {
        return res.status(409).json({ message: 'You cannot demote the last active administrator.' });
      }
    }
    const result = await pool.query(
      `UPDATE users SET role = $1, auth_version = auth_version + 1 WHERE id = $2
       RETURNING id, name, email, role, is_active`,
      [role, userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ message: 'Unable to update user role.' });
  }
};

const setUserActive = async (req, res) => {
  const userId = Number(req.params.id);
  const active = (req.body || {}).active;
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user ID is required.' });
  }
  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'Active must be true or false.' });
  }
  if (userId === req.user.id) {
    return res.status(403).json({ message: 'You cannot deactivate your own account.' });
  }
  try {
    const target = await pool.query('SELECT role, is_active FROM users WHERE id = $1', [userId]);
    if (target.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (active === false && target.rows[0].role === 'admin' && target.rows[0].is_active !== false) {
      const remaining = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active IS NOT FALSE AND id <> $1",
        [userId]
      );
      if (Number(remaining.rows[0].count) === 0) {
        return res.status(409).json({ message: 'You cannot deactivate the last active administrator.' });
      }
    }
    const result = await pool.query(
      `UPDATE users SET is_active = $1, auth_version = auth_version + 1 WHERE id = $2
       RETURNING id, name, email, role, is_active`,
      [active, userId]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ message: 'Unable to update user status.' });
  }
};

const deleteUser = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'A valid user ID is required.' });
  }
  if (userId === req.user.id) {
    return res.status(403).json({ message: 'You cannot delete your own account.' });
  }
  try {
    const target = await pool.query('SELECT role, is_active FROM users WHERE id = $1', [userId]);
    if (target.rows.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    if (target.rows[0].role === 'admin' && target.rows[0].is_active !== false) {
      const admins = await pool.query(
        "SELECT COUNT(*) FROM users WHERE role = 'admin' AND is_active IS NOT FALSE AND id <> $1",
        [userId]
      );
      if (Number(admins.rows[0].count) === 0) {
        return res.status(409).json({ message: 'You cannot delete the last active administrator account.' });
      }
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ message: 'User account deleted.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Unable to delete user account.' });
  }
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateRange = (query = {}) => {
  const hasFrom = typeof query.from === 'string' && DATE_PATTERN.test(query.from);
  const hasTo = typeof query.to === 'string' && DATE_PATTERN.test(query.to);
  // Defaults resolve in SQL via CURRENT_DATE so range and stored
  // CURRENT_TIMESTAMP values share the database timezone.
  const from = hasFrom ? query.from : null;
  const to = hasTo ? query.to : null;
  if (from && to && from > to) {
    return { error: 'The start date must be on or before the end date.' };
  }
  if (from && to) {
    const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000);
    if (days > 366) {
      return { error: 'Date range must be 366 days or fewer.' };
    }
  }
  return { from, to };
};

const getCollections = async (req, res) => {
  const range = parseDateRange(req.query);
  if (range.error) {
    return res.status(400).json({ message: range.error });
  }
  try {
    // Date comparisons use verified_at::date and CURRENT_DATE so filtering
    // shares the database timezone with stored CURRENT_TIMESTAMP values.
    const rangeFilter = `verified_at::date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
           AND verified_at::date <= COALESCE($2::date, CURRENT_DATE)`;
    const [daily, byVerifier, summary, unremitted, payments] = await Promise.all([
      pool.query(
        `SELECT verified_at::date AS day, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE payment_status = 'completed' AND ${rangeFilter}
         GROUP BY verified_at::date
         ORDER BY verified_at::date`,
        [range.from, range.to]
      ),
      pool.query(
        `SELECT COALESCE(u.name, 'Unknown') AS verifier, COUNT(*) AS count, COALESCE(SUM(p.amount), 0) AS total
         FROM payments p
         LEFT JOIN users u ON u.id = p.verified_by
         WHERE p.payment_status = 'completed' AND p.verified_at::date >= COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')
           AND p.verified_at::date <= COALESCE($2::date, CURRENT_DATE)
         GROUP BY u.name
         ORDER BY SUM(p.amount) DESC`,
        [range.from, range.to]
      ),
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE payment_status = 'completed' AND ${rangeFilter}`,
        [range.from, range.to]
      ),
      // Still unremitted: recorded but not yet settled.
      pool.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE payment_status = 'completed' AND settlement_id IS NULL`
      ),
      // Drill-down: individual verified payments in range for audit.
      pool.query(
        `SELECT p.id, p.amount, p.payment_reference, p.verified_at,
                r.visitor_name, m.name AS memorial_name,
                COALESCE(u.name, 'Unknown') AS verifier,
                rc.receipt_no, s.to_account AS remitted_to
         FROM payments p
         JOIN reservations r ON r.id = p.reservation_id
         LEFT JOIN memorials m ON m.id = r.memorial_id
         LEFT JOIN users u ON u.id = p.verified_by
         LEFT JOIN receipts rc ON rc.payment_id = p.id
         LEFT JOIN settlement_transfers s ON s.id = p.settlement_id
         WHERE p.payment_status = 'completed' AND ${rangeFilter}
         ORDER BY p.verified_at DESC, p.id DESC
         LIMIT 100`,
        [range.from, range.to]
      ),
    ]);
    const bounds = await pool.query(
      `SELECT COALESCE($1::date, CURRENT_DATE - INTERVAL '29 days')::date AS from_date,
              COALESCE($2::date, CURRENT_DATE)::date AS to_date`,
      [range.from, range.to]
    );
    res.json({
      from: bounds.rows[0].from_date,
      to: bounds.rows[0].to_date,
      summary: summary.rows[0],
      unremitted: unremitted.rows[0],
      daily: daily.rows,
      by_verifier: byVerifier.rows,
      payments: payments.rows,
    });
  } catch (error) {
    console.error('Get collections error:', error);
    res.status(500).json({ message: 'Unable to load collections.' });
  }
};

const getSettlements = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              (SELECT COUNT(*) FROM payments p WHERE p.settlement_id = s.id) AS covered_count,
              (SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.settlement_id = s.id) AS covered_total,
              u.name AS transferred_by_name
       FROM settlement_transfers s
       LEFT JOIN users u ON u.id = s.transferred_by
       ORDER BY s.transferred_at DESC, s.id DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get settlements error:', error);
    res.status(500).json({ message: 'Unable to load settlement transfers.' });
  }
};

const createSettlement = async (req, res) => {
  const body = req.body || {};
  const periodFrom = typeof body.period_from === 'string' ? body.period_from : '';
  const periodTo = typeof body.period_to === 'string' ? body.period_to : '';
  const fromWallet = typeof body.from_wallet === 'string' && body.from_wallet.trim()
    ? body.from_wallet.trim().slice(0, 100)
    : 'Cash on hand';
  const amount = Number(body.amount);

  if (!DATE_PATTERN.test(periodFrom) || !DATE_PATTERN.test(periodTo) || periodFrom > periodTo) {
    return res.status(400).json({ message: 'Enter a valid collection period (YYYY-MM-DD, start on or before end).' });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000000) {
    return res.status(400).json({ message: 'Enter a valid amount greater than zero.' });
  }

  try {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      // Reconcile first: the recorded amount must exactly equal the
      // unremitted verified total for the period. Nothing is written otherwise.
      const preview = await client.query(
        `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE payment_status = 'completed'
           AND settlement_id IS NULL
           AND verified_at::date >= $1::date
           AND verified_at::date <= $2::date`,
        [periodFrom, periodTo]
      );
      const expectedTotal = Number(preview.rows[0].total);
      if (Number(preview.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'There are no unremitted recorded payments in this period.' });
      }
      if (Number(amount.toFixed(2)) !== Number(expectedTotal.toFixed(2))) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(400).json({
          message: `Amount must equal the unremitted recorded total for this period (₱${expectedTotal.toLocaleString()}).`,
        });
      }
      // Destination account/reference were retired from the form; the columns
      // remain for legacy rows, so new transfers store NULL for both.
      const result = await client.query(
        `INSERT INTO settlement_transfers (period_from, period_to, amount, from_wallet, to_account, transfer_ref, transferred_by)
         VALUES ($1, $2, $3, $4, NULL, NULL, $5)
         RETURNING *`,
        [periodFrom, periodTo, amount, fromWallet, req.user.id]
      );
      // Destination: every verified-but-unremitted payment in the period
      // moves from the collections wallet into this transfer atomically.
      const covered = await client.query(
        `UPDATE payments
         SET settlement_id = $1
         WHERE payment_status = 'completed'
           AND settlement_id IS NULL
           AND verified_at::date >= $2::date
           AND verified_at::date <= $3::date
         RETURNING id, amount`,
        [result.rows[0].id, periodFrom, periodTo]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      const coveredTotal = covered.rows.reduce((sum, row) => sum + Number(row.amount), 0);
      res.status(201).json({
        ...result.rows[0],
        covered_count: covered.rows.length,
        covered_total: coveredTotal,
      });
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK').catch((rollbackError) => {
          console.error('Create settlement rollback error:', rollbackError);
        });
      }
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create settlement error:', error);
    res.status(500).json({ message: 'Unable to record the settlement transfer.' });
  }
};

const voidSettlement = async (req, res) => {
  const settlementId = Number(req.params.id);
  if (!Number.isSafeInteger(settlementId) || settlementId < 1) {
    return res.status(400).json({ message: 'A valid settlement ID is required.' });
  }
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const existing = await client.query(
      'SELECT id FROM settlement_transfers WHERE id = $1 FOR UPDATE',
      [settlementId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Settlement transfer not found.' });
    }
    // Return attached payments to the wallet, then remove the transfer record.
    const released = await client.query(
      'UPDATE payments SET settlement_id = NULL WHERE settlement_id = $1 RETURNING id',
      [settlementId]
    );
    await client.query('DELETE FROM settlement_transfers WHERE id = $1', [settlementId]);
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({
      message: 'Settlement transfer voided. Attached payments returned to the unremitted balance.',
      released_count: released.rows.length,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Void settlement rollback error:', rollbackError);
      });
    }
    console.error('Void settlement error:', error);
    res.status(500).json({ message: 'Unable to void settlement transfer.' });
  } finally {
    if (client) client.release();
  }
};

const searchReceipts = async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2 || query.length > 100) {
    return res.status(400).json({ message: 'Enter at least 2 characters to search.' });
  }
  try {
    const like = `%${query}%`;
    const result = await pool.query(
      `SELECT rc.receipt_no, rc.issued_at, p.amount, p.payment_method,
              p.payment_reference, p.payment_status, p.transaction_date,
              p.reservation_id, r.visitor_name, r.reservation_date,
              m.name AS memorial_name, u.name AS account_name, u.email AS account_email
       FROM receipts rc
       JOIN payments p ON p.id = rc.payment_id
       JOIN reservations r ON r.id = p.reservation_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN memorials m ON m.id = r.memorial_id
       WHERE rc.receipt_no ILIKE $1 OR p.payment_reference ILIKE $1
          OR r.visitor_name ILIKE $1 OR COALESCE(m.name, '') ILIKE $1
       ORDER BY rc.issued_at DESC, rc.id DESC
       LIMIT 20`,
      [like]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Search receipts error:', error);
    res.status(500).json({ message: 'Unable to search receipts.' });
  }
};

module.exports = {
  getDashboard,
  getRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  getReservations,
  getReports,
  getCollections,
  getSettlements,
  createSettlement,
  voidSettlement,
  searchReceipts,
  getUsers,
  createUser,
  updateUserRole,
  setUserActive,
  deleteUser,
};