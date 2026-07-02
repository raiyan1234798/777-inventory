/**
 * Case-insensitive brand + item matching and quantity preservation through parse → dedupe.
 *
 * Run:
 *   npx esbuild scripts/testCaseInsensitiveImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import {
  findBrandForImport,
  findExistingItemForImport,
  normalizeBrandKey,
  normalizeItemKey,
  applyPreviewPriceFallback,
  annotateImportPreviewFlags,
  type ImportBrandRef,
  type ImportItemRef,
} from '../src/lib/importLogic';
import { extractFlatItems, dedupeImportItems, parseImportQty } from '../src/lib/importParser';
import { resolveImportSku } from '../src/lib/skuGenerator';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const bugaBrand: ImportBrandRef = { id: 'brand-buga', name: 'BUGA-SUMR' };
const brands: ImportBrandRef[] = [bugaBrand];

const catalog: ImportItemRef[] = [
  {
    id: 'item-mix-dress',
    brand_id: 'brand-buga',
    name: 'mix dress',
    sku: 'MIX DRESS',
    avg_cost_USD: 10,
    retail_price: 50,
  },
];

// Brand: case + hyphen/space
check('normalizeBrandKey BUGA SUMR = BUGA-SUMR', normalizeBrandKey('BUGA SUMR'), normalizeBrandKey('BUGA-SUMR'));
check('normalizeBrandKey buga sumr', normalizeBrandKey('buga sumr'), normalizeBrandKey('BUGA-SUMR'));
check('findBrandForImport BUGA SUMR', findBrandForImport('BUGA SUMR', brands)?.id, 'brand-buga');
check('findBrandForImport buga-sumr', findBrandForImport('buga-sumr', brands)?.id, 'brand-buga');

// Item: case-insensitive name match
const fileRow = { name: 'MIX DRESS', sku: 'MIX DRESS', category: 'BUGA SUMR' };
check(
  'findExistingItemForImport MIX DRESS case',
  findExistingItemForImport(fileRow, brands, catalog)?.id,
  'item-mix-dress'
);
check(
  'findExistingItemForImport mix dress lowercase',
  findExistingItemForImport({ name: 'mix dress', sku: 'mix dress', category: 'buga sumr' }, brands, catalog)?.id,
  'item-mix-dress'
);

// normalizeItemKey
check('normalizeItemKey trims and lowercases', normalizeItemKey('  MIX DRESS  '), 'mix dress');

// Quantity: parse verbatim values
check('parseImportQty 27', parseImportQty(27), 27);
check('parseImportQty 0', parseImportQty(0), 0);
check('parseImportQty 6', parseImportQty('6'), 6);

const flatRows = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['MD', 'MIX DRESS', '', 27, 5, 500],
  ['MD', 'MIX DRESS', '', 6, 5, 500],
];
const parsed = extractFlatItems(flatRows, 'BUGA-SUMR', 'BUGA SUMR');
check('extract MIX DRESS qty 27', parsed[0]?.qty, 27);

// Dedupe sums qty for same brand+item (hyphen vs space brand labels)
const deduped = dedupeImportItems([
  { name: 'MIX DRESS', sku: 'MIX DRESS', qty: 27, category: 'BUGA SUMR' },
  { name: 'mix dress', sku: 'mix dress', qty: 6, category: 'BUGA-SUMR' },
]);
check('dedupe merges case/hyphen brand rows', deduped.length, 1);
check('dedupe sums qty 27+6', deduped[0]?.qty, 33);

// Simulated save target qty from preview row
const previewRow = deduped[0];
const matchInput = {
  name: previewRow.name,
  sku: resolveImportSku(previewRow.sku ?? '', previewRow.name),
  category: previewRow.category ?? '',
};
const existing = findExistingItemForImport(matchInput, brands, catalog);
check('save simulation matches existing item (no duplicate)', existing?.id, 'item-mix-dress');
const targetQty = Math.max(0, previewRow.qty ?? 0);
check('save simulation targetQty preserved', targetQty, 33);

// Preview flags: existing brand + catalog match, not "new brand"
const flagged = annotateImportPreviewFlags(
  applyPreviewPriceFallback(
    [{ name: 'MIX DRESS', sku: 'MIX DRESS', category: 'BUGA SUMR', qty: 27, unitCost: 0, retailPrice: 0 }],
    brands,
    catalog,
    'add_and_update',
    'USD',
    'ZMW'
  ),
  brands
);
check('preview brandResolved (not new)', flagged[0].brandUnresolved, false);
check('preview catalog matched', flagged[0].matchedToSystem, true);
check('preview clears skuWasGeneratedFromName on catalog match', flagged[0].skuWasGeneratedFromName, false);

// UK SUMMER + Men White Shirt A: catalog SKU applied, no "NO SKU" badge
const ukSummerBrand: ImportBrandRef = { id: 'brand-uk', name: 'UK-SUMMER' };
const ukBrands: ImportBrandRef[] = [ukSummerBrand];
const ukCatalog: ImportItemRef[] = [
  {
    id: 'item-men-white',
    brand_id: 'brand-uk',
    name: 'Men White Shirt A',
    sku: 'MEN-WHITE-SHIRT-A',
    avg_cost_USD: 12,
    retail_price: 80,
  },
];
const ukFileRow = {
  name: 'Men White Shirt A',
  sku: 'Men White Shirt A',
  category: 'UK SUMMER',
  qty: 5,
  unitCost: 0,
  retailPrice: 0,
  skuWasGeneratedFromName: true,
};
const ukPreview = applyPreviewPriceFallback(
  [ukFileRow],
  ukBrands,
  ukCatalog,
  'update_only',
  'USD',
  'ZMW'
);
check('UK SUMMER catalog match', ukPreview[0].matchedToSystem, true);
check('UK SUMMER uses catalog SKU not name fallback', ukPreview[0].sku, 'MEN-WHITE-SHIRT-A');
check('UK SUMMER clears NO SKU badge', ukPreview[0].skuWasGeneratedFromName, false);

// Wrong brand, same item name → no system prices, name as sku fallback
const wrongBrandPreview = applyPreviewPriceFallback(
  [{ ...ukFileRow, category: 'WRONG BRAND', skuWasGeneratedFromName: true }],
  ukBrands,
  ukCatalog,
  'update_only',
  'USD',
  'ZMW'
);
check('wrong brand no catalog match', wrongBrandPreview[0].matchedToSystem, undefined);
check('wrong brand keeps name as sku', wrongBrandPreview[0].sku, 'Men White Shirt A');
check('wrong brand keeps NO SKU badge', wrongBrandPreview[0].skuWasGeneratedFromName, true);

console.log(failures === 0 ? '\n✅ ALL CASE-INSENSITIVE IMPORT CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
