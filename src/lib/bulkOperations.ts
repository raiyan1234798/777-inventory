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
 * Yields progress updates
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  batchSize: number = 50,
  onProgress?: (current: number, total: number) => void
): Promise<{ processed: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let processed = 0;
  let failed = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    // Process batch in parallel but wait before next batch
    const batchResults = await Promise.allSettled(
      batch.map(item => processor(item))
    );
    
    // Count results
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        processed++;
      } else {
        failed++;
        errors.push(`Item ${i + idx + 1}: ${result.reason?.message}`);
      }
    });
    
    // Report progress
    onProgress?.(i + batch.length, items.length);
    
    // Yield to browser for UI updates
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  return { processed, failed, errors };
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
    XLSX.writeFile(workbook, filename);
  } catch (err: any) {
    throw new Error(`Failed to export Excel: ${err.message}`);
  }
}

/**
 * Calculate optimal column widths
 */
function getColumnWidths(data: any[]): Array<{ wch: number }> {
  if (data.length === 0) return [];
  
  const firstRow = data[0];
  const columns = Object.keys(firstRow);
  
  return columns.map(col => {
    // Find max width in column
    let maxWidth = col.length;
    
    data.forEach(row => {
      const cellValue = String(row[col] || '');
      maxWidth = Math.max(maxWidth, cellValue.length);
    });
    
    return { wch: Math.min(maxWidth + 2, 50) }; // Cap at 50
  });
}

/**
 * Validate and transform stock import data
 */
export function validateStockImportRow(row: any): {
  valid: boolean;
  data?: any;
  error?: string;
} {
  const required = ['item_name', 'quantity'];
  
  for (const field of required) {
    if (!row[field]) {
      return {
        valid: false,
        error: `Missing required field: ${field}`
      };
    }
  }
  
  const quantity = parseInt(row.quantity);
  if (isNaN(quantity) || quantity < 0) {
    return {
      valid: false,
      error: 'Quantity must be a positive number'
    };
  }
  
  const cost = row.unit_cost ? parseFloat(row.unit_cost) : 0;
  if (isNaN(cost) || cost < 0) {
    return {
      valid: false,
      error: 'Unit cost must be a positive number'
    };
  }
  
  return {
    valid: true,
    data: {
      item_name: row.item_name.trim(),
      quantity,
      unit_cost: cost,
      category: row.category?.trim() || 'General',
      sku: row.sku?.trim() || '',
      retail_price: row.retail_price ? parseFloat(row.retail_price) : cost * 1.5
    }
  };
}

/**
 * Format data for export with proper column headers
 */
export function formatExportData(data: any[], columns: string[]): any[] {
  return data.map(row => {
    const formatted: any = {};
    columns.forEach(col => {
      const value = row[col];
      
      // Format dates
      if (value instanceof Date) {
        formatted[col] = value.toLocaleDateString();
      }
      // Format numbers
      else if (typeof value === 'number') {
        formatted[col] = Number.isInteger(value) ? value : value.toFixed(2);
      }
      // Format null/undefined
      else if (value == null) {
        formatted[col] = '';
      }
      // Default
      else {
        formatted[col] = value;
      }
    });
    return formatted;
  });
}
