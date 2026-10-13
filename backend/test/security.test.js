const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, emailFrom } = require('../middleware/rateLimit');
const { parsePlotReference, PLOT_REFERENCE_SQL } = require('../services/plotAvailability');

const fakeResponse = () => {
  const res = { headers: {}, statusCode: 200, body: null };
  res.set = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
};

test('rate limiter allows up to max requests then returns 429', () => {
  const limit = createRateLimiter({ windowMs: 60000, max: 2, keyFn: () => 'k-test-1', message: 'slow down' });
  let passed = 0;
  for (let i = 0; i < 3; i += 1) {
    const res = fakeResponse();
    limit({}, res, () => { passed += 1; });
    if (i === 2) {
      assert.equal(res.statusCode, 429);
      assert.equal(res.body.message, 'slow down');
    }
  }
  assert.equal(passed, 2);
});

test('rate limiter skips requests with no key', () => {
  const limit = createRateLimiter({ windowMs: 60000, max: 0, keyFn: () => null, message: 'x' });
  let called = false;
  limit({}, fakeResponse(), () => { called = true; });
  assert.equal(called, true);
});

test('emailFrom normalizes the account key', () => {
  assert.equal(emailFrom({ body: { email: '  Admin@Example.com ' } }), 'email:admin@example.com');
  assert.equal(emailFrom({ body: {} }), null);
});

test('plot references are parsed and bounded', () => {
  assert.deepEqual(parsePlotReference('a-12'), { section: 'A', lotNumber: 12 });
  assert.equal(parsePlotReference('A-10001'), null);
  assert.equal(parsePlotReference('A-123456'), null);
  assert.equal(parsePlotReference('Lot 12'), null);
});

test('SQL plot pattern limits lot digits so the integer cast cannot overflow', () => {
  const pattern = new RegExp(PLOT_REFERENCE_SQL);
  assert.ok(pattern.test('A-12'));
  assert.ok(!pattern.test('A-123456'));
});
