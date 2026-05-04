/**
 * Dynamic Data Export Service
 * Handles exporting all data types to Excel
 * Supports filtering by location, date range, and data type
 */

import { format } from 'date-fns';
import { exportToExcel } from './bulkOperations';

export interface ExportConfig {
  includeSheets: ('sales' | 'inventory' | 'returns' | 'expenses' | 'transfers' | 'movement')[];
  dateFrom?: Date;
  dateTo?: Date;
  locationId?: string;
  includeAllLocations?: boolean;
}

export interface MovementDataParams {
  inventory: any[];
  items: any[];
  locations: any[];
  transactions: any[];
  sales: any[];
  returns: any[];
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
    
    return filtered.map(s => ({
      'Item Name': s.item_name || 'Unknown',
      'Quantity': s.quantity || 0,
      'Unit Price': s.selling_price || 0,
      'Currency': s.currency || 'INR',
      'Total Revenue (INR)': s.converted_price_INR || 0,
      'Cost (INR)': (s.avg_cost_INR || 0) * (s.quantity || 0),
      'Profit (INR)': s.profit_INR || 0,
      'Sold By': s.sold_by || 'Unknown',
      'Date': s.timestamp ? format(new Date(s.timestamp), 'MMM dd, yyyy HH:mm') : '—',
      'Location': locations.find(l => l.id === s.location_id)?.name || s.location_id || 'Unknown'
    }));
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
      const itemName = item?.name || (inv.item_id ? `ITEM-${inv.item_id.slice(-6).toUpperCase()}` : 'Unknown Item');
      
      return {
        'Item Name': itemName.toUpperCase(),
        'SKU': item?.sku || '-',
        'Category': item?.category || '-',
        'Quantity': inv.quantity || 0,
        'Unit Cost (INR)': inv.avg_cost_INR || 0,
        'Total Value (INR)': (inv.quantity || 0) * (inv.avg_cost_INR || 0),
        'Retail Price': item?.retail_price || 0,
        'Location': location?.name || inv.location_id || 'Unknown',
        'Status': (inv.quantity || 0) < (item?.min_stock_limit || 10) ? 'Low Stock' : 'OK'
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
        'Item Name': ret.item_name || 'Unknown',
        'Quantity': ret.quantity || 0,
        'Return Type': ret.type === 'sale_return' ? 'Sale Return' : 'Shop Transfer',
        'Reason': ret.reason || 'No reason provided',
        'Status': ret.status || 'pending',
        'Location': location?.name || ret.location_id || 'Unknown',
        'Date': ret.timestamp ? format(new Date(ret.timestamp), 'MMM dd, yyyy HH:mm') : '—'
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
        'Category': exp.category || 'General',
        'Description': exp.description || '',
        'Amount (INR)': exp.amount_INR || exp.amount || 0,
        'Currency': exp.currency || 'INR',
        'Location': location?.name || exp.location_id || 'Unknown',
        'Location Type': exp.location_type || location?.type || '',
        'Date': exp.date ? format(new Date(exp.date), 'MMM dd, yyyy') : '—',
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
        'Item Name': transfer.item_name || 'Unknown',
        'Quantity': transfer.quantity || 0,
        'Unit Cost (INR)': transfer.unit_cost || 0,
        'Total Value (INR)': transfer.converted_value_INR || 0,
        'From Location': fromLoc?.name || transfer.from_location || 'Supplier',
        'To Location': toLoc?.name || transfer.to_location || 'Warehouse',
        'Performed By': transfer.performed_by || 'Admin',
        'Date': transfer.timestamp ? format(new Date(transfer.timestamp), 'MMM dd, yyyy HH:mm') : '—'
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
      const locSales = (sales || []).filter(s => s.location_id === location.id);
      const locInv = (inventory || []).filter(i => i.location_id === location.id);
      const locReturns = (returns || []).filter(r => r.location_id === location.id);
      
      const totalRevenue = locSales.reduce((sum, s) => sum + (s.converted_price_INR || 0), 0);
      const totalProfit = locSales.reduce((sum, s) => sum + (s.profit_INR || 0), 0);
      const totalStockValue = locInv.reduce((sum, i) => sum + (i.quantity || 0) * (i.avg_cost_INR || 0), 0);
      const totalItems = locInv.reduce((sum, i) => sum + (i.quantity || 0), 0);
      
      return {
        'Location': location.name || 'Unknown',
        'Type': location.type || 'N/A',
        'Country': location.country || 'N/A',
        'Total Sales': locSales.length,
        'Total Revenue (INR)': totalRevenue,
        'Total Profit (INR)': totalProfit,
        'Stock Items': totalItems,
        'Stock Value (INR)': totalStockValue,
        'Returns': locReturns.length,
        'Profit Margin %': totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : '0.00'
      };
    });
  }

  /**
   * Export movement data (Opening, Received, Supplied, Returned) - 777 Format
   */
  static exportInventoryMovementData(
    params: MovementDataParams,
    config: ExportConfig
  ): any[] {
    const { inventory, items, locations, transactions, sales, returns } = params;
    const dateStr = config.dateTo ? format(config.dateTo, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    const dateFromStr = config.dateFrom ? format(config.dateFrom, 'yyyy-MM-dd') : dateStr;

    const isInRange = (timestamp: string) => {
      const d = new Date(timestamp).toISOString().split('T')[0];
      return d >= dateFromStr && d <= dateStr;
    };

    const locationId = config.locationId;
    const filteredItems = config.locationId 
      ? items // If specific location, show all items or items with inventory
      : items;

    let slNo = 1;
    return filteredItems.sort((a,b) => a.name.localeCompare(b.name)).map(item => {
      const locId = locationId!;
      
      const received = transactions
        .filter(t => t.item_id === item.id && t.to_location === locId && isInRange(t.timestamp) && (t.type === 'stock_entry' || t.type === 'transfer'))
        .reduce((s, t) => s + (t.quantity || 0), 0);

      const soldQty = sales
        .filter(s => s.item_id === item.id && s.location_id === locId && isInRange(s.timestamp))
        .reduce((s, sale) => s + (sale.quantity || 0), 0);

      const transferredOut = transactions
        .filter(t => t.item_id === item.id && t.from_location === locId && t.type === 'transfer' && isInRange(t.timestamp))
        .reduce((s, t) => s + (t.quantity || 0), 0);

      const supplied = soldQty + transferredOut;

      const returned = returns
        .filter(r => r.item_id === item.id && r.location_id === locId && isInRange(r.timestamp) && r.status === 'Restocked')
        .reduce((s, r) => s + (r.quantity || 0), 0);

      const currentQty = inventory
        .filter(e => e.item_id === item.id && e.location_id === locId)
        .reduce((s, e) => s + (e.quantity || 0), 0);

      // Opening = Stock before this period's ops
      const opening = currentQty - received + supplied - returned;

      return {
        'SL NO.': slNo++,
        'ITEM DESCRIPTION': (item.name || `ITEM ${item.id}`).toUpperCase(),
        'CODE #': item.sku || '-',
        'OPENING': opening || 0,
        'RECEIVED': received || 0,
        'SUPPLIED': supplied || 0,
        'RETURNED': returned || 0,
        'CLOSING BALANCE': currentQty || 0
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
      transactions: any[];
    },
    config: ExportConfig
  ): Promise<void> {
    const sheets: Record<string, any[]> = {};

    if (config.includeSheets.includes('sales')) {
      const rows = this.exportSalesData(data.sales, data.locations, config);
      if (rows.length > 0) sheets['Sales'] = rows;
    }

    if (config.includeSheets.includes('inventory') || config.includeSheets.includes('movement')) {
      // Only generate movement sheets when locations exist
      if (data.locations.length > 0) {
        // Warehouse movement sheets (777 Format)
        data.locations.filter(l => l.type === 'warehouse').forEach(w => {
          const rows = this.exportInventoryMovementData(
            data,
            { ...config, locationId: w.id, includeAllLocations: false }
          );
          if (rows.length > 0) sheets[`STOCK-${w.name.toUpperCase()}`] = rows;
        });

        // Shop movement sheets (777 Format)
        data.locations.filter(l => l.type === 'shop').forEach(shop => {
          const rows = this.exportInventoryMovementData(
            data,
            { ...config, locationId: shop.id, includeAllLocations: false }
          );
          if (rows.length > 0) sheets[`STOCK-${shop.name.toUpperCase()}`] = rows;
        });
      }
    }

    if (config.includeSheets.includes('returns')) {
      const rows = this.exportReturnsData(data.returns, data.locations, config);
      if (rows.length > 0) sheets['Returns'] = rows;
    }

    if (config.includeSheets.includes('expenses')) {
      const rows = this.exportExpensesData(data.expenses, data.locations, config);
      if (rows.length > 0) sheets['Expenses'] = rows;
    }

    if (config.includeSheets.includes('transfers')) {
      const rows = this.exportTransfersData(data.transfers, data.locations, config);
      if (rows.length > 0) sheets['Transfers'] = rows;
    }

    // Summary sheet — always include
    const summary = this.exportSummaryData(
      data.sales,
      data.inventory,
      data.returns,
      data.locations
    );
    sheets['Summary'] = summary.length > 0
      ? summary
      : [{ 'Status': 'No data yet', 'Note': 'Add locations, stock and sales to see data here.' }];

    // Guarantee at least one sheet to avoid XLSX "Workbook is empty" error
    if (Object.keys(sheets).length === 0) {
      sheets['Summary'] = [{ 'Status': 'No data yet', 'Note': 'Add locations, stock and sales to see data here.' }];
    }

    await exportToExcel(sheets, {
      filename: `inventory_complete_export_${new Date().toISOString().split('T')[0]}`,
      includeTimestamp: true
    });
  }
}
