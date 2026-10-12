const pool = require('../config/db');

const getUserPayments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, r.visitor_name, r.reservation_date, m.name AS memorial_name
       FROM payments p
       JOIN reservations r ON p.reservation_id = r.id
       JOIN memorials m ON r.memorial_id = m.id
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
              p.payment_reference, p.transaction_date, r.visitor_name, r.contact,
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
      `SELECT p.id, p.payment_status, p.reservation_id, r.user_id
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
    if (payment.user_id === req.user.id) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(403).json({ message: 'You cannot verify your own payment.' });
    }
    if (payment.payment_status !== 'pending_verification') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This payment has already been reviewed.' });
    }

    const paymentStatus = action === 'approve' ? 'completed' : 'rejected';
    await client.query(
      `UPDATE payments
       SET payment_status = $1, verified_by = $2, verified_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [paymentStatus, req.user.id, paymentId]
    );
    if (action === 'approve') {
      await client.query(
        "UPDATE reservations SET status = 'confirmed' WHERE id = $1",
        [payment.reservation_id]
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    res.json({
      message: action === 'approve'
        ? 'Payment verified. Reservation confirmed.'
        : 'Payment rejected. The customer can submit a new reference number.',
      payment_status: paymentStatus,
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

module.exports = { getUserPayments, getPendingPayments, createPayment, verifyPayment };
