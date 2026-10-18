// Integration tests for the customer workflow contract:
//   - memorial records are created only by approving a submission;
//   - a plot reservation becomes 'confirmed' only by recording cash;
//   - an approved (awaiting cash) reservation still holds its plot.
// Runs against an isolated in-memory embedded database (':memory:' via
// PGLITE_DATA_DIR): no network connection and no writes to on-disk dev data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:password@host/database';
process.env.PGLITE_DATA_DIR = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const reservationController = require('../controllers/reservationController');
const paymentController = require('../controllers/paymentController');
const submissionController = require('../controllers/submissionController');
const adminController = require('../controllers/adminController');
const adminRouter = require('../routes/admin');
const staffRouter = require('../routes/staff');

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.payload = body;
    return this;
  },
});

const insertUser = async (name, email) => {
  const result = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, 'test-hash', 'staff') RETURNING id`,
    [name, email]
  );
  return result.rows[0].id;
};

const insertPlotReservation = async (userId, plotNumber, status, section = 'W') => {
  const result = await db.query(
    `INSERT INTO reservations
       (user_id, cemetery_id, plot_section, plot_number, visitor_name, contact, reservation_date, status, total_price)
     VALUES ($1, $2, $3, $4, 'Test Visitor', '09170000000', CURRENT_DATE, $5, 500)
     RETURNING id`,
    [userId, cemeteryId, section, plotNumber, status]
  );
  return result.rows[0].id;
};

const insertSubmission = async (userId, fullName, graveReference) => {
  const result = await db.query(
    `INSERT INTO burial_submissions (user_id, full_name, grave_reference)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, fullName, graveReference]
  );
  return result.rows[0].id;
};

const reservationStatus = async (reservationId) => {
  const result = await db.query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
  return result.rows[0]?.status ?? null;
};

const recordCountForName = async (fullName) => {
  const result = await db.query('SELECT id FROM burial_records WHERE full_name = $1', [fullName]);
  return result.rows.length;
};

const reviewReservation = async (reservationId, staffId) => {
  const res = createResponse();
  await reservationController.reviewPlotReservation(
    { user: { id: staffId, role: 'staff' }, params: { id: String(reservationId) }, body: { action: 'approve' } },
    res
  );
  return res;
};

const recordCash = async (reservationId, staffId, amount = 500) => {
  const res = createResponse();
  await paymentController.recordCashPayment(
    { user: { id: staffId, role: 'staff' }, body: { reservation_id: reservationId, amount } },
    res
  );
  return res;
};

const reviewSubmission = async (submissionId, staffId) => {
  const res = createResponse();
  await submissionController.reviewSubmission(
    { user: { id: staffId, role: 'staff' }, params: { id: String(submissionId) }, body: { action: 'approve' } },
    res
  );
  return res;
};

const routeMethods = (router, routePath) => router.stack
  .filter((layer) => layer.route && layer.route.path === routePath)
  .flatMap((layer) => Object.keys(layer.route.methods));

let cemeteryId;
let customerId; // owns every reservation and submission created here
let staffId; // reviews submissions and records cash

test.before(async () => {
  assert.equal(db.isLocal, true, 'workflow tests must run against the embedded database');
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  const cemetery = await db.query(
    `SELECT id FROM cemeteries
     WHERE name = 'Cogon Cemetery' AND barangay = 'Cogon'
       AND municipality = 'Cordova' AND province = 'Cebu'`
  );
  cemeteryId = cemetery.rows[0].id;
  customerId = await insertUser('Workflow Customer', 'customer@test.local');
  staffId = await insertUser('Workflow Staff', 'staff@test.local');
});

test.after(async () => {
  await db.end();
});

test("approving a plot request yields 'approved' (awaiting cash), never 'confirmed'", async () => {
  const reservationId = await insertPlotReservation(customerId, 101, 'pending');

  const res = await reviewReservation(reservationId, staffId);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.status, 'approved');
  assert.match(res.payload.message, /awaiting cash/i);
  assert.equal(await reservationStatus(reservationId), 'approved');
});

test("recording cash for an 'approved' reservation confirms it and issues exactly one receipt", async () => {
  const reservationId = await insertPlotReservation(customerId, 102, 'approved');

  const res = await recordCash(reservationId, staffId);

  assert.equal(res.statusCode, 201);
  assert.ok(res.payload.receipt_no, 'recording cash must issue a receipt');
  assert.equal(await reservationStatus(reservationId), 'confirmed');
  const receipts = await db.query('SELECT id FROM receipts WHERE payment_id = $1', [res.payload.payment.id]);
  assert.equal(receipts.rows.length, 1);
});

test("recording cash for a 'confirmed' reservation is refused with 409 and never double-pays", async () => {
  const reservationId = await insertPlotReservation(customerId, 103, 'pending');
  const first = await recordCash(reservationId, staffId);
  assert.equal(first.statusCode, 201);
  assert.equal(await reservationStatus(reservationId), 'confirmed');

  const second = await recordCash(reservationId, staffId);

  assert.equal(second.statusCode, 409);
  assert.match(second.payload.message, /already been confirmed/i);
  const payments = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [reservationId]);
  assert.equal(payments.rows.length, 1, 'a refused re-payment must not create a second payment');
  const receipts = await db.query(
    `SELECT rc.id FROM receipts rc
     JOIN payments p ON p.id = rc.payment_id
     WHERE p.reservation_id = $1`,
    [reservationId]
  );
  assert.equal(receipts.rows.length, 1, 'a refused re-payment must not issue a second receipt');
});

test("recording cash for a 'rejected' reservation is refused and writes nothing", async () => {
  const reservationId = await insertPlotReservation(customerId, 104, 'rejected');

  const res = await recordCash(reservationId, staffId);

  assert.equal(res.statusCode, 409);
  const payments = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [reservationId]);
  assert.equal(payments.rows.length, 0);
  assert.equal(await reservationStatus(reservationId), 'rejected');
});

test("a submission for a plot with a 'pending' reservation is refused with 409 and creates no record", async () => {
  const reservationId = await insertPlotReservation(customerId, 201, 'pending', 'S');
  const submissionId = await insertSubmission(customerId, 'Pending Plot Person', 'S-201');

  const res = await reviewSubmission(submissionId, staffId);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.message, /pending reservation/i);
  assert.equal(await recordCountForName('Pending Plot Person'), 0);
  const submission = await db.query('SELECT status FROM burial_submissions WHERE id = $1', [submissionId]);
  assert.equal(submission.rows[0].status, 'pending');
  assert.equal(await reservationStatus(reservationId), 'pending');
});

test("a submission for a plot with an 'approved' (awaiting cash) reservation is refused with 409", async () => {
  const reservationId = await insertPlotReservation(customerId, 202, 'approved', 'S');
  const submissionId = await insertSubmission(customerId, 'Awaiting Cash Person', 'S-202');

  const res = await reviewSubmission(submissionId, staffId);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.message, /awaiting cash payment/i);
  assert.equal(await recordCountForName('Awaiting Cash Person'), 0);
  assert.equal(await reservationStatus(reservationId), 'approved');
});

test("a submission for a plot with a 'confirmed' reservation publishes the record and completes the reservation", async () => {
  const reservationId = await insertPlotReservation(customerId, 203, 'pending', 'S');
  const cash = await recordCash(reservationId, staffId);
  assert.equal(cash.statusCode, 201);
  assert.equal(await reservationStatus(reservationId), 'confirmed');
  const submissionId = await insertSubmission(customerId, 'Confirmed Plot Person', 'S-203');

  const res = await reviewSubmission(submissionId, staffId);

  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.record_id, 'publishing must return the created record id');
  assert.equal(await recordCountForName('Confirmed Plot Person'), 1);
  assert.equal(await reservationStatus(reservationId), 'completed');
});

test('a submission with no plot reference still publishes', async () => {
  const submissionId = await insertSubmission(customerId, 'No Plot Person', null);

  const res = await reviewSubmission(submissionId, staffId);

  assert.equal(res.statusCode, 200);
  assert.equal(await recordCountForName('No Plot Person'), 1);
});

test('the public held-plots list includes approved (awaiting cash) reservations', async () => {
  await insertPlotReservation(customerId, 501, 'approved', 'H');

  const res = createResponse();
  await reservationController.getPlotReservations({}, res);

  assert.equal(res.statusCode, 200);
  assert.ok(
    res.payload.some((row) => row.plot_section === 'H' && row.plot_number === 501 && row.status === 'approved'),
    'an awaiting-cash plot must appear as held so it cannot be double-booked'
  );
});

test("cancelling an 'approved' reservation succeeds; cancelling a 'confirmed' one is refused", async () => {
  const approvedId = await insertPlotReservation(customerId, 301, 'approved', 'C');
  const approvedCancel = createResponse();
  await reservationController.cancelReservation(
    { user: { id: customerId, role: 'user' }, params: { id: String(approvedId) } },
    approvedCancel
  );
  assert.equal(approvedCancel.statusCode, 200);
  assert.equal(approvedCancel.payload.status, 'cancelled');
  assert.equal(await reservationStatus(approvedId), 'cancelled');

  const confirmedId = await insertPlotReservation(customerId, 302, 'pending', 'C');
  const cash = await recordCash(confirmedId, staffId);
  assert.equal(cash.statusCode, 201);

  const confirmedCancel = createResponse();
  await reservationController.cancelReservation(
    { user: { id: customerId, role: 'user' }, params: { id: String(confirmedId) } },
    confirmedCancel
  );
  assert.equal(confirmedCancel.statusCode, 409);
  assert.equal(await reservationStatus(confirmedId), 'confirmed');
});

test('editing a record onto a plot without a paid reservation is refused', async () => {
  const submissionId = await insertSubmission(customerId, 'Edit Gate Person', null);
  const approved = await reviewSubmission(submissionId, staffId);
  assert.equal(approved.statusCode, 200);
  const recordRows = await db.query('SELECT id, grave_reference FROM burial_records WHERE full_name = $1', ['Edit Gate Person']);
  assert.equal(recordRows.rows.length, 1);
  const recordId = recordRows.rows[0].id;

  const res = createResponse();
  await adminController.updateRecord(
    {
      user: { id: staffId, role: 'staff' },
      params: { id: String(recordId) },
      body: {
        full_name: 'Edit Gate Person',
        grave_reference: 'E-601',
        birth_date: null,
        death_date: null,
        epitaph: null,
        verified_authorized: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.message, /no confirmed \(paid\) reservation/i);
  const after = await db.query('SELECT grave_reference FROM burial_records WHERE id = $1', [recordId]);
  assert.equal(after.rows[0].grave_reference, recordRows.rows[0].grave_reference);
});

test('editing a record onto a plot with a confirmed reservation succeeds and completes it', async () => {
  const reservationId = await insertPlotReservation(customerId, 602, 'pending', 'E');
  const cash = await recordCash(reservationId, staffId);
  assert.equal(cash.statusCode, 201);

  const submissionId = await insertSubmission(customerId, 'Edit Paid Person', null);
  const approved = await reviewSubmission(submissionId, staffId);
  assert.equal(approved.statusCode, 200);
  const recordRows = await db.query('SELECT id FROM burial_records WHERE full_name = $1', ['Edit Paid Person']);
  const recordId = recordRows.rows[0].id;

  const res = createResponse();
  await adminController.updateRecord(
    {
      user: { id: staffId, role: 'staff' },
      params: { id: String(recordId) },
      body: {
        full_name: 'Edit Paid Person',
        grave_reference: 'E-602',
        birth_date: null,
        death_date: null,
        epitaph: null,
        verified_authorized: true,
      },
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.grave_reference, 'E-602');
  assert.equal(await reservationStatus(reservationId), 'completed');
});

test('the direct record-creation endpoints and controller function were removed', () => {
  assert.equal(adminController.createRecord, undefined, 'adminController must not export createRecord');
  for (const router of [adminRouter, staffRouter]) {
    const methods = routeMethods(router, '/records');
    assert.ok(!methods.includes('post'), 'POST /records must no longer be registered');
    assert.ok(methods.includes('get'), 'GET /records must stay');
    assert.ok(routeMethods(router, '/records/:id').includes('put'), 'PUT /records/:id must stay');
    assert.ok(routeMethods(router, '/records/:id').includes('delete'), 'DELETE /records/:id must stay');
  }
});

test('a memorial-site reservation can be reviewed, paid, and confirmed', async () => {
  const memorial = await db.query(
    `INSERT INTO memorials (name, description, latitude, longitude, category, image_url, price)
     VALUES ('Workflow Memorial Site', 'Review test site.', 10.2601, 123.9511, 'Cemetery', '/cemetery-images/heritage-memorial.png', 500)
     RETURNING id`
  );
  const inserted = await db.query(
    `INSERT INTO reservations (user_id, memorial_id, deceased_name, visitor_name, contact, reservation_date, status, total_price)
     VALUES ($1, $2, 'Memorial Person', 'Test Visitor', '09170000000', CURRENT_DATE, 'pending', 500)
     RETURNING id`,
    [customerId, memorial.rows[0].id]
  );
  const reservationId = inserted.rows[0].id;

  // Memorial-site (non-plot) reservations must be reviewable too: the old
  // endpoint 404'd for anything without a cemetery/plot, leaving the
  // "awaiting review" label with no action behind it.
  const approved = await reviewReservation(reservationId, staffId);
  assert.equal(approved.statusCode, 200);
  assert.match(approved.payload.message, /awaiting cash/i);
  assert.equal(await reservationStatus(reservationId), 'approved');

  const cash = await recordCash(reservationId, staffId);
  assert.equal(cash.statusCode, 201);
  assert.equal(await reservationStatus(reservationId), 'confirmed');
});

test('the active-plot unique guard covers approved after a schema re-apply', async () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  const index = await db.query(
    "SELECT indexdef FROM pg_indexes WHERE indexname = 'reservations_active_plot_unique'"
  );
  assert.equal(index.rows.length, 1, 'the active-plot guard index must survive a restart');
  assert.match(index.rows[0].indexdef, /'approved'/, 'the recreated index must cover approved');

  const approvedId = await insertPlotReservation(customerId, 401, 'approved', 'X');
  await assert.rejects(
    () => insertPlotReservation(customerId, 401, 'pending', 'X'),
    (error) => error.code === '23505',
    'an approved reservation must keep the plot unique against another active request'
  );
  // Terminal statuses do not hold the plot.
  await insertPlotReservation(customerId, 401, 'rejected', 'X');
  assert.equal(await reservationStatus(approvedId), 'approved');
});
