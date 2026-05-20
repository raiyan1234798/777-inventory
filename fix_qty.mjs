import fs from 'fs';

let warehouse = fs.readFileSync('src/pages/Warehouse.tsx', 'utf8');
warehouse = warehouse.replace(/item\.new_qty/g, "item.new_quantity");
warehouse = warehouse.replace(/newArr\[idx\]\.new_qty/g, "newArr[idx].new_quantity");
fs.writeFileSync('src/pages/Warehouse.tsx', warehouse, 'utf8');
