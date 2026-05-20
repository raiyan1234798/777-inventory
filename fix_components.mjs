import fs from 'fs';

// Fix Transfers.tsx
let transfers = fs.readFileSync('src/pages/Transfers.tsx', 'utf8');

// 1. Remove modal component import
transfers = transfers.replace(/import Modal from '\.\.\/components\/Modal';\n/, '');

// 2. Add setTransferModalOpen, setTransferModalMinimized, setTransferForm, setTransferItems to useStore
transfers = transfers.replace(
  /const \{ locations, items, inventory, transactions, transfer, brands \} = useStore\(\);/,
  "const { locations, items, inventory, transactions, transfer, brands, setTransferModalOpen, setTransferModalMinimized, setTransferForm, setTransferItems } = useStore();"
);

// 3. Remove local state variables
transfers = transfers.replace(/const \[isModalOpen, setIsModalOpen\] = useState\(false\);\n/, '');
transfers = transfers.replace(/const \[isMinimized, setIsMinimized\] = useState\(false\);\n/, '');
transfers = transfers.replace(/const \[saving, setSaving\] = useState\(false\);\n/, '');
transfers = transfers.replace(/const \[error, setError\] = useState\(''\);\n/, '');
transfers = transfers.replace(/const \[form, setForm\].*?\n.*?to_location: '',\n  \}\);\n/, '');
transfers = transfers.replace(/const \[itemsToTransfer, setItemsToTransfer\].*?\n/, '');

// 4. Update the button onClick to use Zustand action
transfers = transfers.replace(
  /onClick=\{\(\) => \{ setIsModalOpen\(true\); setIsMinimized\(false\); setError\(''\); \}\}/,
  "onClick={() => { setTransferModalOpen(true); setTransferModalMinimized(false); setTransferForm({ from_location: '', to_location: '' }); setTransferItems([{ brand_id: '', item_id: '', quantity: 1, _id: Date.now() }]); }}"
);

// 5. Remove the entire <Modal> JSX
transfers = transfers.replace(/<Modal[\s\S]*<\/Modal>/, '');

// There is a use of `form` and `itemsToTransfer` up at the top in `sourceItems` and `minimizeLabel`, which we don't need in `Transfers.tsx` anymore!
transfers = transfers.replace(/const sourceItems = [\s\S]*?\];\n/, '');
transfers = transfers.replace(/const minimizeLabel = [\s\S]*?\)\(\);\n/, '');

// The handleTransfer, handleClose, addItemRow, removeItemRow are not needed anymore
transfers = transfers.replace(/const handleTransfer = [\s\S]*?setSaving\(false\);\n    \}\n  \};\n/, '');
transfers = transfers.replace(/const handleClose = [\s\S]*?setError\(''\);\n  \};\n/, '');
transfers = transfers.replace(/const addItemRow = [\s\S]*?\}\];\n  \};\n/, '');
transfers = transfers.replace(/const removeItemRow = [\s\S]*?index\)\);\n  \};\n/, '');

fs.writeFileSync('src/pages/Transfers.tsx', transfers, 'utf8');

// Fix Shops.tsx
let shops = fs.readFileSync('src/pages/Shops.tsx', 'utf8');

// 1. Remove modal component import for Record Sale (keep it if needed for Stock Distribution? We will just replace it later)
// shops = shops.replace(/import Modal from '\.\.\/components\/Modal';\n/, ''); // Wait, it uses Modal for Stock Distribution!

// 2. Add setRecordSaleModalOpen, setRecordSaleModalMinimized, setRecordSaleLocation, setRecordSaleItems to useStore
shops = shops.replace(
  /const \{ locations, items, inventory, sales, recordSale, brands, transactions \} = useStore\(\);/,
  "const { locations, items, inventory, sales, recordSale, brands, transactions, setRecordSaleModalOpen, setRecordSaleModalMinimized, setRecordSaleLocation, setRecordSaleItems } = useStore();"
);

// 3. Remove local state variables for Record Sale Modal
shops = shops.replace(/const \[saleModal, setSaleModal\] = useState\(false\);\n/, '');
shops = shops.replace(/const \[saving, setSaving\] = useState\(false\);\n/, '');
shops = shops.replace(/const \[saleLocation, setSaleLocation\] = useState\(''\);\n/, '');
shops = shops.replace(/const \[isSaleMinimized, setIsSaleMinimized\] = useState\(false\);\n/, '');
shops = shops.replace(/const \[saleItems, setSaleItems\].*?\n/, '');

// 4. Update the button onClick to use Zustand action
shops = shops.replace(
  /onClick=\{\(\) => \{\n\s*setSaleModal\(true\);\n\s*setIsSaleMinimized\(false\);\n\s*\}\}/,
  "onClick={() => { setRecordSaleModalOpen(true); setRecordSaleModalMinimized(false); setRecordSaleLocation(''); setRecordSaleItems([{ brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }]); }}"
);
shops = shops.replace(
  /onClick=\{\(\) => \{ setSaleModal\(true\); setIsSaleMinimized\(false\); \}\}/,
  "onClick={() => { setRecordSaleModalOpen(true); setRecordSaleModalMinimized(false); setRecordSaleLocation(''); setRecordSaleItems([{ brand_id: '', item_id: '', quantity: 1, selling_price: 0, currency: 'USD', _id: Date.now() }]); }}"
);

// 5. Remove the <Modal> for Record a Sale
shops = shops.replace(/<Modal[\s\S]*?isOpen=\{saleModal\}[\s\S]*?<\/Modal>/, '');

// Also remove `totalEstimatedProfit` and `totalAmount` and `handleRecordSale`, `addSaleItemRow`, `removeSaleItemRow`
shops = shops.replace(/const totalEstimatedProfit = [\s\S]*?\}, 0\);\n/, '');
shops = shops.replace(/const totalAmount = [\s\S]*?si\.currency\), 0\);\n/, '');
shops = shops.replace(/const handleRecordSale = [\s\S]*?setSaving\(false\);\n    \}\n  \};\n/, '');
shops = shops.replace(/const addSaleItemRow = [\s\S]*?\}\];\n  \};\n/, '');
shops = shops.replace(/const removeSaleItemRow = [\s\S]*?index\)\);\n  \};\n/, '');

fs.writeFileSync('src/pages/Shops.tsx', shops, 'utf8');
