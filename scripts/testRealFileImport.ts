/**
 * Verification: parse the user's REAL workbook through the actual parsing helper
 * (`extractFlatItems` from src/lib/importParser) — the same code the Smart Stock
 * Import uses — and assert item count + ZMW retail values.
 *
 * Run:
 *   npx esbuild scripts/testRealFileImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  extractFlatItems,
  dedupeImportItems,
  isFlatStockSheet,
} from '../src/lib/importParser';

const FILE = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';

/** Expected extracted row counts per sheet (from auditImport.ts baseline). */
const EXPECTED_SHEET_COUNTS: Record<string, number> = {
  'PANDA': 53,
  'PANDA-BAGS': 7,
  'UK-SUMMER': 61,
  'UK-WINTER': 30,
  'HB-SUMMER': 90,
  'HB-WINTER': 23,
  'DRAG-80KG': 30,
  'GER-SHOES': 1,
  'DRAG-35KG': 40,
  'USA': 1,
  'LOGO-888': 18,
  'ZUMBA-SUM': 88,
  'ZUMBA-WIN': 20,
  'SK-80': 5,
  'SK-100': 3,
  'A1-SUMR': 66,
  'MUKA': 55,
  'VIP': 51,
  'BUGA-SUMR': 75,
  'BUGA-WINT': 27,
  'TIGER': 3,
  'A1-WINTER': 24,
  'GIRA-SUMR': 77,
  'GIRA-WNTR': 36,
};

/** Expected per-sheet quantity totals (sum of QUANTITY column, parser rules). */
const EXPECTED_SHEET_QTY: Record<string, number> = {
  'PANDA': 1329,
  'PANDA-BAGS': 1229,
  'UK-SUMMER': 65,
  'UK-WINTER': 965,
  'HB-SUMMER': 1632,
  'HB-WINTER': 1109,
  'DRAG-80KG': 440,
  'GER-SHOES': 18,
  'DRAG-35KG': 1075,
  'USA': 127,
  'LOGO-888': 1334,
  'ZUMBA-SUM': 556,
  'ZUMBA-WIN': 181,
  'SK-80': 632,
  'SK-100': 645,
  'A1-SUMR': 626,
  'MUKA': 427,
  'VIP': 272,
  'BUGA-SUMR': 473,
  'BUGA-WINT': 625,
  'TIGER': 202,
  'A1-WINTER': 1185,
  'GIRA-SUMR': 42,
  'GIRA-WNTR': 1,
};

if (!fs.existsSync(FILE)) {
  console.error('Warehouse file not found:', FILE);
  console.error('Set WAREHOUSE_FILE env var to the .xlsx path.');
  process.exit(1);
}

let failures = 0;
function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const buf = fs.readFileSync(FILE);
const wb = XLSX.read(buf, { type: 'buffer' });

const all: any[] = [];
const perSheet: Record<string, { count: number; qty: number }> = {};

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
  if (rows.length > 1 && isFlatStockSheet(rows)) {
    const brand = name.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    const extracted = extractFlatItems(rows, name, brand);
    perSheet[name] = {
      count: extracted.length,
      qty: extracted.reduce((s, p) => s + (p.qty || 0), 0),
    };
    all.push(...extracted);
  }
}

const rawQty = all.reduce((s, p) => s + (p.qty || 0), 0);
const deduped = dedupeImportItems(all);
const totalItems = deduped.length;
const totalQty = deduped.reduce((s, p) => s + (p.qty || 0), 0);

console.log(`\nParsed ${all.length} raw rows → ${totalItems} after brand-aware dedupe, total qty ${totalQty}, across ${wb.SheetNames.length} sheets.\n`);

for (const [sheet, expected] of Object.entries(EXPECTED_SHEET_COUNTS)) {
  check(`sheet ${sheet} row count`, perSheet[sheet]?.count ?? 0, expected);
}

for (const [sheet, expected] of Object.entries(EXPECTED_SHEET_QTY)) {
  check(`sheet ${sheet} qty total`, perSheet[sheet]?.qty ?? 0, expected);
}

check('raw rows before dedupe == 884', all.length, 884);
check('total item rows after brand-aware dedupe == 883', totalItems, 883);
check('total quantity == 15190', totalQty, 15190);
check('dedupe preserves total qty (no qty loss)', totalQty, rawQty);

// Dedup sums qty for true duplicates (BUGA-WINT SOCKS ×2 on same sheet)
const dedupPairs = [
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', category: 'PANDA', a: 92, b: 5, sum: 97 },
];
for (const p of dedupPairs) {
  const merged = dedupeImportItems([
    { name: p.name, sku: p.sku, qty: p.a, category: p.category },
    { name: p.name, sku: p.sku, qty: p.b, category: p.category },
  ]);
  check(`${p.name} dedupe sums qty (${p.a}+${p.b})`, merged[0]?.qty, p.sum);
}

// Cross-brand same short code stays separate
const crossBrand = dedupeImportItems([
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', qty: 92, category: 'PANDA' },
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', qty: 131, category: 'A1 SUMR' },
]);
check('A03 PANDA vs A1-SUMR both kept', crossBrand.length, 2);

// The two rows previously dropped (name in SKU column, ITEM NAME blank) are recovered.
const soccer = deduped.find(p => p.name === 'SOCCER SHOES');
const crocs = deduped.find(p => p.name === 'CROCS-SLIPPER');
check('recovered SOCCER SHOES (qty 3)', soccer?.qty, 3);
check('recovered CROCS-SLIPPER (qty 8)', crocs?.qty, 8);

// Sample quantity spot-checks (file QUANTITY column → preview qty)
const pandaSample = (n: string) => deduped.find(p => p.name === n && p.category === 'PANDA');
const bugaMix = deduped.find(p => p.category === 'BUGA SUMR' && p.name === 'MIX DRESS');
check('BUGA SUMR MIX DRESS qty == 27', bugaMix?.qty, 27);
check('PANDA A01 qty == 23', pandaSample('A01')?.qty, 23);

// (b) ZMW retail read correctly (verbatim) for sampled PANDA items.
const sample = pandaSample;
check('A01 retail == 3000 ZMW', sample('A01')?.retailPrice, 3000);
check('A01 cost  == 84 USD',    sample('A01')?.unitCost, 84);
check('A02 retail == 1800 ZMW', sample('A02')?.retailPrice, 1800);
check('A04 retail == 1700 ZMW', sample('A04')?.retailPrice, 1700);
check('A05 retail == 1500 ZMW', sample('A05')?.retailPrice, 1500);

// No priced row should silently lose its retail value.
const zeroRetail = deduped.filter(p => !p.retailPrice).length;
check('rows with retail==0 (only the genuinely blank ones)', zeroRetail, 0);

console.log(failures === 0 ? '\n✅ ALL REAL-FILE CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
