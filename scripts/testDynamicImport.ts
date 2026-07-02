/**
 * Proves Smart Stock Import parsing is fully dynamic:
 *   • Two different workbook structures produce different item lists.
 *   • Retail prices stay as ZMW from the file (not USD system fallbacks).
 *   • Simulated "new file upload" clears prior parse results.
 *
 * Run:
 *   npx esbuild scripts/testDynamicImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import * as XLSX from 'xlsx';
import {
  extractFlatItems,
  isFlatStockSheet,
  isWarehouseStockSheet,
  dedupeImportItems,
} from '../src/lib/importParser';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

function parseWorkbook(wb: XLSX.WorkBook) {
  const parsed: ReturnType<typeof extractFlatItems>[number][] = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
    if (rows.length < 2) continue;
    if (isFlatStockSheet(rows)) {
      const brand = wb.SheetNames.length > 1
        ? sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim()
        : 'List Import';
      parsed.push(...extractFlatItems(rows, sheetName, brand));
    } else if (isWarehouseStockSheet(rows)) {
      // Warehouse matrix not simulated here — shops/warehouse flat files use flat path.
    }
  }
  return dedupeImportItems(parsed);
}

// ── File A: warehouse-style flat sheet (GIRA WNTR brand) ─────────────────────
const warehouseAoa: any[][] = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['GLV', 'GLOVES', 'WINTER GLOVES', 5, 10, 3000],
  ['MSW', 'MOHER SWEATER', 'MOHER KNIT SWEATER', 3, 12, 1800],
  ['MUF', 'MUFFLERS', 'WOOL MUFFLER', 7, 8, 1000],
];
const wbA = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbA, XLSX.utils.aoa_to_sheet(warehouseAoa), 'GIRA WNTR');
XLSX.utils.book_append_sheet(wbA, XLSX.utils.aoa_to_sheet([['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'], ['X', 'DUMMY', 'DUMMY SKU', 1, 1, 100]]), 'OTHER');

// ── File B: shops-style flat sheet (different brand + items) ─────────────────
const shopsAoa: any[][] = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['SH1', 'RUNNING SHOES', 'MENS RUNNING SHOES SIZE 42', 12, 45, 2500],
  ['SH2', 'SANDALS', 'LADIES FLAT SANDALS', 8, 30, 1200],
  ['BG1', 'HANDBAG', 'LEATHER HANDBAG BROWN', 4, 55, 4500],
];
const wbB = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbB, XLSX.utils.aoa_to_sheet(shopsAoa), 'FIROZ SHOP');
// Add a second sheet to mimic 23-sheet shops workbook structure
const shopsAoa2: any[][] = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['HT1', 'CAP', 'BASEBALL CAP RED', 20, 5, 350],
];
XLSX.utils.book_append_sheet(wbB, XLSX.utils.aoa_to_sheet(shopsAoa2), 'ACCESSORIES');

const itemsA = parseWorkbook(wbA);
const itemsB = parseWorkbook(wbB);

check('File A GIRA WNTR sheet items', itemsA.filter(i => i.category === 'GIRA WNTR').length, 3);
check('File B item count', itemsB.length, 4);
check('File A has GLOVES', itemsA.some(i => i.name === 'GLOVES'), true);
check('File B has no GLOVES', itemsB.some(i => i.name === 'GLOVES'), false);
check('File B has RUNNING SHOES', itemsB.some(i => i.name === 'RUNNING SHOES'), true);
check('File A has no RUNNING SHOES', itemsA.some(i => i.name === 'RUNNING SHOES'), false);

// Retail must be raw ZMW from file, not USD-converted system values (~166.666)
const gloves = itemsA.find(i => i.name === 'GLOVES');
check('GLOVES retail == 3000 ZMW (not 166.666 USD)', gloves?.retailPrice, 3000);
check('GLOVES retail is NOT USD fallback 166.666', gloves?.retailPrice === 166.666, false);
check('MOHER SWEATER retail == 1800', itemsA.find(i => i.name === 'MOHER SWEATER')?.retailPrice, 1800);
check('RUNNING SHOES retail == 2500', itemsB.find(i => i.name === 'RUNNING SHOES')?.retailPrice, 2500);

// Brand comes from sheet name, not hardcoded
check('File A brand from sheet GIRA WNTR', gloves?.category, 'GIRA WNTR');
check('File B brand from sheet FIROZ SHOP', itemsB.find(i => i.name === 'RUNNING SHOES')?.category, 'FIROZ SHOP');

// Format detection
check('File A sheet detected as flat', isFlatStockSheet(warehouseAoa), true);
check('File A sheet NOT warehouse matrix', isWarehouseStockSheet(warehouseAoa), false);
check('File B sheet detected as flat', isFlatStockSheet(shopsAoa), true);

// Simulated preview clear: parsing B after A must not retain A's items
let preview: typeof itemsA = itemsA;
preview = parseWorkbook(wbB); // "new file uploaded → re-analyze"
check('After re-analyze, preview has File B items only', preview.length, 4);
check('After re-analyze, GLOVES gone from preview', preview.some(i => i.name === 'GLOVES'), false);

console.log(failures === 0 ? '\n✅ ALL DYNAMIC-IMPORT CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
