import * as XLSX from 'xlsx';
import { findSkuColumn, resolveImportSku } from '../src/lib/skuGenerator';

// Build a workbook that mirrors the user's "PANDA" sheet:
//   CODE (abbrev) | ITEM NAME (A0x) | SKU (lengthy name) | QUANTITY | COST-USD | SELLING PRICE-ZMW
// Includes one row (A03) intentionally missing a SKU to exercise the fallback.
const aoa: any[][] = [
  ['CODE', 'ITEM NAME', 'SKU', 'QUANTITY', 'COST-USD', 'SELLING PRICE-ZMW'],
  ['MTSS', 'A01', 'MENTSHIRT ROUND / POLO', 23, 84, 3000],
  ['LTSS', 'A02', 'LADIES BODY T SHIRT', 46, 84, 1800],
  ['CCR',  'A03', '',                      92, 84, 2800], // missing SKU -> fallback to name
  ['CMR',  'A04', 'CHILDREN SPRING WEAR',  48, 84, 1700],
];

const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'PANDA');

// Re-read as the importer does (header:1 => array of rows)
const sheet = wb.Sheets['PANDA'];
const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

// ── Replicate the flat-sheet column detection from GlobalImportModal ──────────
const header = (rows[0] || []).map((c: any) => String(c).toUpperCase().trim());
const qtyCol = header.findIndex((c: string) => ['QTY', 'QUANTITY', 'TOTAL', 'REC', 'STOCK'].some(k => c === k || c.startsWith(k)));
const nameCol = header.findIndex((c: string) => ['ITEM', 'NAME', 'PARTICULAR', 'DESCRIPTION', 'PRODUCT'].some(k => c.includes(k)));
const codeCol = findSkuColumn(header); // <-- real helper under test

console.log('Detected columns -> name:', nameCol, ' sku/code:', codeCol, ' qty:', qtyCol);
console.log('SKU source column header:', header[codeCol]);

const results = rows.slice(1).map(row => {
  const name = String(row[nameCol] || '').trim();
  const sku = resolveImportSku(codeCol !== -1 ? String(row[codeCol] || '') : '', name); // <-- real helper
  return { name, sku };
});

console.table(results);

// ── Assertions ───────────────────────────────────────────────────────────────
const expected = [
  { name: 'A01', sku: 'MENTSHIRT ROUND / POLO' },
  { name: 'A02', sku: 'LADIES BODY T SHIRT' },
  { name: 'A03', sku: 'A03' }, // fell back to item name (no SKU present)
  { name: 'A04', sku: 'CHILDREN SPRING WEAR' },
];

let pass = true;
if (header[codeCol] !== 'SKU') {
  console.error(`FAIL: expected SKU column to be chosen, got "${header[codeCol]}"`);
  pass = false;
}
for (let i = 0; i < expected.length; i++) {
  if (results[i].sku !== expected[i].sku) {
    console.error(`FAIL row ${i}: expected sku "${expected[i].sku}", got "${results[i].sku}"`);
    pass = false;
  }
}

if (pass) {
  console.log('\n✅ ALL CHECKS PASSED — SKU uses the lengthy column value verbatim, with item-name fallback when empty.');
  process.exit(0);
} else {
  console.error('\n❌ CHECKS FAILED');
  process.exit(1);
}
