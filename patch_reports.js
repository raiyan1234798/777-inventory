const fs = require('fs');
let code = fs.readFileSync('src/pages/Reports.tsx', 'utf8');

code = code.replace(/const netProfitTotal = filteredSales\.reduce\(\(sum, s\) => \{[\s\S]*?return sum \+ profitUSD;\n  \}, 0\);/, 'const netProfitTotal = filteredSales.reduce((sum, s) => sum + Math.max(0, calculateDynamicProfit(s)), 0);');

fs.writeFileSync('src/pages/Reports.tsx', code);
