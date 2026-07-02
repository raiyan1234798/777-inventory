/**
 * Catalog matching: brand + name + sku identity, SKU-from-name fallback, inventory dedup.
 *
 * Run:
 *   npx esbuild scripts/testItemMatching.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import { findExistingItemForImport, type ImportBrandRef, type ImportItemRef } from '../src/lib/importLogic';
import { extractFlatItems } from '../src/lib/importParser';
import { resolveImportSku } from '../src/lib/skuGenerator';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const brand: ImportBrandRef = { id: 'b-panda', name: 'PANDA' };
const brands = [brand];

const existing: ImportItemRef[] = [
  {
    id: 'item-003j-a',
    brand_id: 'b-panda',
    name: '003J',
    sku: 'MENS LEATHER JACKET STYLE A',
  },
  {
    id: 'item-a03',
    brand_id: 'b-panda',
    name: 'A03',
    sku: 'A03',
  },
  {
    id: 'item-a01',
    brand_id: 'b-panda',
    name: 'A01',
    sku: 'MENTSHIRT ROUND / POLO',
  },
];

// Same CODE, different descriptive SKU → must NOT match existing (create new item)
const rowB = findExistingItemForImport(
  { name: '003J', sku: 'MENS LEATHER JACKET STYLE B', category: 'PANDA' },
  brands,
  existing
);
check('003J different SKU → no match (new item)', rowB, null);

// Exact triple match → update existing
const rowA = findExistingItemForImport(
  { name: '003J', sku: 'MENS LEATHER JACKET STYLE A', category: 'PANDA' },
  brands,
  existing
);
check('003J same SKU → matches existing', rowA?.id, 'item-003j-a');

// Cross-brand same short code stays separate (no brand in catalog for A1 SUMR)
const rowCross = findExistingItemForImport(
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', category: 'A1 SUMR' },
  brands,
  existing
);
check('A03 on A1 SUMR with only PANDA in DB → no match', rowCross, null);

// Blank SKU → resolveImportSku uses item name; triple match when catalog sku = name
const blankSkuResolved = resolveImportSku('', 'A03');
check('blank SKU resolves to item name', blankSkuResolved, 'A03');

const rowBlankSku = findExistingItemForImport(
  { name: 'A03', sku: blankSkuResolved, category: 'PANDA' },
  brands,
  existing
);
check('blank SKU (name fallback) → matches existing A03', rowBlankSku?.id, 'item-a03');

// Different sku same name → separate items (003J style B already tested above)

// Short code in file name, long sku in system — cross-match when unambiguous
const rowA01 = findExistingItemForImport(
  { name: 'A01', sku: 'MENTSHIRT ROUND / POLO', category: 'PANDA' },
  brands,
  existing
);
check('A01 triple match → existing item', rowA01?.id, 'item-a01');

// Flat parser sets skuWasGeneratedFromName when SKU cell is blank
const flatRows: any[][] = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['CCR', 'A03', '', 92, 84, 2800],
  ['MTSS', 'A01', 'MENTSHIRT ROUND / POLO', 23, 84, 3000],
];
const parsed = extractFlatItems(flatRows, 'PANDA', 'PANDA');
check('flat parse A03 sku = name', parsed[0]?.sku, 'A03');
check('flat parse A03 skuWasGeneratedFromName', parsed[0]?.skuWasGeneratedFromName, true);
check('flat parse A01 has file SKU', parsed[1]?.skuWasGeneratedFromName, false);

// Simulated save: existing match → same item id, no duplicate key
const matchForSave = findExistingItemForImport(
  { name: parsed[0].name, sku: resolveImportSku(parsed[0].sku, parsed[0].name), category: 'PANDA' },
  brands,
  existing
);
check('flat A03 no-sku row matches catalog (no duplicate item)', matchForSave?.id, 'item-a03');

console.log(failures === 0 ? '\n✅ ALL ITEM-MATCHING CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
