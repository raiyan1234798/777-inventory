/**
 * Preview price fallback: matched brand+item rows pull system cost/retail when
 * the file has blank/zero prices; retail displays in ZMW via fromUSD.
 *
 * Run:
 *   npx esbuild scripts/testPreviewPriceFallback.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  applyPreviewPriceFallback,
  findBrandForImport,
  findExistingItemForImport,
  getSystemRetailForPreview,
  normalizeBrandKey,
  resolvePreviewRetailPrice,
  resolvePreviewUnitCost,
} from '../src/lib/importLogic';
import { extractFlatItems, isFlatStockSheet, dedupeImportItems } from '../src/lib/importParser';
import { DEFAULT_EXCHANGE_RATES } from '../src/lib/exchangeRates';

function toUSD(amount: number, currency: string): number {
  const rate = DEFAULT_EXCHANGE_RATES[currency] ?? 1;
  return rate > 0 ? amount / rate : amount;
}

function fromUSD(amountUSD: number, currency: string): number {
  const rate = DEFAULT_EXCHANGE_RATES[currency] ?? 1;
  return amountUSD * rate;
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

function approx(label: string, actual: number, expected: number, tolerance = 0.02) {
  const ok = Math.abs(actual - expected) <= tolerance;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ~${expected})`);
  if (!ok) failures++;
}

const brands = [
  { id: 'brand-panda', name: 'PANDA' },
  { id: 'brand-drag', name: 'DRAG-80KG' },
  { id: 'brand-vip', name: 'VIP' },
  { id: 'brand-uk', name: 'UK-SUMMER' },
];

const retailUsd = toUSD(3000, 'ZMW');
const dragRetailUsd = toUSD(2500, 'ZMW');
const items = [
  {
    id: 'item-a01',
    brand_id: 'brand-panda',
    name: 'A01',
    sku: 'MENTSHIRT ROUND / POLO',
    avg_cost_USD: 84,
    avg_cost_local: 84,
    local_currency: 'USD',
    retail_price: retailUsd,
  },
  {
    id: 'item-a02',
    brand_id: 'brand-panda',
    name: 'A02',
    sku: 'LADIES T-SHIRT',
    avg_cost_USD: 60,
    retail_price: toUSD(1800, 'ZMW'),
  },
  {
    id: 'item-drag',
    brand_id: 'brand-drag',
    name: '55CT',
    sku: "CHILDREN'S SWETAER",
    avg_cost_USD: 113,
    retail_price: dragRetailUsd,
  },
  {
    id: 'item-long-name',
    brand_id: 'brand-panda',
    name: 'MENTSHIRT ROUND / POLO',
    sku: 'A01',
    avg_cost_USD: 84,
    retail_price: retailUsd,
  },
  {
    id: 'item-v66',
    brand_id: 'brand-vip',
    name: 'V-66',
    sku: 'WOMAN CROPPED PANTS',
    avg_cost_USD: 45,
    retail_price: toUSD(1500, 'ZMW'),
  },
  {
    id: 'item-men-white',
    brand_id: 'brand-uk',
    name: 'Men White Shirt A',
    sku: 'MEN-WHITE-SHIRT-A',
    avg_cost_USD: 12,
    retail_price: toUSD(400, 'ZMW'),
  },
];

const zeroPriceRow = {
  name: 'A01',
  sku: 'MENTSHIRT ROUND / POLO',
  category: 'PANDA',
  qty: 12,
  unitCost: 0,
  retailPrice: 0,
};

const filePricedRow = {
  name: 'A01',
  sku: 'MENTSHIRT ROUND / POLO',
  category: 'PANDA',
  qty: 12,
  unitCost: 84,
  retailPrice: 3000,
};

const unmatchedRow = {
  name: 'NEW-SKU-99',
  sku: 'BRAND NEW ITEM',
  category: 'PANDA',
  qty: 3,
  unitCost: 0,
  retailPrice: 0,
};

// ── Brand normalization ───────────────────────────────────────────────────────
check('normalizeBrandKey DRAG 80KG', normalizeBrandKey('DRAG 80KG'), normalizeBrandKey('DRAG-80KG'));
check(
  'findBrandForImport matches DRAG 80KG sheet to DRAG-80KG brand',
  findBrandForImport('DRAG 80KG', brands)?.id,
  'brand-drag'
);
check(
  'findBrandForImport matches PANDA',
  findBrandForImport('PANDA', brands)?.id,
  'brand-panda'
);

// ── Matching ──────────────────────────────────────────────────────────────────
check(
  'findExistingItemForImport matches A01 + PANDA by name',
  findExistingItemForImport(zeroPriceRow, brands, items)?.id,
  'item-a01'
);

check(
  'findExistingItemForImport matches when file name equals system descriptive name',
  findExistingItemForImport(
    { name: 'MENTSHIRT ROUND / POLO', sku: 'A01', category: 'PANDA' },
    brands,
    items
  )?.id,
  'item-long-name'
);

check(
  'findExistingItemForImport matches file short code to system SKU',
  findExistingItemForImport(
    { name: 'A01', sku: 'OTHER', category: 'PANDA' },
    brands,
    items.filter(i => i.id !== 'item-long-name')
  )?.id,
  'item-a01'
);

check(
  'findExistingItemForImport matches when system stores long name + short sku',
  findExistingItemForImport(zeroPriceRow, brands, items)?.id,
  'item-a01'
);

check(
  'findExistingItemForImport matches DRAG 55CT with hyphenated brand',
  findExistingItemForImport(
    { name: '55CT', sku: "CHILDREN'S SWETAER", category: 'DRAG 80KG' },
    brands,
    items
  )?.id,
  'item-drag'
);

// VIP V-66: short code in name column, descriptive SKU in file
check(
  'findExistingItemForImport matches VIP V-66 by name',
  findExistingItemForImport(
    { name: 'V-66', sku: 'WOMAN CROPPED PANTS', category: 'VIP' },
    brands,
    items
  )?.id,
  'item-v66'
);

// UK SUMMER: blank file SKU, descriptive name matches catalog
const ukNoSkuRow = {
  name: 'Men White Shirt A',
  sku: 'Men White Shirt A',
  category: 'UK SUMMER',
  qty: 2,
  unitCost: 0,
  retailPrice: 0,
  skuWasGeneratedFromName: true,
};
check(
  'findExistingItemForImport matches UK SUMMER Men White Shirt A',
  findExistingItemForImport(ukNoSkuRow, brands, items)?.id,
  'item-men-white'
);
const ukPreview = applyPreviewPriceFallback(
  [ukNoSkuRow],
  brands,
  items,
  'update_only',
  'USD',
  'ZMW'
);
check('UK SUMMER preview uses catalog SKU', ukPreview[0].sku, 'MEN-WHITE-SHIRT-A');
check('UK SUMMER preview clears NO SKU badge', ukPreview[0].skuWasGeneratedFromName, false);
check('UK SUMMER preview matchedToSystem', ukPreview[0].matchedToSystem, true);

// ── Retail conversion must not show raw USD (166.666 bug) ───────────────────
approx(
  'getSystemRetailForPreview converts stored USD → 3000 ZMW',
  getSystemRetailForPreview(items[0], 'ZMW'),
  3000
);
check(
  'preview retail is NOT raw USD storage value',
  Math.round(getSystemRetailForPreview(items[0], 'ZMW')) === Math.round(retailUsd),
  false
);

// ── update_only: prefer system prices when file is blank ────────────────────
const updatePreview = applyPreviewPriceFallback(
  [zeroPriceRow, unmatchedRow],
  brands,
  items,
  'update_only',
  'USD',
  'ZMW'
);
check('update_only matched A01 unit cost', updatePreview[0].unitCost, 84);
approx('update_only matched A01 retail ZMW', updatePreview[0].retailPrice, 3000);
check('update_only matched flagged', updatePreview[0].matchedToSystem, true);
check('update_only matched uses catalog SKU', updatePreview[0].sku, 'MENTSHIRT ROUND / POLO');
check('update_only matched clears skuWasGeneratedFromName', updatePreview[0].skuWasGeneratedFromName, false);
check('update_only unmatched stays 0 cost', updatePreview[1].unitCost, 0);
check('update_only unmatched stays 0 retail', updatePreview[1].retailPrice, 0);

const updateWithFile = applyPreviewPriceFallback(
  [{ ...filePricedRow, unitCost: 99, retailPrice: 5000 }],
  brands,
  items,
  'update_only',
  'USD',
  'ZMW'
);
check('update_only ignores file cost for matched item', updateWithFile[0].unitCost, 84);
approx('update_only ignores file retail for matched item', updateWithFile[0].retailPrice, 3000);

// ── add_and_update: file wins; fallback to system when file is 0 ────────────
const addUpdateBlank = applyPreviewPriceFallback(
  [zeroPriceRow],
  brands,
  items,
  'add_and_update',
  'USD',
  'ZMW'
);
check('add_and_update blank file falls back to system cost', addUpdateBlank[0].unitCost, 84);
approx('add_and_update blank file falls back to system retail', addUpdateBlank[0].retailPrice, 3000);

const addUpdateFile = applyPreviewPriceFallback(
  [filePricedRow],
  brands,
  items,
  'add_and_update',
  'USD',
  'ZMW'
);
check('add_and_update keeps file cost when provided', addUpdateFile[0].unitCost, 84);
check('add_and_update keeps file retail 3000 ZMW (not USD)', addUpdateFile[0].retailPrice, 3000);
check('add_and_update file retail is not 166.666', addUpdateFile[0].retailPrice === 166.666, false);

// ── Direct resolver checks ───────────────────────────────────────────────────
const existing = items[0];
check(
  'resolvePreviewUnitCost update_only',
  resolvePreviewUnitCost(0, existing, 'update_only', 'USD'),
  84
);
approx(
  'resolvePreviewRetailPrice update_only',
  resolvePreviewRetailPrice(0, existing, 'update_only', 'ZMW'),
  3000
);
check(
  'resolvePreviewRetailPrice add_and_update uses file when > 0',
  resolvePreviewRetailPrice(3000, existing, 'add_and_update', 'ZMW'),
  3000
);
approx(
  'resolvePreviewRetailPrice add_and_update falls back when file 0',
  resolvePreviewRetailPrice(0, existing, 'add_and_update', 'ZMW'),
  3000
);

// ── SHOPS-FIROZ real file simulation (no cost/retail columns) ────────────────
const SHOPS_FILE = process.env.SHOPS_FILE || '/Users/rayan/Downloads/SHOPS-FIROZ STOCK-ALL STOCKS-16-06-26.xlsx';
if (fs.existsSync(SHOPS_FILE)) {
  const wb = XLSX.read(fs.readFileSync(SHOPS_FILE), { type: 'buffer' });
  let parsed: ReturnType<typeof extractFlatItems>[number][] & { category?: string }[] = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
    if (rows.length < 2 || !isFlatStockSheet(rows)) continue;
    const brand = sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    for (const it of extractFlatItems(rows, sheetName, brand)) {
      parsed.push({ ...it, category: brand });
    }
  }
  parsed = dedupeImportItems(parsed);
  const withPrices = applyPreviewPriceFallback(parsed, brands, items, 'add_and_update', 'USD', 'ZMW', fromUSD);
  const a01 = withPrices.find(p => p.name === 'A01' && p.category === 'PANDA');
  check('SHOPS-FIROZ A01/PANDA preview unit cost', a01?.unitCost, 84);
  approx('SHOPS-FIROZ A01/PANDA preview retail ZMW', a01?.retailPrice ?? 0, 3000);
  const drag = withPrices.find(p => p.name === '55CT' && p.category === 'DRAG 80KG');
  check('SHOPS-FIROZ DRAG 55CT preview unit cost', drag?.unitCost, 113);
  approx('SHOPS-FIROZ DRAG 55CT preview retail ZMW', drag?.retailPrice ?? 0, 2500);
} else {
  console.log('SKIP  SHOPS-FIROZ file not found (set SHOPS_FILE to run integration check)');
}

console.log(failures === 0 ? '\n✅ ALL PREVIEW-PRICE CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
