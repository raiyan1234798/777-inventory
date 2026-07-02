/**
 * Flat-list stock-sheet parser (single source of truth).
 *
 * The Smart Stock Import "Flat List (Smart Detect)" path parses workbooks whose
 * sheets each look like:
 *
 *   CODE | ITEM NAME | SKU | QUANTITY | COST-USD | SELLING PRICE-ZMW
 *
 * This module holds the *pure* parsing logic (no React / no store access) so it
 * can be unit-tested directly against the user's real workbook. Raw column values
 * come from the file; matched-item system price fallback for preview is applied
 * afterward in importLogic.applyPreviewPriceFallback (save-time rules in
 * shouldReuseExistingPrices).
 *
 * Currency model (documented so import + display stay consistent):
 *   • COST-USD column        → unit cost, already in USD.
 *   • SELLING PRICE-ZMW col  → retail price, read VERBATIM in ZMW. The component
 *     later converts it to USD for storage (retail_price is stored in USD).
 */
import { normalizeBrandFromSheet, normalizeBrandKey, normalizeItemKey } from './importLogic';
import { findSkuColumn, resolveImportSku } from './skuGenerator';

export interface FlatColumns {
  nameCol: number;
  qtyCol: number;
  skuCol: number;
  codeCol: number;
  costCol: number;
  retailCol: number;
  startIdx: number;
}

export interface FlatParsedItem {
  name: string;
  qty: number;
  unitCost: number;
  retailPrice: number;
  sku: string;
  code: string;
  category: string;
  /** True when the file SKU cell was blank and item name was used as SKU. */
  skuWasGeneratedFromName?: boolean;
}

/** Names that are never real items (headers / totals). */
const FORBIDDEN_NAMES = ['DATE', 'PARTICULARS', 'TOTAL', 'GRAND TOTAL', 'CODE', 'ITEM NAME', 'SKU', 'QUANTITY'];

const QTY_HEADERS = ['QTY', 'QUANTITY', 'CLS', 'CLOSING', 'BALANCE', 'STOCK', 'REC'];

/** Parse a spreadsheet cell into an integer quantity (blank → 0, invalid text → NaN). */
export function parseImportQty(raw: unknown): number {
  const str = String(raw ?? '').trim();
  if (!str) return 0;
  const cleaned = str.replace(/[^\d.-]/g, '');
  if (!cleaned) return NaN;
  const n = Math.round(Number(cleaned));
  return isNaN(n) ? NaN : n;
}

const DEDUPE_QTY_FIELDS = ['closing', 'opening', 'received', 'supplied', 'returned'] as const;
const ITEM_HEADERS = ['ITEM', 'NAME', 'PARTICULAR', 'DESCRIPTION', 'PRODUCT'];
const WAREHOUSE_QTY_HEADERS = ['OPENING', 'CLOSING', 'RECEIVED', 'SUPPLIED', 'RETURNED', 'SALES'];

/**
 * True when a sheet uses the flat list layout (CODE | ITEM NAME | SKU | QUANTITY | …).
 * Used to route each sheet independently instead of forcing the warehouse matrix parser.
 * Warehouse matrix sheets (OPENING/RECEIVED/CLOSING …) take priority — they also match
 * qty-like headers such as CLOSING and must not be parsed as flat lists.
 */
export function isFlatStockSheet(sheetRows: any[][]): boolean {
  if (!sheetRows || sheetRows.length < 2) return false;
  if (isWarehouseStockSheet(sheetRows)) return false;
  for (let i = 0; i < Math.min(20, sheetRows.length); i++) {
    const row = (sheetRows[i] || []).map((c: any) => String(c).toUpperCase().trim());
    const hasQty = row.some(c => QTY_HEADERS.some(k => c === k || c.startsWith(k)));
    const hasItem = row.some(c => ITEM_HEADERS.some(k => c.includes(k)));
    const hasSelling = row.some(c => c.includes('SELLING') || c.includes('RETAIL'));
    if (hasQty && (hasItem || hasSelling)) return true;
  }
  return false;
}

/**
 * True when a sheet uses the legacy warehouse matrix (OPENING / CLOSING / RECEIVED …).
 */
export function isWarehouseStockSheet(sheetRows: any[][]): boolean {
  if (!sheetRows || sheetRows.length < 3) return false;
  for (let i = 0; i < Math.min(10, sheetRows.length); i++) {
    const row = (sheetRows[i] || []).map((c: any) => String(c || '').toUpperCase().trim());
    const hasItem = row.some(c => ITEM_HEADERS.some(k => c.includes(k)));
    const hasWarehouseCols = row.some(c => WAREHOUSE_QTY_HEADERS.some(k => c.includes(k)));
    if (hasItem && hasWarehouseCols) return true;
  }
  return false;
}

/**
 * Dedupe parsed rows by brand + name + sku, summing quantities only for true duplicates
 * (same brand sheet context). Distinct brands sharing a short code (e.g. A03 on PANDA vs
 * A1-SUMR) must remain separate rows.
 */
export function dedupeImportItems<T extends { name: string; sku?: string; qty: number; category?: string }>(items: T[]): T[] {
  const deduped = new Map<string, T>();
  for (const item of items) {
    const brandKey = normalizeBrandKey(item.category ?? '');
    const nameKey = normalizeItemKey(item.name);
    const codeKey = normalizeItemKey(item.sku ?? '');
    const key = `${brandKey}_${nameKey}_${codeKey}`;
    const existing = deduped.get(key);
    if (existing) {
      existing.qty += item.qty;
      for (const field of DEDUPE_QTY_FIELDS) {
        if (field in item || field in existing) {
          (existing as Record<string, number>)[field] =
            ((existing as Record<string, number>)[field] ?? 0) +
            ((item as Record<string, number>)[field] ?? 0);
        }
      }
      if ('skuWasGeneratedFromName' in item && (item as { skuWasGeneratedFromName?: boolean }).skuWasGeneratedFromName) {
        (existing as { skuWasGeneratedFromName?: boolean }).skuWasGeneratedFromName = true;
      }
    } else {
      deduped.set(key, { ...item });
    }
  }
  return Array.from(deduped.values());
}

export interface FlatParseStats {
  dataRows: number;
  extracted: number;
  dropped: number;
  blankName: number;
  shortName: number;
  forbidden: number;
  badQty: number;
}

/** Count why rows were excluded during flat extraction (for import status / tests). */
export function countFlatParseExclusions(sheetRows: any[][]): FlatParseStats {
  const cols = detectFlatColumns(sheetRows);
  let blankName = 0;
  let shortName = 0;
  let forbidden = 0;
  let badQty = 0;
  let dataRows = 0;

  for (let i = cols.startIdx; i < sheetRows.length; i++) {
    const row = sheetRows[i] || [];
    dataRows++;
    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    const codeRaw = cols.codeCol !== -1 ? String(row[cols.codeCol] ?? '').trim() : '';
    let pName = String(row[cols.nameCol] ?? '').trim();
    if (!pName) pName = skuRaw;
    if (!pName) pName = codeRaw;
    const pQty = parseImportQty(row[cols.qtyCol]);

    if (!pName) { blankName++; continue; }
    if (pName.length < 2) { shortName++; continue; }
    if (isNaN(pQty)) { badQty++; continue; }
    if (FORBIDDEN_NAMES.includes(pName.toUpperCase())) { forbidden++; continue; }
  }

  const extracted = dataRows - blankName - shortName - forbidden - badQty;
  return {
    dataRows,
    extracted,
    dropped: blankName + shortName + forbidden + badQty,
    blankName,
    shortName,
    forbidden,
    badQty,
  };
}

/**
 * Convert OCR / plain-text lines into tabular rows for flat parsing.
 * Handles tab-separated, multi-space columns, and simple "name qty" lines.
 */
export function ocrTextToRows(text: string): any[][] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.map(line => {
    if (line.includes('\t')) {
      return line.split('\t').map(c => c.trim());
    }
    const multiSpace = line.split(/\s{2,}/).map(c => c.trim()).filter(c => c.length > 0);
    if (multiSpace.length >= 3) return multiSpace;

    // "ITEM NAME 123" or "CODE ITEM NAME 12 84 3000"
    const tokens = line.split(/\s+/);
    if (tokens.length >= 2) {
      const last = tokens[tokens.length - 1];
      if (/^-?\d+(?:\.\d+)?$/.test(last)) {
        return [tokens.slice(0, -1).join(' '), last];
      }
    }
    return [line];
  });
}

/**
 * Detect the column layout of a flat stock sheet by scanning the first rows for
 * a quantity-like header. Returns -1 for any column that can't be found.
 */
export function detectFlatColumns(sheetRows: any[][]): FlatColumns {
  let nameCol = -1;
  let qtyCol = -1;
  let skuCol = -1;
  let codeCol = -1;
  let costCol = -1;
  let retailCol = -1;
  let startIdx = 0;

  for (let i = 0; i < Math.min(20, sheetRows.length); i++) {
    const row = (sheetRows[i] || []).map((c: any) => String(c).toUpperCase().trim());
    // Prefer explicit QUANTITY/QTY headers; never match COST/SELLING price columns.
    let qIdx = row.findIndex((c: string) => c === 'QUANTITY' || c === 'QTY' || c.startsWith('QUANTITY') || c === 'TOTAL QTY' || c === 'TOTAL QUANTITY' || c === 'TOTAL' || c.endsWith('QTY'));
    if (qIdx === -1) {
      qIdx = row.findIndex((c: string) => ['CLS', 'CLOSING', 'BALANCE'].some(k => c === k || c.startsWith(k)));
    }
    if (qIdx === -1) {
      qIdx = row.findIndex((c: string) => ['STOCK', 'REC'].some(k => c === k || c.startsWith(k)));
    }

    if (qIdx !== -1) {
      qtyCol = qIdx;
      const nIdx = row.findIndex((c: string) => ['ITEM', 'NAME', 'PARTICULAR', 'DESCRIPTION', 'PRODUCT'].some(k => c.includes(k)));
      nameCol = nIdx !== -1 ? nIdx : 0;

      // SKU = the lengthy descriptive column (preferred), falling back to a CODE column.
      skuCol = findSkuColumn(row);
      // The short CODE column, tracked separately so it can back-fill a blank name.
      codeCol = row.findIndex((c: string) => c.includes('CODE'));
      costCol = row.findIndex((c: string) =>
        (c.includes('COST') || (c.includes('PRICE') && !c.includes('SELLING')) || c === 'COST') &&
        !c.includes('RETAIL') && !c.includes('SELLING') && !c.includes('QUANTITY')
      );
      retailCol = row.findIndex((c: string) => c.includes('SELLING') || c.includes('RETAIL') || c === 'SELLING PRICE' || c === 'RETAIL PRICE');

      startIdx = i + 1;
      break;
    }
  }

  if (qtyCol === -1) qtyCol = 1;
  if (nameCol === -1) nameCol = 0;

  return { nameCol, qtyCol, skuCol, codeCol, costCol, retailCol, startIdx };
}

/**
 * Extract item rows from a single flat sheet.
 *
 * Row-skip rules (only true non-item rows are dropped):
 *   • Completely blank name (after SKU/CODE back-fill).
 *   • Single-character names.
 *   • Header / total rows (FORBIDDEN_NAMES).
 *
 * Name back-fill fix: some sheets (e.g. PANDA "SOCCER SHOES", "CROCS-SLIPPER")
 * leave ITEM NAME blank and put the descriptive name in the SKU column. We fall
 * back to the SKU column, then the CODE column, so those real items aren't lost.
 */
export function extractFlatItems(
  sheetRows: any[][],
  sheetName: string,
  brandName?: string
): FlatParsedItem[] {
  const cols = detectFlatColumns(sheetRows);
  const brand = normalizeBrandFromSheet(brandName ?? sheetName);
  const out: FlatParsedItem[] = [];

  for (let i = cols.startIdx; i < sheetRows.length; i++) {
    const row = sheetRows[i] || [];

    const skuRaw = cols.skuCol !== -1 ? String(row[cols.skuCol] ?? '').trim() : '';
    const codeRaw = cols.codeCol !== -1 ? String(row[cols.codeCol] ?? '').trim() : '';

    // Name = ITEM NAME column, falling back to SKU column, then CODE column.
    let pName = String(row[cols.nameCol] ?? '').trim();
    if (!pName) pName = skuRaw;
    if (!pName) pName = codeRaw;

    const pQty = parseImportQty(row[cols.qtyCol]);

    // SKU used verbatim; fall back to the item name only when blank.
    const skuWasGeneratedFromName = !skuRaw.trim();
    const pCode = resolveImportSku(skuRaw, pName);

    const pCostRaw = cols.costCol !== -1 ? String(row[cols.costCol] ?? '').replace(/[^\d.-]/g, '') : '';
    const pCost = pCostRaw && !isNaN(Number(pCostRaw)) ? Number(pCostRaw) : 0;
    const pRetailRaw = cols.retailCol !== -1 ? String(row[cols.retailCol] ?? '').replace(/[^\d.-]/g, '') : '';
    const pRetail = pRetailRaw && !isNaN(Number(pRetailRaw)) ? Number(pRetailRaw) : 0;

    if (!pName || pName.length < 2) continue;
    if (isNaN(pQty)) continue;
    if (FORBIDDEN_NAMES.includes(pName.toUpperCase())) continue;

    out.push({
      name: pName,
      qty: pQty,
      unitCost: pCost,
      retailPrice: pRetail,
      sku: pCode,
      code: codeRaw || pName,
      category: brand,
      skuWasGeneratedFromName,
    });
  }

  return out;
}
