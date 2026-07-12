import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(__dirname, '..', 'src', 'pages', 'Distribusi.tsx');

let content = readFileSync(filePath, 'utf-8');
content = content.replace(/\r\n/g, '\n');

let replaced = false;

// ============================================================
// REPLACEMENT: 3 identical calcRetur with totalSent-sold cup approach
// Change to: use sisaGram from penjualan data if available
// ============================================================
const oldCalcRetur = `          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
            }
          };`;

const newCalcRetur = `          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
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
            }
          };`;

if (content.includes(oldCalcRetur)) {
  const count = countOccurrences(content, oldCalcRetur);
  console.log(`Found ${count} occurrence(s) of old calcRetur in Distribusi.tsx`);
  content = content.replaceAll(oldCalcRetur, newCalcRetur);
  replaced = true;
} else {
  console.log('WARNING: Could not find old calcRetur in Distribusi.tsx');
}

// Also fix the saveStep5 freshReturGrid variant
const oldCalcReturFresh = `          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              freshReturGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              freshReturGrid[o.id][iField] = totalRetur - freshReturGrid[o.id][dField];
            }
          };`;

const newCalcReturFresh = `          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
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
            }
          };`;

if (content.includes(oldCalcReturFresh)) {
  const count = countOccurrences(content, oldCalcReturFresh);
  console.log(`Found ${count} occurrence(s) of old calcRetur fresh in Distribusi.tsx`);
  content = content.replaceAll(oldCalcReturFresh, newCalcReturFresh);
  replaced = true;
} else {
  console.log('WARNING: Could not find old calcRetur fresh in Distribusi.tsx');
}

// ============================================================
// Also fix the renderStep5 input fields in Distribusi.tsx (same patterns)
// ============================================================
// bubur_d
const oldInputBD = `                      value={(row.bubur_d || 0) * 118 || ""}`;
const newInputBD = `                      value={row.bubur_d || ""}`;
if (content.includes(oldInputBD)) {
  content = content.replaceAll(oldInputBD, newInputBD);
  replaced = true;
}
const oldOnChangeBD = `                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_d);
                        handleReturChange(step5OutletId, "bubur_d", cups);
                      }`;
const newOnChangeBD = `                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "bubur_d", Math.min(grams, sent.bubur_d * 118));
                      }`;
if (content.includes(oldOnChangeBD)) {
  content = content.replaceAll(oldOnChangeBD, newOnChangeBD);
  replaced = true;
}

// bubur_i
const oldInputBI = `                      value={(row.bubur_i || 0) * 118 || ""}`;
const newInputBI = `                      value={row.bubur_i || ""}`;
if (content.includes(oldInputBI)) {
  content = content.replaceAll(oldInputBI, newInputBI);
  replaced = true;
}
const oldOnChangeBI = `                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_i);
                        handleReturChange(step5OutletId, "bubur_i", cups);
                      }`;
const newOnChangeBI = `                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(step5OutletId, "bubur_i", Math.min(grams, sent.bubur_i * 118));
                      }`;
if (content.includes(oldOnChangeBI)) {
  content = content.replaceAll(oldOnChangeBI, newOnChangeBI);
  replaced = true;
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
  console.log('\n✅ Distribusi.tsx written successfully!');
} else {
  console.log('\n⚠️  No replacements were made in Distribusi.tsx');
}
