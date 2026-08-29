const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

const replacements = [
  { search: /lime-400/g, replace: 'cyan-500' },
  { search: /lime-500/g, replace: 'blue-500' },
  { search: /green-400/g, replace: 'cyan-400' },
  { search: /green-500/g, replace: 'blue-600' },
  { search: /bg-\[#0E0F14\]/g, replace: 'bg-black' },
  { search: /bg-\[#0F131B\]/g, replace: 'bg-[#0a0a0a]' },
  { search: /bg-\[#12161E\]/g, replace: 'bg-[#111111]' },
  { search: /bg-\[#171A22\]/g, replace: 'bg-[#111111]' },
  { search: /bg-\[#181B23\]/g, replace: 'bg-[#111111]' },
  { search: /bg-\[#151A24\]/g, replace: 'bg-[#1a1a1a]' },
  { search: /bg-\[#1B2030\]/g, replace: 'bg-[#1a1a1a]' },
  { search: /bg-\[#1F2430\]/g, replace: 'bg-[#1a1a1a]' },
  { search: /border-\[#0E0F14\]/g, replace: 'border-black' }
];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(srcDir);
let changedFiles = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  replacements.forEach(({ search, replace }) => {
    content = content.replace(search, replace);
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    changedFiles++;
    console.log(`Updated: ${file}`);
  }
});

console.log(`Successfully updated ${changedFiles} files.`);
