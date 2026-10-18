const test = require('node:test');
const assert = require('node:assert/strict');
const {
  escapeLikePattern,
  ANON_MIN_SEARCH_LENGTH,
  ANON_RESULT_LIMIT,
  AUTHENTICATED_RESULT_LIMIT,
} = require('../services/searchQuery');

test('escapeLikePattern leaves plain text unchanged', () => {
  assert.equal(escapeLikePattern('Maria Santos'), 'Maria Santos');
  assert.equal(escapeLikePattern(''), '');
});

test('escapeLikePattern escapes percent wildcards', () => {
  assert.equal(escapeLikePattern('100%'), '100\\%');
  assert.equal(escapeLikePattern('%%'), '\\%\\%');
});

test('escapeLikePattern escapes underscore wildcards', () => {
  assert.equal(escapeLikePattern('A_B'), 'A\\_B');
  assert.equal(escapeLikePattern('__'), '\\_\\_');
});

test('escapeLikePattern escapes backslashes before wildcards', () => {
  // Backslash first: a literal "\%" must become "\\\%", not "\\%".
  assert.equal(escapeLikePattern('\\%'), '\\\\\\%');
  assert.equal(escapeLikePattern('a\\_b'), 'a\\\\\\_b');
  assert.equal(escapeLikePattern('\\%_'), '\\\\\\%\\_');
});

test('escapeLikePattern returns non-string input unchanged', () => {
  assert.equal(escapeLikePattern(null), null);
  assert.equal(escapeLikePattern(undefined), undefined);
  assert.equal(escapeLikePattern(42), 42);
  const input = {};
  assert.equal(escapeLikePattern(input), input);
});

test('anonymous limits are stricter than authenticated limits', () => {
  assert.equal(ANON_MIN_SEARCH_LENGTH, 3);
  assert.equal(ANON_RESULT_LIMIT, 25);
  assert.equal(AUTHENTICATED_RESULT_LIMIT, 50);
  assert.ok(ANON_RESULT_LIMIT < AUTHENTICATED_RESULT_LIMIT);
});
