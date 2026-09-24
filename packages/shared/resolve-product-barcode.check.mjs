import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { resolveProductBarcode } = createRequire(import.meta.url)('./dist/index.js');

assert.equal(resolveProductBarcode(null, 'SKU-1'), 'SKU-1');
assert.equal(resolveProductBarcode(undefined, 'SKU-1'), 'SKU-1');
assert.equal(resolveProductBarcode('', 'SKU-1'), 'SKU-1');
assert.equal(resolveProductBarcode('   ', 'SKU-1'), 'SKU-1');
assert.equal(resolveProductBarcode('UPC123', 'SKU-1'), 'UPC123');
assert.equal(resolveProductBarcode('  UPC123  ', 'SKU-1'), 'UPC123');

console.log('resolveProductBarcode: ok');
