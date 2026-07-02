/**
 * Brand-aware dedupe: same short code on different brand sheets must stay separate.
 *
 * Run:
 *   npx esbuild scripts/testDedupImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import { dedupeImportItems } from '../src/lib/importParser';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const items = [
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', qty: 92, category: 'PANDA' },
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', qty: 131, category: 'A1 SUMR' },
  { name: 'A03', sku: 'CHILDREN SUMMER WEAR', qty: 5, category: 'PANDA' }, // true duplicate within PANDA
];

const deduped = dedupeImportItems(items);
check('cross-brand A03 stays 2 rows', deduped.length, 2);
check('PANDA A03 qty summed (92+5)', deduped.find(i => i.category === 'PANDA' && i.name === 'A03')?.qty, 97);
check('A1 SUMR A03 qty unchanged', deduped.find(i => i.category === 'A1 SUMR' && i.name === 'A03')?.qty, 131);

// Warehouse-style dedupe preserves closing totals for save path
const whDedup = dedupeImportItems([
  { name: 'SOCKS', sku: 'S1', qty: 10, closing: 10, category: 'BUGA WINT' },
  { name: 'SOCKS', sku: 'S1', qty: 3, closing: 3, category: 'BUGA WINT' },
]);
check('warehouse dedupe closing sum', whDedup[0]?.closing, 13);

console.log(failures === 0 ? '\n✅ ALL DEDUP CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
