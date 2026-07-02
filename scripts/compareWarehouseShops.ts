/**
 * Compare WAREHOUSE vs SHOPS-FIROZ qty for same items; detect save-path collisions.
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import {
  extractFlatItems,
  dedupeImportItems,
  isFlatStockSheet,
} from '../src/lib/importParser';
import {
  findExistingItemForImport,
  findBrandForImport,
  normalizeBrandFromSheet,
  type ImportBrandRef,
  type ImportItemRef,
} from '../src/lib/importLogic';
import { resolveImportSku } from '../src/lib/skuGenerator';

const WH = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';
const SH = process.env.SHOPS_FILE || '/Users/rayan/Downloads/SHOPS-FIROZ STOCK-ALL STOCKS-16-06-26.xlsx';

function parseWorkbook(file: string) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const all: ReturnType<typeof extractFlatItems> = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
    if (rows.length > 1 && isFlatStockSheet(rows)) {
      const brand = normalizeBrandFromSheet(name);
      all.push(...extractFlatItems(rows, name, brand));
    }
  }
  return dedupeImportItems(all);
}

function simulateSaveCollisions(
  preview: ReturnType<typeof dedupeImportItems>,
  brands: ImportBrandRef[],
  catalog: ImportItemRef[]
) {
  const byItemId = new Map<string, { rows: typeof preview; lastQty: number }>();
  for (const p of preview) {
    const matchInput = { ...p, sku: resolveImportSku(p.sku, p.name) };
    const item = findExistingItemForImport(matchInput, brands, catalog);
    const key = item?.id ?? `new:${p.category}:${p.name}:${matchInput.sku}`;
    const targetQty = Math.max(0, (p as { closing?: number }).closing ?? p.qty ?? 0);
    const entry = byItemId.get(key) ?? { rows: [], lastQty: 0 };
    entry.rows.push(p);
    entry.lastQty = targetQty; // save loop overwrites — last wins
    byItemId.set(key, entry);
  }
  return [...byItemId.entries()].filter(([, v]) => v.rows.length > 1);
}

// Build minimal catalog from WAREHOUSE file (simulates post-first-import state)
const whItems = parseWorkbook(WH);
const brands: ImportBrandRef[] = [...new Set(whItems.map(p => p.category))].map((name, i) => ({
  id: `b-${i}`,
  name,
}));
const brandMap = new Map(brands.map(b => [b.name, b]));
const catalog: ImportItemRef[] = whItems.map((p, i) => ({
  id: `item-${i}`,
  brand_id: brandMap.get(p.category)?.id ?? 'b-0',
  name: p.name,
  sku: p.sku,
}));

console.log('\n=== WAREHOUSE vs SHOPS qty diff (same brand+name, qty differs) ===');
const shItems = parseWorkbook(SH);
const whMap = new Map(whItems.map(p => [`${p.category}|${p.name}|${p.sku}`, p]));
let diffs = 0;
for (const s of shItems) {
  const key = `${s.category}|${s.name}|${s.sku}`;
  const w = whMap.get(key);
  if (w && w.qty !== s.qty) {
    if (diffs < 25) console.log(`  ${s.category} / ${s.name} / ${s.sku}: WH=${w.qty} SH=${s.qty}`);
    diffs++;
  }
}
console.log(`Total rows with different qty between files: ${diffs}`);

console.log('\n=== Save collisions (multiple preview rows → same catalog item) ===');
const whCollisions = simulateSaveCollisions(whItems, brands, catalog);
console.log(`WAREHOUSE collisions: ${whCollisions.length}`);
for (const [key, v] of whCollisions.slice(0, 10)) {
  console.log(`  itemId=${key} rows=${v.rows.length} qtys=[${v.rows.map(r => r.qty).join(',')}] LAST WINS=${v.lastQty}`);
  v.rows.forEach(r => console.log(`    - ${r.category} | ${r.name} | ${r.sku} qty=${r.qty}`));
}

// Simulate importing SHOPS into catalog built from WAREHOUSE
console.log('\n=== SHOPS import over WAREHOUSE catalog: qty overwrites ===');
let overwrites = 0;
for (const s of shItems.slice(0, 30)) {
  const matchInput = { ...s, sku: resolveImportSku(s.sku, s.name) };
  const existing = findExistingItemForImport(matchInput, brands, catalog);
  if (existing) {
    const whRow = whItems.find(w => w.name === s.name && w.category === s.category);
    if (whRow && whRow.qty !== s.qty) {
      console.log(`  ${s.category}/${s.name}: catalog would go ${whRow.qty} → ${s.qty}`);
      overwrites++;
    }
  }
}
console.log(`Sample overwrites in first 30 SHOPS rows: ${overwrites}`);

// Specific spot checks
for (const spec of [
  { brand: 'PANDA', name: 'A01' },
  { brand: 'BUGA SUMR', name: 'MIX DRESS' },
  { brand: 'PANDA', name: 'A03' },
]) {
  const w = whItems.find(p => p.category === spec.brand && p.name === spec.name);
  const s = shItems.find(p => p.category === spec.brand && p.name === spec.name);
  console.log(`\n${spec.brand} ${spec.name}: WH qty=${w?.qty} sku=${w?.sku} | SH qty=${s?.qty} sku=${s?.sku}`);
}
