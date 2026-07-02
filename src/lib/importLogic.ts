/**
 * Import-mode decision logic for the Smart Stock Import.
 *
 * Modes (as shown in the UI):
 *   • "New & Present Stocks" (add_and_update) — import everything: add brand-new
 *     items AND refresh existing ones (including their prices) from the file.
 *   • "Only Present Stocks"  (update_only)    — import the stock physically present
 *     in the shops/warehouses (the file). New items are still added so they enter
 *     the system, but when a brand+item already matches existing system data we
 *     reuse ("call") the existing unit cost / retail price instead of overwriting.
 *   • "Only New Stocks"      (add_new_only)   — only add items that are not yet in
 *     the system; leave already-tracked items untouched.
 */
import { DEFAULT_EXCHANGE_RATES } from './exchangeRates';
import { matchesItemSearch } from './searchUtils';

export type ImportMode = 'add_and_update' | 'update_only' | 'add_new_only';

export interface PreviewImportItem {
  name: string;
  qty: number;
  unitCost: number;
  unitCostCurrency?: string;
  retailPrice: number;
  retailPriceCurrency?: string;
  sku: string;
  category: string;
  minStockLimit?: number;
  opening?: number;
  received?: number;
  supplied?: number;
  returned?: number;
  closing?: number;
  /** Set when preview prices were filled from an existing catalog match. */
  matchedToSystem?: boolean;
  /** True when the file had no SKU value and the item name was used as SKU. */
  skuWasGeneratedFromName?: boolean;
  /** True when brand could not be matched to an existing catalog brand. */
  brandUnresolved?: boolean;
}

export interface ImportBrandRef {
  id: string;
  name: string;
}

export interface ImportItemRef {
  id: string;
  brand_id: string;
  name: string;
  sku: string;
  avg_cost_USD?: number;
  avg_cost_local?: number;
  local_currency?: string;
  retail_price?: number;
}

function defaultFromUSD(amountUSD: number, currency: string): number {
  const rate = DEFAULT_EXCHANGE_RATES[currency] ?? 1;
  return amountUSD * rate;
}

export type ConvertFromUSD = (amountUSD: number, currency: string) => number;

/** Collapse spaces, hyphens, and punctuation so "DRAG 80KG" ≡ "DRAG-80KG". */
export function normalizeBrandKey(name: string): string {
  return (name || '')
    .toUpperCase()
    .replace(/\bBRAND\b/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}

/** Normalize sheet/tab names into a stable brand label for import rows. */
export function normalizeBrandFromSheet(sheetName: string): string {
  return sheetName
    .replace(/-SUMM$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\bBRAND\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Case-insensitive item / SKU key — trim, collapse spaces, normalize slashes. */
export function normalizeItemKey(value: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolve a brand from a parsed import row's category / sheet name.
 * Handles hyphen vs space ("DRAG-80KG" vs "DRAG 80KG") and minor suffix drift.
 */
export function findBrandForImport(
  category: string,
  brands: ImportBrandRef[]
): ImportBrandRef | null {
  const raw = (category || 'Imported').trim();
  if (!raw) return null;

  const key = normalizeBrandKey(raw);
  if (!key) return null;

  const byKey = new Map<string, ImportBrandRef>();
  for (const b of brands) {
    byKey.set(normalizeBrandKey(b.name), b);
  }

  const exact = byKey.get(key);
  if (exact) return exact;

  // Hyphen/space drift only — e.g. "DRAG 80KG" sheet tab ↔ catalog "DRAG-80KG".
  // Do NOT fuzzy-match shared prefixes (DRAG 80KG ≠ DRAG 35KG, PANDA ≠ PANDA-BAGS,
  // ZUMBA-SUM ≠ ZUMBA-WIN) or import rows collapse onto one catalog item and qty breaks.
  return null;
}

/** Long descriptive SKU (not a short CODE like A01 or V-66). */
function isDescriptiveSku(sku: string, name: string): boolean {
  return sku.length > 8 && sku !== name;
}

/** Short item code in shop files (V-66, A01, 55CT) — not a full descriptive name. */
export function isShortItemCode(value: string): boolean {
  const n = (value || '').trim();
  if (!n || n.length > 15 || /\s/.test(n)) return false;
  return /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(n);
}

/**
 * Resolve an existing catalog item for a parsed import row.
 *
 * Strict identity for prices/SKU:
 *   • Primary — brand + item name (case-insensitive).
 *   • Secondary — only when the file item name is a short code (V-66, A01): that
 *     code may match the catalog SKU or name under the same brand.
 * Never matches on brand-only or SKU-only partial overlap.
 */
export function findExistingItemForImport(
  parsed: Pick<PreviewImportItem, 'name' | 'sku' | 'category'>,
  brands: ImportBrandRef[],
  items: ImportItemRef[]
): ImportItemRef | null {
  let matchedBrand = findBrandForImport(parsed.category || 'Imported', brands);

  const normName = normalizeItemKey(parsed.name);
  const normSku = normalizeItemKey(parsed.sku || '');

  const parsedCatNorm = normalizeBrandKey(parsed.category || '');
  const isGenericCategory = !parsedCatNorm || parsedCatNorm === 'LISTIMPORT' || parsedCatNorm === 'IMPORTED';
  const isGenericMatchedBrand = matchedBrand && (normalizeBrandKey(matchedBrand.name) === 'LISTIMPORT' || normalizeBrandKey(matchedBrand.name) === 'IMPORTED');

  // If no brand was provided in the file, or it's a generic fallback brand, try a global search
  if (isGenericCategory || isGenericMatchedBrand || !matchedBrand) {
    // Search across all items by name
    const globalByName = items.filter(it => normalizeItemKey(it.name) === normName);
    
    // If we have an explicit category, try to score matches by brand similarity
    if (!isGenericCategory && parsedCatNorm && globalByName.length > 0) {
      const scoredMatches = globalByName.map(it => {
        const b = brands.find(br => br.id === it.brand_id);
        const bName = b ? normalizeBrandKey(b.name) : '';
        let score = 0;
        
        // Exact match
        if (bName === parsedCatNorm) score = 100;
        // Similarity match (Prefix or Substring)
        else {
          const bNums = bName.match(/\d+/g)?.join('') || '';
          const pNums = parsedCatNorm.match(/\d+/g)?.join('') || '';

          // If both strings have numbers, they MUST match (e.g. 35KG != 80KG)
          if (bNums && pNums && bNums !== pNums) {
            score = 0;
          } else if (bName && parsedCatNorm && (bName.startsWith(parsedCatNorm.slice(0, 4)) || parsedCatNorm.startsWith(bName.slice(0, 4)))) {
            score = 50;
          }
        }
        return { item: it, score, bName };
      });
      
      // Filter to only those with a positive score if we have any
      const validScored = scoredMatches.filter(m => m.score > 0).sort((a, b) => b.score - a.score);
      
      if (validScored.length > 0) {
        // If we have multiple with the same top score, try to tiebreak by SKU
        const topScore = validScored[0].score;
        const topMatches = validScored.filter(m => m.score === topScore).map(m => m.item);
        if (topMatches.length === 1) return topMatches[0];
        
        if (normSku) {
           const skuMatch = topMatches.find(it => normalizeItemKey(it.sku || '') === normSku);
           if (skuMatch) return skuMatch;
        }
        return topMatches[0]; // Fallback to first if tiebreak fails
      }
      
      // If NO valid scored matches (brand is totally different, e.g. PANDA vs A1-SUMM),
      // we DO NOT fallback to a random brand's item if the category was explicitly provided!
      return null;
    }

    // Original generic fallback logic (only for generic/empty categories)
    if (globalByName.length === 1) {
      return globalByName[0];
    } else if (globalByName.length > 1 && normSku) {
      const globalBySku = globalByName.filter(it => normalizeItemKey(it.sku || '') === normSku);
      if (globalBySku.length === 1) {
        return globalBySku[0];
      } else if (globalBySku.length > 1) {
        return globalBySku[0]; // Fallback to first duplicate
      }
    } else if (globalByName.length > 1) {
      return globalByName[0]; // Fallback to first if no SKU provided
    }
  }

  if (!matchedBrand) return null;

  const brandItems = items.filter(it => it.brand_id === matchedBrand.id);
  if (brandItems.length === 0) return null;

  // Primary: brand + item name
  const byName = brandItems.filter(it => normalizeItemKey(it.name) === normName);
  if (byName.length === 1) {
    const it = byName[0];
    const sysSku = normalizeItemKey(it.sku || '');
    if (
      normSku &&
      sysSku &&
      normSku !== sysSku &&
      isDescriptiveSku(normSku, normName) &&
      isDescriptiveSku(sysSku, normName)
    ) {
      return null; // same CODE, different product lines (e.g. 003J ×2)
    }
    return it;
  }
  if (byName.length > 1) {
    if (normSku) {
      const skuMatch = byName.find(it => normalizeItemKey(it.sku || '') === normSku);
      if (skuMatch) return skuMatch;
    }
    return null;
  }

  // Secondary: file short code ↔ catalog SKU (VIP V-66, PANDA A01)
  if (isShortItemCode(parsed.name)) {
    const byCodeAsSku = brandItems.filter(it => normalizeItemKey(it.sku || '') === normName);
    if (byCodeAsSku.length === 1) return byCodeAsSku[0];
  }

  // Name/SKU column swap: file name is descriptive, file SKU is short code
  if (normSku && isShortItemCode(parsed.sku || '')) {
    const swapped = brandItems.filter(
      it => normalizeItemKey(it.name) === normSku && normalizeItemKey(it.sku || '') === normName
    );
    if (swapped.length === 1) return swapped[0];
  }

  // File SKU matches catalog name when file name is the short code (A01 + long sku text)
  if (normSku && isShortItemCode(parsed.name)) {
    const bySkuAsName = brandItems.filter(it => normalizeItemKey(it.name) === normSku);
    if (bySkuAsName.length === 1) return bySkuAsName[0];
  }

  return null;
}

/** Unit cost for preview display in the selected import currency. */
export function getSystemUnitCostForPreview(
  item: Pick<ImportItemRef, 'avg_cost_USD' | 'avg_cost_local' | 'local_currency'>,
  importCurrency: string,
  convertFromUSD: ConvertFromUSD = defaultFromUSD
): number {
  if (importCurrency === 'USD' && item.avg_cost_USD != null && item.avg_cost_USD > 0) {
    return item.avg_cost_USD;
  }
  if (item.local_currency === importCurrency && item.avg_cost_local != null && item.avg_cost_local > 0) {
    return item.avg_cost_local;
  }
  if (item.avg_cost_USD != null && item.avg_cost_USD > 0) {
    return convertFromUSD(item.avg_cost_USD, importCurrency);
  }
  return 0;
}

/** Retail for preview display — stored retail_price is USD; convert to preview currency. */
export function getSystemRetailForPreview(
  item: Pick<ImportItemRef, 'retail_price'>,
  importRetailCurrency: string,
  convertFromUSD: ConvertFromUSD = defaultFromUSD
): number {
  if (item.retail_price == null || item.retail_price <= 0) return 0;
  return convertFromUSD(item.retail_price, importRetailCurrency);
}

export function resolvePreviewUnitCost(
  fileCost: number,
  existing: ImportItemRef | null,
  mode: ImportMode,
  importCurrency: string,
  convertFromUSD: ConvertFromUSD = defaultFromUSD
): number {
  if (!existing) return fileCost;
  const systemCost = getSystemUnitCostForPreview(existing, importCurrency, convertFromUSD);
  if (shouldReuseExistingPrices(mode, true)) return systemCost || fileCost;
  return fileCost > 0 ? fileCost : systemCost;
}

export function resolvePreviewRetailPrice(
  fileRetail: number,
  existing: ImportItemRef | null,
  mode: ImportMode,
  importRetailCurrency: string,
  convertFromUSD: ConvertFromUSD = defaultFromUSD
): number {
  if (!existing) return fileRetail;
  const systemRetail = getSystemRetailForPreview(existing, importRetailCurrency, convertFromUSD);
  if (shouldReuseExistingPrices(mode, true)) return systemRetail || fileRetail;
  return fileRetail > 0 ? fileRetail : systemRetail;
}

/** Apply matched-item system price fallback to parsed preview rows. */
export function applyPreviewPriceFallback<T extends PreviewImportItem>(
  parsedItems: T[],
  brands: ImportBrandRef[],
  items: ImportItemRef[],
  mode: ImportMode,
  importCurrency: string,
  importRetailCurrency: string,
  convertFromUSD: ConvertFromUSD = defaultFromUSD
): T[] {
  if (!parsedItems.length || (!brands.length && !items.length)) return parsedItems;

  return parsedItems.map(pItem => {
    const existing = findExistingItemForImport(pItem, brands, items);
    if (!existing) return pItem;

    const existingBrand = brands.find(b => b.id === existing.brand_id);

    const unitCost = resolvePreviewUnitCost(pItem.unitCost, existing, mode, importCurrency, convertFromUSD);
    const retailPrice = resolvePreviewRetailPrice(pItem.retailPrice, existing, mode, importRetailCurrency, convertFromUSD);

    return {
      ...pItem,
      sku: existing.sku || pItem.sku,
      category: existingBrand ? existingBrand.name : pItem.category,
      skuWasGeneratedFromName: false,
      unitCost,
      retailPrice,
      matchedToSystem: true,
    };
  });
}

/**
 * Whether an item should be skipped entirely for the chosen import mode.
 *
 * Only "Only New Stocks" skips anything (the items already tracked). The other
 * modes always import the present stock, adding brand-new items as needed — this
 * is what previously caused "0 created, 0 updated" on an empty system.
 */
export function shouldSkipImportItem(mode: ImportMode, itemExists: boolean): boolean {
  if (mode === 'add_new_only' && itemExists) return true;
  return false;
}

/**
 * Whether to reuse the existing system prices (unit cost + retail/selling price)
 * for a matched brand+item, instead of overwriting them with the file's values.
 *
 * Applies to "Only Present Stocks" for items already in the system. Brand-new
 * items always take the file's prices regardless of mode.
 */
export function shouldReuseExistingPrices(mode: ImportMode, itemExists: boolean): boolean {
  return itemExists && mode === 'update_only';
}

/** Client-side search for the import preview table (name, SKU, brand, code). */
export function filterImportPreview<T extends PreviewImportItem>(
  items: T[],
  query: string
): { item: T; index: number }[] {
  if (!query.trim()) return items.map((item, index) => ({ item, index }));

  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      const code = (item as PreviewImportItem & { code?: string }).code;
      const brandName = (item as PreviewImportItem & { brandName?: string }).brandName;
      return matchesItemSearch([item.name, item.sku, item.category, code, brandName], query);
    });
}

/** Mark rows whose brand category does not match an existing catalog brand. */
export function annotateImportPreviewFlags<T extends PreviewImportItem>(
  parsedItems: T[],
  brands: ImportBrandRef[]
): T[] {
  return parsedItems.map(pItem => ({
    ...pItem,
    brandUnresolved: !findBrandForImport(pItem.category || 'Imported', brands),
  }));
}
