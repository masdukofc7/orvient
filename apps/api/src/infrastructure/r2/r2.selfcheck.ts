import assert from 'node:assert/strict';
import { sniffImageUpload, MAX_LOGO_BYTES } from './r2';

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const ok = sniffImageUpload(png);
assert.equal(ok.ok, true);
if (ok.ok) assert.equal(ok.ext, 'png');

assert.equal(sniffImageUpload(Buffer.alloc(0)).ok, false);
assert.equal(sniffImageUpload(Buffer.alloc(MAX_LOGO_BYTES + 1)).ok, false);
assert.equal(sniffImageUpload(Buffer.from([0x00, 0x01, 0x02])).ok, false);

console.log('r2.selfcheck: ok');
