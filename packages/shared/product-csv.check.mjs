import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { parseProductCsv, splitCsv, PRODUCT_CSV_MAX_ROWS, PRODUCT_CSV_HEADERS } =
  createRequire(import.meta.url)('./dist/index.js');

assert.deepEqual(splitCsv('a,b\n1,"2,3"\n'), [
  ['a', 'b'],
  ['1', '2,3'],
]);

assert.deepEqual(
  [...PRODUCT_CSV_HEADERS],
  [
    'Name',
    'SKU',
    'Barcode',
    'Category',
    'Cost Price',
    'Selling Price',
    'Quantity',
    'Low Stock At',
    'Unit',
  ],
);

const ok = parseProductCsv(
  [
    'Name,SKU,Cost Price,Selling Price,Barcode,Quantity,Unit',
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

// Legacy camelCase / short aliases still work
const legacy = parseProductCsv(
  ['name,sku,cost,price,stock', 'Tea,TEA-1,20,30,7'].join('\n'),
);
assert.equal(legacy.errors.length, 0);
assert.equal(legacy.rows[0].input.stock, 7);
assert.equal(legacy.rows[0].input.costPrice, 20);
assert.equal(legacy.rows[0].input.sellingPrice, 30);

const bad = parseProductCsv('Name,SKU,Cost Price,Selling Price\n,SKU,1,2\n');
assert.equal(bad.rows.length, 0);
assert.equal(bad.errors.length, 1);
assert.match(bad.errors[0].message, /name/i);

assert.throws(
  () => parseProductCsv('sku,name\nx,y\n'),
  /Cost Price|Selling Price|Name|SKU/i,
);

const many = ['Name,SKU,Cost Price,Selling Price'];
for (let i = 0; i < PRODUCT_CSV_MAX_ROWS + 1; i++) {
  many.push(`P${i},SKU${i},1,2`);
}
assert.throws(() => parseProductCsv(many.join('\n')), /500/);

console.log('product-csv: ok');
