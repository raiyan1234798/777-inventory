/**
 * Verify SHOPS-ZAAKI catalog SKU + badge behavior against warehouse catalog.
 */
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { extractFlatItems, isFlatStockSheet, dedupeImportItems } from '../src/lib/importParser';
import { applyPreviewPriceFallback, findExistingItemForImport } from '../src/lib/importLogic';

const ZAAKI = process.env.SHOPS_FILE || '/Users/rayan/Downloads/SHOPS-ZAAKI STOCK-ALL STOCKS-16-06-26.xlsx';
const WH = process.env.WAREHOUSE_FILE || '/Users/rayan/Downloads/WAREHOUSE STOCK-ALL STOCKS-16-06-26.xlsx';

function buildCatalog(file: string) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const brands: { id: string; name: string }[] = [];
  const items: { id: string; brand_id: string; name: string; sku: string; avg_cost_USD: number; retail_price: number }[] = [];
  const brandMap = new Map<string, { id: string; name: string }>();
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as any[][];
    if (!isFlatStockSheet(rows)) continue;
    const brand = name.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    if (!brandMap.has(brand)) {
      const id = 'b-' + brandMap.size;
      brandMap.set(brand, { id, name: brand });
      brands.push({ id, name: brand });
    }
    for (const it of extractFlatItems(rows, name, brand)) {
      items.push({
        id: 'i-' + items.length,
        brand_id: brandMap.get(brand)!.id,
        name: it.name,
        sku: it.sku,
        avg_cost_USD: 10,
        retail_price: 50,
      });
    }
  }
  return { brands, items };
}

function parseShops(file: string) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  let parsed: ReturnType<typeof extractFlatItems>[number][] = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 }) as any[][];
    if (!isFlatStockSheet(rows)) continue;
    const brand = name.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    parsed.push(...extractFlatItems(rows, name, brand));
  }
  return dedupeImportItems(parsed);
}

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

if (!fs.existsSync(ZAAKI) || !fs.existsSync(WH)) {
  console.log('SKIP  ZAAKI/WH files not found');
  process.exit(0);
}

const { brands, items } = buildCatalog(WH);
const parsed = parseShops(ZAAKI);
const preview = applyPreviewPriceFallback(parsed, brands, items, 'update_only', 'USD', 'ZMW');

check('ZAAKI row count', parsed.length, 881);
check('ZAAKI no-SKU before fallback', parsed.filter(p => p.skuWasGeneratedFromName).length, 530);

const matched = preview.filter(p => p.matchedToSystem);
const stillNoSku = preview.filter(p => p.skuWasGeneratedFromName);
check('ZAAKI catalog matches', matched.length, 881);
check('ZAAKI no NO-SKU badge after match', stillNoSku.length, 0);

const v66 = preview.find(p => p.category === 'VIP' && p.name === 'V-66');
check('VIP V-66 matched', v66?.matchedToSystem, true);
check('VIP V-66 catalog SKU', v66?.sku, 'WOMAN CROPPED PANTS');
check('VIP V-66 no NO-SKU badge', v66?.skuWasGeneratedFromName, false);

const menWhite = preview.find(p => p.category === 'UK SUMMER' && p.name === 'Men White Shirt A');
check('UK SUMMER Men White Shirt A matched', menWhite?.matchedToSystem, true);
check('UK SUMMER Men White Shirt A no NO-SKU badge', menWhite?.skuWasGeneratedFromName, false);
check(
  'UK SUMMER Men White Shirt A uses catalog SKU',
  menWhite?.sku === findExistingItemForImport(menWhite!, brands, items)?.sku,
  true
);

console.log(failures === 0 ? '\n✅ ZAAKI VERIFICATION PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
