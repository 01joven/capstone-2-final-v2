const pool = require('../config/db');

const getAllMemorials = async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM memorials WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      values.push(`%${search}%`);
      paramCount++;
    }

    if (category) {
      query += ` AND category = $${paramCount}`;
      values.push(category);
      paramCount++;
    }

    query += ' ORDER BY name ASC';

    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Get memorials error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

const getMemorialById = async (req, res) => {
  try {
    const memorialId = Number(req.params.id);
    if (!Number.isSafeInteger(memorialId) || memorialId < 1) {
      return res.status(400).json({ message: 'A valid memorial ID is required.' });
    }

    const result = await pool.query('SELECT * FROM memorials WHERE id = $1', [memorialId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Memorial not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get memorial error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { getAllMemorials, getMemorialById };
