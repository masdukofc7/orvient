import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { csvDate, csvDateTime, csvMoney, csvYesNo } =
  createRequire(import.meta.url)('./dist/index.js');

assert.equal(csvDate('2026-09-26T15:30:00.000Z'), '2026-09-26');
assert.equal(csvDateTime('2026-09-26T15:30:00.000Z'), '2026-09-26 15:30');
assert.equal(csvDate(null), '');
assert.equal(csvDateTime(undefined), '');
assert.equal(csvMoney(12.5), '12.50');
assert.equal(csvMoney('100'), '100.00');
assert.equal(csvYesNo(true), 'Yes');
assert.equal(csvYesNo(false), 'No');

console.log('csv-format: ok');
