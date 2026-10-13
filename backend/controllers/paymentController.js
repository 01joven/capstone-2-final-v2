const pool = require('../config/db');
const { sendEmail } = require('../services/emailService');

// Best-effort notification: never fails the verification action.
const notifyPaymentAccount = (to, name, action, amount, reference, note, receiptNo) => {
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const greeting = `Hello ${name || 'valued customer'},\n\n`;
  const body = action === 'approve'
    ? `Your GCash payment of ₱${Number(amount).toLocaleString()} (ref ${reference}) has been verified and your reservation is confirmed.` +
      (receiptNo ? ` Your official receipt is ${receiptNo}.` : '')
    : `Your GCash payment (ref ${reference}) could not be verified. You can submit a new reference number from the Payments page.` +
      (note ? `\n\nNote from staff: ${note}` : '');
  sendEmail({
    to,
    subject: action === 'approve' ? 'Payment verified — reservation confirmed' : 'Payment needs attention',
    text: greeting + body + '\n\nThank you.',
    html: `<p>${(greeting + body).replace(/\n/g, '<br />')}</p>`,
  }).catch((emailError) => console.error('Payment notification error:', emailError.message));
};

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
    const result = await pool.query(
      `SELECT p.*, r.visitor_name, r.reservation_date, m.name AS memorial_name,
              s.to_account AS remitted_to, s.transfer_ref AS settlement_ref
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN settlement_transfers s ON s.id = p.settlement_id
       WHERE r.user_id = $1
       ORDER BY p.transaction_date DESC, p.id DESC`,
      [req.user.id]
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
      `SELECT p.id AS payment_id, p.reservation_id, p.amount, p.payment_method,
              p.payment_reference, p.transaction_date, p.admin_note, r.visitor_name, r.contact,
              r.reservation_date, u.name AS account_name, u.email AS account_email,
              m.name AS memorial_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN users u ON r.user_id = u.id
       JOIN memorials m ON r.memorial_id = m.id
       WHERE p.payment_status = 'pending_verification'
       ORDER BY p.transaction_date ASC, p.id ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get pending payments error:', error);
    res.status(500).json({ message: 'Unable to load pending payment verifications.' });
  }
};

const createPayment = async (req, res) => {
  const reservationId = Number((req.body || {}).reservation_id);
  const paymentReference = typeof (req.body || {}).payment_reference === 'string'
    ? req.body.payment_reference.trim()
    : '';

  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
  }
  if (!/^[A-Z0-9-]{6,30}$/i.test(paymentReference)) {
    return res.status(400).json({ message: 'Enter a valid GCash reference number (6 to 30 letters, numbers, or hyphens).' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const reservation = await client.query(
      'SELECT * FROM reservations WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [reservationId, req.user.id]
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
    if (reservation.rows[0].plot_section) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'Plot reservations do not use online payments; a staff member will review your request.' });
    }
    if (reservation.rows[0].status === 'confirmed') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation is already confirmed.' });
    }

    const existingResult = await client.query(
      'SELECT * FROM payments WHERE reservation_id = $1 ORDER BY transaction_date DESC, id DESC LIMIT 1 FOR UPDATE',
      [reservationId]
    );
    const existingPayment = existingResult.rows[0];
    if (existingPayment?.payment_status === 'pending_verification') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'Your payment is already submitted and waiting for verification.' });
    }
    if (existingPayment?.payment_status === 'completed') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation already has a completed payment.' });
    }

    const result = existingPayment
      ? await client.query(
        `UPDATE payments
         SET payment_method = 'GCash', payment_reference = $1,
             payment_status = 'pending_verification', transaction_date = CURRENT_TIMESTAMP,
             verified_by = NULL, verified_at = NULL
         WHERE id = $2
         RETURNING *`,
        [paymentReference, existingPayment.id]
      )
      : await client.query(
        `INSERT INTO payments (reservation_id, amount, payment_method, payment_reference, payment_status)
         VALUES ($1, $2, 'GCash', $3, 'pending_verification')
         RETURNING *`,
        [reservationId, reservation.rows[0].total_price, paymentReference]
      );

    await client.query('COMMIT');
    transactionStarted = false;
    res.status(existingPayment ? 200 : 201).json(result.rows[0]);
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Payment submission rollback error:', rollbackError);
      });
    }
    if (error.code === '23505') {
      return res.status(409).json({ message: 'That GCash reference number has already been submitted.' });
    }
    console.error('Submit payment for verification error:', error);
    res.status(500).json({ message: 'Unable to submit payment for verification.' });
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
    if (Number(payment.user_id) === Number(req.user.id)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(403).json({ message: 'You cannot verify your own payment.' });
    }
    if (payment.payment_status !== 'pending_verification') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This payment has already been reviewed.' });
    }
    if (payment.reservation_status !== 'pending') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'The reservation is no longer pending.' });
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
        "UPDATE reservations SET status = 'confirmed' WHERE id = $1",
        [payment.reservation_id]
      );
    }

    let receipt = null;
    if (action === 'approve') {
      receipt = await ensureReceipt(client, paymentId, req.user.id);
    }

    await client.query('COMMIT');
    transactionStarted = false;
    if (payment.account_email) {
      notifyPaymentAccount(
        payment.account_email,
        payment.account_name || payment.visitor_name,
        action, payment.amount, payment.payment_reference, note, receipt?.receipt_no
      );
    }
    res.json({
      message: action === 'approve'
        ? 'Payment verified. Reservation confirmed.'
        : 'Payment rejected. The customer can submit a new reference number.',
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
    res.status(500).json({ message: 'Unable to verify payment.' });
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
              r.visitor_name, r.reservation_date, r.user_id,
              m.name AS memorial_name,
              u.name AS account_name, u.email AS account_email,
              v.name AS verified_by_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN users u ON r.user_id = u.id
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN users v ON v.id = p.verified_by
       WHERE p.id = $1`,
      [paymentId]
    );
    const payment = result.rows[0];
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found.' });
    }
    const isOwner = Number(payment.user_id) === Number(req.user.id);
    const isPrivileged = req.user.role === 'staff' || req.user.role === 'admin';
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (payment.payment_status !== 'completed') {
      return res.status(409).json({ message: 'A receipt is issued only after the payment is verified.' });
    }
    // Backfill receipts for payments approved before this module existed.
    const receipt = await ensureReceipt(pool, paymentId, payment.verified_by || req.user.id);
    res.json({
      receipt_no: receipt.receipt_no,
      issued_at: receipt.issued_at,
      amount: payment.amount,
      payment_method: payment.payment_method,
      payment_reference: payment.payment_reference,
      reservation_id: payment.reservation_id,
      memorial_name: payment.memorial_name,
      visitor_name: payment.visitor_name,
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

module.exports = { getUserPayments, getPendingPayments, createPayment, verifyPayment, getPaymentReceipt };
