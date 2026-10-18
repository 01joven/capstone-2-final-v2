// Contract tests for saved memorial items (favorites). The frontend keys its
// saved-state maps off these exact field names: `saved_id` identifies the
// saved row (used for removal) while `id` is the memorial's id (used for
// matching cards). A rename on either side silently breaks Search, Map, and
// Saved, so this suite locks the contract.
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
const favoriteController = require('../controllers/favoriteController');

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

let ownerId;
let otherUserId;
let memorialId;

test.before(async () => {
  assert.equal(db.isLocal, true, 'favorite tests must run against the embedded database');
  const schema = fs.readFileSync(path.resolve(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  await db.exec(schema);

  const user = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Favorite Owner', 'favorite-owner@test.local', 'test-hash', 'staff') RETURNING id`
  );
  ownerId = user.rows[0].id;
  const other = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ('Favorite Other', 'favorite-other@test.local', 'test-hash', 'staff') RETURNING id`
  );
  otherUserId = other.rows[0].id;
  const memorial = await db.query(
    `INSERT INTO memorials (name, description, latitude, longitude, category, image_url, price)
     VALUES ('Favorite Test Memorial', 'Contract test site.', 10.2600, 123.9510, 'Cemetery', '/cemetery-images/heritage-memorial.png', 500)
     RETURNING id`
  );
  memorialId = memorial.rows[0].id;
});

test.after(async () => {
  await db.end();
});

test('the saved-item row contract: saved_id is the row, id is the memorial', async () => {
  const add = createResponse();
  await favoriteController.addSavedItem(
    { user: { id: ownerId }, body: { memorial_id: memorialId } },
    add
  );
  assert.equal(add.statusCode, 201);
  assert.equal(add.payload.memorial_id, memorialId, 'the saved row must reference the memorial');

  const list = createResponse();
  await favoriteController.getSavedItems({ user: { id: ownerId } }, list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.length, 1);
  const row = list.payload[0];
  // The frontend removes items by saved_id but matches cards by memorial id.
  assert.equal(row.saved_id, add.payload.id, 'saved_id must be the saved_items row id');
  assert.equal(row.id, memorialId, 'id must be the memorial id (not the saved row id)');

  // Removing by saved_id deletes exactly that row; a repeat removal 404s.
  const remove = createResponse();
  await favoriteController.removeSavedItem(
    { user: { id: ownerId }, params: { id: String(row.saved_id) } },
    remove
  );
  assert.equal(remove.statusCode, 200);

  const removeAgain = createResponse();
  await favoriteController.removeSavedItem(
    { user: { id: ownerId }, params: { id: String(row.saved_id) } },
    removeAgain
  );
  assert.equal(removeAgain.statusCode, 404, 'a second removal must not delete anything');
});

test('duplicates are refused and another user cannot remove the item', async () => {
  const first = createResponse();
  await favoriteController.addSavedItem(
    { user: { id: ownerId }, body: { memorial_id: memorialId } },
    first
  );
  assert.equal(first.statusCode, 201);

  const duplicate = createResponse();
  await favoriteController.addSavedItem(
    { user: { id: ownerId }, body: { memorial_id: memorialId } },
    duplicate
  );
  assert.equal(duplicate.statusCode, 409, 'saving the same memorial twice must be refused');

  const missing = createResponse();
  await favoriteController.addSavedItem(
    { user: { id: ownerId }, body: { memorial_id: 999999 } },
    missing
  );
  assert.equal(missing.statusCode, 404, 'saving an unknown memorial must be refused');

  const strangerRemove = createResponse();
  await favoriteController.removeSavedItem(
    { user: { id: otherUserId }, params: { id: String(first.payload.id) } },
    strangerRemove
  );
  assert.equal(strangerRemove.statusCode, 404, 'another user must not remove a saved item they do not own');

  const stillSaved = await db.query('SELECT id FROM saved_items WHERE user_id = $1', [ownerId]);
  assert.equal(stillSaved.rows.length, 1, 'the owner\'s saved item must survive the stranger\'s removal attempt');
});