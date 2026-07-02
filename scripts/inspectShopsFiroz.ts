/**
 * Diagnose SHOPS-FIROZ workbook routing and qty extraction.
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  isFlatStockSheet,
  isWarehouseStockSheet,
  detectFlatColumns,
  extractFlatItems,
  dedupeImportItems,
  parseImportQty,
} from '../src/lib/importParser';

const FILE = process.env.SHOPS_FILE || '/Users/rayan/Downloads/SHOPS-FIROZ STOCK-ALL STOCKS-16-06-26.xlsx';

if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
console.log(`\n=== SHOPS-FIROZ: ${FILE} ===`);
console.log(`Sheets: ${wb.SheetNames.length}\n`);

const all: ReturnType<typeof extractFlatItems> = [];

for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
  const flat = isFlatStockSheet(rows);
  const wh = isWarehouseStockSheet(rows);
  const cols = detectFlatColumns(rows);

  console.log(`--- ${name} ---`);
  console.log(`  flat=${flat} warehouse=${wh}`);
  console.log(`  cols: name=${cols.nameCol} qty=${cols.qtyCol} sku=${cols.skuCol} cost=${cols.costCol} retail=${cols.retailCol} start=${cols.startIdx}`);

  // Show header row
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const row = (rows[i] || []).map((c: unknown) => String(c ?? '').trim());
    if (row.some(c => c.length > 0)) {
      console.log(`  row${i}: ${row.slice(0, 10).join(' | ')}`);
    }
  }

  if (flat) {
    const ex = extractFlatItems(rows, name);
    const totalQty = ex.reduce((s, p) => s + p.qty, 0);
    console.log(`  extracted=${ex.length} totalQty=${totalQty}`);
    // Sample first 3 items with raw cell vs parsed
    for (const it of ex.slice(0, 3)) {
      console.log(`    ${it.name} qty=${it.qty} sku=${it.sku}`);
    }
    all.push(...ex);
  } else if (wh) {
    console.log('  → would use warehouse parser (not flat)');
  } else {
    console.log('  → UNRECOGNIZED format');
  }
}

const deduped = dedupeImportItems(all);
console.log(`\nTOTAL: raw=${all.length} deduped=${deduped.length} qty=${deduped.reduce((s, p) => s + p.qty, 0)}`);

// Row-level audit: compare file QUANTITY cell vs parser for first sheet with data
const firstSheet = wb.SheetNames.find(n => {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[n], { header: 1 });
  return isFlatStockSheet(rows);
});
if (firstSheet) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[firstSheet], { header: 1 });
  const cols = detectFlatColumns(rows);
  const extracted = extractFlatItems(rows, firstSheet);
  const byName = new Map(extracted.map(e => [e.name.toUpperCase(), e]));

  console.log(`\nRow-level audit (${firstSheet}, first 15 data rows):`);
  let mismatches = 0;
  for (let i = cols.startIdx; i < Math.min(cols.startIdx + 15, rows.length); i++) {
    const row = rows[i] || [];
    const rawQty = row[cols.qtyCol];
    const fileQty = parseImportQty(rawQty);
    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    const codeRaw = cols.codeCol !== -1 ? String(row[cols.codeCol] ?? '').trim() : '';
    let name = String(row[cols.nameCol] ?? '').trim();
    if (!name) name = skuRaw;
    if (!name) name = codeRaw;
    const parsed = byName.get(name.toUpperCase());
    const match = parsed?.qty === fileQty;
    if (!match && name.length >= 2) mismatches++;
    console.log(`  ${name || '(blank)'} | file[${cols.qtyCol}]=${JSON.stringify(rawQty)} → ${fileQty} | parsed=${parsed?.qty ?? 'N/A'} ${match ? 'OK' : 'MISMATCH'}`);
  }
  console.log(`Mismatches in sample: ${mismatches}`);
}
