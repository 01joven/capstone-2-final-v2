const pool = require('../config/db');
const { isBurialPlotOccupied } = require('../services/plotAvailability');

const getPlotReservations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.plot_section, r.plot_number, r.status
       FROM reservations r
       JOIN cemeteries c ON c.id = r.cemetery_id
       WHERE c.name = 'Cogon Cemetery' AND c.barangay = 'Cogon'
         AND c.municipality = 'Cordova' AND c.province = 'Cebu'
         AND r.plot_section IS NOT NULL AND r.status IN ('pending', 'confirmed')
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
    const result = await pool.query(
      `SELECT r.*, m.name as memorial_name, m.image_url as memorial_image,
              c.name AS cemetery_name,
              CASE WHEN r.plot_section IS NOT NULL THEN 'plot' ELSE 'memorial' END AS reservation_type,
              (SELECT p.payment_status
               FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC
               LIMIT 1) AS payment_status
       FROM reservations r
       LEFT JOIN memorials m ON r.memorial_id = m.id
       LEFT JOIN cemeteries c ON r.cemetery_id = c.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get reservations error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const createReservation = async (req, res) => {
  const body = req.body || {};
  const visitorName = typeof body.visitor_name === 'string' ? body.visitor_name.trim() : '';
  const visitorContact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const reservationDate = body.reservation_date;
  const plotSection = typeof body.plot_section === 'string' ? body.plot_section.trim().toUpperCase() : '';
  const plotNumber = Number(body.plot_number);
  const isPlotReservation = Boolean(plotSection || body.plot_number !== undefined);

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
  if (reservationDate < new Date().toISOString().slice(0, 10)) {
    return res.status(400).json({ message: 'Reservation date cannot be in the past.' });
  }

  if (isPlotReservation) {
    if (!/^[A-Z]{1,10}$/.test(plotSection) || !Number.isSafeInteger(plotNumber) || plotNumber < 1 || plotNumber > 10000) {
      return res.status(400).json({ message: 'Choose a valid section and plot.' });
    }

    let client;
    let transactionStarted = false;
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
      const cemeteryId = cemeteryResult.rows[0]?.id;
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
           (user_id, cemetery_id, plot_section, plot_number, visitor_name, contact, reservation_date, total_price, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'pending')
         RETURNING *`,
        [req.user.id, cemeteryId, plotSection, plotNumber, visitorName, visitorContact, reservationDate]
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
      `INSERT INTO reservations (user_id, memorial_id, visitor_name, contact, reservation_date, total_price)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, memorialId, visitorName, visitorContact, reservationDate, totalPrice]
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
    if (!reservationSnapshot.rows[0]?.cemetery_id) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Plot reservation not found.' });
    }
    await client.query('SELECT id FROM cemeteries WHERE id = $1 FOR UPDATE', [reservationSnapshot.rows[0].cemetery_id]);

    const reservationResult = await client.query(
      `SELECT id, cemetery_id, plot_section, plot_number, status
       FROM reservations WHERE id = $1 FOR UPDATE`,
      [reservationId]
    );
    const reservation = reservationResult.rows[0];
    if (!reservation || !reservation.plot_section) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Plot reservation not found.' });
    }
    if (reservation.status !== 'pending') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This plot request has already been reviewed.' });
    }

    if (action === 'approve') {
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

    const status = action === 'approve' ? 'confirmed' : 'rejected';
    await client.query('UPDATE reservations SET status = $1 WHERE id = $2', [status, reservationId]);
    await client.query('COMMIT');
    transactionStarted = false;
    return res.json({
      message: action === 'approve' ? 'Plot reservation approved.' : 'Plot reservation rejected.',
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

module.exports = { getUserReservations, getPlotReservations, createReservation, reviewPlotReservation };
