/**
 * Brand isolation + save qty regression — DRAG 80KG ≠ DRAG 35KG, no qty loss on save.
 *
 * Run:
 *   npx esbuild scripts/testBrandQtyRegression.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  extractFlatItems,
  dedupeImportItems,
  isFlatStockSheet,
  parseImportQty,
  detectFlatColumns,
} from '../src/lib/importParser';
import {
  findBrandForImport,
  findExistingItemForImport,
  normalizeBrandFromSheet,
  normalizeBrandKey,
  normalizeItemKey,
  type ImportBrandRef,
  type ImportItemRef,
} from '../src/lib/importLogic';
import { resolveImportSku } from '../src/lib/skuGenerator';

const WH = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';
const SH = process.env.SHOPS_FILE || '/Users/rayan/Downloads/SHOPS-FIROZ STOCK-ALL STOCKS-16-06-26.xlsx';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const brands: ImportBrandRef[] = [
  { id: 'b-drag-80', name: 'DRAG-80KG' },
  { id: 'b-drag-35', name: 'DRAG-35KG' },
  { id: 'b-panda', name: 'PANDA' },
  { id: 'b-panda-bags', name: 'PANDA-BAGS' },
  { id: 'b-zumba-sum', name: 'ZUMBA-SUM' },
  { id: 'b-zumba-win', name: 'ZUMBA-WIN' },
  { id: 'b-gira-sum', name: 'GIRA-SUMR' },
  { id: 'b-gira-win', name: 'GIRA-WNTR' },
];

check('DRAG 80KG → DRAG-80KG', findBrandForImport('DRAG 80KG', brands)?.id, 'b-drag-80');
check('DRAG 35KG → DRAG-35KG (not 80KG)', findBrandForImport('DRAG 35KG', brands)?.id, 'b-drag-35');
check('PANDA BAGS → PANDA-BAGS (not PANDA)', findBrandForImport('PANDA BAGS', brands)?.id, 'b-panda-bags');
check('ZUMBA SUM ≠ ZUMBA WIN', findBrandForImport('ZUMBA SUM', brands)?.id !== findBrandForImport('ZUMBA WIN', brands)?.id, true);
check('GIRA SUMR ≠ GIRA WNTR', findBrandForImport('GIRA SUMR', brands)?.id !== findBrandForImport('GIRA WNTR', brands)?.id, true);

function parseWorkbook(file: string) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const all: ReturnType<typeof extractFlatItems> = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
    if (rows.length > 1 && isFlatStockSheet(rows)) {
      all.push(...extractFlatItems(rows, name, normalizeBrandFromSheet(name)));
    }
  }
  return dedupeImportItems(all).map(p => ({ ...p, closing: p.qty }));
}

function simulateSave(preview: ReturnType<typeof parseWorkbook>) {
  const localItemsMap = new Map<string, ImportItemRef>();
  const localBrandsMap = new Map<string, ImportBrandRef>();
  const inventoryWrites = new Map<string, { qty: number; rows: typeof preview }>();
  let nextId = 1;

  for (const pItem of preview) {
    const catalogItems = [...localItemsMap.values()];
    const catalogBrands = [...localBrandsMap.values()];
    const matchInput = { ...pItem, sku: resolveImportSku(pItem.sku, pItem.name) };
    let item = findExistingItemForImport(matchInput, catalogBrands, catalogItems);

    if (!item) {
      const brandKey = normalizeBrandKey(pItem.category);
      let brandId = findBrandForImport(pItem.category, catalogBrands)?.id;
      if (!brandId) {
        brandId = `brand-${brandKey}`;
        localBrandsMap.set(brandKey, { id: brandId, name: pItem.category });
      }
      const itemId = `item-${nextId++}`;
      item = { id: itemId, brand_id: brandId, name: pItem.name, sku: matchInput.sku };
      localItemsMap.set(`${brandId}_${normalizeItemKey(pItem.name)}_${normalizeItemKey(item.sku || '')}`, item);
    }

    const targetQty = Math.max(0, pItem.closing ?? pItem.qty ?? 0);
    const entry = inventoryWrites.get(item.id) ?? { qty: 0, rows: [] };
    entry.rows.push(pItem);
    entry.qty = targetQty;
    inventoryWrites.set(item.id, entry);
  }

  let mismatches = 0;
  for (const pItem of preview) {
    for (const [, v] of inventoryWrites) {
      if (v.rows.includes(pItem) && v.qty !== pItem.qty) {
        mismatches++;
        break;
      }
    }
  }
  return mismatches;
}

if (!fs.existsSync(WH)) {
  console.error('Warehouse file not found:', WH);
  process.exit(1);
}

const whPreview = parseWorkbook(WH);
check('WAREHOUSE save: file qty == saved qty for all rows', simulateSave(whPreview), 0);

const drag80 = whPreview.find(p => p.category === 'DRAG 80KG' && p.name === '55CT');
const drag35 = whPreview.find(p => p.category === 'DRAG 35KG' && p.name === '55CT');
check('DRAG 80KG 55CT qty', drag80?.qty, 33);
check('DRAG 35KG 55CT qty', drag35?.qty, 8);
check('PANDA A01 qty', whPreview.find(p => p.category === 'PANDA' && p.name === 'A01')?.qty, 23);
check('BUGA SUMR MIX DRESS qty', whPreview.find(p => p.category === 'BUGA SUMR' && p.name === 'MIX DRESS')?.qty, 27);

// Row-level: file QUANTITY cell vs parser (25 samples across sheets)
const wb = XLSX.read(fs.readFileSync(WH), { type: 'buffer' });
let rowChecks = 0;
let rowMismatches = 0;
for (const sheetName of ['PANDA', 'BUGA-SUMR', 'DRAG-80KG', 'DRAG-35KG', 'A1-SUMR']) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
  const cols = detectFlatColumns(rows);
  const extracted = extractFlatItems(rows, sheetName);
  for (let i = cols.startIdx; i < rows.length && rowChecks < 25; i++) {
    const row = rows[i] || [];
    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    let name = String(row[cols.nameCol] ?? '').trim();
    if (!name) name = skuRaw;
    if (!name || name.length < 2) continue;
    const fileQty = parseImportQty(row[cols.qtyCol]);
    const parsed = extracted.find(e => e.name === name);
    if (!parsed || isNaN(fileQty)) continue;
    rowChecks++;
    if (fileQty !== parsed.qty) rowMismatches++;
  }
}
check(`row-level file vs parser (${rowChecks} samples)`, rowMismatches, 0);

if (fs.existsSync(SH)) {
  const shPreview = parseWorkbook(SH);
  check('SHOPS PANDA A01 shop qty', shPreview.find(p => p.category === 'PANDA' && p.name === 'A01')?.qty, 0);
  check('SHOPS save: no qty loss', simulateSave(shPreview), 0);
}

console.log(failures === 0 ? '\n✅ ALL BRAND/QTY REGRESSION CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
