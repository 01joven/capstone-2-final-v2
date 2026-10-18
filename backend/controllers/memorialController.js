const pool = require('../config/db');
const { escapeLikePattern } = require('../services/searchQuery');

const getAllMemorials = async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM memorials WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (search) {
      // Escape LIKE wildcards so searching for "50%" does not match everything
      // (mirrors the escaping the burial search already applies).
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      values.push(`%${escapeLikePattern(search)}%`);
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

const validateSite = (body = {}) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const category = typeof body.category === 'string' && body.category.trim()
    ? body.category.trim().slice(0, 100)
    : null;
  const imageUrl = typeof body.image_url === 'string' && body.image_url.trim()
    ? body.image_url.trim().slice(0, 500)
    : null;
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const price = body.price === undefined || body.price === null || body.price === ''
    ? 0
    : Number(body.price);

  if (!name || name.length > 200) {
    return { error: 'Site name must contain 1 to 200 characters.' };
  }
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: 'Enter valid coordinates (latitude -90 to 90, longitude -180 to 180).' };
  }
  if (!Number.isFinite(price) || price < 0 || price > 1000000000) {
    return { error: 'Enter a valid price of zero or more.' };
  }
  return { values: { name, description, category, imageUrl, latitude, longitude, price } };
};

const createSite = async (req, res) => {
  const validated = validateSite(req.body);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }
  try {
    const v = validated.values;
    const result = await pool.query(
      `INSERT INTO memorials (name, description, latitude, longitude, category, image_url, price)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [v.name, v.description, v.latitude, v.longitude, v.category, v.imageUrl, v.price]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create memorial site error:', error);
    res.status(500).json({ message: 'Unable to create memorial site.' });
  }
};

const updateSite = async (req, res) => {
  const siteId = Number(req.params.id);
  if (!Number.isSafeInteger(siteId) || siteId < 1) {
    return res.status(400).json({ message: 'A valid memorial ID is required.' });
  }
  const validated = validateSite(req.body);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }
  try {
    const v = validated.values;
    const result = await pool.query(
      `UPDATE memorials
       SET name = $1, description = $2, latitude = $3, longitude = $4,
           category = $5, image_url = $6, price = $7
       WHERE id = $8
       RETURNING *`,
      [v.name, v.description, v.latitude, v.longitude, v.category, v.imageUrl, v.price, siteId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Memorial site not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update memorial site error:', error);
    res.status(500).json({ message: 'Unable to update memorial site.' });
  }
};

module.exports = { getAllMemorials, getMemorialById, createSite, updateSite };
