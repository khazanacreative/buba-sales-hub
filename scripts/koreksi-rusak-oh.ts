/**
 * KOREKSI RUSAK/OH — selaraskan penjualan & movement RUSAK:OH dgn aturan BARU
 *
 * Aturan lama sisaGramToCups memakai Math.ceil → sisa dgn desimal ≤ 0,5 dihitung
 * 1 cup lebih banyak (mis. 541 gr ÷ 108 = 5,009 → lama 6 cup, baru 5 cup).
 * Script ini mengoreksi data yang SUDAH tersimpan, dengan prinsip AMAN:
 *
 *   1. QTY PENJUALAN — record Bubur/Nasi Tim dgn sisa_gram: hitung ulang
 *      terjual = distVarian − min(sisaCupsBaru, distVarian); update qty & total
 *      bila berbeda dari tersimpan.
 *   2. MOVEMENT RUSAK:OH — HANYA mengoreksi movement beras / sayur hijau /
 *      sayur buah / sayur protein (bahan yg terpengaruh aturan gram→cup).
 *      Movement puding / oat / kemasan TIDAK disentuh.
 *      Tanggal hanya dikoreksi bila movement historis KONSISTEN dengan hitung
 *      ulang aturan lama dari data penjualan sekarang (kalau data sisa diubah
 *      setelah siklus ditutup, movement tidak bisa dikoreksi otomatis → di-skip
 *      dan ditandai untuk review manual).
 *
 * Cara pakai:
 *   npx tsx scripts/koreksi-rusak-oh.ts                                # dry-run 2026-08-13
 *   npx tsx scripts/koreksi-rusak-oh.ts --tanggal=2026-08-11 --apply
 *   npx tsx scripts/koreksi-rusak-oh.ts --dari=2026-08-08 --sampai=2026-08-11 --apply
 *   npx tsx scripts/koreksi-rusak-oh.ts --tanggal=2026-08-13 --outlet=o-kesambi
 * Opsi: --tanggal=YYYY-MM-DD | --dari=.. --sampai=.. | --outlet=<id> | --apply
 *       --force  → tulis ulang SEMUA movement RUSAK:OH tanggal tsb (termasuk
 *                  puding/oat/kemasan) sesuai data penjualan sekarang + aturan
 *                  baru, tanpa cek konsistensi. Dipakai utk tanggal yg movement-nya
 *                  basi (data diubah setelah siklus ditutup).
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const c = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
c.split(/\r?\n/).forEach((l) => {
  const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || "").replace(/^["']|["']$/g, "");
});
const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const tanggalArg = args.find((a) => a.startsWith("--tanggal="));
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const outletArg = args.find((a) => a.startsWith("--outlet="));
const OUTLET = outletArg ? outletArg.split("=")[1] : null;
const TANGGAL = tanggalArg ? tanggalArg.split("=")[1] : "2026-08-13";
const DARI = dariArg ? dariArg.split("=")[1] : TANGGAL;
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : TANGGAL;

const parseDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (dt: Date, n: number) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d; };

// ===== Konstanta — SAMA dengan Produksi.tsx / Distribusi.tsx =====
const BUBUR_BASE = { beras: 100, sayurHijau: 8, sayurBuah: 5, sayurProtein: 1.5 };
const buburCalc = (cups: number, base: number) => (cups * base) / 6;
const SETTINGS = { berasTim: 20, sayurHijauTim: 1.6, sayurBuahTim: 1.0, sayurProteinTim: 0.3 };
const GPC: Record<string, number> = { "p-bubur": 118, "p-nasitim": 108 };
const VARIANT_GPC: Record<string, number> = { bubur_d: 118, bubur_i: 118, tim_d: 108, tim_i: 108 };
// ingredient per cup (bubur = buburCalc, tim = flat)
const ING = {
  bubur: { beras: buburCalc(1, BUBUR_BASE.beras), sayurHijau: buburCalc(1, BUBUR_BASE.sayurHijau), sayurBuah: buburCalc(1, BUBUR_BASE.sayurBuah), sayurProtein: buburCalc(1, BUBUR_BASE.sayurProtein) },
  tim: { beras: SETTINGS.berasTim, sayurHijau: SETTINGS.sayurHijauTim, sayurBuah: SETTINGS.sayurBuahTim, sayurProtein: SETTINGS.sayurProteinTim },
};
const BAHAN_ING: Record<string, string> = { "b-brs01": "beras", "b-sh01": "sayurHijau", "b-sb01": "sayurBuah", "b-sp01": "sayurProtein" };

// Aturan BARU (identik dgn sisaGramToCups di produksi-utils.ts)
const newCups = (sisaGram: number, gpc: number) => {
  const grams = Math.max(0, Number(sisaGram) || 0);
  if (grams <= 50) return 0;
  const cups = Math.floor(grams / gpc);
  const frac = grams / gpc - cups;
  return cups + (frac > 0.5 ? 1 : 0);
};
// Aturan LAMA
const oldCups = (sisaGram: number, gpc: number) => {
  const grams = Math.max(0, Number(sisaGram) || 0);
  return grams <= 50 ? 0 : Math.ceil(grams / gpc);
};

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const parseSplit = (catatan?: string | null) => {
  const m = catatan?.match(/D:(\d+),I:(\d+)/);
  return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 };
};
const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
const BUBUR_FIELDS = ["bubur_d", "bubur_i"] as const;
const TIM_FIELDS = ["tim_d", "tim_i"] as const;

async function fetchDateData(tanggal: string) {
  const { data: dists, error: e1 } = await supabase
    .from("permohonan_stok")
    .select("outlet_id, produk_id, qty, status, catatan")
    .eq("tanggal_kirim", tanggal)
    .eq("status", "Disetujui");
  if (e1) throw new Error("permohonan_stok: " + e1.message);

  const { data: sales, error: e2 } = await supabase
    .from("penjualan")
    .select("*")
    .eq("tanggal", tanggal);
  if (e2) throw new Error("penjualan: " + e2.message);

  const distGrid: Record<string, any> = {};
  for (const d of (dists || []) as any[]) {
    const row = distGrid[d.outlet_id] || { ...ZERO };
    if (d.produk_id === "p-bubur" || d.produk_id === "p-nasitim") {
      const split = parseSplit(d.catatan);
      if (split.d > 0 || split.i > 0) {
        if (d.produk_id === "p-bubur") { row.bubur_d += split.d; row.bubur_i += split.i; }
        else { row.tim_d += split.d; row.tim_i += split.i; }
      } else {
        const half = Math.round(d.qty / 2);
        if (d.produk_id === "p-bubur") { row.bubur_d += half; row.bubur_i += d.qty - half; }
        else { row.tim_d += half; row.tim_i += d.qty - half; }
      }
    } else if (d.produk_id === "p-oatmeal") row.oatmeal += d.qty;
    else if (d.produk_id === "p-puding") row.puding += d.qty;
    else if (d.produk_id === "p-abon") row.abon += d.qty;
    distGrid[d.outlet_id] = row;
  }

  return { distGrid, sales: (sales || []) as any[] };
}

// Tambahkan kontribusi gram bahan baku untuk satu record (aturan tertentu)
function addIngredient(oh: Record<string, number>, isTim: boolean, cups: number) {
  const ing = isTim ? ING.tim : ING.bubur;
  oh.beras += cups * ing.beras;
  oh.sayurHijau += cups * ing.sayurHijau;
  oh.sayurBuah += cups * ing.sayurBuah;
  oh.sayurProtein += cups * ing.sayurProtein;
}

// ===== Mode --force: hitung ulang SEMUA movement RUSAK:OH (persis saveStep app) =====
const SETTINGS_FULL = { ...SETTINGS, oatmealCup: 25.71, pudingCup: 13.0 };

function buildReturGrid(distGrid: Record<string, any>, sales: any[]) {
  const grid: Record<string, any> = {};
  for (const outletId of Object.keys(distGrid)) {
    const sent = distGrid[outletId];
    const row: any = { ...ZERO };
    for (const v of [...BUBUR_FIELDS, ...TIM_FIELDS]) {
      const baseId = v.startsWith("bubur") ? "p-bubur" : "p-nasitim";
      const rec = sales.find((p) => p.outlet_id === outletId && p.produk_id === baseId && p.variant === v && p.sisa_gram != null);
      if (rec) row[v] = Math.min(rec.sisa_gram, sent[v] * GPC[baseId]);
    }
    for (const v of ["oatmeal", "puding", "abon"]) {
      const baseId = v === "oatmeal" ? "p-oatmeal" : v === "puding" ? "p-puding" : "p-abon";
      const sold = sales.filter((p) => p.outlet_id === outletId && p.produk_id === baseId).reduce((s, p) => s + (p.qty || 0), 0);
      row[v] = Math.max(0, sent[v] - sold);
    }
    grid[outletId] = row;
  }
  return grid;
}

function computeRusak(distGrid: Record<string, any>, returGrid: Record<string, any>) {
  const ohRusak = { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
  const kemasanRusak = { puding: 0, oatmeal: 0 };
  for (const o of Object.keys(distGrid)) {
    const sent = distGrid[o];
    const retur = returGrid[o] || ZERO;
    const process = (fields: readonly string[], gpc: number, isTim: boolean) => {
      for (const v of fields) {
        const s = sent[v] || 0;
        if (s <= 0) continue;
        const cups = Math.min(newCups(retur[v] || 0, gpc), s);
        if (cups > 0) addIngredient(ohRusak, isTim, cups);
      }
    };
    process(BUBUR_FIELDS, 118, false);
    process(TIM_FIELDS, 108, true);
    if (sent.oatmeal > 0) { const ar = Math.min(retur.oatmeal || 0, sent.oatmeal); if (ar > 0) { ohRusak.oat += ar * SETTINGS_FULL.oatmealCup; kemasanRusak.oatmeal += ar; } }
    if (sent.puding > 0) { const ar = Math.min(retur.puding || 0, sent.puding); if (ar > 0) { ohRusak.puding += ar * SETTINGS_FULL.pudingCup; kemasanRusak.puding += ar; } }
  }
  return { ohRusak, kemasanRusak };
}

function buildRusakMovements(tanggal: string, ohRusak: any, kemasanRusak: any, konv: { puding: number; oat: number }) {
  const movs: { bahanId: string; tipe: string; qty: number; keterangan: string }[] = [];
  const add = (bahanId: string, qty: number, keterangan: string) => { if (qty > 0) movs.push({ bahanId, tipe: "OUT", qty, keterangan }); };
  if (ohRusak.beras > 1) add("b-brs01", Math.ceil(ohRusak.beras), `RUSAK:OH Beras (sisa Bubur/Tim) (${Math.ceil(ohRusak.beras)} gr) [${tanggal}]`);
  if (ohRusak.puding > 1) {
    const qtyPuding = Math.ceil(ohRusak.puding / konv.puding);
    add("b-pud01", qtyPuding, `RUSAK:OH Puding (sisa) (${qtyPuding} pcs) [${tanggal}]`);
  }
  if (ohRusak.oat > 1) {
    const qtyOat = Math.ceil(ohRusak.oat / konv.oat);
    add("b-oat01", qtyOat, `RUSAK:OH Oatmeal (sisa) (${qtyOat} pcs) [${tanggal}]`);
  }
  if (ohRusak.sayurHijau > 1) add("b-sh01", Math.ceil(ohRusak.sayurHijau), `RUSAK:OH Sayur Hijau (sisa) (${Math.ceil(ohRusak.sayurHijau)} gr) [${tanggal}]`);
  if (ohRusak.sayurBuah > 1) add("b-sb01", Math.ceil(ohRusak.sayurBuah), `RUSAK:OH Sayur Buah (sisa) (${Math.ceil(ohRusak.sayurBuah)} gr) [${tanggal}]`);
  if (ohRusak.sayurProtein > 1) add("b-sp01", Math.ceil(ohRusak.sayurProtein), `RUSAK:OH Sayur Protein (sisa) (${Math.ceil(ohRusak.sayurProtein)} gr) [${tanggal}]`);
  if (kemasanRusak.puding > 0) {
    add("b-cuppud01", kemasanRusak.puding, `RUSAK:OH Cup Puding (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]`);
    add("b-plas01", kemasanRusak.puding, `RUSAK:OH Plastik Seler (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]`);
  }
  if (kemasanRusak.oatmeal > 0) {
    add("b-cupoat1", kemasanRusak.oatmeal, `RUSAK:OH Cup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]`);
    add("b-ttoat01", kemasanRusak.oatmeal, `RUSAK:OH Tutup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]`);
  }
  return movs;
}

async function processDate(tanggal: string, konv: { puding: number; oat: number }) {
  console.log(`\n──── ${tanggal} ────`);
  const { distGrid, sales } = await fetchDateData(tanggal);

  // ===== 1. KOREKSI QTY PENJUALAN + akumulasi selisih cup per record =====
  let qtyChanges = 0;
  for (const p of sales) {
    const gpc = VARIANT_GPC[p.variant];
    if (!gpc) continue;
    const sisa = Number(p.sisa_gram) ?? 0;
    if (sisa <= 0) continue;
    const distVar = (distGrid[p.outlet_id] || ZERO)[p.variant] || 0;
    if (distVar <= 0) continue;
    const oldCl = Math.min(oldCups(sisa, gpc), distVar);
    const newCl = Math.min(newCups(sisa, gpc), distVar);
    const qtyBaru = Math.max(0, distVar - newCl);
    const qtyLama = Number(p.qty) || 0;
    const isTim = p.produk_id === "p-nasitim";
    if (oldCl !== newCl) {
      if (!OUTLET || p.outlet_id === OUTLET) {
        console.log(`  [CUP] ${p.outlet_id} ${p.produk_id} (${p.variant}) sisa=${sisa}g ÷ ${gpc} = ${(sisa / gpc).toFixed(3)} → lama ${oldCl} cup, baru ${newCl} cup${oldCl - newCl > 0 ? ` (${isTim ? "1 cup tim" : "1 cup bubur"} ekstra di aturan lama)` : ""}`);
      }
    }
    if (qtyLama !== qtyBaru && (!OUTLET || p.outlet_id === OUTLET)) {
      console.log(`  [QTY] ${p.outlet_id} ${p.produk_id} (${p.variant}) sisa=${sisa}g: qty ${qtyLama} → ${qtyBaru}`);
      qtyChanges++;
      if (APPLY) {
        await supabase.from("penjualan").update({ qty: qtyBaru, total: qtyBaru * (p.harga || 0) }).eq("id", p.id);
      }
    }
  }

  if (OUTLET) {
    const has = sales.some((p) => p.outlet_id === OUTLET);
    console.log(`  Penjualan outlet ${OUTLET}: ${has ? `${sales.filter((p) => p.outlet_id === OUTLET).length} record tersimpan` : "TIDAK ADA record tersimpan"}.`);
  }

  // ===== 2. KOREKSI MOVEMENT RUSAK:OH (beras/sayur saja) =====
  const { data: existingMov } = await supabase
    .from("stok_movement")
    .select("id, bahan_id, tipe, qty, keterangan")
    .eq("tanggal", tanggal)
    .eq("tipe", "OUT")
    .like("keterangan", "RUSAK:OH%");
  const existing = (existingMov || []) as any[];
  const histQty: Record<string, number> = {};
  for (const m of existing) if (BAHAN_ING[m.bahan_id]) histQty[m.bahan_id] = Number(m.qty) || 0;

  if (existing.length === 0) {
    console.log(`  RUSAK:OH: tidak ada movement (siklus ${tanggal} belum ditutup) → tidak perlu koreksi. Saat siklus ditutup, aturan baru otomatis terpakai.`);
    return qtyChanges;
  }

  // ===== Mode --force: tulis ulang SEMUA movement RUSAK:OH dari data sekarang =====
  if (FORCE) {
    const returGrid = buildReturGrid(distGrid, sales);
    const { ohRusak, kemasanRusak } = computeRusak(distGrid, returGrid);
    const newMovs = buildRusakMovements(tanggal, ohRusak, kemasanRusak, konv);
    const sig = (m: any) => `${m.bahanId || m.bahan_id}|${m.tipe}|${m.qty}`;
    const oldByBahan = new Map(existing.map((m) => [(m.bahan_id || m.bahanId), m]));
    let changed = 0;
    for (const nm of newMovs) {
      const om = oldByBahan.get(nm.bahanId);
      if (!om || om.qty !== nm.qty) {
        console.log(`  [FORCE] ${nm.bahanId}: ${om ? om.qty : "-"} → ${nm.qty} (${nm.keterangan})`);
        changed++;
      }
    }
    for (const om of existing) {
      if (!newMovs.some((n) => n.bahanId === (om.bahan_id || om.bahanId))) {
        console.log(`  [FORCE] ${om.bahan_id || om.bahanId}: ${om.qty} → 0 (hapus, tidak ada OH)`);
        changed++;
      }
    }
    if (changed === 0) {
      console.log(`  RUSAK:OH (--force): sudah sesuai data sekarang + aturan baru (${newMovs.length} movement).`);
      return qtyChanges;
    }
    if (APPLY) {
      for (const m of existing) await supabase.from("stok_movement").delete().eq("id", m.id);
      for (const nm of newMovs) {
        await supabase.from("stok_movement").insert({ id: uid(), tanggal, bahan_id: nm.bahanId, tipe: nm.tipe, qty: nm.qty, keterangan: nm.keterangan });
      }
      console.log(`  ✅ RUSAK:OH ${tanggal} ditulis ulang (${newMovs.length} movement).`);
    }
    return qtyChanges;
  }

  // Hitung ulang gram bahan baku OH dgn aturan lama & baru (clamp ke dist)
  const calcRaw = (rule: (g: number, gpc: number) => number) => {
    const oh = { beras: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
    for (const p of sales) {
      const gpc = VARIANT_GPC[p.variant];
      if (!gpc) continue;
      const sisa = Number(p.sisa_gram) ?? 0;
      if (sisa <= 0) continue;
      const distVar = (distGrid[p.outlet_id] || ZERO)[p.variant] || 0;
      if (distVar <= 0) continue;
      const cups = Math.min(rule(sisa, gpc), distVar);
      if (cups > 0) addIngredient(oh, p.produk_id === "p-nasitim", cups);
    }
    return oh;
  };
  const oldRaw = calcRaw(oldCups);
  const newRaw = calcRaw(newCups);

  // Cek konsistensi: movement historis harus = hitung ulang aturan lama
  const bahanIds = Object.keys(BAHAN_ING);
  const inconsistent = bahanIds.filter((b) => (histQty[b] || 0) !== Math.max(0, Math.ceil(oldRaw[BAHAN_ING[b]])));
  if (inconsistent.length > 0) {
    console.log(`  ⚠️ RUSAK:OH TIDAK konsisten dengan data penjualan sekarang (beras/SH/SB/SP historis ≠ hitung ulang aturan lama) — kemungkinan sisa diubah setelah siklus ditutup.`);
    for (const b of inconsistent) {
      console.log(`     ${BAHAN_ING[b].padEnd(11)} historis=${histQty[b] ?? "-"} vs aturanLama=${Math.ceil(oldRaw[BAHAN_ING[b]])}`);
    }
    console.log(`     → SKIP koreksi otomatis tanggal ini (perlu review manual).`);
    return qtyChanges;
  }

  // Konsisten → target = hitung ulang aturan BARU
  let rusakChanges = 0;
  for (const b of bahanIds) {
    const target = newRaw[BAHAN_ING[b]] > 1 ? Math.ceil(newRaw[BAHAN_ING[b]]) : 0;
    const old = histQty[b] || 0;
    if (target !== old) {
      const ingName = BAHAN_ING[b];
      console.log(`  [RUSAK] ${ingName.padEnd(11)} ${b}: ${old} → ${target} gr${target === 0 ? " (hapus movement)" : ""}`);
      rusakChanges++;
      if (APPLY) {
        const existingRow = existing.find((m) => m.bahan_id === b);
        if (target === 0) {
          if (existingRow) await supabase.from("stok_movement").delete().eq("id", existingRow.id);
        } else {
          const keterangan = `RUSAK:OH ${ingName === "beras" ? "Beras (sisa Bubur/Tim)" : ingName === "sayurHijau" ? "Sayur Hijau (sisa)" : ingName === "sayurBuah" ? "Sayur Buah (sisa)" : "Sayur Protein (sisa)"} (${target} gr) [${tanggal}]`;
          if (existingRow) {
            await supabase.from("stok_movement").update({ qty: target, keterangan }).eq("id", existingRow.id);
          } else {
            await supabase.from("stok_movement").insert({ id: uid(), tanggal, bahan_id: b, tipe: "OUT", qty: target, keterangan });
          }
        }
      }
    }
  }
  if (rusakChanges === 0) console.log(`  RUSAK:OH: sudah sesuai aturan baru (tidak ada perubahan).`);
  return qtyChanges;
}

async function main() {
  console.log(`=== KOREKSI RUSAK/OH (${DARI} s.d. ${SAMPAI}) ===`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}${FORCE ? " | --force (tulis ulang semua RUSAK:OH)" : ""}${OUTLET ? ` | outlet: ${OUTLET}` : ""}\n`);

  const { data: bahan } = await supabase.from("bahan_baku").select("id, konversi_gram");
  const konv = {
    puding: (bahan || []).find((b: any) => b.id === "b-pud01")?.konversi_gram || 130,
    oat: (bahan || []).find((b: any) => b.id === "b-oat01")?.konversi_gram || 180,
  };

  let totalQty = 0;
  for (let d = parseDate(DARI); d <= parseDate(SAMPAI); d = addDays(d, 1)) {
    totalQty += await processDate(fmtDate(d), konv);
  }
  console.log(`\n=== Selesai. Perubahan qty penjualan: ${totalQty} record ${APPLY ? "diterapkan" : "(dry-run, pakai --apply untuk menulis)"} ===`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
