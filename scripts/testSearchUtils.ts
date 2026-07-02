/**
 * Run: npx esbuild scripts/testSearchUtils.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import { matchesItemSearch } from '../src/lib/searchUtils';

let failures = 0;
function check(label: string, actual: boolean, expected: boolean) {
  const ok = actual === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

const ccrB = ['CCR B', 'CCR B', 'UK SUMMER'];
const ccrOnly = ['CCR', 'CCR', 'GIRA SUMR'];

check('"ccr" matches CCR B', matchesItemSearch(ccrB, 'ccr'), true);
check('"ccr b" matches CCR B', matchesItemSearch(ccrB, 'ccr b'), true);
check('"CCRB" matches CCR B (no space)', matchesItemSearch(ccrB, 'CCRB'), true);
check('"ccr  b" matches CCR B (extra space in query)', matchesItemSearch(ccrB, 'ccr  b'), true);
check('"CCR  B" item matches "ccr b"', matchesItemSearch(['CCR  B', 'CCR B'], 'ccr b'), true);
check('"ccr b" does NOT match CCR only', matchesItemSearch(ccrOnly, 'ccr b'), false);
check('"ccr" matches CCR only', matchesItemSearch(ccrOnly, 'ccr'), true);
check('"uk ccr" matches by tokens', matchesItemSearch(ccrB, 'uk ccr'), true);
check('empty query matches everything', matchesItemSearch(ccrB, ''), true);
check('brand-only token matches', matchesItemSearch(['A03', 'A03', 'PANDA'], 'panda'), true);

console.log(failures === 0 ? '\n✅ ALL SEARCH CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
