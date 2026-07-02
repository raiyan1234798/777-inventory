const fs = require('fs');
const path = 'src/lib/bulkOperations.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
/export async function printAllLocationsStockReport\(data: \{\s+date: string;\s+sales: any\[\];/g,
`export async function printAllLocationsStockReport(data: {
  dateFrom?: string;
  dateTo?: string;
  sales: any[];`
);

code = code.replace(
/const \{ date, sales, locations, items, brands, inventory, transactions, returns, showEmptyStock = false \} = data;/g,
`const { dateFrom, dateTo, sales, locations, items, brands, inventory, transactions, returns, showEmptyStock = false } = data;`
);

code = code.replace(
/const targetDate = date;/g,
`const targetDate = dateTo || new Date().toISOString().split('T')[0];`
);

code = code.replace(
/const isInRange = \(timestamp: string\) => \{\s+const d = new Date\(timestamp\).toISOString\(\).split\('T'\)\[0\];\s+return d === targetDate;\s+\};/g,
`const isInRange = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    if (dateFrom && d < dateFrom) return false;
    if (d > targetDate) return false;
    return true;
  };`
);

code = code.replace(
/const isAfterRange = \(timestamp: string\) => \{\s+const d = new Date\(timestamp\).toISOString\(\).split\('T'\)\[0\];\s+return d > targetDate;\s+\};/g,
`const isAfterRange = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d > targetDate;
  };`
);

code = code.replace(
/Date: \$\{new Date\(targetDate \+ 'T00:00:00'\)\.toLocaleDateString\('en-IN'\)\}/g,
`Date: \${dateFrom ? \`\${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN')} to \` : ''}\${new Date(targetDate + 'T00:00:00').toLocaleDateString('en-IN')}`
);

fs.writeFileSync(path, code);
