/**
 * AUDIT ALUR SIKLUS (READ-ONLY) — verifikasi semua data mengikuti aturan code:
 *
 *   1. BAHAN BAKU  → hanya dipotong di Langkah 2 (label "Pemakaian Produksi"),
 *                    dihitung dari RENCANA pra-produksi (qty_rencana/catatan_rencana),
 *                    TIDAK dari distribusi aktual. Kemasan tidak boleh ada di sini.
 *   2. KEMASAN     → hanya dipotong di Langkah 3 (label "Pemakaian Kemasan"),
 *                    qty = 1:1 dgn TOTAL DISTRIBUSI AKTUAL (puding/oatmeal).
 *   3. PENJUALAN   → qty terjual konsisten dgn distribusi & sisa OH
 *                    (terjual = dist − sisa, aturan pembulatan 118/108).
 *   4. RUSAK:OH    → movement OH (sisa tidak terjual) konsisten dgn data
 *                    penjualan sekarang (aturan baru, sisa ≤ 50g → 0 cup).
 *   5. JURNAL      → OUT-SALES (K Pendapatan 410000) = omzet Σ qty×harga;
 *                    OUT-OH (D 543000) & OUT-HPP (D 541000) = hitung ulang
 *                    dari helper asli (hitungOHValue / nilaiPemotonganTanggal).
 *
 * Helper yang dipakai DI-IMPORT dari src/lib/produksi-utils.ts (logika asli
 * aplikasi), bukan replika — jadi hasil audit = apa yang akan dihitung code.
 *
 * Cara pakai:
 *   npx tsx scripts/audit-alur-siklus.ts                 (semua tanggal tertutup)
 *   npx tsx scripts/audit-alur-siklus.ts --dari=2026-08-08 --sampai=2026-08-15
 *   npx tsx scripts/audit-alur-siklus.ts --tanggal=2026-08-08
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import {
  BUBUR_BASE, buburCalc, parseSplit, parseVariants, hitungMaterialReqs,
  sisaGramToCups, hitungTerjualOh, BUBUR_GRAM_PEMBULATAN, TIM_GRAM_PEMBULATAN,
  hitungOHValue, nilaiPemotonganTanggal, hitungHPPValue, KEMASAN_BAHAN
} from "../src/lib/produksi-utils";

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || "").replace(/^["']|["']$/g, "");
});
const supabase = createClient(
  env["VITE_SUPABASE_URL"],
  env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]
);

// ===== Konstanta — SAMA dgn aplikasi (DEFAULT_SETTINGS di store.ts) =====
const SETTINGS = {
  berasTim: 20.00, dagingTim: 0.80, sayurHijauTim: 1.60,
  sayurBuahTim: 1.00, sayurProteinTim: 0.30,
  pudingCup: 13.00, oatmealCup: 25.71, abonCup: 10.00
};
// GRAM_EXCLUDED_BAHAN di store.ts (puding & oat dihitung per pcs, bukan gram)
const GRAM_EXCLUDED = new Set(["b-pud01", "b-oat01"]);

const KEMASAN_PRODUK: Record<string, "puding" | "oatmeal"> = {
  "b-cuppud01": "puding", "b-plas01": "puding",
  "b-cupoat1": "oatmeal", "b-ttoat01": "oatmeal"
};
const GPC: Record<string, number> = { "p-bubur": BUBUR_GRAM_PEMBULATAN, "p-nasitim": TIM_GRAM_PEMBULATAN };
const VARIANT_GPC: Record<string, number> = { bubur_d: 118, bubur_i: 118, tim_d: 108, tim_i: 108 };

const parseDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (dt: Date, n: number) => { const d = new Date(dt); d.setDate(d.getDate() + n); return d; };

async function main() {
  const args = process.argv.slice(2);
  const dariArg = args.find((a) => a.startsWith("--dari="))?.split("=")[1];
  const sampaiArg = args.find((a) => a.startsWith("--sampai="))?.split("=")[1];
  const tglArg = args.find((a) => a.startsWith("--tanggal="))?.split("=")[1];
  const DARI = tglArg || dariArg || "2026-08-01";
  const SAMPAI = tglArg || sampaiArg || "2026-08-31";

  console.log("============================================");
  console.log("  AUDIT ALUR SIKLUS (READ-ONLY)");
  console.log(`  Rentang: ${DARI} s/d ${SAMPAI}`);
  console.log("============================================\n");

  // ===== Muat data =====
  const { data: movs } = await supabase.from("stok_movement").select("id, tanggal, bahan_id, tipe, qty, keterangan").order("tanggal");
  const { data: reqs } = await supabase.from("permohonan_stok").select("id, tanggal_kirim, outlet_id, produk_id, qty, catatan, qty_rencana, catatan_rencana, status");
  const { data: sales } = await supabase.from("penjualan").select("id, tanggal, outlet_id, produk_id, variant, qty, harga, total, sisa_gram");
  const { data: bahan } = await supabase.from("bahan_baku").select("id, kode, nama, satuan, harga_beli, konversi_gram");
  const { data: jurnal } = await supabase.from("jurnal").select("id, tanggal, ref, kode_akun, akun, tipe, jumlah, keterangan");
  const { data: prods } = await supabase.from("produksi").select("tanggal, produk_id, qty_realisasi");

  const bahanAll = (bahan || []) as any[];
  const byName = new Map(bahanAll.map((b: any) => [String(b.nama || "").toLowerCase(), b.id]));
  const konvPuding = bahanAll.find((b: any) => b.id === "b-pud01")?.konversi_gram || 130;
  const konvOat = bahanAll.find((b: any) => b.id === "b-oat01")?.konversi_gram || 180;
  const toId = (idOrName: string | undefined) => {
    if (!idOrName) return undefined;
    const s = String(idOrName).trim().toLowerCase();
    if (s.startsWith("b-")) return s;
    return byName.get(s);
  };
  // parse [I:id1,id2] (ID langsung) atau [V:nama1,nama2] (nama)
  const parseVariantRefs = (catatan?: string | null) => {
    const mI = catatan?.match(/\[I:([^,\]]+),([^,\]]+)\]/);
    const mV = catatan?.match(/\[V:([^,\]]+),([^,\]]+)\]/);
    if (mI) return { v1: toId(mI[1]), v2: toId(mI[2]) };
    if (mV) return { v1: toId(mV[1]), v2: toId(mV[2]) };
    return { v1: undefined, v2: undefined };
  };

  // Tanggal tertutup = punya jurnal OUT-SALES
  const closedDates = new Set(
    (jurnal || []).filter((j: any) => j.ref === "OUT-SALES").map((j: any) => j.tanggal)
  );
  const inRange = (t: string) => t >= DARI && t <= SAMPAI;
  const dates = [...closedDates].filter(inRange).sort();

  if (dates.length === 0) {
    console.log("Tidak ada tanggal tertutup (OUT-SALES) dalam rentang.");
    return;
  }
  console.log(`Tanggal tertutup dianalisis: ${dates.join(", ")}\n`);

  let masalah = 0;
  const flag = (ok: boolean, pesan: string) => {
    console.log(`  ${ok ? "✅" : "❌"} ${pesan}`);
    if (!ok) masalah++;
  };

  for (const tgl of dates) {
    console.log(`\n──── ${tgl} ────`);

    // ================== 1. BAHAN BAKU (Langkah 2) vs RENCANA ==================
    // Rencana grid dari qty_rencana/catatan_rencana (fallback qty/catatan utk data lama)
    const dayReqs = (reqs || []).filter((r: any) => r.tanggal_kirim === tgl);

    // Movement Pemakaian Produksi utk tanggal ini — label bisa "tgl" (1 hari)
    // atau "tgl + tgl2" (rencana 2 hari dipotong sekaligus di hari pertama).
    const produksiMovs = (movs || []).filter((m: any) => {
      if (m.tipe !== "OUT") return false;
      const mm = (m.keterangan || "").match(/^Pemakaian Produksi \[(.+)\]$/);
      if (!mm) return false;
      const label = mm[1];
      return label === tgl || label.startsWith(tgl + " + ");
    });
    const storedBahan: Record<string, number> = {};
    for (const m of produksiMovs) storedBahan[m.bahan_id] = (storedBahan[m.bahan_id] || 0) + m.qty;

    // Tanggal yang masuk label potongan (tgl + semua tanggal di label 2-hari)
    const labelDates = new Set<string>([tgl]);
    for (const m of produksiMovs) {
      const mm = (m.keterangan || "").match(/^Pemakaian Produksi \[(.+)\]$/);
      if (!mm) continue;
      mm[1].split(/\s*\+\s*/).forEach((d) => labelDates.add(d.trim()));
    }

    // Rencana gabungan (semua tanggal dalam label) + varian dari record pertama
    const plan = { buburD: 0, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const varRefs = { bubur1: undefined as string | undefined, bubur2: undefined as string | undefined, tim1: undefined as string | undefined, tim2: undefined as string | undefined };
    const labelReqRows = (reqs || []).filter((r: any) => labelDates.has(r.tanggal_kirim));
    for (const r of dayReqsFor(labelReqRows)) {
      const cat = r.catatanRencana || r.catatan || "";
      const hasSplit = /D:\d+,I:\d+/.test(cat);
      const split = parseSplit(cat);
      const q = r.qtyRencana != null ? r.qtyRencana : r.qty;
      if (r.produkId === "p-bubur") {
        plan.buburD += hasSplit ? split.d : q; plan.buburI += hasSplit ? split.i : 0;
        if (!varRefs.bubur1) varRefs.bubur1 = parseVariantRefs(cat).v1;
        if (!varRefs.bubur2) varRefs.bubur2 = parseVariantRefs(cat).v2;
      } else if (r.produkId === "p-nasitim") {
        plan.timD += hasSplit ? split.d : q; plan.timI += hasSplit ? split.i : 0;
        if (!varRefs.tim1) varRefs.tim1 = parseVariantRefs(cat).v1;
        if (!varRefs.tim2) varRefs.tim2 = parseVariantRefs(cat).v2;
      } else if (r.produkId === "p-oatmeal") plan.oatmeal += q;
      else if (r.produkId === "p-puding") plan.puding += q;
      else if (r.produkId === "p-abon") plan.abon += q;
    }

    const expectedBahan = hitungMaterialReqs(plan, SETTINGS, {
      bubur1: varRefs.bubur1, bubur2: varRefs.bubur2, tim1: varRefs.tim1, tim2: varRefs.tim2
    }, bahanAll);
    {
      const expected = new Map(expectedBahan.map((r) => [r.bahanId, r.qty]));
      const ids = new Set([...expected.keys(), ...Object.keys(storedBahan)]);
      let ok = true;
      for (const id of ids) {
        const exp = expected.get(id) || 0;
        const got = storedBahan[id] || 0;
        if (exp !== got) {
          ok = false;
          flag(false, `Bahan ${id}: potong=${got} ≠ rencana=${exp}`);
        }
      }
      const labelDesc = [...labelDates].join(" + ");
      if (ok) console.log(`  ✅ Bahan baku = rencana (${expectedBahan.length} bahan, label "${labelDesc}")`);
    }

    // ================== 2. KEMASAN (Langkah 3) vs DISTRIBUSI AKTUAL ==================
    const kemasanMovs = (movs || []).filter((m: any) => m.tipe === "OUT" && m.keterangan === `Pemakaian Kemasan [${tgl}]`);
    const distAktual = { puding: 0, oatmeal: 0 };
    for (const r of dayReqs) {
      if (r.produk_id === "p-puding") distAktual.puding += r.qty || 0;
      else if (r.produk_id === "p-oatmeal") distAktual.oatmeal += r.qty || 0;
    }
    const storedKemasan: Record<string, number> = {};
    for (const m of kemasanMovs) storedKemasan[m.bahan_id] = (storedKemasan[m.bahan_id] || 0) + m.qty;
    {
      let ok = true;
      for (const k of KEMASAN_BAHAN) {
        const exp = distAktual[k.produk];
        const got = storedKemasan[k.bahanId] || 0;
        if (exp !== got) {
          ok = false;
          flag(false, `Kemasan ${k.bahanId}: potong=${got} ≠ distribusi aktual ${k.produk}=${exp}`);
        }
      }
      if (ok) console.log(`  ✅ Kemasan 1:1 dgn distribusi aktual (puding ${distAktual.puding}, oat ${distAktual.oatmeal})`);
    }

    // ================== 3. PENJUALAN & 4. RUSAK:OH vs data penjualan ==================
    // distGrid per outlet dari qty/catatan AKTUAL (permohonan_stok setelah Langkah 3)
    // Hanya record produksi (p-*) — b-* (perlengkapan) tidak masuk distribusi.
    const distGrid: Record<string, any> = {};
    for (const r of dayReqs) {
      if (!String(r.produk_id).startsWith("p-")) continue;
      const row = distGrid[r.outlet_id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      const cat = r.catatan || "";
      const hasSplit = /D:\d+,I:\d+/.test(cat);
      const split = parseSplit(cat);
      if (r.produk_id === "p-bubur") { row.bubur_d += hasSplit ? split.d : r.qty; row.bubur_i += hasSplit ? split.i : 0; }
      else if (r.produk_id === "p-nasitim") { row.tim_d += hasSplit ? split.d : r.qty; row.tim_i += hasSplit ? split.i : 0; }
      else if (r.produk_id === "p-oatmeal") row.oatmeal += r.qty || 0;
      else if (r.produk_id === "p-puding") row.puding += r.qty || 0;
      else if (r.produk_id === "p-abon") row.abon += r.qty || 0;
      distGrid[r.outlet_id] = row;
    }
    const daySales = (sales || []).filter((p: any) => p.tanggal === tgl);

    // 3a. qty penjualan vs dist − sisa (gram-based: bubur/tim)
    let penjualanOK = true;
    for (const p of daySales) {
      const gpc = VARIANT_GPC[p.variant];
      if (!gpc) continue;
      const distVar = (distGrid[p.outlet_id] || {})[p.variant] || 0;
      const sisa = Number(p.sisa_gram) ?? 0;
      const sisaCups = Math.min(sisaGramToCups(sisa, gpc), distVar);
      const expectedQty = Math.max(0, distVar - sisaCups);
      if (expectedQty !== (p.qty || 0)) {
        penjualanOK = false;
        flag(false, `Penjualan ${p.outlet_id} ${p.produk_id}(${p.variant}): qty=${p.qty} ≠ dist(${distVar}) − sisa(${sisa}→${sisaCups} cup)=${expectedQty}`);
      }
    }
    if (penjualanOK) console.log(`  ✅ Penjualan bubur/tim konsisten dgn dist − sisa (${daySales.length} record)`);
    // Non-gram (oatmeal/puding/abon): retur = dist − qty; cek tidak negatif
    for (const p of daySales) {
      const gpc = VARIANT_GPC[p.variant];
      if (gpc) continue;
      const prod = p.produk_id === "p-oatmeal" ? "oatmeal" : p.produk_id === "p-puding" ? "puding" : "abon";
      const distProd = (distGrid[p.outlet_id] || {})[prod] || 0;
      if (p.qty > distProd) {
        penjualanOK = false;
        flag(false, `Penjualan ${p.outlet_id} ${p.produk_id}: qty=${p.qty} > dist=${distProd} (tidak mungkin)`);
      }
    }
    // 4. RUSAK:OH — hitung ulang dari penjualan (aturan baru, identik koreksi-rusak-oh --force)
    const ohRusak = { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
    const kemasanRusak = { puding: 0, oatmeal: 0 };
    const ING_BUBUR = {
      beras: buburCalc(1, BUBUR_BASE.beras), sayurHijau: buburCalc(1, BUBUR_BASE.sayurHijau),
      sayurBuah: buburCalc(1, BUBUR_BASE.sayurBuah), sayurProtein: buburCalc(1, BUBUR_BASE.sayurProtein)
    };
    const ING_TIM = { beras: SETTINGS.berasTim, sayurHijau: SETTINGS.sayurHijauTim, sayurBuah: SETTINGS.sayurBuahTim, sayurProtein: SETTINGS.sayurProteinTim };
    const addIng = (oh: any, isTim: boolean, cups: number) => {
      const ing = isTim ? ING_TIM : ING_BUBUR;
      oh.beras += cups * ing.beras; oh.sayurHijau += cups * ing.sayurHijau;
      oh.sayurBuah += cups * ing.sayurBuah; oh.sayurProtein += cups * ing.sayurProtein;
    };
    for (const p of daySales) {
      const gpc = VARIANT_GPC[p.variant];
      if (!gpc) continue;
      const sisa = Number(p.sisa_gram) ?? 0;
      if (sisa <= 0) continue;
      const distVar = (distGrid[p.outlet_id] || {})[p.variant] || 0;
      if (distVar <= 0) continue;
      const cups = Math.min(sisaGramToCups(sisa, gpc), distVar);
      if (cups > 0) addIng(ohRusak, p.produk_id === "p-nasitim", cups);
    }
    // retur non-gram: per OUTLET dari distGrid (outlet tanpa record penjualan
    // dianggap retur penuh) — identik dgn resolveFreshReturGrid / saveStep4
    const soldPerOutlet: Record<string, Record<string, number>> = {};
    for (const p of daySales) {
      if (VARIANT_GPC[p.variant]) continue;
      const prod = p.produk_id === "p-oatmeal" ? "oatmeal" : p.produk_id === "p-puding" ? "puding" : "abon";
      (soldPerOutlet[p.outlet_id] = soldPerOutlet[p.outlet_id] || {})[prod] = (soldPerOutlet[p.outlet_id][prod] || 0) + (p.qty || 0);
    }
    for (const oid of Object.keys(distGrid)) {
      const sent = distGrid[oid];
      const sold = soldPerOutlet[oid] || {};
      for (const prod of ["oatmeal", "puding"] as const) {
        const retur = Math.max(0, (sent[prod] || 0) - (sold[prod] || 0));
        if (retur <= 0) continue;
        if (prod === "oatmeal") { ohRusak.oat += retur * SETTINGS.oatmealCup; kemasanRusak.oatmeal += retur; }
        else { ohRusak.puding += retur * SETTINGS.pudingCup; kemasanRusak.puding += retur; }
      }
    }
    // Abon retur (OH) — per outlet dari distGrid, bandingkan dgn 1 movement IN
    {
      const abonReturPcs = Object.keys(distGrid).reduce((s, oid) => {
        return s + Math.max(0, (distGrid[oid].abon || 0) - (soldPerOutlet[oid]?.abon || 0));
      }, 0);
      const abonMov = (movs || []).find((m: any) => m.tanggal === tgl && m.tipe === "IN" && m.bahan_id === "b-ab01" && m.keterangan?.startsWith("Retur Bahan Baku"));
      const storedAbon = abonMov?.qty || 0;
      const expectedAbon = Math.ceil(abonReturPcs * SETTINGS.abonCup);
      if (storedAbon !== expectedAbon) {
        flag(false, `Retur abon (IN): stok=${storedAbon}g ≠ hitung-ulang=${expectedAbon}g (${abonReturPcs} pcs)`);
      }
    }

    const expectedRusak: Record<string, number> = {};
    const addR = (bahanId: string, qty: number) => { if (qty > 0) expectedRusak[bahanId] = (expectedRusak[bahanId] || 0) + qty; };
    if (ohRusak.beras > 1) addR("b-brs01", Math.ceil(ohRusak.beras));
    if (ohRusak.puding > 1) addR("b-pud01", Math.ceil(ohRusak.puding / konvPuding));
    if (ohRusak.oat > 1) addR("b-oat01", Math.ceil(ohRusak.oat / konvOat));
    if (ohRusak.sayurHijau > 1) addR("b-sh01", Math.ceil(ohRusak.sayurHijau));
    if (ohRusak.sayurBuah > 1) addR("b-sb01", Math.ceil(ohRusak.sayurBuah));
    if (ohRusak.sayurProtein > 1) addR("b-sp01", Math.ceil(ohRusak.sayurProtein));
    if (kemasanRusak.puding > 0) { addR("b-cuppud01", kemasanRusak.puding); addR("b-plas01", kemasanRusak.puding); }
    if (kemasanRusak.oatmeal > 0) { addR("b-cupoat1", kemasanRusak.oatmeal); addR("b-ttoat01", kemasanRusak.oatmeal); }

    const storedRusak: Record<string, number> = {};
    for (const m of (movs || []).filter((m: any) => m.tanggal === tgl && m.tipe === "OUT" && m.keterangan?.startsWith("RUSAK:OH"))) {
      storedRusak[m.bahan_id] = (storedRusak[m.bahan_id] || 0) + m.qty;
    }
    {
      const ids = new Set([...Object.keys(expectedRusak), ...Object.keys(storedRusak)]);
      let ok = true;
      for (const id of ids) {
        const exp = expectedRusak[id] || 0;
        const got = storedRusak[id] || 0;
        if (exp !== got) {
          ok = false;
          flag(false, `RUSAK:OH ${id}: tersimpan=${got} ≠ hitung-ulang=${exp}`);
        }
      }
      if (ok) console.log(`  ✅ RUSAK:OH konsisten dgn data penjualan (${Object.keys(expectedRusak).length} bahan)`);
    }

    // ================== 5. JURNAL (keuangan otomatis) ==================
    const omzet = daySales.reduce((s, p) => s + (p.qty || 0) * (p.harga || 0), 0);
    const jTgl = (jurnal || []).filter((j: any) => j.tanggal === tgl);
    const outSalesK = jTgl.filter((j: any) => j.ref === "OUT-SALES" && j.tipe === "Kredit").reduce((s, j) => s + (j.jumlah || 0), 0);
    const outSalesDebit = jTgl.filter((j: any) => j.ref === "OUT-SALES" && j.tipe === "Debit");
    const kasDebit = outSalesDebit.filter((j: any) => j.kode_akun === "110000").reduce((s, j) => s + j.jumlah, 0);
    const bankDebit = outSalesDebit.filter((j: any) => j.kode_akun === "120000").reduce((s, j) => s + j.jumlah, 0);
    const piutangDebit = outSalesDebit.filter((j: any) => j.kode_akun === "131000").reduce((s, j) => s + j.jumlah, 0);

    flag(Math.abs(outSalesK - omzet) < 1, `Jurnal OUT-SALES: Pendapatan ${outSalesK.toLocaleString("id-ID")} = omzet ${omzet.toLocaleString("id-ID")}`);
    if (piutangDebit > 0) {
      console.log(`  ⚠️  Format jurnal LAMA (Piutang usaha ${piutangDebit.toLocaleString("id-ID")}) — ditutup sebelum refactor Kas/Bank; masih konsisten siklus, bukan kesalahan baru.`);
    } else {
      flag(Math.abs((kasDebit + bankDebit) - omzet) < 1, `Jurnal OUT-SALES: Kas ${kasDebit.toLocaleString("id-ID")} + Bank ${bankDebit.toLocaleString("id-ID")} = omzet`);
    }

    // OUT-OH & OUT-HPP — hitung ulang dgn helper asli
    const ohValue = hitungOHValue(ohRusak, kemasanRusak, bahanAll, GRAM_EXCLUDED);
    const pemotonganValue = nilaiPemotonganTanggal((movs || []) as any, tgl, bahanAll, GRAM_EXCLUDED);
    const hppValue = hitungHPPValue(pemotonganValue, ohValue);

    const outOh = jTgl.filter((j: any) => j.ref === "OUT-OH" && j.tipe === "Debit").reduce((s, j) => s + (j.jumlah || 0), 0);
    const outHpp = jTgl.filter((j: any) => j.ref === "OUT-HPP" && j.tipe === "Debit").reduce((s, j) => s + (j.jumlah || 0), 0);
    if (outOh === 0 && outHpp === 0) {
      if (ohValue > 0 || hppValue > 0) {
        console.log(`  ⚠️  Tidak ada jurnal OUT-OH/OUT-HPP (ditutup sebelum refactor keuangan) — hitung-ulang: OH=${ohValue.toLocaleString("id-ID")}, HPP=${hppValue.toLocaleString("id-ID")}`);
      } else {
        console.log("  ➖ Tidak ada OH/HPP (omzet 0 atau siklus tanpa sisa)");
      }
    } else {
      flag(outOh === ohValue, `Jurnal OUT-OH: tersimpan ${outOh.toLocaleString("id-ID")} = hitung-ulang ${ohValue.toLocaleString("id-ID")}`);
      flag(outHpp === hppValue, `Jurnal OUT-HPP: tersimpan ${outHpp.toLocaleString("id-ID")} = hitung-ulang ${hppValue.toLocaleString("id-ID")}`);
    }
  }

  console.log("\n============================================");
  if (masalah === 0) console.log("  ✅ SEMUA data konsisten dgn aturan code.");
  else console.log(`  ❌ ${masalah} ketidaksesuaian ditemukan (lihat detail).`);
  console.log(`  Tanggal tertutup dianalisis: ${dates.length}`);
  console.log("============================================\n");
  process.exit(masalah === 0 ? 0 : 2);
}

// helper — map record permohonan_stok DB → field aplikasi (qtyRencana/catatanRencana)
function dayReqsFor(rows: any[]) {
  return rows.map((r: any) => ({
    produkId: r.produk_id, outletId: r.outlet_id,
    qty: r.qty, catatan: r.catatan,
    qtyRencana: r.qty_rencana != null ? r.qty_rencana : r.qty,
    catatanRencana: r.catatan_rencana || r.catatan || ""
  }));
}

main().catch((err) => { console.error("Script failed:", err); process.exit(1); });
