const fs = require('fs');

const path = 'src/store/index.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
/    for \(let i = 0; i < itemUpdates\.length; i \+= 500\) \{\s+const b = writeBatch\(db\);\s+itemUpdates\.slice\(i, i \+ 500\)\.forEach\(update => \{\s+const ref = doc\(db, 'items', update\.id\);\s+const fbUpdates: Partial<Item> = \{\};\s+if \(update\.avg_cost_USD !== undefined\) fbUpdates\.avg_cost_USD = update\.avg_cost_USD;\s+if \(update\.retail_price !== undefined\) fbUpdates\.retail_price = update\.retail_price;\s+if \(Object\.keys\(fbUpdates\)\.length > 0\) \{\s+b\.update\(ref, sanitizeForFirestore\(fbUpdates\)\);\s+\}\s+\}\);\s+await b\.commit\(\);\s+\}/g,
`    const batchPromises = [];
    for (let i = 0; i < itemUpdates.length; i += 500) {
      const b = writeBatch(db);
      itemUpdates.slice(i, i + 500).forEach(update => {
        const ref = doc(db, 'items', update.id);
        const fbUpdates: Partial<Item> = {};
        if (update.avg_cost_USD !== undefined) fbUpdates.avg_cost_USD = update.avg_cost_USD;
        if (update.retail_price !== undefined) fbUpdates.retail_price = update.retail_price;
        
        if (Object.keys(fbUpdates).length > 0) {
          b.update(ref, sanitizeForFirestore(fbUpdates));
        }
      });
      batchPromises.push(b.commit());
    }
    await Promise.all(batchPromises);`
);

fs.writeFileSync(path, code);
