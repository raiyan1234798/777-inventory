const fs = require('fs');
const path = 'src/pages/StockReports.tsx';
let code = fs.readFileSync(path, 'utf8');

// Replace targetDate state with dateFrom and dateTo
code = code.replace(
/  const \[targetDate, setTargetDate\] = useState\(today\);/g,
`  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);`
);

// Update dependency array of stockData
code = code.replace(
/targetDate\]\);/g,
`dateFrom, dateTo]);`
);

// Update isOnDate and isAfterDate
code = code.replace(
/  const isOnDate = \(timestamp: string\) => \{\s+return new Date\(timestamp\)\.toISOString\(\)\.split\('T'\)\[0\] === targetDate;\s+\};\s+const isAfterDate = \(timestamp: string\) => \{\s+return new Date\(timestamp\)\.toISOString\(\)\.split\('T'\)\[0\] > targetDate;\s+\};/g,
`  const isOnDate = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d >= dateFrom && d <= dateTo;
  };

  const isAfterDate = (timestamp: string) => {
    const d = new Date(timestamp).toISOString().split('T')[0];
    return d > dateTo;
  };`
);

// Update isToday check inside getItemStockRow
code = code.replace(
/const isToday = targetDate === today;/g,
`const isToday = dateTo === today && dateFrom === today;`
);

// Update Excel Export to use dateFrom and dateTo
code = code.replace(
/const dateTo = targetDate \|\| today;\s+const filteredItems/g,
`const dtTo = dateTo || today;
      const dtFrom = dateFrom || today;
      const filteredItems`
);
code = code.replace(
/dateTo,\s+inventory,/g,
`dateTo: dtTo,
        dateFrom: dtFrom,
        inventory,`
);

// Update PDF Export to use dateFrom and dateTo
code = code.replace(
/const date = targetDate \|\| today;\s+const filteredItems/g,
`const dtTo = dateTo || today;
      const dtFrom = dateFrom || today;
      const filteredItems`
);
code = code.replace(
/date,\s+sales/g,
`dateTo: dtTo, dateFrom: dtFrom, sales`
);
code = code.replace(
/dateTo: date,\s+inventory,/g,
`dateTo: dtTo,
          dateFrom: dtFrom,
          inventory,`
);

// Replace Target Date input in UI
code = code.replace(
/<div>\s+<label className="block text-xs font-bold text-gray-600 mb-2">Target Date \(Snapshot\)<\/label>\s+<input\s+type="date"\s+value=\{targetDate\}\s+max=\{today\}\s+onChange=\{\(e\) => setTargetDate\(e.target.value\)\}\s+className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary cursor-pointer"\s+onClick=\{\(e\) => \{ try \{ e\.currentTarget\.showPicker\(\); \} catch \(err\) \{\} \}\}\s+onKeyDown=\{\(e\) => e.preventDefault\(\)\}\s+\/>\s+<\/div>/g,
`<div className="flex gap-2">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">From Date</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary cursor-pointer"
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                onKeyDown={(e) => e.preventDefault()}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-2">To Date</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium focus:outline-none focus:border-primary cursor-pointer"
                onClick={(e) => { try { e.currentTarget.showPicker(); } catch (err) {} }}
                onKeyDown={(e) => e.preventDefault()}
              />
            </div>
          </div>`
);

// Reset Filters update
code = code.replace(
/setTargetDate\(today\);/g,
`setDateFrom(today); setDateTo(today);`
);

// Live Preview Header update
code = code.replace(
/Live Preview — \{selectedName\} · \{new Date\(targetDate \+ 'T00:00:00'\)\.toLocaleDateString\('en-IN'\)\}/g,
`Live Preview — {selectedName} · {dateFrom === dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN') : \`\${new Date(dateFrom + 'T00:00:00').toLocaleDateString('en-IN')} to \${new Date(dateTo + 'T00:00:00').toLocaleDateString('en-IN')}\`}`
);

fs.writeFileSync(path, code);
