// Only explicit grave references (e.g. "A-12") define a plot. Records without one have no known plot
// and never block a reservation. The regex bounds the lot number so the integer cast cannot overflow.
const PLOT_REFERENCE_SQL = "^[A-Za-z]{1,10}-?[0-9]{1,5}$";

const parsePlotReference = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^([A-Za-z]{1,10})-?(\d{1,5})$/);
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
       AND grave_reference ~ $5
       AND UPPER(REGEXP_REPLACE(grave_reference, '-?[0-9]+$', '')) = $2
       AND CAST(REGEXP_REPLACE(grave_reference, '^[A-Za-z]+-?', '') AS INTEGER) = $3
     LIMIT 1`,
    [cemeteryId, section, lotNumber, excludeRecordId, PLOT_REFERENCE_SQL]
  );
  return result.rows.length > 0;
};

const getActivePlotReservation = async (queryable, cemeteryId, section, lotNumber) => {
  // 'approved' (reviewed, awaiting cash) still holds the plot until the cash
  // payment confirms the reservation.
  const result = await queryable.query(
    `SELECT id, status FROM reservations
     WHERE cemetery_id = $1 AND UPPER(plot_section) = $2 AND plot_number = $3
       AND status IN ('pending', 'approved', 'confirmed')
     LIMIT 1`,
    [cemeteryId, section, lotNumber]
  );
  return result.rows[0] || null;
};

module.exports = { PLOT_REFERENCE_SQL, parsePlotReference, isBurialPlotOccupied, getActivePlotReservation };
