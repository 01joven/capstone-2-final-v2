const pool = require('../config/db');

const getUserReservations = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, m.name as memorial_name, m.image_url as memorial_image,
              (SELECT p.payment_status
               FROM payments p
               WHERE p.reservation_id = r.id
               ORDER BY p.transaction_date DESC, p.id DESC
               LIMIT 1) AS payment_status
       FROM reservations r
       JOIN memorials m ON r.memorial_id = m.id
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
  try {
    const { memorial_id, visitor_name, contact, reservation_date } = req.body || {};
    const memorialId = Number(memorial_id);
    const visitorName = typeof visitor_name === 'string' ? visitor_name.trim() : '';
    const visitorContact = typeof contact === 'string' ? contact.trim() : '';

    if (!Number.isSafeInteger(memorialId) || memorialId < 1 || !visitorName || !visitorContact || !reservation_date) {
      return res.status(400).json({ message: 'All fields are required.' });
    }
    if (visitorName.length > 100 || visitorContact.length > 100) {
      return res.status(400).json({ message: 'Name and contact must be 100 characters or fewer.' });
    }

    const dateValue = new Date(`${reservation_date}T00:00:00.000Z`);
    if (typeof reservation_date !== 'string' ||
        Number.isNaN(dateValue.getTime()) ||
        dateValue.toISOString().slice(0, 10) !== reservation_date) {
      return res.status(400).json({ message: 'Enter a valid reservation date.' });
    }
    const today = new Date().toISOString().slice(0, 10);
    if (reservation_date < today) {
      return res.status(400).json({ message: 'Reservation date cannot be in the past.' });
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
      [req.user.id, memorialId, visitorName, visitorContact, reservation_date, totalPrice]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create reservation error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getUserReservations, createReservation };
