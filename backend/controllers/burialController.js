const pool = require('../config/db');
const { PLOT_REFERENCE_SQL } = require('../services/plotAvailability');

const MAX_QUERY_LENGTH = 100;

// Location comes only from an explicit grave reference. Records without one report no location.
const getPlotLocation = (record) => {
  const graveReference = record.grave_reference?.trim();
  const parsed = graveReference?.match(/^([A-Za-z]{1,10})-?(\d{1,5})$/);
  const lotNumber = parsed ? Number(parsed[2]) : 0;

  if (parsed && lotNumber > 0) {
    return {
      section: parsed[1].toUpperCase(),
      lot_number: lotNumber,
      plot_reference: graveReference.toUpperCase(),
    };
  }

  return {
    section: null,
    lot_number: null,
    plot_reference: graveReference || null,
  };
};

const getBurialRecords = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const cemetery = typeof req.query.cemetery === 'string' ? req.query.cemetery.trim() : '';
    const section = typeof req.query.section === 'string' ? req.query.section.trim().toUpperCase() : '';
    if (search.length > MAX_QUERY_LENGTH || cemetery.length > MAX_QUERY_LENGTH) {
      return res.status(400).json({ message: `Search terms must be ${MAX_QUERY_LENGTH} characters or fewer.` });
    }
    const values = [];
    const filters = [];

    if (search) {
      if (search.length < 2) {
        return res.status(400).json({ message: 'Enter at least 2 characters to search.' });
      }
      const sectionMatch = search.match(/^(?:section\s*)?([a-z]{1,10})$/i);
      const recordIdMatch = search.match(/^(?:MR-)?0*(\d{1,9})$/i);
      values.push(`%${search}%`);
      const searchFilter = [
        `b.full_name ILIKE $${values.length}`,
        `COALESCE(b.grave_reference, '') ILIKE $${values.length}`,
        `COALESCE(b.death_date::text, '') ILIKE $${values.length}`,
        `('MR-' || LPAD(b.id::text, 4, '0')) ILIKE $${values.length}`,
      ];

      if (sectionMatch) {
        values.push(sectionMatch[1].toUpperCase());
        searchFilter.push(
          `(b.grave_reference ~ '${PLOT_REFERENCE_SQL}'
            AND UPPER(REGEXP_REPLACE(b.grave_reference, '-?[0-9]+$', '')) = $${values.length})`
        );
      }

      if (recordIdMatch) {
        values.push(Number(recordIdMatch[1]));
        searchFilter.push(`b.id = $${values.length}`);
      }

      filters.push(`(${searchFilter.join(' OR ')})`);
    }
    if (cemetery) {
      values.push(`%${cemetery}%`);
      filters.push(`c.name ILIKE $${values.length}`);
    }
    if (section) {
      if (!/^[A-Z]{1,10}$/.test(section)) {
        return res.status(400).json({ message: 'Section must contain 1 to 10 letters only.' });
      }
      values.push(section);
      filters.push(
        `(b.grave_reference ~ '${PLOT_REFERENCE_SQL}'
          AND UPPER(REGEXP_REPLACE(b.grave_reference, '-?[0-9]+$', '')) = $${values.length})`
      );
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    // birth_date is not returned: it is personal data that the search does not need.
    const result = await pool.query(
      `SELECT b.id, b.full_name, b.grave_reference, b.death_date, b.epitaph,
              c.name AS cemetery_name, c.barangay, c.municipality, c.province
       FROM burial_records b
       JOIN cemeteries c ON c.id = b.cemetery_id
       ${whereClause}
       ORDER BY b.full_name ASC
       LIMIT 50`,
      values
    );

    res.json(result.rows.map((record) => ({ ...record, ...getPlotLocation(record) })));
  } catch (error) {
    console.error('Get burial records error:', error);
    res.status(500).json({ message: 'Unable to search burial records.' });
  }
};

module.exports = { getBurialRecords };
