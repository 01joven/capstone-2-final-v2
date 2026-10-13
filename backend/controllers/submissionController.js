const pool = require('../config/db');
const { parsePlotReference, isBurialPlotOccupied, getActivePlotReservation } = require('../services/plotAvailability');
const { sendEmail } = require('../services/emailService');

// Best-effort notification: never fails the submission action.
const notifySubmitter = (to, name, approved, note) => {
  if (!to || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return;
  const text = `Hello ${name || 'valued customer'},\n\n` +
    (approved
      ? 'Your memorial information submission has been approved and published as a memorial record. Thank you.'
      : 'Your memorial information submission was reviewed and could not be published at this time.') +
    (note ? `\n\nNote from staff: ${note}` : '') +
    '\n\nThank you.';
  sendEmail({
    to,
    subject: approved ? 'Memorial submission approved' : 'Memorial submission update',
    text,
    html: `<p>${text.replace(/\n/g, '<br />')}</p>`,
  }).catch((emailError) => console.error('Submission notification error:', emailError.message));
};

const validateSubmission = (body = {}) => {
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const graveReference = typeof body.grave_reference === 'string' ? body.grave_reference.trim() : '';
  const birthDate = body.birth_date || null;
  const deathDate = body.death_date || null;
  const epitaph = typeof body.epitaph === 'string' && body.epitaph.trim()
    ? body.epitaph.trim().slice(0, 500)
    : null;

  if (!fullName || fullName.length > 200) {
    return { error: 'Full name must contain 1 to 200 characters.' };
  }
  if (graveReference.length > 100) {
    return { error: 'Grave reference must be 100 characters or fewer.' };
  }
  const looksLikePlot = graveReference.match(/^([A-Za-z]{1,10})-?(\d+)$/);
  if (looksLikePlot && (looksLikePlot[2].length > 5 || Number(looksLikePlot[2]) > 10000)) {
    return { error: 'Plot numbers must be between 1 and 10000.' };
  }
  for (const [label, value] of [['Birth date', birthDate], ['Death date', deathDate]]) {
    if (value !== null && (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()) ||
      new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value
    )) {
      return { error: `${label} must be a valid date.` };
    }
  }
  if (typeof body.epitaph === 'string' && body.epitaph.trim().length > 500) {
    return { error: 'Epitaph must be 500 characters or fewer.' };
  }
  return { values: { fullName, graveReference: graveReference || null, birthDate, deathDate, epitaph } };
};

const COGON_WHERE = `name = 'Cogon Cemetery' AND barangay = 'Cogon'
  AND municipality = 'Cordova' AND province = 'Cebu'`;

// pg returns DATE columns as JS Dates; normalize to YYYY-MM-DD for re-insert.
const toDateOnly = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
};

const createSubmission = async (req, res) => {
  const validated = validateSubmission(req.body);
  if (validated.error) {
    return res.status(400).json({ message: validated.error });
  }
  try {
    const v = validated.values;
    const result = await pool.query(
      `INSERT INTO burial_submissions (user_id, full_name, grave_reference, birth_date, death_date, epitaph)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.user.id, v.fullName, v.graveReference, v.birthDate, v.deathDate, v.epitaph]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ message: 'Unable to submit memorial information.' });
  }
};

const getMySubmissions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM burial_submissions WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get my submissions error:', error);
    res.status(500).json({ message: 'Unable to load your submissions.' });
  }
};

const getAllSubmissions = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*, u.name AS submitter_name, u.email AS submitter_email
       FROM burial_submissions s
       JOIN users u ON u.id = s.user_id
       ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END, s.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get all submissions error:', error);
    res.status(500).json({ message: 'Unable to load submissions.' });
  }
};

const reviewSubmission = async (req, res) => {
  const submissionId = Number(req.params.id);
  const action = (req.body || {}).action;
  const note = typeof (req.body || {}).note === 'string' ? req.body.note.trim().slice(0, 500) : null;
  if (!Number.isSafeInteger(submissionId) || submissionId < 1) {
    return res.status(400).json({ message: 'A valid submission ID is required.' });
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

    const submissionResult = await client.query(
      `SELECT s.*, u.email AS submitter_email, u.name AS submitter_name
       FROM burial_submissions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id = $1 FOR UPDATE OF s`,
      [submissionId]
    );
    const submission = submissionResult.rows[0];
    if (!submission) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Submission not found.' });
    }
    if (submission.status !== 'pending') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(409).json({ message: 'This submission has already been reviewed.' });
    }

    let recordId = null;
    if (action === 'approve') {
      const cemeteryResult = await client.query(
        `SELECT id FROM cemeteries WHERE ${COGON_WHERE} FOR UPDATE`
      );
      const cemeteryId = cemeteryResult.rows[0]?.id;
      if (!cemeteryId) {
        await client.query('ROLLBACK');
        transactionStarted = false;
        return res.status(409).json({ message: 'Cogon Cemetery is not configured in the database.' });
      }

      const plot = parsePlotReference(submission.grave_reference);
      if (plot) {
        if (await isBurialPlotOccupied(client, cemeteryId, plot.section, plot.lotNumber)) {
          await client.query('ROLLBACK');
          transactionStarted = false;
          return res.status(409).json({ message: 'That plot is already occupied by another memorial record.' });
        }
        const reservation = await getActivePlotReservation(client, cemeteryId, plot.section, plot.lotNumber);
        if (reservation?.status === 'pending') {
          await client.query('ROLLBACK');
          transactionStarted = false;
          return res.status(409).json({ message: 'That plot has a pending reservation request. Review the request before publishing.' });
        }
      }

      try {
        const recordResult = await client.query(
          `INSERT INTO burial_records (cemetery_id, full_name, grave_reference, birth_date, death_date, epitaph)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [cemeteryId, submission.full_name, submission.grave_reference,
            toDateOnly(submission.birth_date), toDateOnly(submission.death_date),
            submission.epitaph]
        );
        recordId = recordResult.rows[0].id;
      } catch (error) {
        if (error.code === '23505') {
          await client.query('ROLLBACK');
          transactionStarted = false;
          return res.status(409).json({ message: 'A record with this name already exists for Cogon Cemetery.' });
        }
        throw error;
      }
      if (plot) {
        await client.query(
          `UPDATE reservations SET status = 'completed'
           WHERE cemetery_id = $1 AND UPPER(plot_section) = $2 AND plot_number = $3 AND status = 'confirmed'`,
          [cemeteryId, plot.section, plot.lotNumber]
        );
      }
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    await client.query(
      `UPDATE burial_submissions
       SET status = $1, review_note = $2, reviewed_by = $3, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [status, note || null, req.user.id, submissionId]
    );
    await client.query('COMMIT');
    transactionStarted = false;

    if (submission.submitter_email) {
      notifySubmitter(submission.submitter_email, submission.submitter_name, action === 'approve', note);
    }
    res.json({
      message: action === 'approve'
        ? 'Submission approved and published as a memorial record.'
        : 'Submission rejected. The customer can submit corrected information.',
      status,
      ...(recordId ? { record_id: recordId } : {}),
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('Review submission rollback error:', rollbackError);
      });
    }
    console.error('Review submission error:', error);
    return res.status(500).json({ message: 'Unable to review submission.' });
  } finally {
    if (client) client.release();
  }
};

module.exports = { createSubmission, getMySubmissions, getAllSubmissions, reviewSubmission };
