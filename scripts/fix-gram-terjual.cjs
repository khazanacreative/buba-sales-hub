const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/pages/Produksi.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// Fix: Second occurrence in the gram equivalent part for all 4 bubur/tim fields
// Example: `(Math.max(0, (sent.bubur_d || 0) - (row.bubur_d || 0)) * 118).toLocaleString()} g)`
// Should be: `(Math.max(0, (sent.bubur_d || 0) - Math.floor((row.bubur_d || 0) / 118)) * 118).toLocaleString()} g)`

const patterns = [
  { field: 'bubur_d', factor: 118 },
  { field: 'bubur_i', factor: 118 },
  { field: 'tim_d', factor: 108 },
  { field: 'tim_i', factor: 108 },
];

for (const { field, factor } of patterns) {
  // Only match the SECOND occurrence (inside the (...).toLocaleString() part)
  // This is the one that appears after `cup ({`
  const oldPart = `(Math.max(0, (sent.${field} || 0) - (row.${field} || 0)) * ${factor}).toLocaleString()`;
  const newPart = `(Math.max(0, (sent.${field} || 0) - Math.floor((row.${field} || 0) / ${factor})) * ${factor}).toLocaleString()`;
  
  let count = 0;
  const replaced = content.replace(oldPart, (match) => {
    count++;
    return newPart;
  });
  
  console.log(`  ${field}: replaced ${count} occcurrence(s)`);
  content = replaced;
}

// Write back with CRLF
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf-8');

console.log(`\n✅ Produksi.tsx updated successfully!`);
