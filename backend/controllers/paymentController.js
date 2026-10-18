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
    // Only a submitted request ('pending') or a staff-reviewed request still
    // awaiting cash ('approved') can be paid. 'confirmed' already has its
    // receipt; 'completed'/'cancelled'/'rejected' are terminal.
    if (!['pending', 'approved'].includes(reservation.status)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      const message = reservation.status === 'cancelled'
        ? 'This reservation has been cancelled.'
        : reservation.status === 'rejected'
          ? 'This reservation was rejected.'
          : 'This reservation has already been confirmed.';
      return res.status(409).json({ message });
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

    // Money integrity: a positive amount is required, and recording less than
    // the reservation's quoted fee must be an explicit, noted adjustment —
    // never a silent underpayment. The note is stored in admin_note and shown
    // in payment history, so reduced receipts carry their justification.
    const totalDue = Number(reservation.total_price) || 0;
    if (totalDue > 0 && amount <= 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'Enter a positive cash amount.' });
    }
    if (amount < totalDue && !note) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({
        message: `Cash amount (₱${amount.toLocaleString()}) is below the reservation fee (₱${totalDue.toLocaleString()}). Record the full fee, or add a note explaining the reduction.`,
      });
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

// Cash (walk-in) is the only numbered payment path: recordCashPayment is the
// only writer of completed payments, the only issuer of receipts, and the only
// path that moves a reservation to 'confirmed'.
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
    // Receipts expose visitor PII: only the reservation owner or a privileged
    // (staff/admin) account may read one.
    const isPrivileged = req.user.role === 'staff' || req.user.role === 'admin';
    if (!isPrivileged && Number(payment.user_id) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You do not have access to this receipt.' });
    }
    // Receipts exist only for completed cash payments. A rejected or awaiting
    // payment must never yield a printable receipt number.
    if (payment.payment_status !== 'completed') {
      return res.status(409).json({ message: 'A receipt is only available for completed cash payments.' });
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
  recordCashPayment,
  getPaymentReceipt,
};
