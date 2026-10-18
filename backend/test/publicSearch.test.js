// Integration tests for the burial search query path (escaping, anonymous
// limits, privacy). Runs against an isolated in-memory embedded database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://user:password@host/database';
process.env.PGLITE_DATA_DIR = ':memory:';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../config/db');
const { getBurialRecords } = require('../controllers/burialController');
const { ANON_RESULT_LIMIT, AUTHENTICATED_RESULT_LIMIT } = require('../services/searchQuery');

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

// Mirrors what the routes pass: public.js sets anonymousLookup, /api/burials does not.
const search = async (query, { anonymous = false } = {}) => {
  const req = { query };
  if (anonymous) {
    req.anonymousLookup = true;
  }
  const res = createResponse();
  await getBurialRecords(req, res);
  return res;
};

test.before(async () => {
  assert.equal(db.isLocal, true, 'search tests must run against the embedded database');
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  // The schema seeds the Cogon cemetery (schema.sql), so reuse it instead of
  // inserting a duplicate.
  const cemetery = await db.query(
    "SELECT id FROM cemeteries WHERE name = 'Cogon Cemetery' ORDER BY id LIMIT 1"
  );
  assert.equal(cemetery.rows.length, 1, 'the schema must seed the Cogon cemetery');
  const cemeteryId = cemetery.rows[0].id;

  const records = [
    ['Maria Santos', 'A-03', '1960-01-01', 'Beloved mother'],
    ['Anna Cruz', null, null, null],
    ['Percent %% Name', null, null, null],
  ];
  for (let i = 1; i <= 30; i += 1) {
    records.push([`Cap Person ${String(i).padStart(2, '0')}`, null, null, null]);
  }

  for (const [fullName, graveReference, deathDate, epitaph] of records) {
    await db.query(
      `INSERT INTO burial_records (cemetery_id, full_name, grave_reference, death_date, epitaph)
       VALUES ($1, $2, $3, $4, $5)`,
      [cemeteryId, fullName, graveReference, deathDate, epitaph]
    );
  }
});

test.after(async () => {
  await db.end();
});

test('anonymous searches below the minimum length are rejected', async () => {
  const res = await search({ search: 'Ma' }, { anonymous: true });
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.message, /at least 3 characters/i);
});

test('authenticated searches still allow two characters', async () => {
  const res = await search({ search: 'Ma' });
  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.some((record) => record.full_name === 'Maria Santos'));
});

test('plain searches work and never expose birth dates', async () => {
  const res = await search({ search: 'Maria' }, { anonymous: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].full_name, 'Maria Santos');
  assert.equal(res.payload[0].plot_reference, 'A-03');
  assert.equal(res.payload[0].section, 'A');
  assert.equal(res.payload[0].lot_number, 3);
  assert.ok(!('birth_date' in res.payload[0]), 'birth dates must not be returned');
});

test('grave references remain searchable', async () => {
  const res = await search({ search: 'A-03' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 1);
  assert.equal(res.payload[0].full_name, 'Maria Santos');
});

test('percent wildcards are matched literally, not as wildcards', async () => {
  const total = await db.query('SELECT COUNT(*)::int AS c FROM burial_records');

  const wildcardOnly = await search({ search: '%%' });
  assert.equal(wildcardOnly.statusCode, 200);
  assert.deepEqual(
    wildcardOnly.payload.map((record) => record.full_name),
    ['Percent %% Name'],
    '%% must match only names containing literal percent signs, not every record'
  );
  assert.ok(
    wildcardOnly.payload.length < total.rows[0].c,
    '%% must not behave like an unescaped wildcard'
  );

  const literal = await search({ search: 'Percent %%' });
  assert.equal(literal.payload.length, 1);
  assert.equal(literal.payload[0].full_name, 'Percent %% Name');
});

test('underscore wildcards are matched literally', async () => {
  const res = await search({ search: 'A_' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 0, "A_ must not act as a single-character wildcard");

  const sanity = await search({ search: 'Ann' });
  assert.equal(sanity.payload.length, 1);
});

test('cemetery filter escapes wildcards too', async () => {
  const wildcard = await search({ cemetery: 'Cogon%', search: 'Maria' });
  assert.equal(wildcard.statusCode, 200);
  assert.equal(wildcard.payload.length, 0);

  const plain = await search({ cemetery: 'Cogon', search: 'Maria' });
  assert.equal(plain.payload.length, 1);
});

test('anonymous results are capped below the authenticated cap', async () => {
  const anonymous = await search({ search: 'Cap Person' }, { anonymous: true });
  assert.equal(anonymous.statusCode, 200);
  assert.equal(anonymous.payload.length, ANON_RESULT_LIMIT);

  const authenticated = await search({ search: 'Cap Person' });
  assert.equal(authenticated.payload.length, 30);
  assert.ok(ANON_RESULT_LIMIT < AUTHENTICATED_RESULT_LIMIT);
});
