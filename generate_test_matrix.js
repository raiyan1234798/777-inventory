import * as XLSX from 'xlsx';

const rows = [
  ['TRIPLE SEVEN INVESTMENTS LTD-2022', '', '', '', 'WARSAW-WAREHOUSE'],
  ['10-Apr-26', '', 'LADIES T-SHIRT-L/S', '', '', '', '', 'MEN COTTON SHIRT'],
  ['', '', '0', '5', '5', '0', '0', '0', '4', '4', '0', '0'],
  ['Date', 'Particulars', 'OPS', 'REC', 'SUPP', 'RTD', 'CLS', 'OPS', 'REC', 'SUPP', 'RTD', 'CLS'],
  ['11/26/22', 'RECEIVED FROM BAHSA', '0', '5', '', '', '5', '0', '4', '', '', '4'],
  ['11/28/22', 'SUPPLIED TO ASAAD', '5', '', '5', '', '0', '4', '', '4', '', '0'],
  ['12/17/22', 'RECEIVED FROM BASHA', '0', '', '', '', '0', '0', '', '', '', '0'],
  ['', '', '0', '', '', '', '0', '0', '', '', '', '0'],
  ['', '', '0', '', '', '', '0', '0', '', '', '', '0']
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);

// Merges for item names to match screenshot (spanning 5 columns under each item)
ws['!merges'] = [
  { s: { r: 1, c: 2 }, e: { r: 1, c: 6 } }, // LADIES T-SHIRT-L/S
  { s: { r: 1, c: 7 }, e: { r: 1, c: 11 } } // MEN COTTON SHIRT
];

XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, 'test_matrix.xlsx');
console.log('Test matrix created!');
