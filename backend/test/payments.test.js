// Integration tests for payment authorization and cash-recording integrity.
// These run against an isolated in-memory embedded database (":memory:" via
// PGLITE_DATA_DIR): no network connection and no writes to the on-disk dev data.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:password@host/database';
process.env.PGLITE_DATA_DIR = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const paymentController = require('../controllers/paymentController');

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

const insertReservation = async (userId, cemeteryId, plotNumber, status) => {
  const result = await db.query(
    `INSERT INTO reservations (user_id, cemetery_id, plot_section, plot_number, visitor_name, contact, reservation_date, status, total_price)
     VALUES ($1, $2, 'A', $3, 'Test Visitor', '09170000000', CURRENT_DATE, $4, 500) RETURNING id`,
    [userId, cemeteryId, plotNumber, status]
  );
  return result.rows[0].id;
};

const insertPayment = async (reservationId, status, reference) => {
  const result = await db.query(
    `INSERT INTO payments (reservation_id, amount, payment_method, payment_status, payment_reference)
     VALUES ($1, 500, 'Cash', $2, $3) RETURNING id`,
    [reservationId, status, reference]
  );
  return result.rows[0].id;
};

const paymentStatus = async (paymentId) => {
  const result = await db.query('SELECT payment_status FROM payments WHERE id = $1', [paymentId]);
  return result.rows[0] ? result.rows[0].payment_status : null;
};

const receiptCount = async (paymentId) => {
  const result = await db.query('SELECT id FROM receipts WHERE payment_id = $1', [paymentId]);
  return result.rows.length;
};

let cemeteryId;
let ownerId; // owns every reservation created here
let reviewerId; // a different staff account recording the cash payments

test.before(async () => {
  assert.equal(db.isLocal, true, 'payment tests must run against the embedded database');
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  const cemetery = await db.query(
    `INSERT INTO cemeteries (name, barangay, municipality, province)
     VALUES ('Test Cemetery', 'Cogon', 'Cordova', 'Cebu') RETURNING id`
  );
  cemeteryId = cemetery.rows[0].id;
  ownerId = await insertUser('Owner Staff', 'owner@test.local');
  reviewerId = await insertUser('Reviewer Staff', 'reviewer@test.local');
});

test.after(async () => {
  await db.end();
});

test('the schema re-applies cleanly on an existing database (server restart)', async () => {
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  const index = await db.query(
    "SELECT indexname FROM pg_indexes WHERE indexname = 'payments_one_completed_per_reservation'"
  );
  assert.equal(index.rows.length, 1, 'the one-completed-payment guard index must survive a restart');
  const users = await db.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'staff'");
  assert.equal(users.rows[0].count, 2, 're-applying the schema must not remove staff accounts');
});

test('the database rejects a second completed payment even if the check is bypassed', async () => {
  const reservationId = await insertReservation(ownerId, cemeteryId, 5, 'pending');
  await insertPayment(reservationId, 'completed', 'INDEX-FIRST');

  await assert.rejects(
    () => insertPayment(reservationId, 'completed', 'INDEX-SECOND'),
    (error) => error.code === '23505'
  );
});

test('recording cash for a pending reservation confirms it and issues exactly one receipt', async () => {
  const reservationId = await insertReservation(ownerId, cemeteryId, 3, 'pending');

  const res = createResponse();
  await paymentController.recordCashPayment(
    {
      user: { id: reviewerId, role: 'staff' },
      body: { reservation_id: reservationId, amount: 500, note: 'Walk-in cash at the office' },
    },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.ok(res.payload.receipt_no, 'recording cash must return a receipt number');
  const paymentId = res.payload.payment.id;
  assert.equal(await paymentStatus(paymentId), 'completed');
  assert.equal(await receiptCount(paymentId), 1, 'a cash payment must issue exactly one receipt');
  const payment = await db.query('SELECT payment_method FROM payments WHERE id = $1', [paymentId]);
  assert.equal(payment.rows[0].payment_method, 'Cash');
  const reservation = await db.query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
  assert.equal(reservation.rows[0].status, 'confirmed');
});

test('recording cash for a cancelled reservation is refused and writes nothing', async () => {
  const reservationId = await insertReservation(ownerId, cemeteryId, 6, 'cancelled');

  const res = createResponse();
  await paymentController.recordCashPayment(
    { user: { id: reviewerId, role: 'staff' }, body: { reservation_id: reservationId, amount: 500 } },
    res
  );

  assert.equal(res.statusCode, 409);
  const payments = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [reservationId]);
  assert.equal(payments.rows.length, 0, 'a refused cash recording must not create a payment row');
  const receipts = await db.query(
    `SELECT rc.id
     FROM receipts rc
     JOIN payments p ON rc.payment_id = p.id
     WHERE p.reservation_id = $1`,
    [reservationId]
  );
  assert.equal(receipts.rows.length, 0, 'a refused cash recording must not issue a receipt');
  const reservation = await db.query('SELECT status FROM reservations WHERE id = $1', [reservationId]);
  assert.equal(reservation.rows[0].status, 'cancelled');
});

test('receipt access is limited to the owner unless the caller is privileged', async () => {
  const reservationId = await insertReservation(ownerId, cemeteryId, 4, 'pending');
  const paymentId = await insertPayment(reservationId, 'completed', 'RECEIPT-CASE');

  const stranger = createResponse();
  await paymentController.getPaymentReceipt(
    { user: { id: reviewerId, role: 'visitor' }, params: { id: String(paymentId) } },
    stranger
  );
  assert.equal(stranger.statusCode, 403);
  assert.equal(await receiptCount(paymentId), 0, 'a denied read must not issue a receipt');

  const owner = createResponse();
  await paymentController.getPaymentReceipt(
    { user: { id: ownerId, role: 'visitor' }, params: { id: String(paymentId) } },
    owner
  );
  assert.equal(owner.statusCode, 200);
  assert.ok(owner.payload.receipt_no);

  const staff = createResponse();
  await paymentController.getPaymentReceipt(
    { user: { id: reviewerId, role: 'staff' }, params: { id: String(paymentId) } },
    staff
  );
  assert.equal(staff.statusCode, 200);
});

test('the legacy direct-completion payment handler is no longer exported', () => {
  assert.equal(paymentController.createPayment, undefined);
});

test('a receipt cannot be issued for a payment that is not completed', async () => {
  const reservationId = await insertReservation(ownerId, cemeteryId, 7, 'pending');
  const paymentId = await insertPayment(reservationId, 'rejected', 'RECEIPT-VOID');

  const res = createResponse();
  await paymentController.getPaymentReceipt(
    { user: { id: ownerId, role: 'visitor' }, params: { id: String(paymentId) } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.message, /completed cash payments/i);
  assert.equal(await receiptCount(paymentId), 0, 'a rejected payment must never produce a receipt');
});

test('recording cash rejects zero and underpaid amounts unless a note explains the reduction', async () => {
  const zeroId = await insertReservation(ownerId, cemeteryId, 8, 'pending');
  const zeroRes = createResponse();
  await paymentController.recordCashPayment(
    { user: { id: reviewerId, role: 'staff' }, body: { reservation_id: zeroId, amount: 0 } },
    zeroRes
  );
  assert.equal(zeroRes.statusCode, 400);
  assert.match(zeroRes.payload.message, /positive cash amount/i);
  const zeroPayments = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [zeroId]);
  assert.equal(zeroPayments.rows.length, 0, 'a zero-amount recording must not create a payment');

  const underpayId = await insertReservation(ownerId, cemeteryId, 9, 'pending');
  const underpayRes = createResponse();
  await paymentController.recordCashPayment(
    { user: { id: reviewerId, role: 'staff' }, body: { reservation_id: underpayId, amount: 100 } },
    underpayRes
  );
  assert.equal(underpayRes.statusCode, 400);
  assert.match(underpayRes.payload.message, /below the reservation fee/i);
  const underpayPayments = await db.query('SELECT id FROM payments WHERE reservation_id = $1', [underpayId]);
  assert.equal(underpayPayments.rows.length, 0, 'a silent underpayment must not create a payment');

  const notedRes = createResponse();
  await paymentController.recordCashPayment(
    {
      user: { id: reviewerId, role: 'staff' },
      body: { reservation_id: underpayId, amount: 100, note: 'Reduced fee approved at the office.' },
    },
    notedRes
  );
  assert.equal(notedRes.statusCode, 201, 'a noted reduction is an explicit, audited adjustment');
  const confirmed = await db.query('SELECT status FROM reservations WHERE id = $1', [underpayId]);
  assert.equal(confirmed.rows[0].status, 'confirmed');
  const recorded = await db.query('SELECT admin_note FROM payments WHERE reservation_id = $1', [underpayId]);
  assert.match(recorded.rows[0].admin_note, /Reduced fee approved/);
});
