const fs = require('fs');

const replacements = {
  'src/pages/Users.tsx': [
    ['Manage access control and node assignments.', 'Manage access control and shop assignments.'],
    ['All Nodes', 'All Shops'],
    ['Commitment Node', 'Assigned Shop'],
    ['Global Node', 'Global (All Shops)'],
    ['Modify node privileges and access vectors.', 'Modify privileges and shop access.'],
    ['Initialize a new team member into the global directory.', 'Add a new team member.'],
    ['Primary Node Assignment', 'Primary Shop Assignment'],
    ['Global Authority / All Nodes', 'Global Authority / All Shops']
  ],
  'src/pages/Warehouse.tsx': [
    ['Global Chain Nodes:', 'Total Shops:']
  ],
  'src/pages/Finance.tsx': [
    ['Multi-node profit audit and capital rotation logic.', 'Multi-shop profit overview and financial logic.'],
    ['{containers.length} Nodes', '{containers.length} Shops'],
    ['Node Currency Mix', 'Shop Currency Mix'],
    ['Anchor Node Performance', 'Shop Performance'],
    ['No node data identified', 'No shop data available']
  ],
  'src/pages/Notifications.tsx': [
    ['Node Notifications', 'Shop Notifications'],
    ["'Branch Node'", "'Shop'"],
    ['Every node is currently operational and synchronized.', 'Every shop is currently operational and synchronized.']
  ],
  'src/lib/dataExporter.ts': [
    ["'Node Flowback'", "'Shop Transfer'"]
  ],
  'src/pages/Transfers.tsx': [
    ['Execute and audit inter-node item migrations.', 'Manage item transfers between shops.'],
    ['>Node Path<', '>Transfer Path<'],
    ['>Node Valuation<', '>Value<'],
    ['Node Migration Vector', 'Transfer Items'],
    ['Rotate synchronized objects between node anchors.', 'Transfer items between shops.'],
    ['Source Node Anchor', 'From Shop'],
    ['Destination Node Anchor', 'To Shop'],
    ['Available Nodes', 'Available'],
    ['Node Limit:', 'Stock Limit:']
  ],
  'src/pages/Dashboard.tsx': [
    ['across Node List', 'across All Shops'],
    ['Global node inventory empty', 'Global inventory empty'],
    ['Node Valuation', 'Shop Inventory Value'],
    ['Empty node map', 'No shops available']
  ],
  'src/pages/Returns.tsx': [
    ['Item Node', 'Returned Item'],
    ['Location Node', 'Shop'],
    ['All initial nodes remain committed.', 'Inventory levels updated.'],
    ["'Node Flowback'", "'Warehouse Return'"],
    ['choose node action.', 'choose action.'],
    ['Node Commitment', 'Return Action'],
    ['Node Location', 'Shop Location'],
    ['Select node path…', 'Select shop…'],
    ['damaged node', 'damaged item'],
    ['Cancel Node Change', 'Cancel']
  ]
};

for (const [file, reps] of Object.entries(replacements)) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [search, replace] of reps) {
    content = content.split(search).join(replace);
  }
  fs.writeFileSync(file, content);
}
console.log('Done!');
