import fs from 'fs';

// 1. Shops.tsx
let shops = fs.readFileSync('src/pages/Shops.tsx', 'utf8');
shops = shops.replace(/setSaleModal\(true\)/g, "setRecordSaleModalOpen(true)");
// Remove any left over setSaleItems
shops = shops.replace(/setSaleItems\(\[\.\.\.saleItems.*?\]\);\n/, '');
fs.writeFileSync('src/pages/Shops.tsx', shops, 'utf8');

// 2. Transfers.tsx
let transfers = fs.readFileSync('src/pages/Transfers.tsx', 'utf8');
transfers = transfers.replace(/setItemsToTransfer\(\[\.\.\.itemsToTransfer.*?\]\);\n/, '');
fs.writeFileSync('src/pages/Transfers.tsx', transfers, 'utf8');

// 3. Warehouse.tsx
let warehouse = fs.readFileSync('src/pages/Warehouse.tsx', 'utf8');
warehouse = warehouse.replace(/new_qty: number/g, "new_quantity: number");
warehouse = warehouse.replace(/new_qty:/g, "new_quantity:");
fs.writeFileSync('src/pages/Warehouse.tsx', warehouse, 'utf8');

