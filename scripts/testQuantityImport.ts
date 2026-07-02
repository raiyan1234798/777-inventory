/**
 * Quantity parsing unit tests — column detection, parseImportQty, dedupe qty fields.
 *
 * Run:
 *   npx esbuild scripts/testQuantityImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import {
  parseImportQty,
  detectFlatColumns,
  extractFlatItems,
  dedupeImportItems,
} from '../src/lib/importParser';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

// parseImportQty
check('parseImportQty integer', parseImportQty(27), 27);
check('parseImportQty string', parseImportQty('23'), 23);
check('parseImportQty blank → 0', parseImportQty(''), 0);
check('parseImportQty rounds decimal', parseImportQty('12.6'), 13);
check('parseImportQty strips commas', parseImportQty('1,234'), 1234);
check('parseImportQty non-numeric is NaN (row skipped)', Number.isNaN(parseImportQty('abc')), true);

// Column detection — QUANTITY not COST or SELLING PRICE
const flatHeader = [['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW']];
const cols = detectFlatColumns(flatHeader);
check('qty col is QUANTITY (index 3)', cols.qtyCol, 3);
check('cost col is COST-USD (index 4)', cols.costCol, 4);
check('retail col is SELLING (index 5)', cols.retailCol, 5);

const flatRows = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['A01', 'A01', 'A01', 23, 84, 3000],
  ['MIX DRESS', 'MIX DRESS', '', 27, 5, 500],
  ['EMPTY', 'EMPTY', '', '', 1, 100],
];
const extracted = extractFlatItems(flatRows, 'BUGA-SUMR', 'BUGA SUMR');
check('A01 qty from QUANTITY col', extracted.find(p => p.name === 'A01')?.qty, 23);
check('MIX DRESS qty', extracted.find(p => p.name === 'MIX DRESS')?.qty, 27);
check('blank qty row imports as 0', extracted.find(p => p.name === 'EMPTY')?.qty, 0);
check('blank qty row not dropped', extracted.some(p => p.name === 'EMPTY'), true);

// Warehouse-style dedupe sums closing + movement fields
const whDeduped = dedupeImportItems([
  { name: 'SOCKS', sku: 'S1', qty: 10, closing: 10, opening: 5, received: 5, category: 'BUGA WINT' },
  { name: 'SOCKS', sku: 'S1', qty: 3, closing: 3, opening: 0, received: 3, category: 'BUGA WINT' },
]);
check('warehouse dedupe merges to 1 row', whDeduped.length, 1);
check('warehouse dedupe sums qty', whDeduped[0]?.qty, 13);
check('warehouse dedupe sums closing', whDeduped[0]?.closing, 13);
check('warehouse dedupe sums opening', whDeduped[0]?.opening, 5);
check('warehouse dedupe sums received', whDeduped[0]?.received, 8);

console.log(failures === 0 ? '\n✅ ALL QUANTITY CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
