/**
 * pageOffset self-check — fails if skip math drifts.
 * Run: node --experimental-strip-types packages/shared/page-offset.check.mjs
 * (or via tsx after build). Pure assert on shared helper copy.
 */
import assert from 'node:assert/strict';

function pageOffset(page, limit) {
  return { skip: (Math.max(1, page) - 1) * limit, take: limit };
}

assert.deepEqual(pageOffset(1, 25), { skip: 0, take: 25 });
assert.deepEqual(pageOffset(2, 25), { skip: 25, take: 25 });
assert.deepEqual(pageOffset(0, 10), { skip: 0, take: 10 }); // clamps page
assert.deepEqual(pageOffset(3, 50), { skip: 100, take: 50 });
console.log('page-offset.check: ok');
