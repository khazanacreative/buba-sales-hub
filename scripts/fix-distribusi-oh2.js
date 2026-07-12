import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src', 'pages', 'Distribusi.tsx');

let content = readFileSync(filePath, 'utf-8');
content = content.replace(/\r\n/g, '\n');

let replaced = false;

// ============================================================
// REPLACEMENT A: Any remaining calcRetur with old cup-based pattern
// Try a more flexible regex-based approach for any leftover instances
// ============================================================

// Pattern 1: calcRetur with existingSales, rGrid (inline filter-reduce)
const oldCalcA = `            const totalSent = dSent + iSent;
            const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
            }`;

const newCalcA = `            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }`;

// Count how many of oldCalcA remain
const remainingA = countOccurrences(content, oldCalcA);
if (remainingA > 0) {
  console.log(`Found ${remainingA} remaining calcRetur with existingSales (inline filter-reduce)`);
  content = content.replaceAll(oldCalcA, newCalcA);
  replaced = true;
} else {
  console.log('No remaining calcRetur with existingSales pattern found');
}

// Pattern 2: calcRetur with existingPenjualan, freshReturGrid (inline filter-reduce)
const oldCalcB = `            const totalSent = dSent + iSent;
            const sold = existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              freshReturGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              freshReturGrid[o.id][iField] = totalRetur - freshReturGrid[o.id][dField];
            }`;

const newCalcB = `            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              freshReturGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              freshReturGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                freshReturGrid[o.id][dField] = dReturCups * gramPerCup;
                freshReturGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }`;

const remainingB = countOccurrences(content, oldCalcB);
if (remainingB > 0) {
  console.log(`Found ${remainingB} remaining calcRetur with existingPenjualan (inline filter-reduce)`);
  content = content.replaceAll(oldCalcB, newCalcB);
  replaced = true;
} else {
  console.log('No remaining calcRetur with existingPenjualan pattern found');
}

// ============================================================
// REPLACEMENT C: saveStep5 recovered ingredients — convert grams→cups
// ============================================================
// bubur_d
const oldRecBD = `          if (sent.bubur_d > 0) {
            const actualRetur = Math.min(retur.bubur_d, sent.bubur_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }`;
const newRecBD = `          if (sent.bubur_d > 0) {
            const actualReturCups = Math.min(Math.floor((retur.bubur_d || 0) / 118), sent.bubur_d);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualReturCups, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualReturCups, BUBUR_BASE.sayurPutih);
            }
          }`;
// Try without the || 0
const oldRecBD2 = `          if (sent.bubur_d > 0) {
            const actualRetur = Math.min(retur.bubur_d || 0, sent.bubur_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }`;
const newRecBD2 = `          if (sent.bubur_d > 0) {
            const actualReturCups = Math.min(Math.floor((retur.bubur_d || 0) / 118), sent.bubur_d);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualReturCups, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualReturCups, BUBUR_BASE.sayurPutih);
            }
          }`;

if (content.includes(oldRecBD)) {
  console.log('Found recovered bubur_d (no || 0)');
  content = content.replaceAll(oldRecBD, newRecBD);
  replaced = true;
} else if (content.includes(oldRecBD2)) {
  console.log('Found recovered bubur_d (with || 0)');
  content = content.replaceAll(oldRecBD2, newRecBD2);
  replaced = true;
} else {
  console.log('WARNING: Could not find recovered bubur_d');
}

// bubur_i
const oldRecBI = `          if (sent.bubur_i > 0) {
            const actualRetur = Math.min(retur.bubur_i || 0, sent.bubur_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }`;
const newRecBI = `          if (sent.bubur_i > 0) {
            const actualReturCups = Math.min(Math.floor((retur.bubur_i || 0) / 118), sent.bubur_i);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualReturCups, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualReturCups, BUBUR_BASE.sayurPutih);
            }
          }`;
if (content.includes(oldRecBI)) {
  console.log('Found recovered bubur_i');
  content = content.replaceAll(oldRecBI, newRecBI);
  replaced = true;
} else {
  console.log('WARNING: Could not find recovered bubur_i');
}

// tim_d
const oldRecTD = `          if (sent.tim_d > 0) {
            const actualRetur = Math.min(retur.tim_d || 0, sent.tim_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }`;
const newRecTD = `          if (sent.tim_d > 0) {
            const actualReturCups = Math.min(Math.floor((retur.tim_d || 0) / 108), sent.tim_d);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += actualReturCups * settings.berasTim;
              recoveredIngredients.sayurHijau += actualReturCups * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualReturCups * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualReturCups * settings.sayurPutihTim;
            }
          }`;
if (content.includes(oldRecTD)) {
  console.log('Found recovered tim_d');
  content = content.replaceAll(oldRecTD, newRecTD);
  replaced = true;
} else {
  console.log('WARNING: Could not find recovered tim_d');
}

// tim_i
const oldRecTI = `          if (sent.tim_i > 0) {
            const actualRetur = Math.min(retur.tim_i || 0, sent.tim_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }`;
const newRecTI = `          if (sent.tim_i > 0) {
            const actualReturCups = Math.min(Math.floor((retur.tim_i || 0) / 108), sent.tim_i);
            if (actualReturCups > 0) {
              recoveredIngredients.beras += actualReturCups * settings.berasTim;
              recoveredIngredients.sayurHijau += actualReturCups * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualReturCups * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualReturCups * settings.sayurPutihTim;
            }
          }`;
if (content.includes(oldRecTI)) {
  console.log('Found recovered tim_i');
  content = content.replaceAll(oldRecTI, newRecTI);
  replaced = true;
} else {
  console.log('WARNING: Could not find recovered tim_i');
}

// ============================================================
// REPLACEMENT D: auto-create penjualan — convert grams→cups
// ============================================================
const oldAutoBubur = `          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = (ret.bubur_d || 0) + (ret.bubur_i || 0);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));`;
const newAutoBubur = `          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = Math.floor(((ret.bubur_d || 0) + (ret.bubur_i || 0)) / 118);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));`;
if (content.includes(oldAutoBubur)) {
  console.log('Found auto-create buburRet');
  content = content.replaceAll(oldAutoBubur, newAutoBubur);
  replaced = true;
} else {
  console.log('WARNING: Could not find auto-create buburRet');
}

const oldAutoTim = `          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = (ret.tim_d || 0) + (ret.tim_i || 0);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));`;
const newAutoTim = `          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = Math.floor(((ret.tim_d || 0) + (ret.tim_i || 0)) / 108);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));`;
if (content.includes(oldAutoTim)) {
  console.log('Found auto-create timRet');
  content = content.replaceAll(oldAutoTim, newAutoTim);
  replaced = true;
} else {
  console.log('WARNING: Could not find auto-create timRet');
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

if (replaced) {
  content = content.replace(/\n/g, '\r\n');
  writeFileSync(filePath, content, 'utf-8');
  console.log('\n✅ Distribusi.tsx updated successfully!');
} else {
  console.log('\n⚠️  No replacements were made in Distribusi.tsx');
}
