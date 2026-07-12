import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src', 'pages', 'Produksi.tsx');

let content = readFileSync(filePath, 'utf-8');

// Normalize to LF first
content = content.replace(/\r\n/g, '\n');

let replaced = false;

// ============================================================
// REPLACEMENT 1: 4 identical calcRetur with rGrid/existingSales
// ============================================================
const oldCalcReturRGrid = `            if (dRec) {
              rGrid[o.id][dField] = Math.min(Math.floor(dRec.sisaGram / gramPerCup), dSent);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(Math.floor(iRec.sisaGram / gramPerCup), iSent);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
                rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
              }
            }`;

const newCalcReturRGrid = `            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }`;

if (content.includes(oldCalcReturRGrid)) {
  const count = countOccurrences(content, oldCalcReturRGrid);
  console.log(`Found ${count} occurrence(s) of old calcRetur with rGrid`);
  content = content.replaceAll(oldCalcReturRGrid, newCalcReturRGrid);
  replaced = true;
} else {
  console.log('WARNING: Could not find old calcRetur with rGrid pattern');
}

// ============================================================
// REPLACEMENT 2: calcRetur with freshReturGrid/existingPenjualan
// ============================================================
const oldCalcReturFresh = `            if (dRec) {
              freshReturGrid[o.id][dField] = Math.min(Math.floor(dRec.sisaGram / gramPerCup), dSent);
            }
            if (iRec) {
              freshReturGrid[o.id][iField] = Math.min(Math.floor(iRec.sisaGram / gramPerCup), iSent);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingPenjualan
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                freshReturGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
                freshReturGrid[o.id][iField] = totalRetur - freshReturGrid[o.id][dField];
              }
            }`;

const newCalcReturFresh = `            if (dRec) {
              freshReturGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              freshReturGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingPenjualan
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                freshReturGrid[o.id][dField] = dReturCups * gramPerCup;
                freshReturGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }`;

if (content.includes(oldCalcReturFresh)) {
  console.log('Found calcRetur with freshReturGrid');
  content = content.replaceAll(oldCalcReturFresh, newCalcReturFresh);
  replaced = true;
} else {
  console.log('WARNING: Could not find calcRetur with freshReturGrid pattern');
}

// ============================================================
// REPLACEMENT 3-6: renderStep5 inputs
// ============================================================
const inputPatterns = [
  {
    old: `                      value={(row.bubur_d || 0) * 118 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_d);
                        handleReturChange(step5OutletId, "bubur_d", cups);
                      }`,
    new: `                      value={row.bubur_d || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "bubur_d", Math.min(grams, sent.bubur_d * 118));
                      }`
  },
  {
    old: `                      value={(row.bubur_i || 0) * 118 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_i);
                        handleReturChange(step5OutletId, "bubur_i", cups);
                      }`,
    new: `                      value={row.bubur_i || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "bubur_i", Math.min(grams, sent.bubur_i * 118));
                      }`
  },
  {
    old: `                      value={(row.tim_d || 0) * 108 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 108), sent.tim_d);
                        handleReturChange(step5OutletId, "tim_d", cups);
                      }`,
    new: `                      value={row.tim_d || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "tim_d", Math.min(grams, sent.tim_d * 108));
                      }`
  },
  {
    old: `                      value={(row.tim_i || 0) * 108 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 108), sent.tim_i);
                        handleReturChange(step5OutletId, "tim_i", cups);
                      }`,
    new: `                      value={row.tim_i || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "tim_i", Math.min(grams, sent.tim_i * 108));
                      }`
  }
];

for (const p of inputPatterns) {
  if (content.includes(p.old)) {
    console.log(`Found input pattern: ${p.new.substring(0, 50)}...`);
    content = content.replaceAll(p.old, p.new);
    replaced = true;
  } else {
    console.log('WARNING: Could not find input pattern');
  }
}

// ============================================================
// REPLACEMENT 7: saveStep5 recovered ingredients
// ============================================================
const recovPatterns = [
  // bubur_d
  {
    old: `          if (sent.bubur_d > 0) {
            const actualRetur = Math.min(retur.bubur_d || 0, sent.bubur_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }`,
    new: `          if (sent.bubur_d > 0) {
            const actualReturCups = Math.min(Math.floor((retur.bubur_d || 0) / 118), sent.bubur_d);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualReturCups, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualReturCups, BUBUR_BASE.sayurPutih);
            }
          }`
  },
  // bubur_i
  {
    old: `          if (sent.bubur_i > 0) {
            const actualRetur = Math.min(retur.bubur_i || 0, sent.bubur_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }`,
    new: `          if (sent.bubur_i > 0) {
            const actualReturCups = Math.min(Math.floor((retur.bubur_i || 0) / 118), sent.bubur_i);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualReturCups, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualReturCups, BUBUR_BASE.sayurPutih);
            }
          }`
  },
  // tim_d
  {
    old: `          if (sent.tim_d > 0) {
            const actualRetur = Math.min(retur.tim_d || 0, sent.tim_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }`,
    new: `          if (sent.tim_d > 0) {
            const actualReturCups = Math.min(Math.floor((retur.tim_d || 0) / 108), sent.tim_d);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += actualReturCups * settings.berasTim;
              recoveredIngredients.sayurHijau += actualReturCups * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualReturCups * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualReturCups * settings.sayurPutihTim;
            }
          }`
  },
  // tim_i
  {
    old: `          if (sent.tim_i > 0) {
            const actualRetur = Math.min(retur.tim_i || 0, sent.tim_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }`,
    new: `          if (sent.tim_i > 0) {
            const actualReturCups = Math.min(Math.floor((retur.tim_i || 0) / 108), sent.tim_i);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += actualReturCups * settings.berasTim;
              recoveredIngredients.sayurHijau += actualReturCups * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualReturCups * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualReturCups * settings.sayurPutihTim;
            }
          }`
  }
];

for (const p of recovPatterns) {
  if (content.includes(p.old)) {
    console.log('Found recovered ingredient pattern');
    content = content.replaceAll(p.old, p.new);
    replaced = true;
  } else {
    console.log('WARNING: Could not find recovered ingredient pattern');
  }
}

// ============================================================
// REPLACEMENT 8: auto-create penjualan
// ============================================================
const autoPatterns = [
  {
    old: `          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = (ret.bubur_d || 0) + (ret.bubur_i || 0);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));`,
    new: `          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = Math.floor(((ret.bubur_d || 0) + (ret.bubur_i || 0)) / 118);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));`
  },
  {
    old: `          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = (ret.tim_d || 0) + (ret.tim_i || 0);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));`,
    new: `          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = Math.floor(((ret.tim_d || 0) + (ret.tim_i || 0)) / 108);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));`
  }
];

for (const p of autoPatterns) {
  if (content.includes(p.old)) {
    console.log('Found auto-create pattern');
    content = content.replaceAll(p.old, p.new);
    replaced = true;
  } else {
    console.log('WARNING: Could not find auto-create pattern');
  }
}

function countOccurrences(str, substr) {
  let count = 0;
  let pos = 0;
  while ((pos = str.indexOf(substr, pos)) !== -1) {
    count++;
    pos += substr.length;
  }
  return count;
}

// ============================================================
// Convert back to CRLF and write
// ============================================================
if (replaced) {
  content = content.replace(/\n/g, '\r\n');
  writeFileSync(filePath, content, 'utf-8');
  console.log('\n✅ File written successfully!');
} else {
  console.log('\n⚠️  No replacements were made!');
}
