/**
 * Bulk Import & Export System
 * Handles fast batch processing of 100+ items
 * Real-time progress tracking and error handling
 */

import * as XLSX from 'xlsx';

export interface BulkImportOptions {
  batchSize?: number;
  onProgress?: (current: number, total: number) => void;
  onError?: (error: string, rowIndex: number) => void;
}

export interface ExportOptions {
  filename?: string;
  sheetName?: string;
  includeTimestamp?: boolean;
}

/**
 * Parse Excel file with batch processing
 * Returns parsed rows and statistics
 */
export async function parseExcelFile(
  file: File
): Promise<{
  rows: any[];
  total: number;
  errors: Array<{ row: number; error: string }>;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet);
        
        const errors: Array<{ row: number; error: string }> = [];
        
        // Validate rows as we parse
        const validRows = rows.filter((row, idx) => {
          if (!row || Object.keys(row).length === 0) {
            errors.push({ row: idx + 1, error: 'Empty row' });
            return false;
          }
          return true;
        });
        
        resolve({
          rows: validRows,
          total: validRows.length,
          errors
        });
      } catch (err: any) {
        reject(new Error(`Failed to parse Excel: ${err.message}`));
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Process items in batches to prevent UI freezing
 * Supports both parallel processing (for independent ops) and chunk-processing (for batched DB writes)
 */
export async function processBatch<T>(
  items: T[],
  processor: (items: T[]) => Promise<void>,
  batchSize: number = 50,
  onProgress?: (current: number, total: number) => void
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let processedItems = 0;
  let failed = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    try {
      await processor(batch);
      processedItems += batch.length;
    } catch (err: any) {
      failed += batch.length;
      errors.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${err.message}`);
    }
    
    // Report progress
    onProgress?.(i + batch.length, items.length);
    
    // Yield to browser for UI updates
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  return { processed: processedItems, failed, errors };
}

/**
 * Export data to Excel with multiple sheets
 */
export async function exportToExcel(
  dataSheets: Record<string, any[]>,
  options: ExportOptions = {}
): Promise<void> {
  try {
    const workbook = XLSX.utils.book_new();
    
    // Add each dataset as a separate sheet
    Object.entries(dataSheets).forEach(([sheetName, data]) => {
      if (data.length === 0) return;
      
      const worksheet = XLSX.utils.json_to_sheet(data);
      
      // Auto-size columns based on content
      const colWidths = getColumnWidths(data);
      worksheet['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });
    
    // Generate filename
    const timestamp = options.includeTimestamp 
      ? `_${new Date().toISOString().split('T')[0]}` 
      : '';
    const filename = `${options.filename || 'inventory_export'}${timestamp}.xlsx`;
    
    // Download
    console.log(`[bulkOperations] Generating Excel for ${filename}... Sheets: ${Object.keys(dataSheets).join(', ')}`);
    XLSX.writeFile(workbook, filename);
    console.log(`[bulkOperations] Download triggered successfully for ${filename}`);
  } catch (err: any) {
    console.error('[bulkOperations] CORE EXPORT FAILURE:', err);
    throw new Error(`Failed to export Excel: ${err.message}`);
  }
}

/**
 * Export all system data into a single Excel file with multiple sheets
 */
export async function exportInventorySystemData(data: {
  inventory: any[];
  sales: any[];
  returns: any[];
  expenses: any[];
  locations: any[];
  items: any[];
  brands: any[];
}) {
  const { inventory, sales, returns, expenses, locations, items } = data;

  const dataSheets: Record<string, any[]> = {
    'Current Stock': (inventory || []).map(e => {
      const item = (items || []).find(i => i.id === e.item_id);
      const loc = (locations || []).find(l => l.id === e.location_id);
      const qty = e.quantity || 0;
      const cost = e.avg_cost_INR || 0;
      return {
        'Item Name': item?.name || e.item_id || 'Unknown',
        'SKU': item?.sku || '',
        'Category': item?.category || '',
        'Location': loc?.name || e.location_id || 'Unknown',
        'Location Type': loc?.type || '',
        'Quantity': qty,
        'Avg Cost (INR)': cost.toFixed(2),
        'Retail Price (INR)': (item?.retail_price || 0).toFixed(2),
        'Value (INR)': (qty * cost).toFixed(2)
      };
    }),
    'Sales Log': (sales || []).map(s => ({
      'Date': s.timestamp ? new Date(s.timestamp).toLocaleDateString() : '-',
      'Item': s.item_name || 'Unknown',
      'Location': (locations || []).find(l => l.id === s.location_id)?.name || 'Unknown',
      'Qty': s.quantity || 0,
      'Price': (s.selling_price || 0).toFixed(2),
      'Total (INR)': (s.converted_price_INR || 0).toFixed(2),
      'Profit (INR)': (s.profit_INR || 0).toFixed(2),
      'Sold By': s.sold_by || 'Unknown'
    })),
    'Returns Log': (returns || []).map(r => ({
      'Date': r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '-',
      'Item': r.item_name || 'Unknown',
      'Location': (locations || []).find(l => l.id === r.location_id)?.name || 'Unknown',
      'Qty': r.quantity || 0,
      'Reason': r.reason || 'No reason provided',
      'Status': r.status || 'pending'
    })),
    'Expenses': (expenses || []).map(ex => ({
      'Date': ex.date ? new Date(ex.date).toLocaleDateString() : '-',
      'Location': (locations || []).find(l => l.id === ex.location_id)?.name || 'Unknown',
      'Category': ex.category || 'General',
      'Amount': (ex.amount || 0).toFixed(2),
      'Currency': ex.currency || 'INR',
      'Total (INR)': (ex.converted_amount_INR || ex.amount || 0).toFixed(2),
      'Notes': ex.notes || ''
    })),
    'Stock Summary': (locations || []).map(l => {
      const locInv = (inventory || []).filter(i => i.location_id === l.id);
      const locSales = (sales || []).filter(s => s.location_id === l.id);
      const totalItems = locInv.reduce((sum, i) => sum + (i.quantity || 0), 0);
      const totalValue = locInv.reduce((sum, i) => sum + (i.quantity || 0) * (i.avg_cost_INR || 0), 0);
      const totalRev = locSales.reduce((sum, s) => sum + (s.converted_price_INR || 0), 0);
      const totalProfit = locSales.reduce((sum, s) => sum + (s.profit_INR || 0), 0);
      
      return {
        'Location': l.name || 'Unknown',
        'Type': l.type || 'N/A',
        'Total Items': totalItems,
        'Stock Value (INR)': totalValue.toFixed(2),
        'Total Revenue (INR)': totalRev.toFixed(2),
        'Total Profit (INR)': totalProfit.toFixed(2),
        'Margin %': totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(2) : '0.00'
      };
    })
  };

  await exportToExcel(dataSheets, {
    filename: `777_Inventory_Report_${new Date().toISOString().split('T')[0]}`,
    includeTimestamp: true
  });
}

/**
 * Calculate optimal column widths
 */
function getColumnWidths(data: any[]): Array<{ wch: number }> {
  if (data.length === 0) return [];
  
  const columns = Object.keys(data[0]);
  
  return columns.map(col => {
    let maxWidth = col.length;
    data.forEach(row => {
      const cellValue = String(row[col] || '');
      maxWidth = Math.max(maxWidth, cellValue.length);
    });
    return { wch: Math.min(maxWidth + 2, 50) };
  });
}

/**
 * Export inventory in a matrix-style ledger format matching user's spreadsheet image
 */
export async function exportInventoryToLedger(data: {
  locationId: string;
  locations: any[];
  items: any[];
  brands: any[];
  transactions: any[];
  inventory: any[];
  sales: any[];
  returns: any[];
}) {
  const { locationId, locations, items, transactions, sales, returns } = data;
  const location = locations.find(l => l.id === locationId);
  if (!location) throw new Error("Location not found");

  // 1. Prepare grouped transactions for this location
  // Map our internal transactions to OPS, REC, SUP, RTD, CLS
  // We need to build a day-by-day or event-by-event ledger
  
  // Sort all relevant events by timestamp
  const events = [
    ...(transactions || []).filter(t => t.from_location === locationId || t.to_location === locationId),
    ...(sales || []).filter(s => s.location_id === locationId).map(s => ({ ...s, type: 'sale' as const })),
    ...(returns || []).filter(r => r.location_id === locationId).map(r => ({ ...r, type: 'return' as const }))
  ].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

  // 2. Identify all items that have ever been in this location
  const locationItemIds = new Set(events.map(e => e.item_id));
  const activeItems = items.filter(i => locationItemIds.has(i.id));

  // 3. Initialize balances
  const balances: Record<string, number> = {};
  activeItems.forEach(i => balances[i.id] = 0);

  // 4. Build Rows
  const spreadsheetRows: any[][] = [];

  // Metadata rows
  spreadsheetRows.push(['TRIPLE SEVEN INVESTMENTS LTD', '', '', '', '']); // Title
  spreadsheetRows.push([location.name.toUpperCase(), '', '', '', '']); // Location
  spreadsheetRows.push([new Date().toLocaleDateString(), '', '', '', '']); // Date

  // Header Row 1: Item Names (spanning 5 columns each)
  const header1 = ['', '']; // Date, Particulars
  activeItems.forEach(item => {
    header1.push(item.name.toUpperCase());
    header1.push('', '', '', ''); // Span
  });
  spreadsheetRows.push(header1);

  // Header Row 2: Sub-metrics
  const header2 = ['Date', 'Particulars'];
  activeItems.forEach(() => {
    header2.push('OPS', 'REC', 'SUP', 'RTD', 'CLS');
  });
  spreadsheetRows.push(header2);

  // Data Rows
  // We should group events by (Date + Particulars) to keep the matrix compact
  interface DailyMatrix {
    date: string;
    particulars: string;
    items: Record<string, { ops: number; rec: number; sup: number; rtd: number; cls: number }>;
  }

  const groupedRows: DailyMatrix[] = [];
  
  events.forEach(event => {
    const date = event.timestamp ? new Date(event.timestamp).toLocaleDateString() : '-';
    const particulars = (event as any).particulars || (event as any).notes || event.type.toUpperCase();
    
    // Find or create group
    let grp = groupedRows.find(g => g.date === date && g.particulars === particulars);
    if (!grp) {
      grp = { date, particulars, items: {} };
      activeItems.forEach(i => {
        grp!.items[i.id] = { ops: balances[i.id], rec: 0, sup: 0, rtd: 0, cls: balances[i.id] };
      });
      groupedRows.push(grp);
    }

    const itemMetrics = grp.items[event.item_id];
    if (itemMetrics) {
      const qty = event.quantity || 0;
      if (event.type === 'stock_entry' || (event.type === 'transfer' && event.to_location === locationId)) {
        itemMetrics.rec += qty;
        balances[event.item_id] += qty;
      } else if (event.type === 'sale' || (event.type === 'transfer' && event.from_location === locationId)) {
        itemMetrics.sup += qty;
        balances[event.item_id] -= qty;
      } else if (event.type === 'return') {
        itemMetrics.rtd += qty;
        balances[event.item_id] += qty; // Assuming returned to stock
      }
      itemMetrics.cls = balances[event.item_id];
    }
  });

  // Convert groups to spreadsheet rows
  groupedRows.forEach(grp => {
    const row: any[] = [grp.date, grp.particulars];
    activeItems.forEach(item => {
      const m = grp.items[item.id];
      row.push(m.ops || 0, m.rec || 0, m.sup || 0, m.rtd || 0, m.cls || 0);
    });
    spreadsheetRows.push(row);
  });

  // Summary Row (Final totals)
  const summaryRow: any[] = ['TOTAL', '-'];
  activeItems.forEach(item => {
    const finalBalance = balances[item.id];
    // For summary, we might want sums of REC, SUP, etc.
    const totalRec = groupedRows.reduce((a, b) => a + (b.items[item.id]?.rec || 0), 0);
    const totalSup = groupedRows.reduce((a, b) => a + (b.items[item.id]?.sup || 0), 0);
    const totalRtd = groupedRows.reduce((a, b) => a + (b.items[item.id]?.rtd || 0), 0);
    summaryRow.push(0, totalRec, totalSup, totalRtd, finalBalance);
  });
  spreadsheetRows.push(summaryRow);

  // Create Worksheet
  const worksheet = XLSX.utils.aoa_to_sheet(spreadsheetRows);

  // Styling (Merges for item names)
  const merges: XLSX.Range[] = [];
  activeItems.forEach((_, idx) => {
    const startCol = 2 + (idx * 5);
    merges.push({
      s: { r: 3, c: startCol },
      e: { r: 3, c: startCol + 4 }
    });
  });
  worksheet['!merges'] = merges;

  // Auto-width
  const colWidths = spreadsheetRows[header2.length].map((_, i) => ({ wch: i < 2 ? 20 : 6 }));
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ledger');
  XLSX.writeFile(workbook, `${location.name}_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
}

/**
 * Format data for export with proper column headers
 */
export function formatExportData(data: any[], columns: string[]): any[] {
  return data.map(row => {
    const formatted: any = {};
    columns.forEach(col => {
      const value = row[col];
      if (value instanceof Date) {
        formatted[col] = value.toLocaleDateString();
      } else if (typeof value === 'number') {
        formatted[col] = Number.isInteger(value) ? value : value.toFixed(2);
      } else if (value == null) {
        formatted[col] = '';
      } else {
        formatted[col] = value;
      }
    });
    return formatted;
  });
}

/**
 * Export Daily Sales Report - matches the 777 Investments paper format
 * Header: Company name, Shop name, Date
 * Columns: Brand, Item Description, No. Qty Sold, Selling Price Per Unit, Total Sales, Net Profit
 */
export async function exportDailySalesReport(data: {
  locationId: string;
  date: string; // YYYY-MM-DD
  sales: any[];
  locations: any[];
  items: any[];
  brands: any[];
  inventory: any[];
  transactions: any[];
}) {
  const { locationId, date, sales, locations, items, brands, inventory, transactions } = data;
  const location = locations.find(l => l.id === locationId);
  const locationName = location?.name || 'Unknown';

  // Filter sales for this location and date
  const daySales = sales.filter(s => {
    if (s.location_id !== locationId) return false;
    const saleDate = new Date(s.timestamp).toISOString().split('T')[0];
    return saleDate === date;
  });

  // Calculate bales/bags balance
  // Opening = stock at start of day (current stock + sold today - received today)
  const dayTransfers = transactions.filter(t => {
    const txDate = new Date(t.timestamp).toISOString().split('T')[0];
    return txDate === date && (t.from_location === locationId || t.to_location === locationId);
  });

  const totalReceived = dayTransfers
    .filter(t => t.to_location === locationId && (t.type === 'transfer' || t.type === 'stock_entry'))
    .reduce((s, t) => s + (t.quantity || 0), 0);

  const totalSoldQty = daySales.reduce((s, sale) => s + (sale.quantity || 0), 0);

  const currentStock = inventory
    .filter(e => e.location_id === locationId)
    .reduce((s, e) => s + (e.quantity || 0), 0);

  const openingBalance = currentStock + totalSoldQty - totalReceived;
  const closingBalance = currentStock;

  // Build AOA (Array of Arrays) for custom formatting
  const rows: any[][] = [];

  // Header rows
  rows.push(['777 INVESTMENTS LTD-2026']);
  rows.push([]);
  rows.push([`SHOP-DAILY SALES REPORT`, '', '', '', 'DATE', date]);
  rows.push([locationName]);
  rows.push([]);

  // Stock balance section
  rows.push(['BALES/STOCK SUMMARY']);
  rows.push(['OPENING BALANCE', openingBalance]);
  rows.push(['RECEIVED', totalReceived]);
  rows.push(['SOLD', totalSoldQty]);
  rows.push(['CLOSING BALANCE', closingBalance]);
  rows.push([]);

  // Sales table header
  rows.push(['BRANDS', 'ITEM DESCRIPTION', 'NO. QTY SOLD', 'SELLING PRICE PER UNIT', 'TOTAL SALES', 'NET PROFIT']);

  // Sales rows
  let grandTotalSales = 0;
  let grandTotalProfit = 0;

  daySales.forEach(sale => {
    const item = items.find(i => i.id === sale.item_id);
    const brand = brands.find(b => b.id === item?.brand_id);
    const totalSale = sale.converted_price_INR || (sale.selling_price * sale.quantity);
    const profit = sale.profit_INR || 0;

    grandTotalSales += totalSale;
    grandTotalProfit += profit;

    rows.push([
      brand?.name || '-',
      sale.item_name || item?.name || 'Unknown',
      sale.quantity || 0,
      sale.selling_price || 0,
      totalSale,
      profit
    ]);
  });

  // Totals row
  rows.push([]);
  rows.push(['', 'TOTAL', totalSoldQty, '', grandTotalSales, grandTotalProfit]);

  // Create workbook with AOA
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 18 }, // Brand
    { wch: 30 }, // Item Description
    { wch: 14 }, // Qty Sold
    { wch: 20 }, // Selling Price
    { wch: 16 }, // Total Sales
    { wch: 14 }, // Net Profit
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Daily Sales Report');

  const formattedDate = date.replace(/-/g, '_');
  XLSX.writeFile(wb, `Sales_Report_${locationName}_${formattedDate}.xlsx`);
}

/**
 * Helper function to generate an HTML table and trigger print to PDF
 */
function openPrintablePDF(rows: any[][]) {
  const win = window.open('', '_blank');
  if (!win) {
    alert("Popup blocked! Please allow popups for this site to print to PDF.");
    return;
  }
  
  let html = `
    <html>
      <head>
        <title>Stock Report</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #000; margin: 20px; }
          .header-table { width: 100%; margin-bottom: 20px; border: none; }
          .data-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .data-table th, .data-table td { border: 1px solid #000; padding: 4px; text-align: center; }
          .data-table td:nth-child(2) { text-align: left; }
          .data-table th { background-color: #f0f0f0; font-weight: bold; }
          .text-left { text-align: left !important; }
          .text-right { text-align: right !important; }
          .strong { font-weight: bold; }
          .center { text-align: center; }
          h3, h4 { margin: 2px 0; font-weight: bold; text-align: center; }
          @media print {
            @page { margin: 1cm; }
            body { font-size: 10px; }
            .data-table th { background-color: #f0f0f0 !important; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
  `;

  // Process rows
  // First 4 rows are header metadata based on exportStockReport
  if (rows.length > 4) {
    html += `<table class="header-table">
      <tr>
        <td class="text-left strong">${rows[0][0]}</td>
        <td class="text-right strong">${rows[0][3] || 'DATE'} ${rows[0][4] || ''}</td>
      </tr>
      <tr><td colspan="2" class="center"><h3>${rows[1][0]}</h3></td></tr>
      <tr><td colspan="2" class="center"><h4>${rows[2][0]}</h4></td></tr>
    </table>`;

    html += '<table class="data-table">';
    // Table Header (Row index 4)
    html += '<thead><tr>';
    rows[4].forEach((cell: any) => html += `<th>${cell || ''}</th>`);
    html += '</tr></thead><tbody>';

    // Table Body
    for (let i = 5; i < rows.length; i++) {
      html += '<tr>';
      rows[i].forEach((cell: any) => html += `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`);
      html += '</tr>';
    }
    
    html += '</tbody></table>';
  }

  html += `
      </body>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

/**
 * Format helper for numbers to match Indian currency formatting or standard whole numbers
 */
function formatNum(num: number | undefined): string {
  if (num === undefined || num === null) return '0';
  return num.toLocaleString('en-IN');
}

/**
 * Enhanced Daily Sales Report matching the specific 777 Investments paper layout
 * Includes BALES and BAGS/BOXES summary boxes and detailed main table
 */
export async function printDailySalesReport777(data: {
  locationId: string;
  date: string;
  sales: any[];
  locations: any[];
  items: any[];
  brands: any[];
  inventory: any[];
  transactions: any[];
  returns: any[];
}) {
  const { locationId, date, sales, locations, items, brands, inventory, transactions, returns } = data;
  const location = locations.find(l => l.id === locationId);
  const locationName = location?.name || 'Unknown';

  // Use the sales data directly as it's already filtered by UI
  const daySales = sales;

  // Calculate stats for BALES vs BAGS/BOXES
  // For now, we group by item category. 
  // If category includes "Bale", it goes to Bales, otherwise Bags & Boxes.
  const filterSummary = (categoryMatch: (cat: string) => boolean) => {
    const relevantSales = daySales.filter(s => {
      const item = items.find(i => i.id === s.item_id);
      return categoryMatch(item?.category || '');
    });

    const sold = relevantSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
    
    // Returns today
    const returned = returns.filter(r => {
      const rDate = new Date(r.timestamp).toISOString().split('T')[0];
      const item = items.find(i => i.id === r.item_id);
      return rDate === date && r.location_id === locationId && r.status === 'Restocked' && categoryMatch(item?.category || '');
    }).reduce((sum, r) => sum + (r.quantity || 0), 0);

    // Transfers/Received today
    const received = transactions.filter(t => {
      const tDate = new Date(t.timestamp).toISOString().split('T')[0];
      const item = items.find(i => i.id === t.item_id);
      return tDate === date && t.to_location === locationId && (t.type === 'transfer' || t.type === 'stock_entry') && categoryMatch(item?.category || '');
    }).reduce((sum, t) => sum + (t.quantity || 0), 0);

    // Current stock (Closing) for these items
    const closing = inventory.filter(inv => {
      const item = items.find(i => i.id === inv.item_id);
      return inv.location_id === locationId && categoryMatch(item?.category || '');
    }).reduce((sum, inv) => sum + (inv.quantity || 0), 0);

    // Formula: Opening = Closing + Sold - Received - Returned
    const opening = closing + sold - received - returned;

    return { opening, received, sold, returned, closing };
  };

  const baleStats = filterSummary(cat => cat.toLowerCase().includes('bale'));
  const boxStats = filterSummary(cat => !cat.toLowerCase().includes('bale'));

  const win = window.open('', '_blank');
  if (!win) {
    alert("Popup blocked! Please allow popups for this site.");
    return;
  }

  const html = `
    <html>
      <head>
        <title>Daily Sales Report - ${date}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
          body { font-family: 'Inter', sans-serif; font-size: 12px; margin: 20px; color: #000; }
          .header-container { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; position: relative; }
          .header-center { position: absolute; left: 50%; transform: translateX(-50%); text-align: center; font-weight: 900; font-size: 16px; text-decoration: underline; }
          .header-right { border: 2px solid #000; padding: 5px 20px; font-weight: 900; }
          .location-title { font-weight: 900; font-size: 14px; margin-bottom: 5px; text-decoration: underline; }
          
          .summary-container { display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 20px; width: 100%; border-top: 2px solid #000; border-bottom: 2px solid #000; }
          
          .summary-block { flex: 0 0 35%; border-left: 1px solid #000; border-right: 1px solid #000; }
          .summary-block:first-child { border-left: none; }
          .summary-block:last-child { border-right: none; }
          .summary-header { text-align: center; font-weight: 900; padding: 5px; border-bottom: 2px solid #000; }
          
          .summary-table { width: 100%; border-collapse: collapse; }
          .summary-table th, .summary-table td { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 5px 10px; text-align: left; font-size: 11px; }
          .summary-table tr:last-child th, .summary-table tr:last-child td { border-bottom: none; }
          .summary-table td { border-right: none; text-align: center; font-weight: bold; width: 40%; }
          
          .location-middle { flex: 0 0 30%; text-align: center; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 10px; }
          .location-name { font-weight: 900; font-size: 13px; margin-bottom: 15px; }

          .main-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 2px solid #000; }
          .main-table th, .main-table td { border: 1px solid #000; padding: 8px; text-align: center; }
          .main-table th { font-weight: 900; font-size: 12px; }
          .main-table .text-left { text-align: left; }
          .main-table .footer-row td { font-weight: 900; }
          
          @media print {
            @page { margin: 10mm; }
            body { margin: 0; }
            .handwritten { color: #800 !important; }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="location-title"><br/></div>
          <div class="header-center">SHOP-DAILY SALES REPORT-2026</div>
          <div class="header-right">${new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')}</div>
        </div>

        <div class="summary-container">
          <div class="summary-block border-l-0">
            <div class="summary-header">BALES</div>
            <table class="summary-table">
              <tr><th>OPENING BALANCE</th><td>${baleStats.opening || ''}</td></tr>
              <tr><th>RECEIVED</th><td>${baleStats.received || ''}</td></tr>
              <tr><th>SOLD</th><td>${baleStats.sold || ''}</td></tr>
              <tr><th>CLOSING BALANCE</th><td>${baleStats.closing || ''}</td></tr>
            </table>
          </div>

          <div class="location-middle">
            <div class="location-name">${locationName.toUpperCase()}</div>
          </div>

          <div class="summary-block border-r-0">
            <div class="summary-header">BAGS & BOXES</div>
            <table class="summary-table">
              <tr><th>OPENING BALANCE</th><td>${boxStats.opening || ''}</td></tr>
              <tr><th>RECEIVED</th><td>${boxStats.received || ''}</td></tr>
              <tr><th>SOLD</th><td>${boxStats.sold || ''}</td></tr>
              <tr><th>CLOSING BALANCE</th><td>${boxStats.closing || ''}</td></tr>
            </table>
          </div>
        </div>

        <table class="main-table">
          <thead>
            <tr>
              <th>BRANDS</th>
              <th>ITEM DESCRIPTION</th>
              <th>NO. QTY<br/>SOLD</th>
              <th>ACTUAL<br/>SELLING<br/>PRICE PER<br/>UNIT</th>
              <th>#VALUE!</th>
              <th>NET<br/>PROFIT</th>
            </tr>
          </thead>
          <tbody>
            ${daySales.map(sale => {
              const item = items.find(i => i.id === sale.item_id);
              const brand = brands.find(b => b.id === item?.brand_id);
              const totalVal = sale.converted_price_INR || (sale.selling_price * sale.quantity);
              return `
                <tr>
                  <td>${brand?.name.toUpperCase() || '-'}</td>
                  <td class="text-left">${(sale.item_name || item?.name || 'Unknown').toUpperCase()}</td>
                  <td>${sale.quantity}</td>
                  <td>${formatNum(sale.selling_price)}</td>
                  <td>${formatNum(totalVal)}</td>
                  <td>${formatNum(sale.profit_INR)}</td>
                </tr>
              `;
            }).join('')}
              ${daySales.length < 5 ? `<tr><td colspan="6" style="height: ${100 - (daySales.length * 20)}px"></td></tr>` : ''}
          </tbody>
          <tfoot>
            <tr class="footer-row">
              <td colspan="2">TOTAL NO. OF BALES SOLD</td>
              <td>${daySales.reduce((a, b) => a + (b.quantity || 0), 0)}</td>
              <td>TOTAL SALES<br/>& PROFIT</td>
              <td>${formatNum(daySales.reduce((a, b) => a + (b.converted_price_INR || 0), 0))}</td>
              <td>${formatNum(daySales.reduce((a, b) => a + (b.profit_INR || 0), 0))}</td>
            </tr>
          </tfoot>
        </table>
      </body>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

/**
 * Excel version of the 777 Daily Sales Report
 */
export async function exportDailySalesReport777(data: {
  locationId: string;
  date: string;
  sales: any[];
  locations: any[];
  items: any[];
  brands: any[];
  inventory: any[];
  transactions: any[];
}) {
  const { locationId, date, sales, locations, items, brands, inventory, transactions } = data;
  const location = locations.find(l => l.id === locationId);
  const locationName = location?.name || 'Unknown';

  const daySales = sales;

  const filterSummary = (categoryMatch: (cat: string) => boolean) => {
    const relevantSales = daySales.filter(s => {
      const item = items.find(i => i.id === s.item_id);
      return categoryMatch(item?.category || '');
    });
    const sold = relevantSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
    const received = transactions.filter(t => {
      const tDate = new Date(t.timestamp).toISOString().split('T')[0];
      const item = items.find(i => i.id === t.item_id);
      return tDate === date && t.to_location === locationId && (t.type === 'transfer' || t.type === 'stock_entry') && categoryMatch(item?.category || '');
    }).reduce((sum, t) => sum + (t.quantity || 0), 0);
    const closing = inventory.filter(inv => {
      const item = items.find(i => i.id === inv.item_id);
      return inv.location_id === locationId && categoryMatch(item?.category || '');
    }).reduce((sum, inv) => sum + (inv.quantity || 0), 0);
    const opening = closing + sold - received;
    return { opening, received, sold, closing };
  };

  const baleStats = filterSummary(cat => cat.toLowerCase().includes('bale'));
  const boxStats = filterSummary(cat => !cat.toLowerCase().includes('bale'));

  const rows: any[][] = [];
  rows.push(['', 'SHOP-DAILY SALES REPORT-2026', '', '', '', new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')]);
  rows.push(['', '', '', '', '', '']);
  rows.push([]);

  // Summary row
  rows.push(['BALES', '', '', 'BAGS & BOXES', '', '']);
  rows.push(['OPENING BALANCE', baleStats.opening || '', locationName.toUpperCase(), 'OPENING BALANCE', boxStats.opening || '', '']);
  rows.push(['RECEIVED', baleStats.received || '', '', 'RECEIVED', boxStats.received || '', '']);
  rows.push(['SOLD', baleStats.sold || '', '', 'SOLD', boxStats.sold || '', '']);
  rows.push(['CLOSING BALANCE', baleStats.closing || '', '', 'CLOSING BALANCE', boxStats.closing || '', '']);
  rows.push([]);

  // Table header
  rows.push(['BRANDS', 'ITEM DESCRIPTION', 'NO. QTY SOLD', 'ACTUAL SELLING PRICE PER UNIT', '#VALUE!', 'NET PROFIT']);

  daySales.forEach(sale => {
    const item = items.find(i => i.id === sale.item_id);
    const brand = brands.find(b => b.id === item?.brand_id);
    const totalVal = sale.converted_price_INR || (sale.selling_price * sale.quantity);
    rows.push([
      brand?.name.toUpperCase() || '-',
      (sale.item_name || item?.name || 'Unknown').toUpperCase(),
      sale.quantity,
      sale.selling_price,
      totalVal,
      sale.profit_INR
    ]);
  });

  rows.push([]);
  rows.push([
    'TOTAL NO. OF BALES SOLD', 
    '', 
    daySales.reduce((a, b) => a + (b.quantity || 0), 0),
    'TOTAL SALES & PROFIT',
    daySales.reduce((a, b) => a + (b.converted_price_INR || 0), 0),
    daySales.reduce((a, b) => a + (b.profit_INR || 0), 0)
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Report');
  XLSX.writeFile(wb, `Daily_Sales_Report_${locationName}_${date}.xlsx`);
}

/**
 * Export Stock Report - matches the 777 Investments stock ledger format
 * Columns: SL NO, Item Description, Code #, Opening, Received, Supplied (Sold), Returned
 */
export async function exportStockReport(data: {
  locationId: string;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;   // YYYY-MM-DD
  inventory: any[];
  items: any[];
  brands: any[];
  locations: any[];
  transactions: any[];
  sales: any[];
  returns: any[];
  format?: 'excel' | 'pdf';
}) {
  const { locationId, dateFrom, dateTo, inventory, items, locations, transactions, sales, returns, format, brands } = data;
  const location = locations.find(l => l.id === locationId);
  const locationName = location?.name || 'Unknown';
  const locType = location?.type || '';

  // Use today as default if no range provided
  const targetDate = dateTo || new Date().toISOString().split('T')[0];

  const isInRange = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    // If only one date is provided (standard use case), check for exact match
    if (!dateFrom && dateTo && d !== dateTo) return false;
    return true;
  };

  const rows: any[][] = [];

  const brandGroups = new Map<string, typeof items>();
  items.forEach(item => {
    const brandId = item.brand_id || 'unbranded';
    if (!brandGroups.has(brandId)) brandGroups.set(brandId, []);
    brandGroups.get(brandId)!.push(item);
  });

  const getBrandName = (brandId: string) => {
    const b = brands.find(br => br.id === brandId);
    return b ? b.name : 'UNBRANDED';
  };

  // ── PRE-COMPUTED AGGREGATIONS FOR O(1) LOOKUP (Major performance boost) ──
  const aggregationMap = new Map();
  const getAgg = (locId: string, itemId: string) => {
    const key = `${locId}_${itemId}`;
    if (!aggregationMap.has(key)) aggregationMap.set(key, { received: 0, supplied: 0, returned: 0, currentQty: 0, storedOpening: 0, storedReceived: 0, storedSupplied: 0, storedReturned: 0 });
    return aggregationMap.get(key);
  };

  const targetLocations = locationId === 'all' ? locations.sort((a,b) => a.name.localeCompare(b.name)) : [location!];

  // 1. Current Qty & Stored Balances
  inventory.forEach(e => {
    if (locationId === 'all' || e.location_id === locationId) {
      const agg = getAgg(e.location_id, e.item_id);
      agg.currentQty += (e.quantity || 0);
      agg.storedOpening = (agg.storedOpening || 0) + (e.opening_balance || 0);
      agg.storedReceived = (agg.storedReceived || 0) + (e.received_balance || 0);
      agg.storedSupplied = (agg.storedSupplied || 0) + (e.supplied_balance || 0);
      agg.storedReturned = (agg.storedReturned || 0) + (e.returned_balance || 0);
    }
  });

  // 2. Transactions (Received/Supplied)
  transactions.forEach(t => {
    if (isInRange(t.timestamp)) {
       if ((locationId === 'all' || t.to_location === locationId) && (t.type === 'stock_entry' || t.type === 'transfer')) {
          getAgg(t.to_location, t.item_id).received += (t.quantity || 0);
       }
       if ((locationId === 'all' || t.from_location === locationId) && t.type === 'transfer') {
          getAgg(t.from_location, t.item_id).supplied += (t.quantity || 0);
       }
    }
  });

  // 3. Sales (Supplied)
  sales.forEach(s => {
    if ((locationId === 'all' || s.location_id === locationId) && isInRange(s.timestamp)) {
      getAgg(s.location_id, s.item_id).supplied += (s.quantity || 0);
    }
  });

  // 4. Returns
  returns.forEach(r => {
    if ((locationId === 'all' || r.location_id === locationId) && isInRange(r.timestamp) && r.status === 'Restocked') {
      getAgg(r.location_id, r.item_id).returned += (r.quantity || 0);
    }
  });

  // Map metrics back to items per location
  const isToday = targetDate === new Date().toISOString().split('T')[0];
  const itemMetrics = new Map<string, { opening: number, received: number, supplied: number, returned: number, closing: number }>();
  
  targetLocations.forEach(loc => {
    items.forEach(item => {
      const metrics = aggregationMap.get(`${loc.id}_${item.id}`) || { received: 0, supplied: 0, returned: 0, currentQty: 0, storedOpening: 0, storedReceived: 0, storedSupplied: 0, storedReturned: 0 };
      const { received: txReceived, supplied: txSupplied, returned: txReturned, currentQty, storedOpening, storedReceived, storedSupplied, storedReturned } = metrics;
      
      let opening = 0, received = 0, supplied = 0, returned = 0, closing = 0;

      if (isToday) {
        opening = storedOpening || 0;
        received = (storedReceived || 0) + txReceived;
        supplied = (storedSupplied || 0) + txSupplied;
        returned = (storedReturned || 0) + txReturned;
        closing = opening + received - supplied + returned;
      } else {
        opening = Math.max(0, currentQty - txReceived + txSupplied - txReturned);
        received = txReceived;
        supplied = txSupplied;
        returned = txReturned;
        closing = opening + received - supplied + returned;
      }

      itemMetrics.set(`${loc.id}_${item.id}`, { opening, received, supplied, returned, closing });
    });
  });

  // Filter out brands that have no active inventory or movements to prevent empty pages/sheets
  const activeBrandGroups = Array.from(brandGroups.entries()).filter(([_, groupItems]) => {
    return groupItems.some(item => {
      return targetLocations.some(loc => {
        const m = itemMetrics.get(`${loc.id}_${item.id}`)!;
        return m.opening > 0 || m.closing > 0 || m.received > 0 || m.supplied > 0 || m.returned > 0;
      });
    });
  });

  const getFileNameBrandPart = () => {
    if (activeBrandGroups.length === 1) {
      return getBrandName(activeBrandGroups[0][0]).toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_';
    }
    return '';
  };
  const brandPartStr = getFileNameBrandPart();
  const fileTitleLocation = locationId === 'all' ? 'All Locations' : locationName;
  const fileTitleType = locationId === 'all' ? 'All' : locType.toUpperCase();

  if (activeBrandGroups.length === 0) {
    if (format === 'pdf') {
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(`<h2>No active stock to report for ${brandPartStr}${fileTitleLocation} and date range.</h2>`);
        win.document.close();
      }
      return;
    } else {
      // create empty excel
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['No active stock data']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Empty');
      XLSX.writeFile(wb, `Stock_Report_${brandPartStr}${fileTitleLocation}_${targetDate}.xlsx`);
      return;
    }
  }

  // Header for PDF
  if (format === 'pdf') {
    const win = window.open('', '_blank');
    if (!win) return alert("Popup blocked!");

    let html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Stock Report - ${brandPartStr}${fileTitleLocation}</title>
          <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            * { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
            body { font-family: 'Inter', sans-serif; font-size: 11px; margin: 10mm; color: #000; }
            .header-top { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 5px; }
            .report-title { text-align: center; font-weight: 900; text-decoration: underline; margin-bottom: 2px; text-transform: uppercase; }
            .brand-subtitle { text-align: center; font-weight: 900; margin-bottom: 15px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #000; padding: 4px; text-align: center; }
            th { background: #eee !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 10px; }
            .text-left { text-align: left; }
            .closing { background: #d4edda !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .category-row td { font-weight: 900; text-align: center; background: #fafafa !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .total-row td { font-weight: 900; background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page-break { page-break-before: always; }
            @media print { @page { margin: 10mm; } body { margin: 0; } }
          </style>
        </head>
        <body>
    `;

    activeBrandGroups.forEach(([brandId, brandItems], bIdx) => {
      const bName = getBrandName(brandId).toUpperCase();
      
      if (bIdx > 0) {
         html += `<div class="page-break"></div>`;
      }

      html += `
          <div class="header-top">
            <div>777 INVESTMENTS LTD</div>
            <div>DATE & TIME: ${new Date().toLocaleString('en-IN')}</div>
          </div>
          <div class="report-title">STOCK-${fileTitleType}</div>
          <div class="brand-subtitle">${bName} ${locationId !== 'all' ? '- ' + fileTitleLocation : ''}</div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px">SL NO.</th>
                <th style="width: 80px">CODE</th>
                <th>ITEM DESCRIPTION</th>
                ${locationId === 'all' ? '<th>LOCATION</th>' : ''}
                <th style="width: 60px">OPENING</th>
                <th style="width: 60px">RECEIVED</th>
                <th style="width: 60px">SUPPLIED</th>
                <th style="width: 60px">RETURNED</th>
                <th style="width: 70px">CLOSING</th>
              </tr>
            </thead>
            <tbody>
      `;

      let slNo = 1;
      let currentCategory = '';
      let totOpening = 0, totRec = 0, totSup = 0, totRet = 0, totClos = 0;

      [...brandItems].sort((a, b) => {
        const cA = (a.category || '').toUpperCase();
        const cB = (b.category || '').toUpperCase();
        if (cA !== cB) return cA.localeCompare(cB);
        return (a.name || '').localeCompare(b.name || '');
      }).forEach(item => {
        targetLocations.forEach(loc => {
          const m = itemMetrics.get(`${loc.id}_${item.id}`)!;
          if (m.opening === 0 && m.closing === 0 && m.received === 0 && m.supplied === 0 && m.returned === 0) return;

          const cat = (item.category || 'OTHER').toUpperCase();
          if (cat !== currentCategory) {
            html += `<tr class="category-row"><td colspan="${locationId === 'all' ? 9 : 8}">${cat}</td></tr>`;
            currentCategory = cat;
          }

          totOpening += m.opening; totRec += m.received; totSup += m.supplied; totRet += m.returned; totClos += m.closing;

          html += `
            <tr>
              <td>${slNo++}</td>
              <td>${item.sku || '-'}</td>
              <td class="text-left">${(item.name || '').toUpperCase()}</td>
              ${locationId === 'all' ? `<td>${loc.name}</td>` : ''}
              <td>${m.opening}</td>
              <td>${m.received}</td>
              <td>${m.supplied}</td>
              <td>${m.returned}</td>
              <td class="closing">${m.closing}</td>
            </tr>
          `;
        });
      });
      
      html += `
            <tr class="total-row">
              <td colspan="${locationId === 'all' ? 4 : 3}" class="text-left">TOTAL QTY</td>
              <td>${totOpening}</td>
              <td>${totRec}</td>
              <td>${totSup}</td>
              <td>${totRet}</td>
              <td class="closing">${totClos}</td>
            </tr>
          </tbody>
        </table>
      `;
    });

    html += `
        </body>
        <script>
          document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
          window.onload = function() { window.print(); };
        </script>
      </html>
    `;
    win.document.write(html);
    win.document.close();
    return;
  }

  // Excel Format
  const wb = XLSX.utils.book_new();

  activeBrandGroups.forEach(([brandId, brandItems]) => {
    const bName = getBrandName(brandId).toUpperCase();
    const sheetRows: any[][] = [];

    sheetRows.push(['777 INVESTMENTS LTD', '', '', 'DATE & TIME', new Date().toLocaleString('en-IN')]);
    sheetRows.push([`STOCK-${fileTitleType}`]);
    sheetRows.push([`${bName} ${locationId !== 'all' ? '- ' + fileTitleLocation : ''}`]);
    
    if (locationId === 'all') {
      sheetRows.push(['SL NO.', 'CODE', 'ITEM DESCRIPTION', 'LOCATION', 'OPENING', 'RECEIVED', 'SUPPLIED', 'RETURNED', 'CLOSING']);
    } else {
      sheetRows.push(['SL NO.', 'CODE', 'ITEM DESCRIPTION', 'OPENING', 'RECEIVED', 'SUPPLIED', 'RETURNED', 'CLOSING']);
    }

    let slNo = 1;
    let currentCategory = '';
    let totOpening = 0, totRec = 0, totSup = 0, totRet = 0, totClos = 0;

    [...brandItems].sort((a, b) => {
      const cA = (a.category || '').toUpperCase();
      const cB = (b.category || '').toUpperCase();
      if (cA !== cB) return cA.localeCompare(cB);
      return (a.name || '').localeCompare(b.name || '');
    }).forEach(item => {
      targetLocations.forEach(loc => {
        const m = itemMetrics.get(`${loc.id}_${item.id}`)!;
        if (m.opening === 0 && m.closing === 0 && m.received === 0 && m.supplied === 0 && m.returned === 0) return;

        const cat = (item.category || 'OTHER').toUpperCase();
        if (cat !== currentCategory) {
          if (locationId === 'all') {
            sheetRows.push(['', '', cat, '', '', '', '', '', '']); // Category header row
          } else {
            sheetRows.push(['', '', cat, '', '', '', '', '']); // Category header row
          }
          currentCategory = cat;
        }

        totOpening += m.opening; totRec += m.received; totSup += m.supplied; totRet += m.returned; totClos += m.closing;
        if (locationId === 'all') {
          sheetRows.push([slNo++, item.sku || '-', (item.name || '').toUpperCase(), loc.name, m.opening, m.received, m.supplied, m.returned, m.closing]);
        } else {
          sheetRows.push([slNo++, item.sku || '-', (item.name || '').toUpperCase(), m.opening, m.received, m.supplied, m.returned, m.closing]);
        }
      });
    });

    if (locationId === 'all') {
      sheetRows.push(['', '', 'TOTAL QTY', '', totOpening, totRec, totSup, totRet, totClos]);
    } else {
      sheetRows.push(['', '', 'TOTAL QTY', totOpening, totRec, totSup, totRet, totClos]);
    }

    const ws = XLSX.utils.aoa_to_sheet(sheetRows);
    
    // Formatting basic column widths
    if (locationId === 'all') {
      ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    } else {
      ws['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
    }

    // Excel limits sheet names to 31 chars
    let sheetName = bName.substring(0, 31).replace(/[\\/?*\[\]:]/g, '');
    if (!sheetName) sheetName = 'Brand';

    // Ensure uniqueness
    let counter = 1;
    let finalSheetName = sheetName;
    while (wb.SheetNames.includes(finalSheetName)) {
      finalSheetName = `${sheetName.substring(0, 27)}_${counter}`;
      counter++;
    }

    XLSX.utils.book_append_sheet(wb, ws, finalSheetName);
  });

  if (wb.SheetNames.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([['No active stock data']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Empty');
  }

  XLSX.writeFile(wb, `Stock_Report_${brandPartStr}${fileTitleLocation}_${targetDate}.xlsx`);
}

/**
 * Validate a row from the stock import Excel file
 */
export function validateStockImportRow(row: any) {
  if (!row.item_name) return { valid: false, error: 'Missing Item Name' };
  
  return {
    valid: true,
    data: {
      item_name: String(row.item_name).trim(),
      quantity: parseFloat(row.quantity) || 0,
      unit_cost: parseFloat(row.unit_cost) || 0,
      location: String(row.location || 'Warehouse').trim(),
      category: String(row.category || 'Standard').trim(),
      sku: String(row.sku || '').trim()
    }
  };
}

/**
 * Print stock movement reports for all locations in a single PDF document
 */
export async function printAllLocationsStockReport(data: {
  date: string;
  sales: any[];
  locations: any[];
  items: any[];
  brands: any[];
  inventory: any[];
  transactions: any[];
  returns: any[];
}) {
  const { date, sales, locations, items, brands, inventory, transactions, returns } = data;
  
  const win = window.open('', '_blank');
  if (!win) return alert("Popup blocked!");

  let html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>All Locations Stock Report - ${date}</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
          * { -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
          body { font-family: 'Inter', sans-serif; font-size: 10px; margin: 0; color: #000; }
          .page { padding: 10mm; page-break-after: always; min-height: 270mm; border-bottom: 1px dashed #eee; }
          .header-top { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 5px; }
          .report-title { text-align: center; font-weight: 700; text-decoration: underline; margin-bottom: 2px; text-transform: uppercase; }
          .location-subtitle { text-align: center; font-weight: 700; margin-bottom: 10px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #000; padding: 3px; text-align: center; }
          th { background: #eee !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .text-left { text-align: left; }
          .closing { background: #d4edda !important; font-weight: 700; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @media print { .page { margin: 0; border: none; } @page { margin: 10mm; } }
        </style>
      </head>
      <body>
  `;

  // Sort locations: warehouse first, then shops
  const sortedLocations = [...locations].sort((a,b) => {
    if (a.type === 'warehouse') return -1;
    if (b.type === 'warehouse') return 1;
    return a.name.localeCompare(b.name);
  });

  const isInRange = (timestamp: string) => {
    return new Date(timestamp).toISOString().split('T')[0] === date;
  };

  sortedLocations.forEach(location => {
    const locationId = location.id;

    const brandGroups = new Map<string, typeof items>();
    items.forEach(item => {
      const brandId = item.brand_id || 'unbranded';
      if (!brandGroups.has(brandId)) brandGroups.set(brandId, []);
      brandGroups.get(brandId)!.push(item);
    });

    const getBrandName = (brandId: string) => {
      const b = brands.find(br => br.id === brandId);
      return b ? b.name : 'UNBRANDED';
    };

    const itemMetrics = new Map<string, { opening: number, received: number, supplied: number, returned: number, closing: number }>();
    items.forEach(item => {
      const txReceived = transactions
        .filter(t => t.item_id === item.id && t.to_location === locationId && isInRange(t.timestamp) && (t.type === 'stock_entry' || t.type === 'transfer'))
        .reduce((s, t) => s + (t.quantity || 0), 0);

      const soldQty = sales
        .filter(s => s.item_id === item.id && s.location_id === locationId && isInRange(s.timestamp))
        .reduce((s, sale) => s + (sale.quantity || 0), 0);

      const transferredOut = transactions
        .filter(t => t.item_id === item.id && t.from_location === locationId && t.type === 'transfer' && isInRange(t.timestamp))
        .reduce((s, t) => s + (t.quantity || 0), 0);

      const txSupplied = soldQty + transferredOut;

      const txReturned = returns
        .filter(r => r.item_id === item.id && r.location_id === locationId && isInRange(r.timestamp) && r.status === 'Restocked')
        .reduce((s, r) => s + (r.quantity || 0), 0);

      const invEntry = inventory.find(e => e.item_id === item.id && e.location_id === locationId);
      
      const isToday = date === new Date().toISOString().split('T')[0];
      let opening = 0, received = 0, supplied = 0, returned = 0, closing = 0;

      if (isToday && invEntry) {
        opening = invEntry.opening_balance || 0;
        received = (invEntry.received_balance || 0) + txReceived;
        supplied = (invEntry.supplied_balance || 0) + txSupplied;
        returned = (invEntry.returned_balance || 0) + txReturned;
        closing = opening + received - supplied + returned;
      } else {
        const currentQty = invEntry?.quantity || 0;
        opening = Math.max(0, currentQty - txReceived + txSupplied - txReturned);
        received = txReceived;
        supplied = txSupplied;
        returned = txReturned;
        closing = opening + received - supplied + returned;
      }
      itemMetrics.set(item.id, { opening, received, supplied, returned, closing });
    });

    const activeBrandGroups = Array.from(brandGroups.entries()).filter(([_, groupItems]) => {
      return groupItems.some(item => {
        const m = itemMetrics.get(item.id)!;
        return m.opening > 0 || m.closing > 0 || m.received > 0 || m.supplied > 0 || m.returned > 0;
      });
    });

    if (activeBrandGroups.length === 0) return; // Skip completely empty locations

    activeBrandGroups.forEach(([brandId, brandItems]) => {
      const bName = getBrandName(brandId).toUpperCase();
      let slNo = 1;
      let currentCategory = '';
      let totOpening = 0, totRec = 0, totSup = 0, totRet = 0, totClos = 0;

      html += `
        <div class="page">
          <div class="header-top">
            <div>777 INVESTMENTS LTD</div>
            <div>DATE & TIME: ${new Date().toLocaleString('en-IN')}</div>
          </div>
          <div class="report-title">STOCK-${(location.type || '').toUpperCase()}</div>
          <div class="location-subtitle">${bName} - ${location.name.toUpperCase()}</div>

          <table>
            <thead>
              <tr>
                <th style="width: 35px">SL NO.</th>
                <th style="width: 80px">CODE</th>
                <th>ITEM DESCRIPTION</th>
                <th style="width: 60px">OPENING</th>
                <th style="width: 60px">RECEIVED</th>
                <th style="width: 60px">SUPPLIED</th>
                <th style="width: 60px">RETURNED</th>
                <th style="width: 70px">CLOSING</th>
              </tr>
            </thead>
            <tbody>
      `;

      [...brandItems].sort((a, b) => {
        const cA = (a.category || '').toUpperCase();
        const cB = (b.category || '').toUpperCase();
        if (cA !== cB) return cA.localeCompare(cB);
        return (a.name || '').localeCompare(b.name || '');
      }).forEach(item => {
        const m = itemMetrics.get(item.id)!;
        if (m.opening === 0 && m.closing === 0 && m.received === 0 && m.supplied === 0 && m.returned === 0) return;

        const cat = (item.category || 'OTHER').toUpperCase();
        if (cat !== currentCategory) {
          html += `<tr><td colspan="8" style="font-weight: 900; background: #fafafa;">${cat}</td></tr>`;
          currentCategory = cat;
        }

        totOpening += m.opening; totRec += m.received; totSup += m.supplied; totRet += m.returned; totClos += m.closing;
        const itemName = (item.name || '').toUpperCase();

        html += `
          <tr>
            <td>${slNo++}</td>
            <td>${item.sku || '-'}</td>
            <td class="text-left">${itemName}</td>
            <td>${m.opening}</td>
            <td>${m.received}</td>
            <td>${m.supplied}</td>
            <td>${m.returned}</td>
            <td class="closing">${m.closing}</td>
          </tr>
        `;
      });

      html += `
              <tr style="font-weight: 900; background: #eee;">
                <td colspan="3" class="text-left">TOTAL QTY</td>
                <td>${totOpening}</td>
                <td>${totRec}</td>
                <td>${totSup}</td>
                <td>${totRet}</td>
                <td class="closing">${totClos}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    });
  });

  html += `
      </body>
      <script>
        document.addEventListener('contextmenu', function(e) { e.preventDefault(); return false; });
        document.addEventListener('keydown', function(e) {
          var blocked = (
            (e.ctrlKey || e.metaKey) && ['s','u','a','c'].includes(e.key.toLowerCase()) ||
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && ['i','j','c'].includes(e.key.toLowerCase()))
          );
          if (blocked) { e.preventDefault(); e.stopPropagation(); }
        });
        window.onload = function() { window.print(); };
      </script>
    </html>
  `;

  win.document.write(html);
  win.document.close();
}

