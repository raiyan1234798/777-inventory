/**
 * Dynamic Data Export Service
 * Handles exporting all data types to Excel
 * Supports filtering by location, date range, and data type
 */

import { format } from 'date-fns';
import { exportToExcel, formatExportData } from './bulkOperations';

export interface ExportConfig {
  includeSheets: ('sales' | 'inventory' | 'returns' | 'expenses' | 'transfers')[];
  dateFrom?: Date;
  dateTo?: Date;
  locationId?: string;
  includeAllLocations?: boolean;
}

export class DataExporter {
  /**
   * Export sales data to Excel
   */
  static exportSalesData(
    sales: any[],
    locations: any[],
    config?: ExportConfig
  ): any[] {
    let filtered = sales;
    
    if (config?.dateFrom) {
      filtered = filtered.filter(s => new Date(s.timestamp) >= config.dateFrom!);
    }
    if (config?.dateTo) {
      filtered = filtered.filter(s => new Date(s.timestamp) <= config.dateTo!);
    }
    if (config?.locationId && !config.includeAllLocations) {
      filtered = filtered.filter(s => s.location_id === config.locationId);
    }
    
    const columns = [
      'item_name', 'quantity', 'selling_price', 'currency',
      'converted_price_INR', 'avg_cost_INR', 'profit_INR',
      'sold_by', 'timestamp'
    ];
    
    const formatted = formatExportData(
      filtered.map(s => ({
        'Item Name': s.item_name,
        'Quantity': s.quantity,
        'Unit Price': s.selling_price,
        'Currency': s.currency,
        'Total Revenue (INR)': s.converted_price_INR,
        'Cost (INR)': s.avg_cost_INR * s.quantity,
        'Profit (INR)': s.profit_INR,
        'Sold By': s.sold_by,
        'Date': format(new Date(s.timestamp), 'MMM dd, yyyy HH:mm'),
        'Location': locations.find(l => l.id === s.location_id)?.name || s.location_id
      })),
      columns
    );
    
    return formatted;
  }

  /**
   * Export inventory data by location
   */
  static exportInventoryData(
    inventory: any[],
    itemsData: any[],
    locations: any[],
    config?: ExportConfig
  ): any[] {
    let filtered = inventory;
    
    if (config?.locationId && !config.includeAllLocations) {
      filtered = filtered.filter(inv => inv.location_id === config.locationId);
    }
    
    return filtered.map(inv => {
      const item = itemsData.find((i: any) => i.id === inv.item_id);
      const location = locations.find((l: any) => l.id === inv.location_id);
      
      return {
        'Item Name': item?.name || inv.item_id,
        'SKU': item?.sku || '',
        'Category': item?.category || '',
        'Quantity': inv.quantity,
        'Unit Cost (INR)': inv.avg_cost_INR,
        'Total Value (INR)': inv.quantity * inv.avg_cost_INR,
        'Retail Price': item?.retail_price || 0,
        'Location': location?.name || '',
        'Location Type': location?.type || '',
        'Min Stock': item?.min_stock_limit || 0,
        'Status': inv.quantity < (item?.min_stock_limit || 10) ? 'Low Stock' : 'OK'
      };
    });
  }

  /**
   * Export returns data
   */
  static exportReturnsData(
    returns: any[],
    locations: any[],
    config?: ExportConfig
  ): any[] {
    let filtered = returns;
    
    if (config?.dateFrom) {
      filtered = filtered.filter(r => new Date(r.timestamp) >= config.dateFrom!);
    }
    if (config?.dateTo) {
      filtered = filtered.filter(r => new Date(r.timestamp) <= config.dateTo!);
    }
    if (config?.locationId && !config.includeAllLocations) {
      filtered = filtered.filter(r => r.location_id === config.locationId);
    }
    
    return filtered.map(ret => {
      const location = locations.find(l => l.id === ret.location_id);
      
      return {
        'Item Name': ret.item_name,
        'Quantity': ret.quantity,
        'Return Type': ret.type === 'sale_return' ? 'Sale Return' : 'Node Flowback',
        'Reason': ret.reason || 'No reason provided',
        'Status': ret.status,
        'Location': location?.name || '',
        'Date': format(new Date(ret.timestamp), 'MMM dd, yyyy HH:mm')
      };
    });
  }

  /**
   * Export expenses data
   */
  static exportExpensesData(
    expenses: any[],
    locations: any[],
    config?: ExportConfig
  ): any[] {
    let filtered = expenses;
    
    if (config?.dateFrom) {
      filtered = filtered.filter(e => new Date(e.date) >= config.dateFrom!);
    }
    if (config?.dateTo) {
      filtered = filtered.filter(e => new Date(e.date) <= config.dateTo!);
    }
    if (config?.locationId && !config.includeAllLocations) {
      filtered = filtered.filter(e => e.location_id === config.locationId);
    }
    
    return filtered.map(exp => {
      const location = locations.find(l => l.id === exp.location_id);
      
      return {
        'Category': exp.category,
        'Description': exp.description,
        'Amount (INR)': exp.amount_INR,
        'Currency': exp.currency || 'INR',
        'Location': location?.name || '',
        'Location Type': exp.location_type || '',
        'Date': format(new Date(exp.date), 'MMM dd, yyyy'),
        'Notes': exp.notes || ''
      };
    });
  }

  /**
   * Export transfers data
   */
  static exportTransfersData(
    transfers: any[],
    locations: any[],
    config?: ExportConfig
  ): any[] {
    let filtered = transfers;
    
    if (config?.dateFrom) {
      filtered = filtered.filter(t => new Date(t.timestamp) >= config.dateFrom!);
    }
    if (config?.dateTo) {
      filtered = filtered.filter(t => new Date(t.timestamp) <= config.dateTo!);
    }
    
    return filtered.map(transfer => {
      const fromLoc = locations.find((l: any) => l.id === transfer.from_location);
      const toLoc = locations.find((l: any) => l.id === transfer.to_location);
      
      return {
        'Item Name': transfer.item_name,
        'Quantity': transfer.quantity,
        'Unit Cost (INR)': transfer.unit_cost,
        'Total Value (INR)': transfer.converted_value_INR,
        'From Location': fromLoc?.name || transfer.from_location,
        'To Location': toLoc?.name || transfer.to_location,
        'Performed By': transfer.performed_by,
        'Date': format(new Date(transfer.timestamp), 'MMM dd, yyyy HH:mm')
      };
    });
  }

  /**
   * Export summary dashboard data
   */
  static exportSummaryData(
    sales: any[],
    inventory: any[],
    returns: any[],
    locations: any[]
  ): any[] {
    return locations.map(location => {
      const locSales = sales.filter(s => s.location_id === location.id);
      const locInv = inventory.filter(i => i.location_id === location.id);
      const locReturns = returns.filter(r => r.location_id === location.id);
      
      const totalRevenue = locSales.reduce((sum, s) => sum + s.converted_price_INR, 0);
      const totalProfit = locSales.reduce((sum, s) => sum + s.profit_INR, 0);
      const totalStockValue = locInv.reduce((sum, i) => sum + i.quantity * i.avg_cost_INR, 0);
      const totalItems = locInv.reduce((sum, i) => sum + i.quantity, 0);
      
      return {
        'Location': location.name,
        'Type': location.type,
        'Country': location.country,
        'Total Sales': locSales.length,
        'Total Revenue (INR)': totalRevenue,
        'Total Profit (INR)': totalProfit,
        'Stock Items': totalItems,
        'Stock Value (INR)': totalStockValue,
        'Returns': locReturns.length,
        'Profit Margin %': totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0
      };
    });
  }

  /**
   * Generate complete export with multiple sheets
   */
  static async generateCompleteExport(
    data: {
      sales: any[];
      inventory: any[];
      returns: any[];
      expenses: any[];
      transfers: any[];
      items: any[];
      locations: any[];
    },
    config: ExportConfig
  ): Promise<void> {
    const sheets: Record<string, any[]> = {};
    
    if (config.includeSheets.includes('sales')) {
      sheets['Sales'] = this.exportSalesData(data.sales, data.locations, config);
    }
    
    if (config.includeSheets.includes('inventory')) {
      sheets['Inventory'] = this.exportInventoryData(
        data.inventory,
        data.items,
        data.locations,
        config
      );
    }
    
    if (config.includeSheets.includes('returns')) {
      sheets['Returns'] = this.exportReturnsData(
        data.returns,
        data.locations,
        config
      );
    }
    
    if (config.includeSheets.includes('expenses')) {
      sheets['Expenses'] = this.exportExpensesData(data.expenses, data.locations, config);
    }
    
    if (config.includeSheets.includes('transfers')) {
      sheets['Transfers'] = this.exportTransfersData(
        data.transfers,
        data.locations,
        config
      );
    }
    
    // Always add summary
    sheets['Summary'] = this.exportSummaryData(
      data.sales,
      data.inventory,
      data.returns,
      data.locations
    );
    
    await exportToExcel(sheets, {
      filename: 'inventory_complete_export',
      includeTimestamp: true
    });
  }
}
