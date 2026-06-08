import { generateBrandSKU } from './src/lib/skuGenerator';
console.log(generateBrandSKU('PANDA', 'A01', new Set(), undefined));
console.log(generateBrandSKU('PANDA', 'A01', new Set(), ''));
