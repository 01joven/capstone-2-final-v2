const pool = require('../config/db');

const receiptNoFor = (paymentId) => {
  const year = new Date().getFullYear();
  return `OR-${year}-${String(paymentId).padStart(6, '0')}`;
};

// Idempotent: approval retries and legacy completed payments resolve to one row.
const ensureReceipt = async (db, paymentId, issuedBy) => {
  await db.query(
    `INSERT INTO receipts (payment_id, receipt_no, amount, issued_by)
     SELECT $1, $2, p.amount, $3 FROM payments p WHERE p.id = $1
     ON CONFLICT (payment_id) DO NOTHING`,
    [paymentId, receiptNoFor(paymentId), issuedBy]
  );
  const result = await db.query('SELECT * FROM receipts WHERE payment_id = $1', [paymentId]);
  return result.rows[0] || null;
};

const getUserPayments = async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'staff' || req.user.role === 'admin';
    const result = await pool.query(
      `SELECT p.*, r.visitor_name, r.deceased_name, r.contact, r.reservation_date, r.plot_section, r.plot_number,
              COALESCE(m.name, CONCAT('Section ', r.plot_section, ', Plot ', LPAD(r.plot_number::text, 2, '0'))) AS memorial_name,
              rc.receipt_no, rc.issued_at, v.name AS verified_by_name,
              u.name AS account_name, u.email AS account_email
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN receipts rc ON rc.payment_id = p.id
       LEFT JOIN users v ON v.id = p.verified_by
       ${isPrivileged ? '' : 'WHERE r.user_id = $1'}
       ORDER BY p.transaction_date DESC, p.id DESC`,
      isPrivileged ? [] : [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getPendingPayments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id AS reservation_id, r.visitor_name, r.deceased_name, r.contact,
              r.plot_section, r.plot_number, r.reservation_date, r.total_price, r.status AS reservation_status,
              COALESCE(m.name, CONCAT('Section ', r.plot_section, ', Plot ', LPAD(r.plot_number::text, 2, '0'))) AS memorial_name,
              u.name AS account_name, u.email AS account_email,
              p.id AS payment_id, p.payment_status, p.amount
       FROM reservations r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN payments p ON p.reservation_id = r.id AND p.payment_status = 'completed'
       WHERE r.status = 'pending' AND p.id IS NULL
       ORDER BY r.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ message: 'Unable to load unpaid reservations.' });
  }
};

const recordCashPayment = async (req, res) => {
  const reservationId = Number((req.body || {}).reservation_id);
  const amount = Number((req.body || {}).amount);
  const note = typeof (req.body || {}).note === 'string' ? req.body.note.trim() : null;

  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ message: 'A valid payment amount is required.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const reservationResult = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );
    const reservation = reservationResult.rows[0];
    if (!reservation) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }
    if (reservation.status === 'cancelled') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation has been cancelled.' });
    }

    const existingPayment = await client.query(
      "SELECT * FROM payments WHERE reservation_id = $1 AND payment_status = 'completed' LIMIT 1 FOR UPDATE",
      [reservationId]
    );
    if (existingPayment.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation already has a completed cash payment.' });
    }

    const cashRef = `CASH-${Date.now().toString().slice(-6)}`;
    const paymentResult = await client.query(
      `INSERT INTO payments (reservation_id, amount, payment_method, payment_reference, payment_status, verified_by, verified_at, admin_note)
       VALUES ($1, $2, 'Cash', $3, 'completed', $4, CURRENT_TIMESTAMP, $5)
       RETURNING *`,
      [reservationId, amount, cashRef, req.user.id, note || 'Walk-in cash payment']
    );
    const payment = paymentResult.rows[0];

    await client.query(
      "UPDATE reservations SET status = 'confirmed', total_price = $1 WHERE id = $2",
      [amount, reservationId]
    );

    const receipt = await ensureReceipt(client, payment.id, req.user.id);

    await client.query('COMMIT');
    transactionStarted = false;

    res.status(201).json({
      message: 'Cash payment recorded and official receipt issued.',
      payment,
      receipt_no: receipt.receipt_no,
      receipt_id: receipt.id,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((err) => console.error('Rollback error:', err));
    }
    console.error('Record cash payment error:', error);
    res.status(500).json({ message: 'Unable to record cash payment.' });
  } finally {
    if (client) client.release();
  }
};

const createPayment = async (req, res) => {
  const reservationId = Number((req.body || {}).reservation_id);
  const amount = Number((req.body || {}).amount);
  const paymentMethod = typeof (req.body || {}).payment_method === 'string' ? req.body.payment_method.trim() : 'Cash';
  const paymentReference = typeof (req.body || {}).payment_reference === 'string'
    ? req.body.payment_reference.trim()
    : `CASH-${Date.now().toString().slice(-6)}`;

  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const reservation = await client.query(
      'SELECT * FROM reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );
    if (reservation.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }
    if (reservation.rows[0].status === 'cancelled' || reservation.rows[0].status === 'rejected') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation is no longer active.' });
    }

    const payAmount = Number.isFinite(amount) && amount > 0 ? amount : Number(reservation.rows[0].total_price) || 0;

    const result = await client.query(
      `INSERT INTO payments (reservation_id, amount, payment_method, payment_reference, payment_status, verified_by, verified_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, CURRENT_TIMESTAMP)
       RETURNING *`,
      [reservationId, payAmount, paymentMethod, paymentReference, req.user.id]
    );

    await client.query(
      "UPDATE reservations SET status = 'confirmed', total_price = $1 WHERE id = $2",
      [payAmount, reservationId]
    );

    const receipt = await ensureReceipt(client, result.rows[0].id, req.user.id);

    await client.query('COMMIT');
    transactionStarted = false;
    res.status(201).json({ ...result.rows[0], receipt_no: receipt.receipt_no });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Payment submission rollback error:', rollbackError);
      });
    }
    console.error('Payment error:', error);
    res.status(500).json({ message: 'Unable to record payment.' });
  } finally {
    if (client) client.release();
  }
};

const verifyPayment = async (req, res) => {
  const paymentId = Number(req.params.id);
  const action = (req.body || {}).action;
  const note = typeof (req.body || {}).note === 'string' ? req.body.note.trim().slice(0, 500) : null;
  if (!Number.isSafeInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ message: 'A valid payment ID is required.' });
  }
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Choose approve or reject.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query(
      `SELECT p.id, p.payment_status, p.reservation_id, p.amount, p.payment_reference,
              r.user_id, r.status AS reservation_status, r.visitor_name,
              u.email AS account_email, u.name AS account_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN users u ON r.user_id = u.id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [paymentId]
    );
    const payment = result.rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Payment not found.' });
    }

    const paymentStatus = action === 'approve' ? 'completed' : 'rejected';
    await client.query(
      `UPDATE payments
       SET payment_status = $1, verified_by = $2, verified_at = CURRENT_TIMESTAMP, admin_note = $3
       WHERE id = $4`,
      [paymentStatus, req.user.id, note || null, paymentId]
    );
    if (action === 'approve') {
      await client.query(
        "UPDATE reservations SET status = 'confirmed' WHERE id = $1 AND status = 'pending'",
        [payment.reservation_id]
      );
    }

    let receipt = null;
    if (action === 'approve') {
      receipt = await ensureReceipt(client, paymentId, req.user.id);
    }

    await client.query('COMMIT');
    transactionStarted = false;

    res.json({
      message: action === 'approve'
        ? 'Payment verified. Reservation confirmed.'
        : 'Payment marked as rejected.',
      payment_status: paymentStatus,
      ...(receipt ? { receipt_no: receipt.receipt_no, receipt_id: receipt.id } : {}),
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Verify payment rollback error:', rollbackError);
      });
    }
    console.error('Verify payment error:', error);
    res.status(500).json({ message: 'Unable to update payment.' });
  } finally {
    if (client) client.release();
  }
};

const getPaymentReceipt = async (req, res) => {
  const paymentId = Number(req.params.id);
  if (!Number.isSafeInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({ message: 'A valid payment ID is required.' });
  }
  try {
    const result = await pool.query(
      `SELECT p.id, p.reservation_id, p.amount, p.payment_method, p.payment_reference,
              p.payment_status, p.transaction_date, p.verified_by, p.verified_at,
              r.visitor_name, r.deceased_name, r.contact, r.plot_section, r.plot_number,
              r.reservation_date, r.user_id,
              COALESCE(m.name, CONCAT('Section ', r.plot_section, ', Plot ', LPAD(r.plot_number::text, 2, '0'))) AS memorial_name,
              u.name AS account_name, u.email AS account_email,
              v.name AS verified_by_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN users v ON v.id = p.verified_by
       WHERE p.id = $1`,
      [paymentId]
    );
    const payment = result.rows[0];
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const receipt = await ensureReceipt(pool, paymentId, payment.verified_by || req.user.id);
    res.json({
      receipt_no: receipt.receipt_no,
      issued_at: receipt.issued_at,
      amount: payment.amount,
      payment_method: payment.payment_method || 'Cash',
      payment_reference: payment.payment_reference,
      reservation_id: payment.reservation_id,
      memorial_name: payment.memorial_name,
      deceased_name: payment.deceased_name,
      visitor_name: payment.visitor_name,
      contact: payment.contact,
      plot_section: payment.plot_section,
      plot_number: payment.plot_number,
      account_name: payment.account_name,
      account_email: payment.account_email,
      reservation_date: payment.reservation_date,
      verified_by_name: payment.verified_by_name,
      verified_at: payment.verified_at,
    });
  } catch (error) {
    console.error('Get payment receipt error:', error);
    res.status(500).json({ message: 'Unable to load the receipt.' });
  }
};

module.exports = {
  getUserPayments,
  getPendingPayments,
  recordCashPayment,
  createPayment,
  verifyPayment,
  getPaymentReceipt,
};
