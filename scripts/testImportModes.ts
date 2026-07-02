import { shouldSkipImportItem, shouldReuseExistingPrices, type ImportMode } from '../src/lib/importLogic';

let failures = 0;
function check(label: string, actual: any, expected: any) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

// ── shouldSkipImportItem ──────────────────────────────────────────────────────
// Reproduces the original bug: "Only Present Stocks" on an empty system.
check('update_only + item NOT in system → import (no skip)', shouldSkipImportItem('update_only', false), false);
check('update_only + item in system → import (no skip)',     shouldSkipImportItem('update_only', true),  false);
check('add_and_update + new item → import',                  shouldSkipImportItem('add_and_update', false), false);
check('add_and_update + existing item → import',             shouldSkipImportItem('add_and_update', true),  false);
check('add_new_only + new item → import',                    shouldSkipImportItem('add_new_only', false), false);
check('add_new_only + existing item → SKIP',                 shouldSkipImportItem('add_new_only', true),  true);

// ── shouldReuseExistingPrices ────────────────────────────────────────────────
check('update_only + matched item → reuse system prices', shouldReuseExistingPrices('update_only', true),  true);
check('update_only + new item → use file prices',         shouldReuseExistingPrices('update_only', false), false);
check('add_and_update + matched item → use file prices',  shouldReuseExistingPrices('add_and_update', true), false);
check('add_new_only + matched item → use file prices',    shouldReuseExistingPrices('add_new_only', true),  false);

// ── Simulated import on an EMPTY system (the user's exact scenario) ───────────
// 882-style file, system has 0 items. Previously update_only imported 0.
type Row = { name: string; cost: number; retail: number };
const file: Row[] = [
  { name: 'A01', cost: 84, retail: 3000 },
  { name: 'A02', cost: 84, retail: 1800 },
  { name: 'A03', cost: 84, retail: 2800 },
];
const systemItems = new Map<string, { avg_cost_USD: number; retail_price: number }>(); // empty

function simulate(mode: ImportMode, system: Map<string, { avg_cost_USD: number; retail_price: number }>) {
  let created = 0, updated = 0;
  const persisted: Record<string, { cost: number; retail: number }> = {};
  for (const r of file) {
    const existing = system.get(r.name);
    if (shouldSkipImportItem(mode, !!existing)) continue;
    const reuse = shouldReuseExistingPrices(mode, !!existing);
    if (!existing) {
      created++;
      persisted[r.name] = { cost: r.cost, retail: r.retail };
    } else {
      updated++;
      persisted[r.name] = reuse
        ? { cost: existing.avg_cost_USD, retail: existing.retail_price } // call system data
        : { cost: r.cost, retail: r.retail };
    }
  }
  return { created, updated, persisted };
}

const emptyResult = simulate('update_only', systemItems);
check('EMPTY system + "Only Present Stocks" → 3 items created', emptyResult.created, 3);
check('EMPTY system + "Only Present Stocks" → 0 updated',       emptyResult.updated, 0);

// ── Re-import where items already exist with established system prices ────────
const populated = new Map([
  ['A01', { avg_cost_USD: 50, retail_price: 9999 }], // established (different from file)
  ['A02', { avg_cost_USD: 60, retail_price: 8888 }],
]);
const reimport = simulate('update_only', populated);
check('re-import matched A01 reuses system retail 9999', reimport.persisted['A01']?.retail, 9999);
check('re-import matched A02 reuses system cost 60',     reimport.persisted['A02']?.cost, 60);
check('re-import new A03 uses file retail 2800',         reimport.persisted['A03']?.retail, 2800);

const fullSync = simulate('add_and_update', populated);
check('"New & Present" overwrites A01 retail with file 3000', fullSync.persisted['A01']?.retail, 3000);

console.log(failures === 0 ? '\n✅ ALL IMPORT-MODE CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
