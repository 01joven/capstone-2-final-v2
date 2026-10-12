const pool = require('../config/db');

const getPlotLocation = (record) => {
  const graveReference = record.grave_reference?.trim();
  const parsedReference = graveReference?.match(/^([A-Za-z]+)-?(\d+)$/);
  const parsedLotNumber = parsedReference ? Number(parsedReference[2]) : 0;

  if (parsedReference && parsedLotNumber > 0) {
    return {
      section: parsedReference[1].toUpperCase(),
      lot_number: parsedLotNumber,
      plot_reference: graveReference.toUpperCase(),
      location_is_demo: false,
    };
  }

  if (graveReference) {
    return {
      section: null,
      lot_number: null,
      plot_reference: graveReference,
      location_is_demo: false,
    };
  }

  const recordId = Number(record.id);
  const section = String.fromCharCode(65 + ((recordId - 1) % 4));
  const lotNumber = Math.floor((recordId - 1) / 4) + 1;

  return {
    section,
    lot_number: lotNumber,
    plot_reference: `${section}-${String(lotNumber).padStart(2, '0')}`,
    location_is_demo: true,
  };
};

const getBurialRecords = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const cemetery = typeof req.query.cemetery === 'string' ? req.query.cemetery.trim() : '';
    const section = typeof req.query.section === 'string' ? req.query.section.trim().toUpperCase() : '';
    const values = [];
    const filters = [];

    if (search) {
      const sectionMatch = search.match(/^(?:section\s*)?([a-z]+)$/i);
      const recordIdMatch = search.match(/^(?:MR-)?0*(\d+)$/i);
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
          `CASE
             WHEN b.grave_reference ~ '^[A-Za-z]+-?[0-9]+$'
               THEN UPPER(REGEXP_REPLACE(b.grave_reference, '-?[0-9]+$', ''))
             WHEN COALESCE(b.grave_reference, '') = ''
               THEN CHR(65 + ((b.id - 1) % 4))
             ELSE NULL
           END = $${values.length}`
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
      if (!/^[A-Z]+$/.test(section)) {
        return res.status(400).json({ message: 'Section must contain letters only.' });
      }

      values.push(section);
      filters.push(
        `CASE
           WHEN b.grave_reference ~ '^[A-Za-z]+-?[0-9]+$'
             THEN UPPER(REGEXP_REPLACE(b.grave_reference, '-?[0-9]+$', ''))
           WHEN COALESCE(b.grave_reference, '') = ''
             THEN CHR(65 + ((b.id - 1) % 4))
           ELSE NULL
         END = $${values.length}`
      );
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT b.id, b.full_name, b.grave_reference, b.birth_date, b.death_date, b.is_demo,
              c.name AS cemetery_name, c.barangay, c.municipality, c.province
       FROM burial_records b
       JOIN cemeteries c ON c.id = b.cemetery_id
       ${whereClause}
       ORDER BY b.full_name ASC
       LIMIT 200`,
      values
    );

    res.json(result.rows.map((record) => ({ ...record, ...getPlotLocation(record) })));
  } catch (error) {
    console.error('Get burial records error:', error);
    res.status(500).json({ message: 'Unable to search burial records.' });
  }
};

module.exports = { getBurialRecords };
