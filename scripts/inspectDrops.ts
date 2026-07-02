/**
 * Inspect dropped rows and dedup collisions in the real warehouse file.
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { extractFlatItems, detectFlatColumns, dedupeImportItems } from '../src/lib/importParser';

const FILE = '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';
const FORBIDDEN = ['DATE', 'PARTICULARS', 'TOTAL', 'GRAND TOTAL', 'CODE', 'ITEM NAME', 'SKU', 'QUANTITY'];

const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });

// 1. Show dropped blank-name rows (might have recoverable data)
console.log('\n=== BLANK-NAME ROWS (potential missed items) ===');
for (const sheetName of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
  if (rows.length < 2) continue;
  const cols = detectFlatColumns(rows);
  for (let i = cols.startIdx; i < rows.length; i++) {
    const row = rows[i] || [];
    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    const codeRaw = cols.codeCol !== -1 ? String(row[cols.codeCol] ?? '').trim() : '';
    let pName = String(row[cols.nameCol] ?? '').trim();
    if (!pName) pName = skuRaw;
    if (!pName) pName = codeRaw;
    const pQty = Math.round(Number(String(row[cols.qtyCol] ?? '').replace(/[^\d.-]/g, '')));
    if ((!pName || pName.length < 2) && (skuRaw || codeRaw || pQty)) {
      console.log(`${sheetName} row ${i+1}: nameCol=${JSON.stringify(row[cols.nameCol])} sku=${skuRaw} code=${codeRaw} qty=${pQty}`);
    }
    if (FORBIDDEN.includes((pName||'').toUpperCase()) && pQty) {
      console.log(`${sheetName} row ${i+1}: FORBIDDEN name=${pName} qty=${pQty}`);
    }
  }
}

// 2. Dedup collisions
console.log('\n=== DEDUP COLLISIONS (same name+sku, different sheets) ===');
const all: { name: string; sku: string; qty: number; category: string; sheet: string }[] = [];
for (const sheetName of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1 });
  if (rows.length < 2) continue;
  const brand = sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
  for (const it of extractFlatItems(rows, sheetName, brand)) {
    all.push({ ...it, category: brand, sheet: sheetName });
  }
}

const keyMap = new Map<string, typeof all>();
for (const it of all) {
  const key = `${it.name.toLowerCase().trim()}_${(it.sku||'').toLowerCase().trim()}`;
  if (!keyMap.has(key)) keyMap.set(key, []);
  keyMap.get(key)!.push(it);
}

let collisionCount = 0;
for (const [key, items] of keyMap) {
  if (items.length > 1) {
    const sheets = new Set(items.map(i => i.sheet));
    if (sheets.size > 1) {
      collisionCount += items.length - 1;
      console.log(`key=${key} sheets=[${[...sheets].join(', ')}] qtys=[${items.map(i=>i.qty).join('+')}]`);
    }
  }
}
console.log(`\nCross-sheet collisions (rows lost to dedup): ${collisionCount}`);

const deduped = dedupeImportItems(all);
console.log(`Pre-dedup: ${all.length}, post-dedup: ${deduped.length}, lost: ${all.length - deduped.length}`);
