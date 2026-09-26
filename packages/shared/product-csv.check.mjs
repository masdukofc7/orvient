import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseProductCsv, splitCsv, PRODUCT_CSV_MAX_ROWS } =
  createRequire(import.meta.url)('./dist/index.js');

assert.deepEqual(splitCsv('a,b\n1,"2,3"\n'), [
  ['a', 'b'],
  ['1', '2,3'],
]);

const ok = parseProductCsv(
  [
    'name,sku,costPrice,sellingPrice,barcode,stock,unit',
    'Rice,RICE-1,100,120,,10,bag',
    'Oil,OIL-1,50,80,8901,0,bottle',
  ].join('\n'),
);
assert.equal(ok.errors.length, 0);
assert.equal(ok.rows.length, 2);
assert.equal(ok.rows[0].input.name, 'Rice');
assert.equal(ok.rows[0].input.stock, 10);
assert.equal(ok.rows[0].input.unit, 'bag');
assert.equal(ok.rows[1].input.barcode, '8901');

const bad = parseProductCsv('name,sku,costPrice,sellingPrice\n,SKU,1,2\n');
assert.equal(bad.rows.length, 0);
assert.equal(bad.errors.length, 1);
assert.match(bad.errors[0].message, /name/i);

assert.throws(
  () => parseProductCsv('sku,name\nx,y\n'),
  /costPrice|sellingPrice|name|sku/i,
);

const many = ['name,sku,costPrice,sellingPrice'];
for (let i = 0; i < PRODUCT_CSV_MAX_ROWS + 1; i++) {
  many.push(`P${i},SKU${i},1,2`);
}
assert.throws(() => parseProductCsv(many.join('\n')), /500/);

console.log('product-csv: ok');
