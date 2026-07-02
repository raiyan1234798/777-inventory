/**
 * OCR row builder + flat parser (mock text, no Tesseract).
 *
 * Run:
 *   npx esbuild scripts/testOcrImport.ts --bundle --platform=node --format=cjs --outfile=scripts/.tmp.cjs && node scripts/.tmp.cjs && rm -f scripts/.tmp.cjs
 */
import { ocrTextToRows, extractFlatItems, isFlatStockSheet } from '../src/lib/importParser';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

const mockOcr = [
  'CODE    ITEM NAME    SKU    QUANTITY    COST-USD    SELLING PRICE-ZMW',
  'GLV     GLOVES       WINTER GLOVES    5    10    3000',
  'MSW     MOHER SWEATER    MOHER KNIT    3    12    1800',
  'TOTAL',
].join('\n');

const rows = ocrTextToRows(mockOcr);
check('OCR produces header + data rows', rows.length >= 3, true);
check('flat sheet detected from OCR rows', isFlatStockSheet(rows), true);

const items = extractFlatItems(rows, 'OCR', 'OCR Import');
check('OCR flat parse item count', items.length, 2);
check('GLOVES qty', items.find(i => i.name === 'GLOVES')?.qty, 5);
check('TOTAL row excluded', items.some(i => i.name === 'TOTAL'), false);

// Tab-separated line
const tabRows = ocrTextToRows('A01\tMENTSHIRT\t23');
check('tab row splits to 3 cells', tabRows[0].length, 3);

console.log(failures === 0 ? '\n✅ ALL OCR CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
