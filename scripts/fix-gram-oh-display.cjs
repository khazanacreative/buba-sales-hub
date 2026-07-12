const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/pages/Produksi.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Normalize line endings to LF
content = content.replace(/\r\n/g, '\n');

// ——— FIX 1: Cup approximations for bubur_d/bubur_i (gramPerCup = 118) ———
const cupApproxBuburPatterns = [
  { field: 'bubur_d', factor: 118 },
  { field: 'bubur_i', factor: 118 },
  { field: 'tim_d', factor: 108 },
  { field: 'tim_i', factor: 108 },
];

for (const { field, factor } of cupApproxBuburPatterns) {
  // Fix: ≈ {row.xxx || 0} cup retur  →  ≈ {Math.floor((row.xxx || 0) / factor)} cup retur
  const oldCupApprox = new RegExp(
    `≈ \\{row\\.${field} \\|\\| 0\\} cup retur`,
    'g'
  );
  content = content.replace(
    oldCupApprox,
    `≈ {Math.floor((row.${field} || 0) / ${factor})} cup retur`
  );

  // Fix: Terjual: sent - row.xxx (cup - grams → wrong!)
  const oldTerjual = new RegExp(
    `Terjual: \\{Math\\.max\\(0, \\(sent\\.${field} \\|\\| 0\\) - \\(row\\.${field} \\|\\| 0\\)\\)\\} cup \\(\\{Math\\.max\\(0, \\(sent\\.${field} \\|\\| 0\\) - \\(row\\.${field} \\|\\| 0\\)\\) \\* ${factor}\\.toLocaleString\\(\\)\\} g\\)`,
    'g'
  );
  content = content.replace(
    oldTerjual,
    `Terjual: {Math.max(0, (sent.${field} || 0) - Math.floor((row.${field} || 0) / ${factor}))} cup ({Math.max(0, (sent.${field} || 0) - Math.floor((row.${field} || 0) / ${factor})) * ${factor}.toLocaleString()} g)`
  );
}

// ——— FIX 2: Summary table Terjual (without gram equivalent) ———
const summaryTerjualPatterns = [
  { field: 'bubur_d', factor: 118 },
  { field: 'bubur_i', factor: 118 },
  { field: 'tim_d', factor: 108 },
  { field: 'tim_i', factor: 108 },
];

for (const { field, factor } of summaryTerjualPatterns) {
  const oldSummary = new RegExp(
    `Terjual: \\{Math\\.max\\(0, \\(sent\\.${field} \\|\\| 0\\) - \\(row\\.${field} \\|\\| 0\\)\\)\\} cup`,
    'g'
  );
  content = content.replace(
    oldSummary,
    `Terjual: {Math.max(0, (sent.${field} || 0) - Math.floor((row.${field} || 0) / ${factor}))} cup`
  );
}

// Write back with original line endings (CRLF)
content = content.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, content, 'utf-8');

console.log(`✅ Produksi.tsx updated successfully!`);
