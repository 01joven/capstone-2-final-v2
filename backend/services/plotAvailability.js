const parsePlotReference = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([A-Za-z]{1,10})-?(\d+)$/);
  if (!match) return null;
  const lotNumber = Number(match[2]);
  if (!Number.isSafeInteger(lotNumber) || lotNumber < 1 || lotNumber > 10000) return null;
  return { section: match[1].toUpperCase(), lotNumber };
};

const isBurialPlotOccupied = async (queryable, cemeteryId, section, lotNumber, excludeRecordId = null) => {
  const result = await queryable.query(
    `SELECT id FROM burial_records
     WHERE cemetery_id = $1
       AND id IS DISTINCT FROM $4
       AND CASE
             WHEN grave_reference ~ '^[A-Za-z]+-?[0-9]+$'
               THEN UPPER(REGEXP_REPLACE(grave_reference, '-?[0-9]+$', ''))
             WHEN COALESCE(grave_reference, '') = ''
               THEN CHR(65 + ((id - 1) % 4))
             ELSE NULL
           END = $2
       AND CASE
             WHEN grave_reference ~ '^[A-Za-z]+-?[0-9]+$'
               THEN CAST(REGEXP_REPLACE(grave_reference, '^[A-Za-z]+-?', '') AS INTEGER)
             WHEN COALESCE(grave_reference, '') = ''
               THEN FLOOR((id - 1) / 4) + 1
             ELSE NULL
           END = $3
     LIMIT 1`,
    [cemeteryId, section, lotNumber, excludeRecordId]
  );
  return result.rows.length > 0;
};

const getActivePlotReservation = async (queryable, cemeteryId, section, lotNumber) => {
  const result = await queryable.query(
    `SELECT id, status FROM reservations
     WHERE cemetery_id = $1 AND UPPER(plot_section) = $2 AND plot_number = $3
       AND status IN ('pending', 'confirmed')
     LIMIT 1`,
    [cemeteryId, section, lotNumber]
  );
  return result.rows[0] || null;
};

module.exports = { parsePlotReference, isBurialPlotOccupied, getActivePlotReservation };
