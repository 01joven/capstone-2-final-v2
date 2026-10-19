const pool = require('../config/db');
const { isBurialPlotOccupied, getActivePlotReservation } = require('../services/plotAvailability');
const { sendEmail } = require('../services/emailService');

// Best-effort notification: never fails the reservation action.
// Without Resend configured the email is skipped and the action still succeeds.
const notifyAccount = (to, subject, text) => {
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  sendEmail({ to, subject, text, html: `<p>${text.replace(/\n/g, '<br />')}</p>` })
    .catch((emailError) => console.error('Reservation notification error:', emailError.message));
};

// Cemetery dates are local dates, so "today" is computed in the app's timezone, not UTC.
const todayInAppTimezone = () => new Date().toLocaleDateString('en-CA', {
  timeZone: process.env.APP_TIMEZONE || 'Asia/Manila',
});

const getPlotReservations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT UPPER(r.plot_section) AS plot_section, r.plot_number, r.status
       FROM reservations r
       JOIN cemeteries c ON c.id = r.cemetery_id
       WHERE c.name = 'Cogon Cemetery' AND c.barangay = 'Cogon'
         AND c.municipality = 'Cordova' AND c.province = 'Cebu'
         AND r.plot_section IS NOT NULL AND r.status IN ('pending', 'approved', 'confirmed')
       ORDER BY plot_section, plot_number`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get plot reservations error:', error);
    res.status(500).json({ message: 'Unable to load reserved plots.' });
  }
};

const getUserReservations = async (req, res) => {
  try {
    const isPrivileged = req.user.role === 'staff' || req.user.role === 'admin';
    const result = await pool.query(
      `SELECT r.*, m.name as memorial_name, m.image_url as memorial_image,
              c.name AS cemetery_name,
              CASE WHEN r.plot_section IS NOT NULL THEN 'plot' ELSE 'memorial' END AS reservation_type,
              (SELECT p.payment_status
               FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC
               LIMIT 1) AS payment_status,
              (SELECT p.amount
               FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC
               LIMIT 1) AS paid_amount,
              (SELECT rc.receipt_no
               FROM payments p
               JOIN receipts rc ON rc.payment_id = p.id
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC
               LIMIT 1) AS receipt_no
       FROM reservations r
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN cemeteries c ON r.cemetery_id = c.id
       ${isPrivileged ? '' : 'WHERE r.user_id = $1'}
       ORDER BY r.created_at DESC`,
      isPrivileged ? [] : [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createReservation = async (req, res) => {
  const body = req.body || {};
  const deceasedName = typeof body.deceased_name === 'string' ? body.deceased_name.trim() : '';
  const visitorName = typeof body.visitor_name === 'string' ? body.visitor_name.trim() : '';
  const visitorContact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const reservationDate = body.reservation_date;
  const plotSection = typeof body.plot_section === 'string' ? body.plot_section.trim().toUpperCase() : '';
  const plotNumber = Number(body.plot_number);
  const isPlotReservation = Boolean(plotSection || body.plot_number !== undefined);
  const priceInput = body.total_price !== undefined ? Number(body.total_price) : (body.price !== undefined ? Number(body.price) : 0);

  if (isPlotReservation && body.memorial_id !== undefined) {
    return res.status(400).json({ message: 'Choose either a memorial-site reservation or a plot reservation.' });
  }
  if (!visitorName || !visitorContact || !reservationDate) {
    return res.status(400).json({ message: 'Name, contact, and reservation date are required.' });
  }
  if (visitorName.length > 100 || visitorContact.length > 100) {
    return res.status(400).json({ message: 'Name and contact must be 100 characters or fewer.' });
  }

  const dateValue = typeof reservationDate === 'string'
    ? new Date(`${reservationDate}T00:00:00.000Z`)
    : new Date(Number.NaN);
  if (Number.isNaN(dateValue.getTime()) || dateValue.toISOString().slice(0, 10) !== reservationDate) {
    return res.status(400).json({ message: 'Enter a valid reservation date.' });
  }
  if (reservationDate < todayInAppTimezone()) {
    return res.status(400).json({ message: 'Reservation date cannot be in the past.' });
  }

  if (isPlotReservation) {
    if (!/^[A-Z]{1,10}$/.test(plotSection) || !Number.isSafeInteger(plotNumber) || plotNumber < 1 || plotNumber > 10000) {
      return res.status(400).json({ message: 'Choose a valid section and plot.' });
    }

    let client;
    let transactionStarted = false;
    let cemeteryId = null;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionStarted = true;

      const cemeteryResult = await client.query(
        `SELECT id FROM cemeteries
         WHERE name = 'Cogon Cemetery' AND barangay = 'Cogon'
           AND municipality = 'Cordova' AND province = 'Cebu'
         FOR UPDATE`
      );
      cemeteryId = cemeteryResult.rows[0]?.id;
      if (!cemeteryId) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'Cogon Cemetery is not configured in the database.' });
      }

      if (await isBurialPlotOccupied(client, cemeteryId, plotSection, plotNumber)) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'This plot is already occupied.' });
      }

      const result = await client.query(
        `INSERT INTO reservations
           (user_id, cemetery_id, plot_section, plot_number, deceased_name, visitor_name, contact, reservation_date, total_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING *`,
        [req.user.id, cemeteryId, plotSection, plotNumber, deceasedName || null, visitorName, visitorContact, reservationDate, Math.max(0, priceInput)]
      );
      await client.query('COMMIT');
      transactionStarted = false;
      return res.status(201).json(result.rows[0]);
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK').catch((rollbackError) => {
          console.error('Create plot reservation rollback error:', rollbackError);
        });
      }
      if (error.code === '23505') {
        // Tell the customer exactly what holds the plot: awaiting review,
        // awaiting cash payment, or already paid (occupied plots are caught
        // before the insert with their own message).
        try {
          const active = await getActivePlotReservation(client, cemeteryId, plotSection, plotNumber);
          const reason = active?.status === 'pending' ? 'is awaiting staff review'
            : active?.status === 'approved' ? 'is awaiting cash payment'
            : active?.status === 'confirmed' ? 'is already paid and confirmed'
            : 'has already been requested or reserved';
          return res.status(409).json({ message: `This plot ${reason}. Choose another plot.` });
        } catch (lookupError) {
          console.error('Held-plot lookup error:', lookupError);
        }
        return res.status(409).json({ message: 'This plot has already been requested or reserved.' });
      }
      console.error('Create plot reservation error:', error);
      return res.status(500).json({ message: 'Unable to submit plot reservation.' });
    } finally {
      if (client) client.release();
    }
  }

  try {
    const memorialId = Number(body.memorial_id);
    if (!Number.isSafeInteger(memorialId) || memorialId < 1) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const memorial = await pool.query('SELECT price FROM memorials WHERE id = $1', [memorialId]);
    if (memorial.rows.length === 0) {
      return res.status(404).json({ message: 'Memorial not found.' });
    }

    const totalPrice = memorial.rows[0].price;

    const result = await pool.query(
      `INSERT INTO reservations (user_id, memorial_id, deceased_name, visitor_name, contact, reservation_date, total_price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, memorialId, deceasedName || null, visitorName, visitorContact, reservationDate, totalPrice]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create reservation error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const reviewPlotReservation = async (req, res) => {
  const reservationId = Number(req.params.id);
  const action = (req.body || {}).action;
  const note = typeof (req.body || {}).note === 'string' ? req.body.note.trim().slice(0, 500) : null;
  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
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

    const reservationSnapshot = await client.query(
      'SELECT cemetery_id FROM reservations WHERE id = $1',
      [reservationId]
    );
    if (!reservationSnapshot.rows[0]) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }
    // Memorial-site (non-plot) reservations carry no cemetery/plot: those
    // locks only apply to plot requests. Both types are reviewable.
    if (reservationSnapshot.rows[0].cemetery_id) {
      await client.query('SELECT id FROM cemeteries WHERE id = $1 FOR UPDATE', [reservationSnapshot.rows[0].cemetery_id]);
    }

    const reservationResult = await client.query(
      `SELECT id, cemetery_id, plot_section, plot_number, status
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [reservationId]
    );
    const reservation = reservationResult.rows[0];
    if (!reservation) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }
    if (reservation.status !== 'pending') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This reservation has already been reviewed.' });
    }

    // Occupancy only matters for plot requests; memorial-site bookings have
    // no plot to occupy.
    if (action === 'approve' && reservation.plot_section && reservation.cemetery_id) {
      if (await isBurialPlotOccupied(
        client,
        reservation.cemetery_id,
        reservation.plot_section,
        reservation.plot_number
      )) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'This plot has since been marked occupied. Reject this request instead.' });
      }
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    // Conditional update: never overwrite a concurrent cancellation.
    const updated = await client.query(
      'UPDATE reservations SET status = $1, review_note = $2 WHERE id = $3 AND status = $4',
      [status, note || null, reservationId, 'pending']
    );
    if (updated.rowCount === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'The reservation is no longer pending.' });
    }
    const notified = await client.query(
      `SELECT r.visitor_name, u.email, u.name
       FROM reservations r JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
      [reservationId]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    const account = notified.rows[0];
    if (account?.email) {
      const subjectNoun = reservation.plot_section ? 'plot request' : 'reservation';
      const bodySubject = reservation.plot_section ? 'cemetery plot request' : 'reservation';
      notifyAccount(
        account.email,
        action === 'approve' ? `Your ${subjectNoun} was approved` : `Your ${subjectNoun} was not approved`,
        `Hello ${account.name || account.visitor_name},\n\n` +
        (action === 'approve'
          ? `Your ${bodySubject} has been approved by our staff. It is awaiting cash payment: visit the office to pay, and the reservation will be confirmed once the payment is recorded.`
          : `Your ${bodySubject} was reviewed and could not be approved at this time.`) +
        (note ? `\n\nNote from staff: ${note}` : '') +
        '\n\nThank you.'
      );
    }
    return res.json({
      message: action === 'approve'
        ? `${reservation.plot_section ? 'Plot reservation' : 'Reservation'} approved — awaiting cash payment.`
        : `${reservation.plot_section ? 'Plot reservation' : 'Reservation'} rejected.`,
      status,
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Review plot reservation rollback error:', rollbackError);
      });
    }
    console.error('Review plot reservation error:', error);
    return res.status(500).json({ message: 'Unable to review plot reservation.' });
  } finally {
    if (client) client.release();
  }
};

const cancelReservation = async (req, res) => {
  const reservationId = Number(req.params.id);
  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
  }
  const isPrivileged = req.user.role === 'staff' || req.user.role === 'admin';
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query('SELECT * FROM reservations WHERE id = $1 FOR UPDATE', [reservationId]);
    const reservation = result.rows[0];
    if (!reservation) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }
    if (Number(reservation.user_id) !== Number(req.user.id) && !isPrivileged) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(403).json({ message: 'Access denied.' });
    }
    if (!['pending', 'approved'].includes(reservation.status)) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'Only pending or approved reservations can be cancelled.' });
    }
    await client.query("UPDATE reservations SET status = 'cancelled' WHERE id = $1", [reservationId]);
    // Void any awaiting payment claim so it cannot linger in the verify queue
    // or be approved afterward. Completed payments are untouched (no refunds:
    // money already verified stays verified; contact staff about returns).
    const voided = await client.query(
      `UPDATE payments
       SET payment_status = 'rejected',
           admin_note = 'Voided: reservation cancelled before verification.'
       WHERE reservation_id = $1 AND payment_status = 'pending_verification'
       RETURNING id`,
      [reservationId]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({
      message: voided.rows.length > 0
        ? 'Reservation cancelled. The awaiting payment claim was voided; no automatic refund is issued.'
        : 'Reservation cancelled.',
      status: 'cancelled',
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Cancel reservation rollback error:', rollbackError);
      });
    }
    console.error('Cancel reservation error:', error);
    res.status(500).json({ message: 'Unable to cancel reservation.' });
  } finally {
    if (client) client.release();
  }
};

const deleteReservation = async (req, res) => {
  const reservationId = Number(req.params.id);
  if (!Number.isSafeInteger(reservationId) || reservationId < 1) {
    return res.status(400).json({ message: 'A valid reservation ID is required.' });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    transactionStarted = true;

    const result = await client.query('SELECT id, status FROM reservations WHERE id = $1 FOR UPDATE', [reservationId]);
    const reservation = result.rows[0];
    if (!reservation) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Reservation not found.' });
    }

    // A paid/confirmed reservation is financial history: refuse so the
    // recorded payment (and its receipt) can never be silently cascaded away.
    const recordedPayment = await client.query(
      `SELECT id FROM payments WHERE reservation_id = $1 AND payment_status = 'completed' LIMIT 1`,
      [reservationId]
    );
    if (['confirmed', 'completed'].includes(reservation.status) || recordedPayment.rows.length > 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'A confirmed reservation with a recorded payment cannot be deleted.' });
    }

    await client.query('DELETE FROM reservations WHERE id = $1', [reservationId]);
    await client.query('COMMIT');
    transactionStarted = false;
    res.json({ message: 'Reservation deleted.' });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Delete reservation rollback error:', rollbackError);
      });
    }
    console.error('Delete reservation error:', error);
    res.status(500).json({ message: 'Unable to delete reservation.' });
  } finally {
    if (client) client.release();
  }
};

module.exports = { getUserReservations, getPlotReservations, createReservation, reviewPlotReservation, cancelReservation, deleteReservation };
