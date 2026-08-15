/**
 * REBUILD PEMOTONGAN STOK PRODUKSI — Agustus 1-7 (dan rentang bebas)
 *
 * Menyelaraskan stok_movement dengan aturan kode sekarang (Produksi.tsx):
 *   - Langkah 2 → potong BAHAN BAKU dari RENCANA:
 *       keterangan "Pemakaian Produksi [tanggal]" (beras, sayur, daging varian,
 *       puding, oat, abon — TANPA kemasan)
 *   - Langkah 3 → potong KEMASAN dari HASIL AKTUAL:
 *       keterangan "Pemakaian Kemasan [tanggal]" (cup & tutup Puding/Oatmeal 1:1)
 *
 * Yang dikerjakan per tanggal:
 *   1. Hapus movement "Pemakaian Produksi [D]" LAMA (termasuk entri kemasan
 *      format lama yang tercampur di situ) — dicocokkan via LABEL (bukan tanggal
 *      movement), sehingga entri nyasar ber-label [D] dengan tanggal lain ikut hilang.
 *   2. Hapus movement "Pemakaian Kemasan [D]" LAMA (semua tanggal movement).
 *   3. Buat ulang potongan bahan dari permohonan_stok (rencana) + varian dari catatan.
 *   4. Buat ulang potongan kemasan dari realisasi produksi.
 *
 * Opsi --bahan-only: HANYA rebuild pemotongan BAHAN BAKU (Pemakaian Produksi).
 * Kemasan (Pemakaian Kemasan) TIDAK disentuh — dipakai saat kemasan sudah benar
 * 1:1 dgn distribusi aktual (mis. 08-08 sudah dikoreksi ke 50/13) dan hanya
 * bahan baku yang perlu disesuaikan ke rencana.
 *
 * Movement lain (IN supplier, RUSAK:OH, Retur Bahan, OH abon) TIDAK disentuh.
 *
 * Cara pakai:
 *   npx tsx scripts/rebuild-produksi-stok-aug.ts                                  # DRY-RUN 08-01..08-07
 *   npx tsx scripts/rebuild-produksi-stok-aug.ts --dari=2026-08-01 --sampai=2026-08-07 --apply
 * Opsi: --dari=YYYY-MM-DD --sampai=YYYY-MM-DD --apply | --bahan-only
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
const FILL_REALISASI = args.includes("--fill-realisasi");
const BAHAN_ONLY = args.includes("--bahan-only");
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const DARI = dariArg ? dariArg.split("=")[1] : "2026-08-01";
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : "2026-08-07";

// Iterasi tanggal TANPA pergeseran zona waktu (Y-M-D murni)
const parseDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

// ===== Konstanta — SAMA dengan Produksi.tsx =====
const BUBUR_BASE = { beras: 100, daging: 5, air: 700, sayurHijau: 8, sayurBuah: 5, sayurProtein: 1.5 };
const buburCalc = (cups: number, base: number) => (cups * base) / 6;
const SETTINGS = { berasTim: 20, dagingTim: 0.8, sayurHijauTim: 1.6, sayurBuahTim: 1.0, sayurProteinTim: 0.3, oatmealCup: 25.71, pudingCup: 13.0, abonCup: 10.0 };
const KEMASAN_BAHAN = [
  { bahanId: "b-cuppud01", produk: "puding" },
  { bahanId: "b-plas01", produk: "puding" },
  { bahanId: "b-cupoat1", produk: "oatmeal" },
  { bahanId: "b-ttoat01", produk: "oatmeal" }
];
const KEMASAN_IDS = new Set(KEMASAN_BAHAN.map((k) => k.bahanId));

// id di-generate client-side (sama dengan aplikasi) — kolom id TIDAK punya default di DB
const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

const parseSplit = (catatan?: string | null) => {
  const m = catatan?.match(/D:(\d+),I:(\d+)/);
  return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 };
};
const parseVariantIds = (catatan?: string | null) => {
  const m = catatan?.match(/\[I:([^,\]]+),([^,\]]+)\]/);
  return m ? { v1: m[1], v2: m[2] } : { v1: "", v2: "" };
};
const parseVariants = (catatan?: string | null) => {
  const m = catatan?.match(/\[V:([^,\]]+),([^,\]]+)\]/);
  return m ? { v1: m[1], v2: m[2] } : { v1: "", v2: "" };
};

// Hitung kebutuhan bahan dari rencana (identik materialReqs di Produksi.tsx)
function computeBahanReqs(plan: any, variantIds: { bubur1?: string; bubur2?: string; tim1?: string; tim2?: string }, konv: { puding: number; oat: number }) {
  const reqs: { bahanId: string; qty: number; rawQtyGrams?: number }[] = [];
  const totalBubur = plan.buburD + plan.buburI;
  const totalTim = plan.timD + plan.timI;

  const berasGr = Math.ceil(buburCalc(totalBubur, BUBUR_BASE.beras) + totalTim * SETTINGS.berasTim);
  if (berasGr > 0) reqs.push({ bahanId: "b-brs01", qty: berasGr });
  const shGr = Math.ceil(buburCalc(totalBubur, BUBUR_BASE.sayurHijau) + totalTim * SETTINGS.sayurHijauTim);
  if (shGr > 0) reqs.push({ bahanId: "b-sh01", qty: shGr });
  const sbGr = Math.ceil(buburCalc(totalBubur, BUBUR_BASE.sayurBuah) + totalTim * SETTINGS.sayurBuahTim);
  if (sbGr > 0) reqs.push({ bahanId: "b-sb01", qty: sbGr });
  const spGr = Math.ceil(buburCalc(totalBubur, BUBUR_BASE.sayurProtein) + totalTim * SETTINGS.sayurProteinTim);
  if (spGr > 0) reqs.push({ bahanId: "b-sp01", qty: spGr });

  // Identik dgn aplikasi: akumulasi desimal, bulatkan TOTAL sekali (kolom integer)
  const addVariant = (variantId: string | undefined, grams: number) => {
    if (!variantId || grams <= 0) return;
    const existing = reqs.find((r) => r.bahanId === variantId);
    if (existing) {
      existing.rawQtyGrams = (existing.rawQtyGrams || 0) + grams;
      existing.qty = Math.round(existing.rawQtyGrams);
    } else {
      reqs.push({ bahanId: variantId, qty: Math.round(grams), rawQtyGrams: grams });
    }
  };
  if (plan.buburD > 0) addVariant(variantIds.bubur1, buburCalc(plan.buburD, BUBUR_BASE.daging));
  if (plan.buburI > 0) addVariant(variantIds.bubur2, buburCalc(plan.buburI, BUBUR_BASE.daging));
  if (plan.timD > 0) addVariant(variantIds.tim1, plan.timD * SETTINGS.dagingTim);
  if (plan.timI > 0) addVariant(variantIds.tim2, plan.timI * SETTINGS.dagingTim);

  const pudingPcs = Math.ceil(Math.ceil(plan.puding * SETTINGS.pudingCup) / konv.puding);
  if (pudingPcs > 0) reqs.push({ bahanId: "b-pud01", qty: pudingPcs });
  const oatPcs = Math.ceil(Math.ceil(plan.oatmeal * SETTINGS.oatmealCup) / konv.oat);
  if (oatPcs > 0) reqs.push({ bahanId: "b-oat01", qty: oatPcs });
  if (plan.abon > 0) reqs.push({ bahanId: "b-ab01", qty: Math.ceil(plan.abon * SETTINGS.abonCup) });

  return reqs;
}

// Kebutuhan kemasan dari realisasi (identik packagingReqs di Produksi.tsx)
function computeKemasanReqs(realisasi: { puding: number; oatmeal: number }) {
  return KEMASAN_BAHAN.map((k) => ({ bahanId: k.bahanId, qty: Math.max(0, realisasi[k.produk] || 0) })).filter((k) => k.qty > 0);
}

async function main() {
  console.log(`=== REBUILD PEMOTONGAN STOK PRODUKSI (${DARI} s.d. ${SAMPAI}) ===`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  const { data: bahan } = await supabase.from("bahan_baku").select("id, nama, konversi_gram");
  const byName = new Map((bahan || []).map((b: any) => [b.nama.toLowerCase(), b.id]));
  const konvPuding = (bahan || []).find((b: any) => b.id === "b-pud01")?.konversi_gram || 130;
  const konvOat = (bahan || []).find((b: any) => b.id === "b-oat01")?.konversi_gram || 180;
  // Bisa berupa ID langsung ([I:b-ay01,...]) atau NAMA ([V:AYAM,...])
  const nameToId = (name: string) => byName.get(String(name || "").trim().toLowerCase());
  const toId = (idOrName: string | undefined) => {
    if (!idOrName) return undefined;
    const s = String(idOrName).trim().toLowerCase();
    if (s.startsWith("b-")) return s; // sudah berupa ID bahan
    return nameToId(s);
  };

  const dates: string[] = [];
  let d = parseDate(DARI);
  const end = parseDate(SAMPAI);
  while (d <= end) {
    dates.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }

  let totalDel = 0, totalIns = 0;
  for (const tgl of dates) {
    // 1. Rencana dari permohonan_stok — pakai qty_rencana/catatan_rencana (rencana
    //    Langkah 1) bila ada; fallback ke qty/catatan untuk data lama. qty/catatan
    //    kini menyimpan DISTRIBUSI AKTUAL (Langkah 3) yang tidak boleh dipakai
    //    untuk menghitung pemotongan bahan baku.
    const { data: reqs } = await supabase
      .from("permohonan_stok").select("produk_id, qty, catatan, qty_rencana, catatan_rencana")
      .eq("tanggal_kirim", tgl);
    const plan = { buburD: 0, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const varNames = { bubur1: "", bubur2: "", tim1: "", tim2: "" };
    (reqs || []).forEach((r: any) => {
      const qtyRencana = r.qty_rencana != null ? r.qty_rencana : r.qty;
      const catatanRencana = r.catatan_rencana || r.catatan || "";
      const split = parseSplit(catatanRencana);
      // Split [D:X,I:Y] (termasuk D=0/I=0) dihormati; fallback ke qty_rencana
      // hanya untuk data lama tanpa format split.
      const hasSplit = /D:\d+,I:\d+/.test(catatanRencana);
      if (r.produk_id === "p-bubur") {
        plan.buburD += hasSplit ? split.d : qtyRencana; plan.buburI += hasSplit ? split.i : 0;
        // Varian dari record PERTAMA (sama dgn aplikasi: dayReqsForVariant.find)
        const ids = parseVariantIds(catatanRencana); const names = parseVariants(catatanRencana);
        if (!varNames.bubur1) varNames.bubur1 = ids.v1 || names.v1;
        if (!varNames.bubur2) varNames.bubur2 = ids.v2 || names.v2;
      } else if (r.produk_id === "p-nasitim") {
        plan.timD += hasSplit ? split.d : qtyRencana; plan.timI += hasSplit ? split.i : 0;
        const ids = parseVariantIds(catatanRencana); const names = parseVariants(catatanRencana);
        if (!varNames.tim1) varNames.tim1 = ids.v1 || names.v1;
        if (!varNames.tim2) varNames.tim2 = ids.v2 || names.v2;
      } else if (r.produk_id === "p-oatmeal") plan.oatmeal += qtyRencana;
      else if (r.produk_id === "p-puding") plan.puding += qtyRencana;
      else if (r.produk_id === "p-abon") plan.abon += qtyRencana;
    });
    const variantIds = {
      bubur1: toId(varNames.bubur1),
      bubur2: toId(varNames.bubur2),
      tim1: toId(varNames.tim1),
      tim2: toId(varNames.tim2)
    };
    const missingVariants = Object.entries(variantIds)
      .filter(([, v]) => !v)
      .map(([k]) => `${k}(${varNames[k as keyof typeof varNames] || "?"})`);

    // 2. Realisasi dari produksi (fallback = rencana bila belum ada record, spt auto-fill aplikasi)
    const { data: prods } = await supabase.from("produksi").select("produk_id, qty_realisasi").eq("tanggal", tgl);
    let realisasiPuding = 0, realisasiOat = 0;
    (prods || []).forEach((p: any) => {
      if (p.produk_id === "p-puding") realisasiPuding += p.qty_realisasi || 0;
      if (p.produk_id === "p-oatmeal") realisasiOat += p.qty_realisasi || 0;
    });
    const hasProduksiRecord = (prods || []).length > 0;
    if (!hasProduksiRecord && FILL_REALISASI) {
      realisasiPuding = plan.puding;
      realisasiOat = plan.oatmeal;
    }

    const bahanReqs = computeBahanReqs(plan, variantIds, { puding: konvPuding, oat: konvOat });
    const kemasanReqs = computeKemasanReqs({ puding: realisasiPuding, oatmeal: realisasiOat });

    // 3. Movement lama yang harus dihapus (cocok via LABEL)
    const { data: movs } = await supabase
      .from("stok_movement").select("id, tanggal, bahan_id, tipe, qty, keterangan")
      .or(`keterangan.eq.Pemakaian Produksi [${tgl}],keterangan.eq.Pemakaian Kemasan [${tgl}]`);
    let toDelete = (movs || []).filter((m: any) => m.tipe === "OUT");
    if (BAHAN_ONLY) {
      // Hanya hapus potongan BAHAN BAKU — kemasan (Pemakaian Kemasan) dipertahankan
      toDelete = toDelete.filter((m: any) => (m.keterangan || "").startsWith("Pemakaian Produksi"));
    }

    console.log(`\n----- ${tgl} -----`);
    console.log(`  Rencana: bubur ${plan.buburD}+${plan.buburI}, tim ${plan.timD}+${plan.timI}, oat ${plan.oatmeal}, puding ${plan.puding}, abon ${plan.abon}`);
    console.log(`  Varian: bubur1=${varNames.bubur1}(${variantIds.bubur1 || "?"}) bubur2=${varNames.bubur2}(${variantIds.bubur2 || "?"}) tim1=${varNames.tim1}(${variantIds.tim1 || "?"}) tim2=${varNames.tim2}(${variantIds.tim2 || "?"})`);
    if (missingVariants.length > 0) console.log(`  ⚠️ Varian tidak ditemukan: ${missingVariants.join(", ")} — daging varian tsb dilewati`);
    console.log(`  Realisasi kemasan: puding ${realisasiPuding} cup, oatmeal ${realisasiOat} cup${!hasProduksiRecord ? (FILL_REALISASI ? " (fallback rencana — tidak ada record produksi)" : " (⚠️ TIDAK ada record produksi — kemasan dilewati, pakai --fill-realisasi bila mau ikut rencana)") : ""}`);
    console.log(`  HAPUS (${toDelete.length}):`);
    (toDelete || []).forEach((m: any) => console.log(`    - ${m.tanggal} ${m.bahan_id} qty=${m.qty} "${(m.keterangan || "").slice(0, 55)}" (id=${m.id})`));
    console.log(`  BUAT BAHAN (${bahanReqs.length}): "${bahanReqs.map((r) => `${r.bahanId}=${r.qty}`).join(", ") || "-"}"`);
    console.log(`  BUAT KEMASAN (${BAHAN_ONLY ? "dilewati (--bahan-only)" : kemasanReqs.length}): "${kemasanReqs.map((r) => `${r.bahanId}=${r.qty}`).join(", ") || "-"}"`);

    const delIds = toDelete.map((m: any) => m.id);
    if (APPLY) {
      if (delIds.length > 0) {
        const { error } = await supabase.from("stok_movement").delete().in("id", delIds);
        if (error) { console.error(`  ❌ Gagal hapus ${tgl}: ${error.message}`); continue; }
      }
      let insertOk = 0, insertErr = 0;
      for (const r of bahanReqs) {
        const { error } = await supabase.from("stok_movement").insert([{ id: uid(), tanggal: tgl, bahan_id: r.bahanId, tipe: "OUT", qty: r.qty, keterangan: `Pemakaian Produksi [${tgl}]` }]);
        if (error) { console.error(`  ❌ Gagal insert bahan ${r.bahanId}: ${error.message}`); insertErr++; } else insertOk++;
      }
      if (!BAHAN_ONLY) {
        for (const r of kemasanReqs) {
          const { error } = await supabase.from("stok_movement").insert([{ id: uid(), tanggal: tgl, bahan_id: r.bahanId, tipe: "OUT", qty: r.qty, keterangan: `Pemakaian Kemasan [${tgl}]` }]);
          if (error) { console.error(`  ❌ Gagal insert kemasan ${r.bahanId}: ${error.message}`); insertErr++; } else insertOk++;
        }
      }
      console.log(`  ✅ ${tgl}: hapus ${delIds.length}, buat ${insertOk} (gagal ${insertErr})`);
    }
    totalDel += delIds.length;
    totalIns += bahanReqs.length + (BAHAN_ONLY ? 0 : kemasanReqs.length);
  }

  console.log(`\n=== RINGKASAN ===`);
  console.log(`  ${dates.length} tanggal diproses${BAHAN_ONLY ? " (--bahan-only: kemasan dipertahankan)" : ""}`);
  console.log(`  Akan dihapus: ${totalDel} movement | Akan dibuat: ${totalIns} movement`);
  if (!APPLY) console.log(`\n👉 DRY-RUN selesai — jalankan dengan --apply untuk menulis ke database.`);
  else console.log(`\n✅ Selesai — stok produksi ${DARI} s.d. ${SAMPAI} diselaraskan dengan aturan Step 2 (bahan)${BAHAN_ONLY ? "" : " & Step 3 (kemasan)"}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
