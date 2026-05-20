import React, { useState, useCallback, memo } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import Tesseract from 'tesseract.js';
import { FileText, X, Upload, Store, Search, Trash2, Pencil } from 'lucide-react';
import Modal from './Modal';
import { useStore, CURRENCIES, toUSD, type Brand, type ImportSessionItem } from '../store';
import { db } from '../lib/firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import { generateBrandSKU } from '../lib/skuGenerator';
import { useAuthStore } from '../store/authStore';

const ImportPreviewRow = memo(({ item, idx, importCurrency, onUpdate, onRemove }: any) => {
  return (
    <tr className="bg-white hover:bg-blue-50/30 transition-colors">
      <td className="py-2 px-3">
        <input id={`imp-name-${idx}`} title="Item Name" placeholder="Item Name" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-primary font-medium text-gray-900" 
          value={item.name} onChange={e => onUpdate(idx, 'name', e.target.value)} />
      </td>
      <td className="py-2 px-3">
        <input title="SKU" placeholder="Auto-SKU" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-full focus:ring-1 focus:ring-blue-400 text-gray-600" 
          value={item.sku} onChange={e => onUpdate(idx, 'sku', e.target.value)} />
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
        <input title="Unit Cost" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-gray-400 text-gray-600" 
          value={item.unitCost} onChange={e => onUpdate(idx, 'unitCost', Number(e.target.value))} />
      </td>
      <td className="py-2 px-3 text-right">
        <input title="Retail Price" placeholder="0" type="number" className="bg-white border-gray-100 rounded border-0 hover:border p-1 text-[11px] w-16 text-right focus:ring-1 focus:ring-emerald-400 text-emerald-600 font-bold" 
          value={item.retailPrice} onChange={e => onUpdate(idx, 'retailPrice', Number(e.target.value))} />
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setExcelFile(acceptedFiles[0]);
      setImportExcelFileName(acceptedFiles[0].name);
    }
  }, [setImportExcelFileName]);

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

  const parseStockWarehouseSheet = (rows: any[][], sheetName: string): { name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; brandName: string; code: string; opening: number; received: number; supplied: number; returned: number; closing: number; minStockLimit?: number }[] => {
    const results: any[] = [];

    // Extract brand name from sheet header rows (rows 1-5) or sheet name
    let brandName = sheetName.replace(/-SUMM$/i, '').replace(/[-_]/g, ' ').trim();
    for (let i = 0; i < Math.min(6, rows.length); i++) {
      const rowStr = (rows[i] || []).map(c => String(c || '').trim()).join(' ').toUpperCase();
      // Look for "BRAND:" or brand name line (after STOCK-WAREHOUSE and before column headers)
      if (rowStr.includes('BRAND') || rowStr.includes('FORGE BRAND') || rowStr.includes('HORSE BRAND')) {
        const parts = rowStr.split(/[:–-]/).map(s => s.trim());
        if (parts.length >= 2) brandName = parts[parts.length - 1].replace(/BRAND/gi, '').trim() || brandName;
      }
      // Also check for standalone brand name between company header and table
      if (i >= 1 && i <= 3 && !rowStr.includes('INVESTMENTS') && !rowStr.includes('DATE') && !rowStr.includes('SL') && !rowStr.includes('STOCK')) {
        const cleaned = (rows[i] || []).map(c => String(c || '').trim()).filter(Boolean);
        if (cleaned.length === 1 && cleaned[0].length > 2 && cleaned[0].length < 40 && isNaN(Number(cleaned[0]))) {
          brandName = cleaned[0];
        }
      }
    }

    // Find header row with column names
    let headerIdx = -1;
    let colMap: Record<string, number> = {};
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
          if (cell.includes('CODE') || cell === 'CODE#' || cell === 'CODE #') colMap['code'] = idx;
          if (cell.includes('ITEM') || cell.includes('DESCRIPTION') || cell.includes('NAME') || cell.includes('PARTICULAR')) colMap['name'] = idx;
          if (cell.includes('OPENING') || cell === 'OPS') colMap['opening'] = idx;
          if (cell.includes('RECEIVED') || cell === 'REC') colMap['received'] = idx;
          if (cell.includes('SUPPLIED') || cell.includes('SALES') || cell === 'SUPP' || cell.includes('SOLD')) colMap['supplied'] = idx;
          if (cell.includes('RETURNED') || cell === 'RTD' || cell.includes('RETURN')) colMap['returned'] = idx;
          if (cell.includes('CLOSING') || cell === 'CLS' || cell.includes('BALANCE')) colMap['closing'] = idx;
        });
        break;
      }
    }

    if (headerIdx === -1 || colMap['name'] === undefined) return results;

    const { items, brands } = useStore.getState();
    // Track used SKUs in this sheet and database to avoid duplicates
    const usedSkus = new Set<string>(items.map(it => it.sku).filter(Boolean));

    // Parse data rows
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const itemName = String(row[colMap['name']] || '').trim();

      // Skip empty, header, or total rows
      if (!itemName || itemName.length < 2) continue;
      const upper = itemName.toUpperCase();
      if (['TOTAL', 'GRAND TOTAL', 'TOTAL QTY', 'SL NO', 'DATE', 'PARTICULARS'].some(k => upper === k || upper.startsWith(k + ' '))) continue;
      // Skip section headers (bold category names like "SHORTS", "MEN SHIRT", "COTTON PANTS", "COATS", "JOGGING")
      // These are typically short names with no numeric data in the row
      const hasAnyNumeric = [colMap['opening'], colMap['received'], colMap['supplied'], colMap['returned'], colMap['closing']]
        .filter(c => c !== undefined)
        .some(c => { const v = Number(String(row[c] || '').replace(/[^\d.-]/g, '')); return !isNaN(v) && v !== 0; });
      if (!hasAnyNumeric && itemName.length < 25 && !row[colMap['code']]) continue;

      const parseNum = (idx: number | undefined) => {
        if (idx === undefined) return 0;
        const raw = String(row[idx] || '').replace(/[^\d.-]/g, '');
        const n = Math.round(Number(raw));
        return isNaN(n) ? 0 : n;
      };

      const opening = parseNum(colMap['opening']);
      const received = parseNum(colMap['received']);
      const supplied = parseNum(colMap['supplied']);
      const returned = parseNum(colMap['returned']);
      const closing = parseNum(colMap['closing']);
      const code = String(row[colMap['code']] || '').trim();

      // Use closing stock as quantity; if 0 or missing, use opening + received - supplied + returned
      let qty = closing;
      if (qty === 0 && (opening > 0 || received > 0)) {
        qty = opening + received - supplied + returned;
      }

      // Check if this brand item already exists and has an SKU assigned
      const matchedBrand = brands.find(b => b.name.trim().toUpperCase() === (brandName || 'Imported').trim().toUpperCase());
      const existingItem = matchedBrand 
        ? items.find(it => it.brand_id === matchedBrand.id && it.name.toLowerCase().trim() === itemName.toLowerCase().trim())
        : null;

      let skuCode = '';
      if (existingItem) {
        skuCode = existingItem.sku;
      } else {
        skuCode = generateBrandSKU(brandName || 'Imported', itemName, usedSkus, code);
      }

      results.push({
        name: itemName, qty: Math.max(qty, 0),
        unitCost: 0, retailPrice: 0, minStockLimit: 0,
        sku: skuCode,
        category: brandName || 'Imported',
        brandName,
        code,
        opening, received, supplied, returned, closing
      });
      usedSkus.add(skuCode);
    }

    return results;
  };

  const handleImportExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!excelFile || !importTargetLocation) return;
    setIsProcessing(true);
    setImportProcessingStatus('Initialising parser...');

    try {
      let rows: any[][] = [];
      const fileType = excelFile.name.split('.').pop()?.toLowerCase();
      let workbook: XLSX.WorkBook | null = null;

      if (fileType === 'xlsx' || fileType === 'xls') {
        setImportProcessingStatus('Reading spreadsheet...');
        const buffer = await excelFile.arrayBuffer();
        workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 });
      } else if (fileType === 'pdf' || fileType?.match(/png|jpg|jpeg/)) {
        setImportProcessingStatus('Performing OCR text extraction...');
        const { data: { text } } = await Tesseract.recognize(excelFile, 'eng', {
          logger: m => m.status === 'recognizing text' ? setImportProcessingStatus(`OCR: ${Math.round(m.progress * 100)}%`) : null
        });
        rows = text.split('\n').filter(l => l.trim()).map(line => line.split(/\s{2,}|\t/));
      }

      setImportProcessingStatus('Analyzing structure...');
      let parsedItems: { 
        name: string; qty: number; unitCost: number; retailPrice: number; sku: string; category: string; minStockLimit?: number;
        opening?: number; received?: number; supplied?: number; returned?: number; closing?: number;
      }[] = [];

      let isMultiSheetStock = false;
      if (workbook && workbook.SheetNames.length > 1) {
        const firstSheetStr = rows.slice(0, 8).map(r => (r || []).map((c: any) => String(c || '').toUpperCase()).join(' ')).join(' ');
        const hasStockHeader = firstSheetStr.includes('STOCK') || firstSheetStr.includes('WAREHOUSE') || firstSheetStr.includes('INVESTMENTS');
        const hasStockCols = firstSheetStr.includes('OPENING') || firstSheetStr.includes('CLOSING') || firstSheetStr.includes('RECEIVED') || firstSheetStr.includes('SUPPLIED');
        const brandSheetCount = workbook.SheetNames.filter(n =>
          n.toUpperCase().includes('SUMM') || n.toUpperCase().includes('SUMMARY') ||
          (!n.toUpperCase().includes('TOTAL') && n.length > 2)
        ).length;

        if ((hasStockHeader || hasStockCols) && brandSheetCount >= 1) {
          isMultiSheetStock = true;
        }
      }

      if (isMultiSheetStock && workbook) {
        setImportProcessingStatus(`Detected multi-brand stock workbook (${workbook.SheetNames.length} sheets)...`);

        for (let s = 0; s < workbook.SheetNames.length; s++) {
          const sheetName = workbook.SheetNames[s];
          setImportProcessingStatus(`Reading sheet ${s + 1}/${workbook.SheetNames.length}: ${sheetName}...`);

          const sheet = workbook.Sheets[sheetName];
          const sheetRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

          if (sheetRows.length < 3) continue;

          const sheetItems = parseStockWarehouseSheet(sheetRows, sheetName);
          parsedItems.push(...sheetItems);
        }

        const deduped = new Map<string, typeof parsedItems[0]>();
        for (const item of parsedItems) {
          const key = item.name.toLowerCase();
          if (deduped.has(key)) {
            const existing = deduped.get(key)!;
            existing.qty += item.qty;
            if (existing.opening !== undefined && item.opening !== undefined &&
                existing.received !== undefined && item.received !== undefined &&
                existing.supplied !== undefined && item.supplied !== undefined &&
                existing.returned !== undefined && item.returned !== undefined &&
                existing.closing !== undefined && item.closing !== undefined) {
               existing.opening += item.opening;
               existing.received += item.received;
               existing.supplied += item.supplied;
               existing.returned += item.returned;
               existing.closing += item.closing;
            }
          } else {
            deduped.set(key, { ...item });
          }
        }
        parsedItems = Array.from(deduped.values());
        setImportProcessingStatus(`Found ${parsedItems.length} unique items across all brand sheets.`);
      }

      else if (!isMultiSheetStock && rows.length > 3) {
        const headerStr = rows.slice(0, 8).map(r => (r || []).map((c: any) => String(c || '').toUpperCase()).join(' ')).join(' ');
        const isSingleStockSheet = (headerStr.includes('OPENING') || headerStr.includes('CLOSING')) &&
          (headerStr.includes('ITEM') || headerStr.includes('DESCRIPTION'));

        if (isSingleStockSheet) {
          setImportProcessingStatus('Detected stock warehouse format (single sheet)...');
          parsedItems = parseStockWarehouseSheet(rows, workbook?.SheetNames[0] || 'Import');
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
            setImportProcessingStatus('Parsing Flat List (Smart Detect)...');
            let nameCol = -1;
            let qtyCol = -1;
            let startIdx = 0;

            for (let i = 0; i < Math.min(20, rows.length); i++) {
              const row = (rows[i] || []).map((c: any) => String(c).toUpperCase().trim());
              let qIdx = row.findIndex((c: string) => ['CLS', 'CLOSING', 'BALANCE'].some(k => c === k || c.startsWith(k)));
              if (qIdx === -1) qIdx = row.findIndex((c: string) => ['QTY', 'QUANTITY', 'TOTAL', 'REC', 'STOCK'].some(k => c === k || c.startsWith(k)));

              if (qIdx !== -1) {
                qtyCol = qIdx;
                const nIdx = row.findIndex((c: string) => ['ITEM', 'NAME', 'PARTICULAR', 'DESCRIPTION', 'PRODUCT'].some(k => c.includes(k)));
                nameCol = nIdx !== -1 ? nIdx : 0;
                startIdx = i + 1;
                break;
              }
            }

            if (qtyCol === -1) qtyCol = 1;
            if (nameCol === -1) nameCol = 0;

            const listSkus = new Set<string>();

            for (let i = startIdx; i < rows.length; i++) {
              const row = rows[i] || [];
              const pName = String(row[nameCol] || '').trim();
              const pQty = Math.round(Number(String(row[qtyCol] || '').replace(/[^\d.-]/g, '')));

              if (!pName || isNaN(pQty) || pName.length < 2) continue;
              if (['DATE', 'PARTICULARS', 'TOTAL', 'GRAND TOTAL'].includes(pName.toUpperCase())) continue;

              const listSku = generateBrandSKU('List', pName, listSkus);
              listSkus.add(listSku);
              parsedItems.push({
                name: pName, qty: pQty,
                unitCost: 0, retailPrice: 0, minStockLimit: 0,
                sku: listSku, category: 'List Import'
              });
            }
          }
        }
      }

      setImportPreview(parsedItems);
      setImportProcessingStatus(`Success! Found ${parsedItems.length} items with Closing Stock values.`);
    } catch (err: any) {
      console.error(err);
      alert("Parser Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const executeFinalImport = async () => {
    if (!importTargetLocation || importPreview.length === 0) return;
    setImportSaving(true);
    try {
      setImportProcessingStatus('Preparing import...');

      const containerId = await addContainer({
        container_no: `IMP-PRO-${Date.now().toString().slice(-6)}`,
        source_country: 'Smart Import',
        total_cost: 0, currency: 'USD', converted_cost_USD: 0,
        date: new Date().toISOString(),
        notes: `Confirmed import with ${importPreview.length} items`,
      });

      setImportProcessingStatus(`Building batches for ${importPreview.length} items...`);

      const localItemsMap = new Map<string, any>();
      items.forEach(it => localItemsMap.set(`${it.brand_id}_${it.name.toLowerCase().trim()}`, it));
      const localBrandsMap = new Map<string, any>();
      brands.forEach(b => localBrandsMap.set(b.name.trim().toUpperCase(), b));

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

      for (const pItem of importPreview) {
        const incomingCostINR = toUSD(pItem.unitCost, importCurrency);

        const brandNameText = (pItem.category || 'Imported').trim().toUpperCase();
        let matchedBrand = localBrandsMap.get(brandNameText);
        let brandId = matchedBrand?.id;

        if (!brandId) {
          const bRef = doc(collection(db, 'brands'));
          brandId = bRef.id;
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
          localBrandsMap.set(brandNameText, newBrand);
        }

        let item = localItemsMap.get(`${brandId}_${pItem.name.toLowerCase().trim()}`);
        let itemId = item?.id;

        if (!itemId) {
          const iRef = doc(collection(db, 'items'));
          itemId = iRef.id;
          const newItem = {
            id: itemId, brand_id: brandId || brands[0]?.id || 'imported', name: pItem.name,
            sku: generateBrandSKU(brandNameText, pItem.name, importedSkusSet, pItem.sku),
            category: pItem.category || 'Imported',
            min_stock_limit: pItem.minStockLimit || 0,
            retail_price: pItem.retailPrice || 0,
            avg_cost_USD: incomingCostINR
          };
          if (masterOpCount >= MASTER_CHUNK) {
            allMasterBatches.push(masterBatch);
            masterBatch = writeBatch(db);
            masterOpCount = 0;
          }
          masterBatch.set(iRef, newItem);
          masterOpCount++;
          localItemsMap.set(`${brandId}_${pItem.name.toLowerCase().trim()}`, newItem);
          newItemsCreated++;
        } else {
          const updateData: any = {};
          if (pItem.retailPrice !== undefined && pItem.retailPrice > 0) updateData.retail_price = pItem.retailPrice;
          if (incomingCostINR !== undefined && incomingCostINR > 0) updateData.avg_cost_USD = incomingCostINR;
          if (pItem.minStockLimit !== undefined) updateData.min_stock_limit = pItem.minStockLimit;
          if (brandId) updateData.brand_id = brandId;
          if (Object.keys(updateData).length > 0) {
            if (masterOpCount >= MASTER_CHUNK) {
              allMasterBatches.push(masterBatch);
              masterBatch = writeBatch(db);
              masterOpCount = 0;
            }
            masterBatch.update(doc(db, 'items', itemId), updateData);
            masterOpCount++;
            existingItemsUpdated++;
          }
        }

        const safeLocId = importTargetLocation.replace(/\//g, '-');
        const safeItemId = (itemId as string).replace(/\//g, '-');
        const invId = `${safeLocId}_${safeItemId}`;
        const existing = inventorySnapshot.get(invId);
        
        let opening = 0;
        let received = 0;
        let supplied = 0;
        let returned = 0;

        if (!existing) {
          const excelClosing = pItem.closing || pItem.qty || 0;
          opening = excelClosing;
          received = 0;
          supplied = 0;
          returned = 0;
        } else {
          opening = existing.quantity || 0;
          supplied = existing.supplied_balance || 0;
          returned = existing.returned_balance || 0;
          
          const excelClosing = pItem.closing || pItem.qty || opening;
          supplied = 0;
          returned = 0;
          received = Math.max(0, excelClosing - opening);
        }
        
        const newQty = opening + received - supplied + returned;

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
          avg_cost_USD: incomingCostINR > 0 ? incomingCostINR : (existing?.avg_cost_USD ?? 0)
        });
        invOpCount++;

        const txQty = pItem.closing ?? pItem.qty ?? 0;
        if (txQty > 0) {
          const txRef = doc(collection(db, 'transactions'));
          if (invOpCount >= INV_CHUNK) {
            inventoryBatches.push(invBatch);
            invBatch = writeBatch(db);
            invOpCount = 0;
          }
          invBatch.set(txRef, {
            id: txRef.id,
            type: 'stock_entry',
            from_location: 'supplier',
            to_location: importTargetLocation,
            item_id: itemId,
            item_name: pItem.name,
            quantity: txQty,
            unit_cost: pItem.unitCost || 0,
            currency: importCurrency,
            converted_value_USD: toUSD((pItem.unitCost || 0) * txQty, importCurrency),
            performed_by: useAuthStore.getState().user?.name ?? 'Admin',
            container_id: containerId,
            notes: 'Imported via Smart Stock Import',
            timestamp: new Date().toISOString()
          });
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
        await allBatches[i].commit();
        setImportProcessingStatus(`Saving... ${i + 1}/${allBatches.length} batches done`);
        if (i < allBatches.length - 1) await sleep(300);
      }

      // ── Save Import Session ──────────────────────────────────────────────
      const sessionItems: ImportSessionItem[] = importPreview.map(pItem => {
        const brandName = (pItem.category || 'Imported').trim().toUpperCase();
        // Use localBrandsMap (built during this import) — not stale React brands state
        // This ensures newly created brands in this import are resolved correctly
        const resolvedBrand = localBrandsMap.get(brandName);
        const resolvedItem = localItemsMap.get(`${resolvedBrand?.id ?? ''}_${pItem.name.toLowerCase().trim()}`);
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
        date: new Date().toISOString(),
        fileName: importExcelFileName || 'Manual Import',
        location_id: importTargetLocation,
        currency: importCurrency,
        itemCount: importPreview.length,
        totalItems: importPreview.reduce((sum, i) => sum + (i.closing ?? i.qty ?? 0), 0),
        items: sessionItems,
        status: 'confirmed',
        container_id: containerId,
      });
      // ──────────────────────────────────────────────────────────────────────

      alert(`Import successful! ${newItemsCreated} new items created, ${existingItemsUpdated} updated.`);
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
      title="Smart Stock Import" 
      description="Upload Excel, PDF, or Images. Drag & Drop supported." 
      minimizeLabel={importExcelFileName ? `Importing ${importExcelFileName}` : "Bulk Import"}
      size="xl"
    >
      <form onSubmit={handleImportExcel} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <button type="button" onClick={(e) => { e.stopPropagation(); setExcelFile(null); setImportExcelFileName(null); }} className="text-[10px] text-red-500 font-bold uppercase mt-2 flex items-center gap-1">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">{importPreview.length} Items Found</p>
              </div>
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-gray-50 text-[10px] uppercase font-bold text-gray-400">
                    <tr>
                      <th className="py-3 px-3 text-left">Item Name</th>
                      <th className="py-3 px-3 text-left">SKU</th>
                      <th className="py-3 px-3 text-left">Brand</th>
                      <th className="py-3 px-3 text-right">Qty</th>
                      <th className="py-3 px-3 text-right">Unit Cost ({importCurrency})</th>
                      <th className="py-3 px-3 text-right">Retail Price</th>
                      <th className="py-3 px-3 text-right">Min Limit</th>
                      <th className="py-3 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {importPreview.map((item, idx) => (
                      <ImportPreviewRow 
                        key={item.name + idx} 
                        item={item} 
                        idx={idx} 
                        importCurrency={importCurrency}
                        onUpdate={handleUpdateImportItem}
                        onRemove={handleRemoveImportItem}
                      />
                    ))}
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
          <button type="submit" className="btn-primary" disabled={importSaving || !importExcelFileName || importPreview.length > 0}>{importSaving ? 'Processing…' : 'Analyze & Preview'}</button>
        </div>
      </form>
    </Modal>
  );
}
