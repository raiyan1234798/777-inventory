const fs = require('fs');

const path = 'src/components/GlobalImportModal.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
/      for \(let i = 0; i < allMasterBatches\.length; i\+\+\) \{\s+await allMasterBatches\[i\]\.commit\(\);\s+setImportProcessingStatus\(`Saved items batch \$\{i \+ 1\} of \$\{allMasterBatches\.length\}\.\.\.`\);\s+\}\s+for \(let i = 0; i < inventoryBatches\.length; i\+\+\) \{\s+await inventoryBatches\[i\]\.commit\(\);\s+setImportProcessingStatus\(`Saved inventory batch \$\{i \+ 1\} of \$\{inventoryBatches\.length\}\.\.\.`\);\s+\}/g,
`      const commitPromises = [];
      for (let i = 0; i < allMasterBatches.length; i++) {
        commitPromises.push(allMasterBatches[i].commit().then(() => setImportProcessingStatus(\`Saved items batch \${i + 1} of \${allMasterBatches.length}...\`)));
      }
      for (let i = 0; i < inventoryBatches.length; i++) {
        commitPromises.push(inventoryBatches[i].commit().then(() => setImportProcessingStatus(\`Saved inventory batch \${i + 1} of \${inventoryBatches.length}...\`)));
      }
      await Promise.all(commitPromises);`
);

fs.writeFileSync(path, code);
