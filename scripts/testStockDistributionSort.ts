/**
 * Run: npx esbuild scripts/testStockDistributionSort.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import {
  PRIMARY_WAREHOUSE_NAME,
  sortStockDistribution,
  sortLocationBreakdown,
} from '../src/lib/stockDistribution';

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures++;
}

const rows = sortStockDistribution([
  { id: '1', type: 'shop', name: 'ASAAD SHOP-1', qty: 1 },
  { id: '2', type: 'warehouse', name: PRIMARY_WAREHOUSE_NAME, qty: 3 },
  { id: '3', type: 'shop', name: 'FIROZ SHOP-2', qty: 3 },
  { id: '4', type: 'warehouse', name: 'NEW WAREHOUSE', qty: 5 },
]);

check('primary warehouse is first', rows[0].name === PRIMARY_WAREHOUSE_NAME);
check('other warehouse before shops', rows[1].name === 'NEW WAREHOUSE');
check('shops after warehouses', rows[2].type === 'shop' && rows[3].type === 'shop');
check('shops sorted by name', rows[2].name === 'ASAAD SHOP-1' && rows[3].name === 'FIROZ SHOP-2');

const chips = sortLocationBreakdown([
  { location: 'FIROZ SHOP-2', type: 'shop', quantity: 3 },
  { location: PRIMARY_WAREHOUSE_NAME, type: 'warehouse', quantity: 3 },
  { location: 'ASAAD SHOP-1', type: 'shop', quantity: 1 },
]);
check('breakdown chips: warehouse first', chips[0].location === PRIMARY_WAREHOUSE_NAME);

console.log(failures === 0 ? '\n✅ ALL STOCK SORT CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
