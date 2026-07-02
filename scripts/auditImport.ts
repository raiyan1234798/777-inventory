/**
 * Per-sheet import audit — reports rows read, dropped, routing, drop reasons.
 * Run: npx esbuild scripts/auditImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  extractFlatItems,
  detectFlatColumns,
  isFlatStockSheet,
  isWarehouseStockSheet,
  dedupeImportItems,
} from '../src/lib/importParser';

const FILE = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';

const FORBIDDEN = ['DATE', 'PARTICULARS', 'TOTAL', 'GRAND TOTAL', 'CODE', 'ITEM NAME', 'SKU', 'QUANTITY'];

function auditFlatSheet(rows: any[][], sheetName: string) {
  const cols = detectFlatColumns(rows);
  const extracted = extractFlatItems(rows, sheetName);
  let blankName = 0, shortName = 0, forbidden = 0, badQty = 0, dataRows = 0;

  for (let i = cols.startIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    dataRows++;
    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    const codeRaw = cols.codeCol !== -1 ? String(row[cols.codeCol] ?? '').trim() : '';
    let pName = String(row[cols.nameCol] ?? '').trim();
    if (!pName) pName = skuRaw;
    if (!pName) pName = codeRaw;
    const pQty = Math.round(Number(String(row[cols.qtyCol] ?? '').replace(/[^\d.-]/g, '')));

    if (!pName || pName.length < 2) { if (!pName) blankName++; else shortName++; continue; }
    if (isNaN(pQty)) { badQty++; continue; }
    if (FORBIDDEN.includes(pName.toUpperCase())) { forbidden++; continue; }
  }

  return {
    route: 'flat',
    extracted: extracted.length,
    totalQty: extracted.reduce((s, p) => s + p.qty, 0),
    dataRows,
    dropped: dataRows - extracted.length,
    reasons: { blankName, shortName, forbidden, badQty },
    cols,
  };
}

function simulateModalRouting(wb: XLSX.WorkBook) {
  const all: ReturnType<typeof extractFlatItems>[number][] = [];
  const sheetStats: Record<string, any> = {};

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
    if (rows.length < 2) {
      sheetStats[sheetName] = { route: 'skipped_empty', extracted: 0 };
      continue;
    }

    const isFlat = isFlatStockSheet(rows);
    const isWarehouse = isWarehouseStockSheet(rows);

    if (isFlat) {
      const audit = auditFlatSheet(rows, sheetName);
      sheetStats[sheetName] = { ...audit, isFlat, isWarehouse };
      all.push(...extractFlatItems(rows, sheetName, sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim()));
    } else if (isWarehouse) {
      sheetStats[sheetName] = { route: 'warehouse', isFlat, isWarehouse, extracted: '(warehouse parser not in audit)' };
    } else {
      sheetStats[sheetName] = { route: 'unrecognized', isFlat, isWarehouse, extracted: 0 };
    }
  }

  const deduped = dedupeImportItems(all);
  return { sheetStats, raw: all.length, deduped: deduped.length, totalQty: deduped.reduce((s, p) => s + p.qty, 0) };
}

if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
console.log(`\n=== AUDIT: ${FILE} ===`);
console.log(`Sheets: ${wb.SheetNames.length}\n`);

const { sheetStats, raw, deduped, totalQty } = simulateModalRouting(wb);

for (const name of wb.SheetNames) {
  const s = sheetStats[name];
  console.log(`--- ${name} ---`);
  console.log(`  route=${s.route} flat=${s.isFlat} warehouse=${s.isWarehouse}`);
  if (s.extracted !== undefined) console.log(`  extracted=${s.extracted} dropped=${s.dropped ?? 0} dataRows=${s.dataRows ?? 0}`);
  if (s.reasons) console.log(`  drop reasons:`, s.reasons);
  if (s.cols) console.log(`  cols: name=${s.cols.nameCol} qty=${s.cols.qtyCol} sku=${s.cols.skuCol} start=${s.cols.startIdx}`);
}

console.log(`\n=== TOTALS ===`);
console.log(`Raw extracted (pre-dedup): ${raw}`);
console.log(`After dedupe: ${deduped}`);
console.log(`Total qty: ${totalQty}`);
console.log(`Dedup collapsed: ${raw - deduped} rows`);
