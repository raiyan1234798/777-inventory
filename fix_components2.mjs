import fs from 'fs';

let transfers = fs.readFileSync('src/pages/Transfers.tsx', 'utf8');

transfers = transfers.replace(/const \[form, setForm\] = useState\(\{[\s\S]*?\}\);\n/, '');
transfers = transfers.replace(/const addItemRow = \(\) => \{[\s\S]*?\}\];\n  \};\n/, '');

fs.writeFileSync('src/pages/Transfers.tsx', transfers, 'utf8');

let shops = fs.readFileSync('src/pages/Shops.tsx', 'utf8');

shops = shops.replace(/import Modal from '\.\.\/components\/Modal';\n/, "import Modal from '../components/Modal';\n");

fs.writeFileSync('src/pages/Shops.tsx', shops, 'utf8');
