import fs from 'fs';
import path from 'path';

const walkSync = (dir, filelist = []) => {
  fs.readdirSync(dir).forEach(file => {
    const dirFile = path.join(dir, file);
    if (fs.statSync(dirFile).isDirectory()) {
      filelist = walkSync(dirFile, filelist);
    } else {
      if (dirFile.endsWith('.ts') || dirFile.endsWith('.tsx') || dirFile.endsWith('.js') || dirFile.endsWith('.jsx')) {
        filelist.push(dirFile);
      }
    }
  });
  return filelist;
};

const files = walkSync('./src');
let changed = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replacements
  content = content.replace(/_INR/g, '_USD');
  content = content.replace(/toINR/g, 'toUSD');
  content = content.replace(/'INR'/g, "'USD'");
  content = content.replace(/"INR"/g, '"USD"');
  content = content.replace(/currency: 'INR'/g, "currency: 'USD'");
  content = content.replace(/Base: ₹ INR/g, "Base: $ USD");
  content = content.replace(/currency: COUNTRIES\.find\(c => c\.name === e\.target\.value\)\?\.currency \|\| 'USD'/g, "currency: COUNTRIES.find(c => c.name === e.target.value)?.currency || 'USD'"); // just in case
  content = content.replace(/₹/g, '$');
  content = content.replace(/country: 'India'/g, "country: 'Zambia'");

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    changed++;
    console.log(`Updated ${file}`);
  }
}

console.log(`Updated ${changed} files.`);
