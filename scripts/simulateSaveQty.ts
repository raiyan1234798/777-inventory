/**
 * Simulate executeFinalImport matching loop — detect rows that collapse to same itemId.
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
  normalizeBrandKey,
  normalizeItemKey,
  type ImportBrandRef,
  type ImportItemRef,
} from '../src/lib/importLogic';
import { resolveImportSku } from '../src/lib/skuGenerator';

const FILE = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';

function parsePreview() {
  const wb = XLSX.read(fs.readFileSync(FILE), { type: 'buffer' });
  const all: ReturnType<typeof extractFlatItems> = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1 });
    if (rows.length > 1 && isFlatStockSheet(rows)) {
      all.push(...extractFlatItems(rows, name, normalizeBrandFromSheet(name)));
    }
  }
  return dedupeImportItems(all).map(p => ({
    ...p,
    closing: p.qty,
  }));
}

function simulateImportLoop(preview: ReturnType<typeof parsePreview>, existingBrands: ImportBrandRef[], existingItems: ImportItemRef[]) {
  const localItemsMap = new Map<string, ImportItemRef>();
  existingItems.forEach(it => {
    localItemsMap.set(`${it.brand_id}_${normalizeItemKey(it.name)}_${normalizeItemKey(it.sku || '')}`, it);
  });
  const localBrandsMap = new Map<string, ImportBrandRef>();
  existingBrands.forEach(b => localBrandsMap.set(normalizeBrandKey(b.name), b));

  const inventoryWrites = new Map<string, { qty: number; rows: typeof preview }>();
  let nextId = 1000;

  for (const pItem of preview) {
    const catalogItems = [...existingItems, ...Array.from(localItemsMap.values())];
    const brands = [...existingBrands, ...Array.from(localBrandsMap.values())];
    const matchInput = { ...pItem, sku: resolveImportSku(pItem.sku, pItem.name) };
    let item = findExistingItemForImport(matchInput, brands, catalogItems);

    if (!item) {
      const brandKey = normalizeBrandKey(pItem.category);
      let brandId = findBrandForImport(pItem.category, brands)?.id ?? localBrandsMap.get(brandKey)?.id;
      if (!brandId) {
        brandId = `new-brand-${brandKey}`;
        localBrandsMap.set(brandKey, { id: brandId, name: pItem.category });
      }
      const itemId = `new-item-${nextId++}`;
      item = {
        id: itemId,
        brand_id: brandId,
        name: pItem.name,
        sku: matchInput.sku,
      };
      localItemsMap.set(`${brandId}_${normalizeItemKey(pItem.name)}_${normalizeItemKey(item.sku || '')}`, item);
    }

    const targetQty = Math.max(0, pItem.closing ?? pItem.qty ?? 0);
    const invKey = item.id;
    const entry = inventoryWrites.get(invKey) ?? { qty: 0, rows: [] };
    entry.rows.push(pItem);
    entry.qty = targetQty; // last wins
    inventoryWrites.set(invKey, entry);
  }

  return inventoryWrites;
}

const preview = parsePreview();
console.log(`Preview rows: ${preview.length}`);

// Empty catalog (first import)
const emptyWrites = simulateImportLoop(preview, [], []);
const emptyCollisions = [...emptyWrites.entries()].filter(([, v]) => v.rows.length > 1);
console.log(`\nFirst import — rows mapping to same itemId: ${emptyCollisions.length}`);
for (const [id, v] of emptyCollisions.slice(0, 15)) {
  console.log(`  itemId=${id} LAST qty=${v.qty} from ${v.rows.length} rows:`);
  v.rows.forEach(r => console.log(`    ${r.category} | ${r.name} | ${r.sku} qty=${r.qty}`));
}

// Compare file qty vs final saved qty for spot items
function checkSpot(name: string, brand: string, writes: Map<string, { qty: number; rows: typeof preview }>) {
  const fileRow = preview.find(p => p.name === name && p.category === brand);
  if (!fileRow) return;
  const matchInput = { ...fileRow, sku: resolveImportSku(fileRow.sku, fileRow.name) };
  // find which inv key got this row
  for (const [, v] of writes) {
    if (v.rows.some(r => r.name === name && r.category === brand)) {
      const saved = v.qty;
      const fileQty = fileRow.qty;
      const ok = saved === fileQty;
      console.log(`${ok ? 'OK' : 'MISMATCH'} ${brand}/${name}: file=${fileQty} saved=${saved}${v.rows.length > 1 ? ` (${v.rows.length} rows collapsed)` : ''}`);
      return;
    }
  }
  console.log(`NOT FOUND ${brand}/${name}`);
}

console.log('\nSpot checks (file qty vs simulated save qty):');
checkSpot('A01', 'PANDA', emptyWrites);
checkSpot('MIX DRESS', 'BUGA SUMR', emptyWrites);
checkSpot('A03', 'PANDA', emptyWrites);
checkSpot('003J', 'PANDA', emptyWrites);

// Row-level: every preview row file qty should equal saved qty when no collisions
let mismatchCount = 0;
for (const p of preview) {
  const matchInput = { ...p, sku: resolveImportSku(p.sku, p.name) };
  let savedQty = -1;
  let collision = false;
  for (const [, v] of emptyWrites) {
    if (v.rows.some(r => r === p)) {
      savedQty = v.qty;
      collision = v.rows.length > 1;
      break;
    }
  }
  if (savedQty !== p.qty) {
    mismatchCount++;
    if (mismatchCount <= 10) {
      console.log(`QTY LOSS: ${p.category}/${p.name}/${p.sku} file=${p.qty} saved=${savedQty} collision=${collision}`);
    }
  }
}
console.log(`\nTotal preview rows where saved qty != file qty: ${mismatchCount}`);
