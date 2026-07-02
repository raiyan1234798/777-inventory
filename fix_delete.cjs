const fs = require('fs');

const path = 'src/store/index.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
/    for \(let i = 0; i < allDocs.length; i \+= 500\) \{\s+const b = writeBatch\(db\);\s+allDocs\.slice\(i, i \+ 500\)\.forEach\(ref => b\.delete\(ref\)\);\s+await b\.commit\(\);\s+\}\s+\/\/ Log deletion\s+for \(const id of ids\) \{\s+const item = st\.items\.find\(i => i\.id === id\);\s+if \(item\) \{\s+await logAction\('delete', 'item', id, item\.name, `Deleted item \$\{item\.name\} and all its inventory records\.`\);\s+\}\s+\}/g,
`    const batchPromises = [];
    for (let i = 0; i < allDocs.length; i += 500) {
      const b = writeBatch(db);
      allDocs.slice(i, i + 500).forEach(ref => b.delete(ref));
      batchPromises.push(b.commit());
    }
    
    // Log deletion concurrently
    for (const id of ids) {
      const item = st.items.find(i => i.id === id);
      if (item) {
        batchPromises.push(logAction('delete', 'item', id, item.name, \`Deleted item \${item.name} and all its inventory records.\`));
      }
    }
    await Promise.all(batchPromises);`
);

fs.writeFileSync(path, code);
