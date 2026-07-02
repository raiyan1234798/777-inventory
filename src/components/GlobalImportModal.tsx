import React, { useState, useCallback, memo, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { FileText, X, Upload, Store, Search, Trash2, Pencil, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import { useStore, CURRENCIES, toUSD, fromUSD, type Brand, type ImportSessionItem, sanitizeForFirestore } from '../store';
import { db } from '../lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { generateBrandSKU, resolveImportSku } from '../lib/skuGenerator';
import { extractFlatItems, isFlatStockSheet, isWarehouseStockSheet, dedupeImportItems, ocrTextToRows, countFlatParseExclusions } from '../lib/importParser';
import {
  shouldSkipImportItem,
  shouldReuseExistingPrices,
  applyPreviewPriceFallback,
  findExistingItemForImport,
  findBrandForImport,
  normalizeBrandFromSheet,
  normalizeBrandKey,
  normalizeItemKey,
  annotateImportPreviewFlags,
  filterImportPreview,
} from '../lib/importLogic';
import { useAuthStore } from '../store/authStore';

const ImportPreviewRow = memo(({ item, idx, importCurrency, importRetailCurrency, onUpdate, onRemove }: any) => {
  return (
    <tr className={`bg-white hover:bg-blue-50/30 transition-colors ${item.matchedToSystem ? 'ring-1 ring-inset ring-emerald-100' : ''}`}>
      <td className="py-2 px-3">
        <input id={`imp-name-${idx}`} title="Item Name" placeholder="Item Name" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-primary font-medium text-gray-900" 
          value={item.name} onChange={e => onUpdate(idx, 'name', e.target.value)} />
        <div className="flex flex-wrap gap-1 mt-0.5">
          {!item.brandUnresolved && item.category && (
            <span className="text-[9px] text-blue-600 font-bold uppercase">Existing brand</span>
          )}
          {item.matchedToSystem && (
            <span className="text-[9px] text-emerald-600 font-bold uppercase">Catalog match</span>
          )}
          {item.brandUnresolved && (
            <span className="text-[9px] text-amber-600 font-bold uppercase" title="Brand not found in catalog — a new brand will be created on save">New brand</span>
          )}
        </div>
      </td>
      <td className="py-2 px-3">
        <input title="SKU" placeholder="Auto-SKU" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-blue-400 text-gray-600" 
          value={item.sku} onChange={e => onUpdate(idx, 'sku', e.target.value)} />
        {item.skuWasGeneratedFromName && (
          <span
            className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold uppercase border border-amber-200"
            title="No SKU in file — item name was used as the SKU"
          >
            <AlertCircle className="w-2.5 h-2.5" />
            No SKU — using name
          </span>
        )}
      </td>
      <td className="py-2 px-3">
        <input title="Brand" placeholder="Brand" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-blue-400 text-gray-600" 
          value={item.category} onChange={e => onUpdate(idx, 'category', e.target.value)} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Quantity" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-12 text-right focus:ring-1 focus:ring-primary font-bold text-primary" 
          value={item.qty} onChange={e => onUpdate(idx, 'qty', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          <input title="Unit Cost" placeholder="0" type="number" step="0.01" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-gray-400 text-gray-600" 
            value={item.unitCost} onChange={e => onUpdate(idx, 'unitCost', Number(e.target.value))} />
          <select title="Currency" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[10px] focus:ring-1 focus:ring-gray-400 text-gray-500" value={item.unitCostCurrency || importCurrency} onChange={e => onUpdate(idx, 'unitCostCurrency', e.target.value)}>
            <option value="USD">USD</option>
            <option value="ZMW">ZMW</option>
            <option value="INR">INR</option>
            <option value="CNY">CNY</option>
          </select>
        </div>
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center gap-1 justify-end">
          <input title="Retail Price" placeholder="0" type="number" step="0.01" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-emerald-400 text-emerald-600 font-bold" 
            value={item.retailPrice} onChange={e => onUpdate(idx, 'retailPrice', Number(e.target.value))} />
          <select title="Currency" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[10px] focus:ring-1 focus:ring-emerald-400 text-emerald-500" value={item.retailPriceCurrency || importRetailCurrency} onChange={e => onUpdate(idx, 'retailPriceCurrency', e.target.value)}>
            <option value="USD">USD</option>
            <option value="ZMW">ZMW</option>
            <option value="INR">INR</option>
            <option value="CNY">CNY</option>
          </select>
        </div>
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Min Stock Limit" placeholder="10" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-12 text-right focus:ring-1 focus:ring-orange-400 text-orange-600 font-bold" 
          value={item.minStockLimit === undefined ? '' : item.minStockLimit} onChange={e => onUpdate(idx, 'minStockLimit', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <button 
            type="button"
            title="Edit Item Details" 
            onClick={() => document.getElementById(`imp-name-${idx}`)?.focus()}
            className="text-blue-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-all"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button type="button" title="Remove item" onClick={() => onRemove(idx)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded outline-none transition-all">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function GlobalImportModal() {
  const { 
    locations, brands, items, addContainer,
    isImportModalOpen, isImportModalMinimized,
    importPreview, importTargetLocation, importCurrency, importExcelFileName,
    importProcessingStatus, importProgress, importSaving,
    setImportModalOpen, setImportModalMinimized, setImportPreview,
    setImportTargetLocation, setImportCurrency, setImportExcelFileName,
    setImportProcessingStatus, setImportProgress, setImportSaving,
    saveImportSession,
  } = useStore();

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importRetailCurrency, setImportRetailCurrency] = useState<string>('ZMW');
  const [importMode, setImportMode] = useState<'add_and_update' | 'update_only' | 'add_new_only' | 'update_price_only'>('add_and_update');
  const [previewSearch, setPreviewSearch] = useState('');
  const [importDate, setImportDate] = useState(new Date().toISOString().split('T')[0]);
  const [importContainerNo, setImportContainerNo] = useState('');

  const filteredImportPreview = useMemo(
    () => filterImportPreview(importPreview, previewSearch),
    [importPreview, previewSearch]
  );
  const isPreviewSearchActive = previewSearch.trim().length > 0;

  // Re-apply system price fallback when catalog loads or import settings change.
  useEffect(() => {
    if (importPreview.length === 0 || (brands.length === 0 && items.length === 0)) return;
    setImportPreview(prev =>
      annotateImportPreviewFlags(
        applyPreviewPriceFallback(
          prev,
          brands,
          items,
          importMode,
          importCurrency,
          importRetailCurrency,
          fromUSD
        ),
        brands
      )
    );
  }, [brands.length, items.length, importMode, importCurrency, importRetailCurrency, setImportPreview]);

  useEffect(() => {
    if (importPreview.length === 0) setPreviewSearch('');
  }, [importPreview.length]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setExcelFile(acceptedFiles[0]);
      setImportExcelFileName(acceptedFiles[0].name);
      // New file → discard any preview from a previous upload so analysis is fresh.
      setImportPreview([]);
      setImportProcessingStatus('');
    }
  }, [setImportExcelFileName, setImportPreview, setImportProcessingStatus]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg']
    },
    maxFiles: 1
  });

  const handleUpdateImportItem = useCallback((idx: number, field: string, value: any) => {
    setImportPreview(prev => {
      const newItems = [...prev];
      newItems[idx] = { ...newItems[idx], [field]: value };
      return newItems;
    });
  }, [setImportPreview]);

  const handleRemoveImportItem = useCallback((idx: number) => {
    if(window.confirm("Remove this entry from the import list?")) {
      setImportPreview(prev => prev.filter((_, i) => i !== idx));
    }
  }, [setImportPreview]);

  const parseStockWarehouseSheet = (rows: any[][], sheetName: string, fallbackBrand: string): { name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; brandName: string; code: string; opening: number; received: number; supplied: number; returned: number; closing: number; minStockLimit?: number; skuWasGeneratedFromName?: boolean }[] => {
    const results: any[] = [];

    // Extract brand name from sheet header rows (rows 1-5) or sheet name
    let brandName = normalizeBrandFromSheet(sheetName);
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const rowStr = (rows[i] || []).map(c => String(c || '').trim()).join(' ').toUpperCase();
      // Look for "BRAND:" or brand name line (after STOCK-WAREHOUSE and before column headers)
      if (rowStr.includes('BRAND') || rowStr.includes('FORGE BRAND') || rowStr.includes('HORSE BRAND')) {
        const parts = rowStr.split(/[:–-]/).map(s => s.trim());
        if (parts.length >= 2) brandName = parts[parts.length - 1].replace(/BRAND/gi, '').trim() || brandName;
        else if (parts.length === 1) brandName = parts[0].replace(/BRAND/gi, '').trim() || brandName;
      }
      // Also check for standalone brand name between company header and table
      if (i >= 1 && i <= 3 && !rowStr.includes('INVESTMENTS') && !rowStr.includes('DATE') && !rowStr.includes('SL') && !rowStr.includes('STOCK')) {
        const cleaned = (rows[i] || []).map(c => String(c || '').trim()).filter(Boolean);
        if (cleaned.length === 1 && cleaned[0].length > 2 && cleaned[0].length < 40 && isNaN(Number(cleaned[0]))) {
          brandName = cleaned[0].replace(/BRAND/gi, '').trim();
        }
      }
    }
    
    // Ensure "BRAND" is fully stripped from the final result just in case
    brandName = brandName.replace(/BRAND/gi, '').trim();

    if (!brandName || /^(SHEET\s*\d+|IMPORT|LIST\s*IMPORT)$/i.test(brandName)) {
      brandName = fallbackBrand;
    }

    // Find header row with column names
    let headerIdx = -1;
    let colMap: Record<string, number> = {};
    let nameHeader = '';
    let codeHeader = '';
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = (rows[i] || []).map(c => String(c || '').toUpperCase().trim());
      const joined = row.join(' ');

      // Check for standard stock warehouse header patterns
      const hasItem = row.some(c => c.includes('ITEM') || c.includes('DESCRIPTION') || c.includes('NAME'));
      const hasQtyCol = row.some(c => ['OPENING', 'RECEIVED', 'CLOSING', 'SUPPLIED', 'RETURNED', 'SALES'].some(k => c.includes(k)));

      if (hasItem && hasQtyCol) {
        headerIdx = i;
        row.forEach((cell, idx) => {
          if (cell.includes('SL') || cell === 'NO' || cell === 'S.NO' || cell === 'SL.NO' || cell === 'SL NO') colMap['slno'] = idx;
          if (cell.includes('CODE') || cell === 'CODE#' || cell === 'CODE #' || cell.includes('SKU') || cell === 'SKU') { colMap['code'] = idx; codeHeader = cell; }
          if (cell.includes('ITEM') || cell.includes('DESCRIPTION') || cell.includes('NAME') || cell.includes('PARTICULAR')) { colMap['name'] = idx; nameHeader = cell; }
          if (cell.includes('OPENING') || cell === 'OPS') colMap['opening'] = idx;
          if (cell.includes('RECEIVED') || cell === 'REC') colMap['received'] = idx;
          if (cell.includes('SUPPLIED') || cell === 'SALES' || cell === 'SUPP' || cell.includes('SOLD')) colMap['supplied'] = idx;
          if (cell.includes('RETURNED') || cell === 'RTD' || cell.includes('RETURN')) colMap['returned'] = idx;
          if (cell.includes('CLOSING') || cell === 'CLS' || cell.includes('BALANCE')) colMap['closing'] = idx;
          if ((cell.includes('COST') || cell.includes('PRICE') || cell === 'COST') && !cell.includes('RETAIL') && !cell.includes('SELLING')) colMap['unitCost'] = idx;
          if (cell.includes('SELLING') || cell.includes('RETAIL') || cell === 'SELLING PRICE' || cell === 'RETAIL PRICE') colMap['retailPrice'] = idx;
        });
        break;
      }
    }

    if (headerIdx === -1 || colMap['name'] === undefined) return results;

    const { items, brands } = useStore.getState();

    // Parse data rows
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const itemNameRaw = String(row[colMap['name']] || '').trim();
      const codeRaw = colMap['code'] !== undefined ? String(row[colMap['code']] || '').trim() : '';

      let itemName = itemNameRaw || codeRaw;
      let code = codeRaw;

      // Skip empty, header, or total rows (after name back-fill from CODE column)
      if (!itemName || itemName.length < 2) continue;
      const upper = itemName.toUpperCase();
      if (['TOTAL', 'GRAND TOTAL', 'TOTAL QTY', 'SL NO', 'DATE', 'PARTICULARS'].some(k => upper === k || upper.startsWith(k + ' '))) continue;
      // Skip section headers (bold category names like "SHORTS", "MEN SHIRT", "COTTON PANTS", "COATS", "JOGGING")
      // These are typically short names with no numeric data in the row
      const hasAnyNumeric = [colMap['opening'], colMap['received'], colMap['supplied'], colMap['returned'], colMap['closing']]
        .filter(c => c !== undefined)
        .some(c => { 
          const raw = String(row[c] ?? '').trim();
          if (raw === '') return false;
          const v = Number(raw.replace(/[^\d.-]/g, '')); 
          return !isNaN(v); 
        });
      if (!hasAnyNumeric && itemName.length < 25 && !code) continue;

      const parseNum = (idx: number | undefined) => {
        if (idx === undefined) return 0;
        const raw = String(row[idx] ?? '').replace(/[^\d.-]/g, '');
        const n = Math.round(Number(raw));
        return isNaN(n) ? 0 : n;
      };

      const parseDecimal = (idx: number | undefined) => {
        if (idx === undefined) return 0;
        const raw = String(row[idx] ?? '').replace(/[^\d.-]/g, '');
        const n = Number(raw);
        return isNaN(n) ? 0 : n;
      };

      const opening = parseNum(colMap['opening']);
      const received = parseNum(colMap['received']);
      const supplied = parseNum(colMap['supplied']);
      const returned = parseNum(colMap['returned']);
      const closing = parseNum(colMap['closing']);
      let unitCost = parseDecimal(colMap['unitCost']);
      let retailPrice = parseDecimal(colMap['retailPrice']);

      // Use closing stock as quantity; if 0 or missing, use opening + received - supplied + returned
      let qty = closing;
      if (qty === 0 && (opening > 0 || received > 0)) {
        qty = opening + received - supplied + returned;
      }

      // Check for swapped columns where "CODE #" actually contains the item name and "ITEM DESCRIPTION" contains the brand/category/sku
      const isSwapped = codeHeader.includes('CODE') && !codeHeader.includes('SKU') && codeRaw.length > itemNameRaw.length && codeRaw.includes(' ');
      
      let finalBrandName = brandName;
      if (isSwapped) {
        // The item name is actually in the code column
        itemName = codeRaw;
        // The category/SKU is actually in the item name column
        code = itemNameRaw.trim();
      } else if (brandName && itemNameRaw && itemNameRaw.length <= 15 && !itemNameRaw.includes(' ')) {
        // Just in case it's a category but the code wasn't swapped or code was empty
        code = itemNameRaw.trim();
      }

      const codeFromFile = codeRaw;
      if (!code) code = itemName; // Fallback SKU to item name

      const skuWasGeneratedFromName = !codeFromFile.trim();
      const resolvedSku = resolveImportSku(code, itemName);

      // Check if this brand item already exists (brand + name + sku — same as import dedupe)
      const existingItem = findExistingItemForImport(
        { name: itemName, sku: resolvedSku, category: finalBrandName || 'Imported' },
        brands,
        items
      );

      const skuCode = existingItem ? existingItem.sku : resolvedSku;

      results.push({
        name: itemName, qty: Math.max(qty, 0),
        unitCost: unitCost, retailPrice: retailPrice, minStockLimit: 0,
        sku: skuCode,
        category: finalBrandName || 'Imported',
        brandName: finalBrandName,
        code,
        opening, received, supplied, returned, closing,
        skuWasGeneratedFromName,
      });
    }

    return results;
  };

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile || !importTargetLocation) return;
    setIsProcessing(true);
    setImportPreview([]);
    setImportProcessingStatus('Initialising parser...');

    const getBrandFromFileName = (fileName: string) => {
      if (!fileName) return 'List Import';
      let name = fileName.replace(/\.[^/.]+$/, "");
      name = name.split(/-CONTAINER| CONTAINER|#| - /i)[0];
      return name.trim().toUpperCase() || 'List Import';
    };

    try {
      let rows: any[][] = [];
      const fileType = excelFile.name.split('.').pop()?.toLowerCase();
      let workbook: XLSX.WorkBook | null = null;

      // Memoize each sheet's parsed rows so a 24-sheet workbook is only parsed
      // once (the previous code re-parsed sheets across multiple paths).
      const sheetRowsCache = new Map<string, any[][]>();
      const getSheetRows = (name: string): any[][] => {
        const cached = sheetRowsCache.get(name);
        if (cached) return cached;
        const parsed = workbook ? XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[name], { header: 1 }) : [];
        sheetRowsCache.set(name, parsed);
        return parsed;
      };

      if (fileType === 'xlsx' || fileType === 'xls') {
        setImportProcessingStatus('Reading spreadsheet...');
        const buffer = await excelFile.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array' });
        rows = getSheetRows(workbook.SheetNames[0]);
      } else if (fileType === 'pdf' || fileType?.match(/png|jpg|jpeg/)) {
        setImportProcessingStatus('Performing OCR text extraction...');
        const { data: { text } } = await Tesseract.recognize(excelFile, 'eng', {
          logger: m => m.status === 'recognizing text' ? setImportProcessingStatus(`OCR: ${Math.round(m.progress * 100)}%`) : null
        });
        rows = ocrTextToRows(text);
      }

      setImportProcessingStatus('Analyzing structure...');
      let parsedItems: { 
        name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; minStockLimit?: number;
        opening?: number; received?: number; supplied?: number; returned?: number; closing?: number;
      }[] = [];

      // Per-sheet routing: flat list vs warehouse matrix (never force warehouse-only on flat sheets).
      if (workbook && workbook.SheetNames.length > 0) {
        setImportProcessingStatus(`Scanning ${workbook.SheetNames.length} sheets...`);
        let totalExcluded = 0;
        for (let s = 0; s < workbook.SheetNames.length; s++) {
          const sheetName = workbook.SheetNames[s];
          const sheetRows = getSheetRows(sheetName);
          if (sheetRows.length < 2) continue;

          setImportProcessingStatus(`Reading sheet ${s + 1}/${workbook.SheetNames.length}: ${sheetName}...`);

          if (isFlatStockSheet(sheetRows)) {
            const brand = workbook.SheetNames.length > 1
              ? normalizeBrandFromSheet(sheetName)
              : getBrandFromFileName(excelFile.name);
            const stats = countFlatParseExclusions(sheetRows);
            totalExcluded += stats.dropped;
            const extracted = extractFlatItems(sheetRows, sheetName, brand);
            for (const it of extracted) {
              parsedItems.push({
                name: it.name, qty: it.qty, closing: it.qty,
                unitCost: it.unitCost, retailPrice: it.retailPrice, minStockLimit: 0,
                sku: it.sku, category: brand,
                skuWasGeneratedFromName: it.skuWasGeneratedFromName,
              });
            }
          } else if (isWarehouseStockSheet(sheetRows)) {
            const fallbackBrand = getBrandFromFileName(excelFile.name);
            parsedItems.push(...parseStockWarehouseSheet(sheetRows, sheetName, fallbackBrand));
          }

          // Yield so the UI can refresh during large workbooks (24+ sheets).
          if (s % 3 === 2) await new Promise<void>(r => setTimeout(r, 0));
        }

        if (parsedItems.length > 0) {
          const beforeDedup = parsedItems.length;
          parsedItems = dedupeImportItems(parsedItems);
          const deduped = beforeDedup - parsedItems.length;
          const excludeMsg = totalExcluded > 0 ? ` (${totalExcluded} blank/total rows excluded` : '';
          const dedupMsg = deduped > 0 ? `${excludeMsg ? ',' : ' ('}${deduped} within-brand duplicates merged` : '';
          const suffix = excludeMsg || dedupMsg ? `${excludeMsg}${dedupMsg}).` : '.';
          setImportProcessingStatus(`Found ${parsedItems.length} items across ${workbook.SheetNames.length} sheets${suffix}`);
        }
      }

      // OCR / image path: try flat parser on extracted rows when no workbook.
      if (parsedItems.length === 0 && rows.length > 1 && !workbook && isFlatStockSheet(rows)) {
        setImportProcessingStatus('Parsing OCR text as flat stock list...');
        const extracted = extractFlatItems(rows, 'OCR Import', 'OCR Import');
        parsedItems = extracted.map(it => ({
          name: it.name, qty: it.qty, closing: it.qty,
          unitCost: it.unitCost, retailPrice: it.retailPrice, minStockLimit: 0,
          sku: it.sku, category: it.category,
          skuWasGeneratedFromName: it.skuWasGeneratedFromName,
        }));
      }

      // Fallback parsers when per-sheet routing found nothing (matrix, single warehouse, etc.)
      if (parsedItems.length === 0 && rows.length > 3) {
        const headerStr = rows.slice(0, 8).map(r => (r || []).map((c: any) => String(c || '').toUpperCase()).join(' ')).join(' ');
        const isSingleStockSheet = (headerStr.includes('OPENING') || headerStr.includes('CLOSING')) &&
          (headerStr.includes('ITEM') || headerStr.includes('DESCRIPTION'));

        if (isSingleStockSheet) {
          setImportProcessingStatus('Detected stock warehouse format (single sheet)...');
          parsedItems = parseStockWarehouseSheet(rows, workbook?.SheetNames[0] || 'Import', getBrandFromFileName(excelFile.name));
        } else {
          let isMatrix = false;
          let metricRowIdx = -1;
          for (let i = 0; i < Math.min(20, rows.length); i++) {
            const rowString = (rows[i] || []).map((c: any) => String(c).toUpperCase()).join(' ');
            if (rowString.includes('OPS') || (rowString.includes('REC') && rowString.includes('CLS')) || rowString.includes('SUPP')) {
              isMatrix = true;
              metricRowIdx = i;
              break;
            }
          }

          if (isMatrix && metricRowIdx >= 1) {
            setImportProcessingStatus('Parsing Ledger Matrix (Priority: Closing Stock)...');
            const itemNames: Record<number, string> = {};
            let currentItem = '';
            const headerRow = rows[metricRowIdx - 1] || [];
            const topHeaderRow = metricRowIdx >= 2 ? rows[metricRowIdx - 2] : [];

            const forbiddenNames = ['DATE', 'PARTICULAR', 'PARTICULARS', '0', 'OPS', 'REC', 'SUPP', 'RTD', 'CLS'];
            for (let c = 1; c < (rows[metricRowIdx]?.length || 0); c++) {
              const subHeader = String(rows[metricRowIdx][c] || '').trim().toUpperCase();
              const val = String(topHeaderRow[c] || headerRow[c] || '').trim();
              const isValidName = val && !forbiddenNames.some(f => val.toUpperCase() === f) && isNaN(Number(val));

              if (subHeader === 'OPS' || subHeader === 'OPENING') {
                if (isValidName) { currentItem = val; } else { currentItem = ''; }
              } else {
                if (isValidName) { currentItem = val; }
              }
              if (currentItem) itemNames[c] = currentItem;
            }

            const itemBalances: Record<string, number> = {};
            for (let c = 2; c < (rows[metricRowIdx]?.length || 0); c++) {
              const iName = itemNames[c];
              if (!iName) continue;
              const colHeader = String(rows[metricRowIdx][c] || '').trim().toUpperCase();
              if (['OPS', 'OPENING', 'REC', 'RECEIVED'].some(head => colHeader === head || colHeader.includes(head))) {
                const topValRaw = headerRow[c];
                if (topValRaw !== undefined && topValRaw !== null && String(topValRaw).trim() !== '') {
                  const v = Math.round(Number(String(topValRaw).replace(/[^\d.-]/g, '')));
                  if (!isNaN(v)) { itemBalances[iName] = (itemBalances[iName] || 0) + v; }
                }
              }
            }

            parsedItems = Object.entries(itemBalances).map(([name, qty]) => ({
              name, qty, unitCost: 0, retailPrice: 0, minStockLimit: 0,
              sku: generateBrandSKU('Ledger', name, new Set()), category: 'Ledger Import'
            }));
            // deduplicate skus
            const seenLedger = new Set<string>();
            parsedItems.forEach(p => {
              const base = p.sku;
              if (seenLedger.has(base)) { let s=2; while(seenLedger.has(`${base}-${s}`)) s++; p.sku=`${base}-${s}`; }
              seenLedger.add(p.sku);
            });
          } else {
            setImportProcessingStatus(`Parsing Flat List (Smart Detect) across ${workbook?.SheetNames.length || 1} sheets...`);

            const processFlatSheet = (sheetRows: any[][], sheetName: string) => {
              const isMultiSheet = !!(workbook && workbook.SheetNames.length > 1);
              const brand = isMultiSheet ? normalizeBrandFromSheet(sheetName) : getBrandFromFileName(excelFile.name);

              const extracted = extractFlatItems(sheetRows, sheetName, brand);

              for (const it of extracted) {
                parsedItems.push({
                  name: it.name, qty: it.qty, closing: it.qty,
                  unitCost: it.unitCost, retailPrice: it.retailPrice, minStockLimit: 0,
                  sku: it.sku, category: brand,
                  skuWasGeneratedFromName: it.skuWasGeneratedFromName,
                });
              }
            };

            if (workbook && workbook.SheetNames.length > 0) {
              for (const sheetName of workbook.SheetNames) {
                 const sheetRows = getSheetRows(sheetName);
                 if (sheetRows.length > 1) {
                    processFlatSheet(sheetRows, sheetName);
                 }
              }
            } else {
              processFlatSheet(rows, 'Import');
            }
          }
        }
      }

      const { brands: storeBrands, items: storeItems } = useStore.getState();
      parsedItems = applyPreviewPriceFallback(
        parsedItems,
        storeBrands,
        storeItems,
        importMode,
        importCurrency,
        importRetailCurrency,
        fromUSD
      );
      parsedItems = annotateImportPreviewFlags(parsedItems, storeBrands);

      const noSkuCount = parsedItems.filter(p => p.skuWasGeneratedFromName).length;
      const noSkuSuffix = noSkuCount > 0 ? ` · ${noSkuCount} without SKU (item name used)` : '';
      setImportPreview(parsedItems);
      setImportProcessingStatus(`Success! Found ${parsedItems.length} items with Closing Stock values${noSkuSuffix}.`);
    } catch (err: any) {
      console.error(err);
      alert("Parser Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeFinalImport = async () => {
    if (importPreview.length === 0) {
      alert('Nothing to import — analyze a file first.');
      return;
    }
    if (!importTargetLocation) {
      alert('Please select a destination shop/warehouse before saving.');
      return;
    }

    const unresolvedBrands = [...new Set(
      importPreview
        .filter(p => p.brandUnresolved)
        .map(p => (p.category || 'Imported').trim())
    )];
    if (unresolvedBrands.length > 0) {
      const proceed = window.confirm(
        `${unresolvedBrands.length} brand(s) not found in catalog (${unresolvedBrands.slice(0, 3).join(', ')}${unresolvedBrands.length > 3 ? '…' : ''}). ` +
        'New brand records will be created. Continue?'
      );
      if (!proceed) return;
    }

    setImportSaving(true);
    try {
      setImportProcessingStatus('Preparing import...');

      const containerNo = importContainerNo.trim() || `IMP-PRO-${Date.now().toString().slice(-6)}`;
      const containerId = await addContainer({
        container_no: containerNo,
        source_country: 'Smart Import',
        total_cost: 0, currency: 'USD', converted_cost_USD: 0,
        date: importDate.length === 10 ? importDate + 'T00:00:00.000Z' : importDate,
        notes: `Confirmed import with ${importPreview.length} items`,
        status: 'Received'
      });

      setImportProcessingStatus(`Building batches for ${importPreview.length} items...`);

      const localItemsMap = new Map<string, any>();
      items.forEach(it => {
        localItemsMap.set(
          `${it.brand_id}_${normalizeItemKey(it.name)}_${normalizeItemKey(it.sku || '')}`,
          it
        );
      });
      const localBrandsMap = new Map<string, any>();
      brands.forEach(b => localBrandsMap.set(normalizeBrandKey(b.name), b));

      // Track SKUs used in this import to avoid duplicates
      const importedSkusSet = new Set<string>(items.map(it => it.sku).filter(Boolean));

      const inventorySnapshot = new Map(
        useStore.getState().inventory.map(e => [
          `${e.location_id.replace(/\//g, '-')}_${e.item_id.replace(/\//g, '-')}`, e
        ])
      );

      const allMasterBatches: ReturnType<typeof writeBatch>[] = [];
      let masterBatch = writeBatch(db);
      let masterOpCount = 0;

      const inventoryBatches: ReturnType<typeof writeBatch>[] = [];
      let invBatch = writeBatch(db);
      let invOpCount = 0;

      const MASTER_CHUNK = 200;
      const INV_CHUNK = 200;

      let newItemsCreated = 0;
      let existingItemsUpdated = 0;
      let inventoryRowsWritten = 0;
      let skippedExisting = 0;

      for (const pItem of importPreview) {
        const catalogItems = [
          ...useStore.getState().items,
          ...Array.from(localItemsMap.values()).filter(
            (it: { id?: string }) => !useStore.getState().items.some(s => s.id === it.id)
          ),
        ];

        const brandNameRaw = (pItem.category || '').trim();
        if (!brandNameRaw) {
          throw new Error(`Row "${pItem.name}" has no brand — assign a brand before saving.`);
        }
        const brandKey = normalizeBrandKey(brandNameRaw);
        let matchedBrand = findBrandForImport(pItem.category || 'Imported', brands);
        if (matchedBrand) {
          localBrandsMap.set(brandKey, matchedBrand);
        } else {
          matchedBrand = localBrandsMap.get(brandKey);
        }
        const matchInput = { ...pItem, sku: resolveImportSku(pItem.sku, pItem.name) };
        let item = findExistingItemForImport(matchInput, brands, catalogItems);

        // "Only New Stocks" skips catalog items already tracked (no inventory write).
        // "Update Price Only" operates on existing items but does NOT create inventory.
        if (shouldSkipImportItem(importMode, !!item)) {
          skippedExisting++;
          continue;
        }

        // If in "Update Price Only" mode and item doesn't exist, we skip it.
        if (importMode === 'update_price_only' && !item) {
          skippedExisting++;
          continue;
        }

        const incomingCostINR = toUSD(pItem.unitCost, pItem.unitCostCurrency || importCurrency);
        const incomingRetailUSD = toUSD(pItem.retailPrice || 0, pItem.retailPriceCurrency || importRetailCurrency);

        let brandId = matchedBrand?.id;

        if (!brandId) {
          const bRef = doc(collection(db, 'brands'));
          brandId = bRef.id;
          const brandNameText = brandNameRaw.toUpperCase();
          if (masterOpCount >= MASTER_CHUNK) {
            allMasterBatches.push(masterBatch);
            masterBatch = writeBatch(db);
            masterOpCount = 0;
          }
          masterBatch.set(bRef, { id: brandId, name: brandNameText, description: 'Auto-imported brand', origin_country: 'Imported' });
          masterOpCount++;
          const newBrand = { id: brandId, name: brandNameText, description: 'Auto-imported brand', origin_country: 'Imported' };
          const brandsArr = useStore.getState().brands;
          brandsArr.push(newBrand as Brand);
          localBrandsMap.set(brandKey, newBrand);
        }

        // Match by brand + name + sku (same logic as preview fallback).
        item = findExistingItemForImport(matchInput, useStore.getState().brands, catalogItems);
        
        let itemId = item?.id;

        // When a brand+item match exists, "Only Present Stocks" reuses the system's
        // existing unit cost / retail price instead of overwriting from the file.
        const reusePrices = shouldReuseExistingPrices(importMode, !!item);

        if (!itemId) {
          const iRef = doc(collection(db, 'items'));
          itemId = iRef.id;
          const newItem = {
            id: itemId, brand_id: brandId || brands[0]?.id || 'imported', name: pItem.name,
            sku: resolveImportSku(pItem.sku, pItem.name),
            category: pItem.category || 'Imported',
            min_stock_limit: pItem.minStockLimit || 0,
            retail_price: incomingRetailUSD,
            avg_cost_USD: incomingCostINR,
            avg_cost_local: pItem.unitCost || 0,
            retail_price_local: pItem.retailPrice || 0,
            local_currency: importCurrency
          };
          importedSkusSet.add(newItem.sku);
          if (masterOpCount >= MASTER_CHUNK) {
            allMasterBatches.push(masterBatch);
            masterBatch = writeBatch(db);
            masterOpCount = 0;
          }
          masterBatch.set(iRef, newItem);
          masterOpCount++;
          localItemsMap.set(`${brandId}_${normalizeItemKey(pItem.name)}_${normalizeItemKey(newItem.sku || '')}`, newItem);
          newItemsCreated++;
        } else {
          // Reuse existing prices for matched items in "Only Present Stocks"; otherwise
          // refresh them from the file when provided.
          if (!reusePrices) {
            const updates: any = {};
            // For price updates, we overwrite the currency details as well
            if (pItem.unitCost !== undefined && pItem.unitCost !== item.avg_cost_local) {
              updates.avg_cost_local = pItem.unitCost;
              updates.avg_cost_USD = incomingCostINR;
              updates.local_currency = importCurrency;
            }
            if (pItem.retailPrice !== undefined && incomingRetailUSD !== item.retail_price) {
              updates.retail_price = incomingRetailUSD;
              updates.retail_price_local = pItem.retailPrice;
            }
            if (pItem.category && pItem.category !== 'Imported' && pItem.category !== item.category) {
              updates.category = pItem.category;
            }
            if (pItem.minStockLimit !== undefined && pItem.minStockLimit !== item.min_stock_limit) {
              updates.min_stock_limit = pItem.minStockLimit;
            }
            if (brandId && brandId !== item.brand_id) {
              updates.brand_id = brandId;
            }
            
            // Use the SKU from the file verbatim (fall back to item name only when missing).
            const newSkuCode = resolveImportSku(pItem.sku, pItem.name);
            if (newSkuCode && newSkuCode !== item.sku) {
               updates.sku = newSkuCode;
               importedSkusSet.add(newSkuCode);
            }

            if (Object.keys(updates).length > 0) {
              if (masterOpCount >= MASTER_CHUNK) {
                allMasterBatches.push(masterBatch);
                masterBatch = writeBatch(db);
                masterOpCount = 0;
              }
              masterBatch.update(doc(db, 'items', itemId), updates);
              masterOpCount++;
              existingItemsUpdated++;
            }
          }
        }

        const safeLocId = importTargetLocation.replace(/\//g, '-');
        const safeItemId = (itemId as string).replace(/\//g, '-');
        const invId = `${safeLocId}_${safeItemId}`;
        const existing = inventorySnapshot.get(invId);

        // Add the imported quantity to the existing stock
        const importedQty = Math.max(0, pItem.closing ?? pItem.qty ?? 0);
        const prevQty = existing?.quantity ?? 0;

        let opening = 0;
        let received = 0;
        let supplied = 0;
        let returned = 0;

        if (!existing) {
          opening = 0;
          received = importedQty;
        } else {
          opening = existing.opening_balance ?? prevQty;
          received = importedQty;
          supplied = 0;
          returned = 0;
        }

        const newQty = prevQty + importedQty;
        const incomingQtyForAvg = received > 0 ? received : (opening === 0 ? newQty : 0);
        let newAvgUSD = existing?.avg_cost_USD ?? 0;
        let newAvgLocal = existing?.avg_cost_local ?? pItem.unitCost ?? 0;
        if (reusePrices) {
          // Matched brand+item in "Only Present Stocks" → call the existing system cost.
          newAvgUSD = item?.avg_cost_USD ?? existing?.avg_cost_USD ?? newAvgUSD;
          newAvgLocal = item?.avg_cost_local ?? existing?.avg_cost_local ?? newAvgLocal;
        } else if (incomingQtyForAvg > 0 || (incomingCostINR > 0 && newQty > 0)) {
           if (incomingCostINR > 0) newAvgUSD = incomingCostINR;
           if (pItem.unitCost && pItem.unitCost > 0) newAvgLocal = pItem.unitCost;
        }

        if (invOpCount >= INV_CHUNK) {
          inventoryBatches.push(invBatch);
          invBatch = writeBatch(db);
          invOpCount = 0;
        }
        invBatch.set(doc(db, 'inventory', invId), {
          id: invId, 
          location_id: importTargetLocation,
          item_id: itemId, 
          quantity: newQty,
          opening_balance: opening,
          received_balance: received,
          supplied_balance: supplied,
          returned_balance: returned,
          last_import_timestamp: new Date().toISOString(),
          avg_cost_USD: newAvgUSD,
          avg_cost_local: newAvgLocal,
          local_currency: importCurrency
        });
        inventorySnapshot.set(invId, {
          ...(existing || {}),
          id: invId,
          location_id: importTargetLocation,
          item_id: itemId,
          quantity: newQty,
          opening_balance: opening,
          received_balance: received,
          supplied_balance: supplied,
          returned_balance: returned,
        });
        inventoryRowsWritten++;
        invOpCount++;

        const txQty = newQty - prevQty;
        if (txQty !== 0) {
          const txRef = doc(collection(db, 'transactions'));
          if (invOpCount >= INV_CHUNK) {
            inventoryBatches.push(invBatch);
            invBatch = writeBatch(db);
            invOpCount = 0;
          }
          invBatch.set(txRef, sanitizeForFirestore({
            id: txRef.id,
            type: 'stock_entry',
            from_location: 'supplier',
            to_location: importTargetLocation,
            item_id: itemId,
            item_name: pItem.name || pItem.sku || 'Imported Item',
            quantity: txQty,
            unit_cost: pItem.unitCost || 0,
            currency: importCurrency,
            converted_value_USD: toUSD((pItem.unitCost || 0) * txQty, importCurrency),
            unit_cost_local: pItem.unitCost || 0,
            local_currency: importCurrency,
            performed_by: useAuthStore.getState().appUser?.name ?? useAuthStore.getState().user?.displayName ?? 'Admin',
            container_id: containerId,
            notes: 'Imported via Smart Stock Import',
            timestamp: importDate ? (importDate.length === 10 ? importDate + 'T00:00:00.000Z' : importDate) : new Date().toISOString()
          }));
          invOpCount++;
        }

      }

      if (masterOpCount > 0) allMasterBatches.push(masterBatch);
      if (invOpCount > 0) inventoryBatches.push(invBatch);

      const totalBatches = allMasterBatches.length + inventoryBatches.length;
      setImportProcessingStatus(`Saving ${totalBatches} batches (${newItemsCreated} new, ${existingItemsUpdated} updated)...`);

      const allBatches = [...allMasterBatches, ...inventoryBatches];
      const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

      for (let i = 0; i < allBatches.length; i++) {
        try {
          await allBatches[i].commit();
        } catch (batchErr: any) {
          throw new Error(`Save failed on batch ${i + 1} of ${allBatches.length}: ${batchErr?.message || batchErr}`);
        }
        setImportProcessingStatus(`Saving... ${i + 1}/${allBatches.length} batches done`);
        if (i < allBatches.length - 1) await sleep(300);
      }

      // ── Save Import Session ──────────────────────────────────────────────
      const sessionItems: ImportSessionItem[] = importPreview.map(pItem => {
        const brandName = (pItem.category || 'Imported').trim().toUpperCase();
        // Use localBrandsMap (built during this import) — not stale React brands state
        // This ensures newly created brands in this import are resolved correctly
        const resolvedBrand = findBrandForImport(pItem.category || 'Imported', [...localBrandsMap.values()]) ?? localBrandsMap.get(brandName);
        const resolvedItem = findExistingItemForImport(pItem, [...localBrandsMap.values()], items)
          ?? localItemsMap.get(`${resolvedBrand?.id ?? ''}_${(pItem.name || '').toLowerCase().trim()}_${(pItem.sku || '').toLowerCase().trim()}`);
        return {
          item_id: (resolvedItem as any)?.id ?? pItem.name,
          item_name: pItem.name,
          sku: pItem.sku || '',
          brand: brandName,
          invoiceQty: pItem.closing ?? pItem.qty ?? 0,
          receivedQty: pItem.closing ?? pItem.qty ?? 0,
          unitCost: pItem.unitCost || 0,
          retailPrice: pItem.retailPrice || 0,
        };
      });

      await saveImportSession({
        date: importDate ? (importDate.length === 10 ? importDate + 'T00:00:00.000Z' : importDate) : new Date().toISOString(),
        fileName: importExcelFileName || 'Manual Import',
        location_id: importTargetLocation,
        currency: importCurrency,
        itemCount: importPreview.length,
        totalItems: importPreview.reduce((sum, i) => sum + (i.closing ?? i.qty ?? 0), 0),
        items: sessionItems,
        status: 'confirmed',
        container_id: containerId,
        performed_by: useAuthStore.getState().appUser?.name ?? useAuthStore.getState().user?.displayName ?? 'Unknown',
      });
      // ──────────────────────────────────────────────────────────────────────

      const skipNote = skippedExisting > 0 && importMode === 'add_new_only'
        ? ` · ${skippedExisting} existing item(s) skipped (Only New Stocks mode)`
        : '';
      alert(
        `Import successful! ${newItemsCreated} new item(s), ${existingItemsUpdated} catalog update(s), ` +
        `${inventoryRowsWritten} inventory row(s) at destination${skipNote}.`
      );
      setImportPreview([]);
      setImportModalOpen(false);
      setExcelFile(null);
      setImportExcelFileName(null);
    } catch (err: any) {
      console.error(err);
      alert('Import Error: ' + err.message);
    } finally {
      setImportSaving(false);
    }
  };

  return (
    <Modal 
      isOpen={isImportModalOpen || isImportModalMinimized} 
      onClose={() => { setImportModalOpen(false); setImportModalMinimized(false); }} 
      minimized={isImportModalMinimized}
      onMinimize={() => { setImportModalMinimized(true); setImportModalOpen(false); }}
      onRestore={() => { setImportModalMinimized(false); setImportModalOpen(true); }}
      onOutsideClick={() => { setImportModalMinimized(true); setImportModalOpen(false); }}
      title="Smart Stock Import" 
      description="Upload Excel, PDF, or Images. Drag & Drop supported." 
      minimizeLabel={importExcelFileName ? `Importing ${importExcelFileName}` : "Bulk Import"}
      size="xl"
    >
      <form onSubmit={handleImportExcel} className="space-y-4">
        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <label className="label">Source File</label>
            <div 
              {...getRootProps()} 
              className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer
                ${isDragActive ? 'border-primary bg-primary/5 scale-[0.99]' : 'border-gray-200 hover:border-primary/50 hover:bg-gray-50'}`}
            >
              <input {...getInputProps()} />
              {importExcelFileName ? (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-900 line-clamp-1">{importExcelFileName}</p>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setExcelFile(null); setImportExcelFileName(null); setImportPreview([]); setImportProcessingStatus(''); }} className="text-[10px] text-red-500 font-bold uppercase mt-2 flex items-center gap-1">
                    <X className="w-3 h-3" /> Remove File
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-gray-900">Drag & Drop or Click</p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase font-semibold">Supports .xlsx, .pdf, .png, .jpg</p>
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                 Import Currency
              </label>
              <select title="Import Currency" className="input-field bg-white shadow-sm" value={importCurrency} onChange={e => setImportCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">Currency for costs in this file.</p>
            </div>
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                 Retail Currency
              </label>
              <select title="Retail Currency" className="input-field bg-white shadow-sm" value={importRetailCurrency} onChange={e => setImportRetailCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">Currency for retail prices.</p>
            </div>
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                 Import Mode
              </label>
              <select title="Import Mode" className="input-field bg-white shadow-sm" value={importMode} onChange={e => setImportMode(e.target.value as any)}>
                <option value="add_and_update">New & Present Stocks</option>
                <option value="update_only">Only Present Stocks</option>
                <option value="update_price_only">Update Prices & Stocks</option>
                <option value="add_new_only">Only New Stocks</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">
                {importMode === 'add_new_only'
                  ? 'Skips items already in catalog; no inventory write for those.'
                  : importMode === 'update_price_only'
                  ? 'Updates cost/retail globally AND adds stock quantities locally.'
                  : 'How to handle items.'}
              </p>
            </div>
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                Stock Date
              </label>
              <input
                type="date"
                className="input-field bg-white shadow-sm font-bold"
                value={importDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setImportDate(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">Date stock was received.</p>
            </div>
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                Container / Ref No. (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. IMP-PRO-123456"
                className="input-field bg-white shadow-sm font-bold"
                value={importContainerNo}
                onChange={e => setImportContainerNo(e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">Recognize imports easily.</p>
            </div>
            <div>
              <label className="label text-gray-900 font-bold flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" /> Destination Location
              </label>
              <select title="Select Location" required className="input-field bg-white shadow-sm" value={importTargetLocation} onChange={e => setImportTargetLocation(e.target.value)}>
                <option value="">Select where to unload items…</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
              </select>
            </div>
          </div>

            {isProcessing && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-center gap-4 animate-pulse">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <div>
                  <p className="text-xs font-bold text-primary uppercase leading-none">Processing...</p>
                  <p className="text-[11px] text-primary/70 mt-1">{importProcessingStatus}</p>
                </div>
              </div>
            )}
          </div>

        <div className="mt-2 p-4 bg-gray-50 border border-gray-100 rounded-xl overflow-x-auto">
          {importPreview.length > 0 ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <p className="font-bold text-gray-900 text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-emerald-500"/> Review Detected Items</p>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">
                    {isPreviewSearchActive
                      ? `Showing ${filteredImportPreview.length} of ${importPreview.length} items`
                      : `${importPreview.length} Items Found`}
                  </p>
                  {importPreview.some(p => p.skuWasGeneratedFromName) && (
                    <p className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">
                      {importPreview.filter(p => p.skuWasGeneratedFromName).length} without SKU (item name used)
                    </p>
                  )}
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="search"
                  value={previewSearch}
                  onChange={e => setPreviewSearch(e.target.value)}
                  placeholder="Search item name, brand, SKU..."
                  className="input-field bg-white shadow-sm pl-9 pr-8 py-2 text-xs w-full"
                  aria-label="Search import preview items"
                />
                {previewSearch && (
                  <button
                    type="button"
                    onClick={() => setPreviewSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400">
                    <tr>
                      <th className="py-3 px-3 text-left">Item Name</th>
                      <th className="py-3 px-3 text-left">SKU</th>
                      <th className="py-3 px-3 text-left">Brand</th>
                      <th className="py-3 px-3 text-right">Qty</th>
                      <th className="py-3 px-3 text-right">Unit Cost</th>
                      <th className="py-3 px-3 text-right">Retail Price</th>
                      <th className="py-3 px-3 text-right">Min Limit</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredImportPreview.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-xs text-gray-500">
                          No items match your search
                        </td>
                      </tr>
                    ) : (
                      filteredImportPreview.map(({ item, index: idx }) => (
                        <ImportPreviewRow 
                          key={item.name + idx} 
                          item={item} 
                          idx={idx} 
                          importCurrency={importCurrency}
                          importRetailCurrency={importRetailCurrency}
                          onUpdate={handleUpdateImportItem}
                          onRemove={handleRemoveImportItem}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between">
                 <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-tight">Review complete? Click below to finalize stock entry.</p>
                 <button type="button" onClick={executeFinalImport} disabled={importSaving} className="btn-primary py-1.5 px-4 text-[11px] bg-emerald-600 hover:bg-emerald-700 border-none shadow-none">
                   {importSaving ? 'Saving...' : 'Confirm & Save All'}
                 </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-700">
              <p className="font-bold text-gray-700 mb-2 font-sans text-xs flex items-center gap-1"><Search className="w-3.5 h-3.5"/> Smart Parser Capability:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-emerald-600 uppercase">1. Structured Matrices</p>
                  <p className="text-[10px] text-gray-500 font-sans leading-relaxed">Reads grouped columns with sub-metrics (OPS, REC, etc.) from standard inventory Excel files.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-[9px] font-bold text-blue-600 uppercase">2. OCR & PDF Lists</p>
                  <p className="text-[10px] text-gray-500 font-sans leading-relaxed">Uses AI visual processing to extract stock items even from scanned PDFs, images, or plain text lists.</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200/50">
                <p className="font-bold text-gray-700 mb-2 font-sans text-xs">Standard Matrix Example:</p>
                <table className="w-full text-center border-collapse bg-white shadow-sm text-[9px]">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th rowSpan={2} className="border border-gray-200 px-2 py-1">Date</th>
                      <th rowSpan={2} className="border border-gray-200 px-2 py-1">Particulars</th>
                      <th colSpan={5} className="border border-gray-200 px-2 py-1 bg-yellow-50 font-bold text-yellow-800 uppercase">LADIES T-SHIRT-L/S</th>
                      <th colSpan={5} className="border border-gray-200 px-2 py-1 bg-red-50 font-bold text-red-800 uppercase">MEN COTTON SHIRT</th>
                    </tr>
                    <tr>
                      <th className="border border-gray-200 px-1 py-1 bg-blue-50 text-blue-800 font-black">REC</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 bg-blue-50 text-blue-800 font-black">REC</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                      <th className="border border-gray-200 px-1 py-1 text-gray-400">...</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-2 py-1">26/11/22</td>
                      <td className="border border-gray-200 px-2 py-1 text-left">FROM...</td>
                      <td className="border border-gray-200 px-1 py-1 font-bold bg-blue-50/50">5</td>
                      <td className="border border-gray-200 px-1 py-1 text-gray-400"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td>
                      <td className="border border-gray-200 px-1 py-1 font-bold bg-blue-50/50">4</td>
                      <td className="border border-gray-200 px-1 py-1 text-gray-400"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td><td className="border border-gray-200 px-1 py-1"></td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-gray-400 font-sans text-xs uppercase tracking-tighter">Parser will detect REC columns and sum quantities automatically.</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
          <button type="button" className="btn-secondary" onClick={() => { setImportModalOpen(false); setImportPreview([]); setExcelFile(null); setImportExcelFileName(null); }}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={importSaving || !importExcelFileName || isProcessing}>{importSaving ? 'Processing…' : importPreview.length > 0 ? 'Re-Analyze File' : 'Analyze & Preview'}</button>
        </div>
      </form>
    </Modal>
  );
}
