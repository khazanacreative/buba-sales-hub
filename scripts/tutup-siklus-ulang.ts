/**
 * TUTUP SIKLUS ULANG — meniru persis saveStep4 (tombol "Simpan/Tutup Siklus"
 * di Produksi & Distribusi) untuk tanggal yang siklusnya dibuka kembali.
 *
 * Membuat ulang untuk setiap tanggal (memulihkan keadaan persis sebelum siklus
 * dibuka kembali) — alur keuangan (spec):
 *   1. Jurnal OUT-SALES (2 baris: 110000 Kas Rupiah Debit / 410000 Kredit) —
 *      jumlah = Σ(qty × harga) dari penjualan outlet SAAT INI.
 *   2. Jurnal OUT-OH (2 baris: 543000 OH Debit / 140000 Persediaan Kredit) —
 *      nilai OH (bahan baku + kemasan rusak) dihitung ulang dari data sekarang.
 *   3. Jurnal OUT-HPP (2 baris: 541000 HPP Debit / 140000 Persediaan Kredit) —
 *      HPP = nilai pemotongan (Pemakaian Produksi/Kemasan) − nilai OH rusak.
 *   4. Movement stok IN "Retur Bahan Baku (g)" untuk OH abon yang kembali ke
 *      gudang (yang terhapus saat Buka Siklus).
 *
 * Movement OUT "RUSAK:OH ..." TIDAK disentuh (sudah ada & sudah benar — hasil
 * koreksi aturan baru; penjualan tidak berubah selama siklus dibuka). Catatan:
 * tombol Tutup Siklus di aplikasi menghitung ulang RUSAK:OH memakai fallback
 * "terkirim − terjual", sehingga outlet tanpa input sisa dianggap seluruh
 * stoknya sisa/rusak — skrip ini TIDAK memakai fallback itu agar angka historis
 * tetap sama seperti sebelum dibuka.
 *
 * Penjualan TIDAK disentuh. Bila omzet <= 0, tanggal di-skip (sama dgn guard
 * aplikasi — siklus tidak ditutup tanpa omzet).
 *
 * Cara pakai:
 *   npx tsx scripts/tutup-siklus-ulang.ts                                   # dry-run 08-08..08-11
 *   npx tsx scripts/tutup-siklus-ulang.ts --dari=2026-08-08 --sampai=2026-08-11
 *   npx tsx scripts/tutup-siklus-ulang.ts --dari=2026-08-08 --sampai=2026-08-11 --apply
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
      value = value.substring(1, value.length - 1);
    else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'")
      value = value.substring(1, value.length - 1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const DARI = dariArg ? dariArg.split("=")[1] : "2026-08-08";
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : "2026-08-11";

// ===== Konstanta — IDENTIK dengan Produksi.tsx / produksi-utils.ts =====
const BUBUR_BASE = { beras: 100, sayurHijau: 8, sayurBuah: 5, sayurProtein: 1.5 };
const buburCalc = (cups: number, base: number) => (cups * base) / 6;
// Default getBubaSettings() (localStorage tidak tersedia di script)
const SETTINGS = {
  berasTim: 20.0, sayurHijauTim: 1.6, sayurBuahTim: 1.0, sayurProteinTim: 0.3,
  oatmealCup: 25.71, pudingCup: 13.0, abonCup: 10.0
};
const OH_MIN_GRAM = 50;
const GPC: Record<string, number> = { "p-bubur": 118, "p-nasitim": 108 };

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
const parseSplit = (catatan?: string | null) => {
  const m = catatan?.match(/D:(\d+),I:(\d+)/);
  return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 };
};
const hasSplit = (catatan?: string | null) => /D:\d+,I:\d+/.test(catatan || "");

// Identik dgn sisaGramToCups (produksi-utils.ts)
function sisaGramToCups(sisaGram: number, gramPerCup: number): number {
  const grams = Math.max(0, Number(sisaGram) || 0);
  if (grams <= OH_MIN_GRAM) return 0;
  const cups = Math.floor(grams / gramPerCup);
  const frac = grams / gramPerCup - cups;
  return cups + (frac > 0.5 ? 1 : 0);
}

const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

async function main() {
  console.log(`=== TUTUP SIKLUS ULANG (${DARI} s.d. ${SAMPAI}) ===`);
  console.log(`Mode: ${APPLY ? "✅ EKSEKUSI (--apply)" : "🔍 DRY-RUN (hanya laporan)"}\n`);

  // Bahan master untuk konversi puding/oat (fallback 130/180) & harga beli (nilai OH/HPP)
  const { data: bahan } = await supabase.from("bahan_baku").select("id, konversi_gram, harga_beli");
  const konv = new Map((bahan || []).map((b: any) => [b.id, Number(b.konversi_gram) || 0]));
  const harga = new Map((bahan || []).map((b: any) => [b.id, Number(b.harga_beli) || 0]));
  const konvPuding = konv.get("b-pud01") || 130;
  const konvOat = konv.get("b-oat01") || 180;

  // Nilai rupiah qty stok (identik dgn nilaiBahan + GRAM_EXCLUDED_BAHAN di aplikasi)
  const GRAM_EXCLUDED = new Set(["b-pud01", "b-oat01"]);
  const nilaiBahan = (bahanId: string, qty: number): number => {
    if (!(qty > 0)) return 0;
    const hrg = harga.get(bahanId) || 0;
    const konvG = GRAM_EXCLUDED.has(bahanId) ? null : (konv.get(bahanId) || 0);
    if (!konvG || konvG <= 0) return Math.round(qty * hrg);
    return Math.round(qty * (hrg / konvG));
  };

  const parseDate = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const dates: string[] = [];
  let d = parseDate(DARI);
  const end = parseDate(SAMPAI);
  while (d <= end) {
    dates.push(fmtDate(d));
    d.setDate(d.getDate() + 1);
  }

  let totalClosed = 0;
  let totalEligible = 0;
  for (const tanggal of dates) {
    console.log(`\n--- ${tanggal} ---`);

    // 1. Distribusi (permohonan_stok Disetujui) → distGrid per outlet
    const { data: dists, error: e1 } = await supabase
      .from("permohonan_stok")
      .select("outlet_id, produk_id, qty, catatan")
      .eq("tanggal_kirim", tanggal)
      .eq("status", "Disetujui")
      .like("produk_id", "p-%");
    if (e1) throw new Error("permohonan_stok: " + e1.message);

    const distGrid: Record<string, any> = {};
    (dists || []).forEach((r: any) => {
      const row = distGrid[r.outlet_id] || { ...ZERO };
      if (r.produk_id === "p-bubur" || r.produk_id === "p-nasitim") {
        const sp = parseSplit(r.catatan);
        if (hasSplit(r.catatan)) {
          if (r.produk_id === "p-bubur") { row.bubur_d += sp.d; row.bubur_i += sp.i; }
          else { row.tim_d += sp.d; row.tim_i += sp.i; }
        } else {
          // Data lama tanpa split: bagi dua (fallback aplikasi lama)
          const half = Math.round((Number(r.qty) || 0) / 2);
          if (r.produk_id === "p-bubur") { row.bubur_d += half; row.bubur_i += (Number(r.qty) || 0) - half; }
          else { row.tim_d += half; row.tim_i += (Number(r.qty) || 0) - half; }
        }
      } else if (r.produk_id === "p-oatmeal") row.oatmeal += Number(r.qty) || 0;
      else if (r.produk_id === "p-puding") row.puding += Number(r.qty) || 0;
      else if (r.produk_id === "p-abon") row.abon += Number(r.qty) || 0;
      distGrid[r.outlet_id] = row;
    });

    // 2. Penjualan outlet
    const { data: sales, error: e2 } = await supabase
      .from("penjualan")
      .select("*")
      .eq("tanggal", tanggal);
    if (e2) throw new Error("penjualan: " + e2.message);
    const penjualan = (sales || []) as any[];

    const totalSalesRevenue = penjualan.reduce((s, p) => s + (Number(p.qty) || 0) * (Number(p.harga) || 0), 0);
    if (totalSalesRevenue <= 0) {
      console.log(`  ⏭️  Omzet <= 0 (${penjualan.length} record penjualan) — siklus TIDAK ditutup (guard aplikasi).`);
      continue;
    }
    totalEligible++;

    // 3. Retur grid (fresh, dari penjualan — tanpa edit manual)
    const freshReturGrid: Record<string, any> = {};
    Object.keys(distGrid).forEach((oid) => { freshReturGrid[oid] = { ...ZERO }; });
    Object.keys(distGrid).forEach((oid) => {
      const sent = distGrid[oid];
      const row = freshReturGrid[oid];
      const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
        const gpc = GPC[baseId] || 118;
        // Kolom DB: outlet_id, produk_id, sisa_gram, variant
        const dRec = penjualan.find((p: any) => p.outlet_id === oid && p.produk_id === baseId && p.variant === dField && p.sisa_gram != null);
        const iRec = penjualan.find((p: any) => p.outlet_id === oid && p.produk_id === baseId && p.variant === iField && p.sisa_gram != null);
        if (dRec) row[dField] = Math.min(Number(dRec.sisa_gram) || 0, dSent * gpc);
        if (iRec) row[iField] = Math.min(Number(iRec.sisa_gram) || 0, iSent * gpc);
        if (!dRec && !iRec) {
          const totalSent = dSent + iSent;
          const sold = penjualan.filter((p: any) => p.outlet_id === oid && p.produk_id === baseId).reduce((s: number, p: any) => s + (Number(p.qty) || 0), 0);
          const totalRetur = Math.max(0, totalSent - sold);
          if (totalSent > 0) {
            const dReturCups = Math.round(totalRetur * (dSent / totalSent));
            const iReturCups = totalRetur - dReturCups;
            row[dField] = dReturCups * gpc;
            row[iField] = iReturCups * gpc;
          }
        }
      };
      calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
      calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
      row.oatmeal = Math.max(0, (sent.oatmeal || 0) - penjualan.filter((p: any) => p.outlet_id === oid && p.produk_id === "p-oatmeal").reduce((s: number, p: any) => s + (Number(p.qty) || 0), 0));
      row.puding = Math.max(0, (sent.puding || 0) - penjualan.filter((p: any) => p.outlet_id === oid && p.produk_id === "p-puding").reduce((s: number, p: any) => s + (Number(p.qty) || 0), 0));
      row.abon = Math.max(0, (sent.abon || 0) - penjualan.filter((p: any) => p.outlet_id === oid && p.produk_id === "p-abon").reduce((s: number, p: any) => s + (Number(p.qty) || 0), 0));
    });

    // 4. Hitung OH (persis saveStep4)
    const ohRusak = { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
    let abonKembali = 0;
    const kemasanRusak = { puding: 0, oatmeal: 0 };
    Object.keys(distGrid).forEach((oid) => {
      const sent = distGrid[oid];
      const retur = freshReturGrid[oid] || ZERO;
      [["bubur_d", "bubur_i"], ["tim_d", "tim_i"]].forEach(([dField, iField]) => {
        const isTim = dField.startsWith("tim");
        const gpc = isTim ? 108 : 118;
        [dField, iField].forEach((field) => {
          if ((sent[field] || 0) > 0) {
            const cups = Math.min(sisaGramToCups(retur[field] || 0, gpc), sent[field]);
            if (cups > 0) {
              if (isTim) {
                ohRusak.beras += cups * SETTINGS.berasTim;
                ohRusak.sayurHijau += cups * SETTINGS.sayurHijauTim;
                ohRusak.sayurBuah += cups * SETTINGS.sayurBuahTim;
                ohRusak.sayurProtein += cups * SETTINGS.sayurProteinTim;
              } else {
                ohRusak.beras += buburCalc(cups, BUBUR_BASE.beras);
                ohRusak.sayurHijau += buburCalc(cups, BUBUR_BASE.sayurHijau);
                ohRusak.sayurBuah += buburCalc(cups, BUBUR_BASE.sayurBuah);
                ohRusak.sayurProtein += buburCalc(cups, BUBUR_BASE.sayurProtein);
              }
            }
          }
        });
      });
      if ((sent.oatmeal || 0) > 0) {
        const actualRetur = Math.min(retur.oatmeal || 0, sent.oatmeal);
        if (actualRetur > 0) { ohRusak.oat += actualRetur * SETTINGS.oatmealCup; kemasanRusak.oatmeal += actualRetur; }
      }
      if ((sent.puding || 0) > 0) {
        const actualRetur = Math.min(retur.puding || 0, sent.puding);
        if (actualRetur > 0) { ohRusak.puding += actualRetur * SETTINGS.pudingCup; kemasanRusak.puding += actualRetur; }
      }
      if ((sent.abon || 0) > 0) {
        const actualRetur = Math.min(retur.abon || 0, sent.abon);
        if (actualRetur > 0) abonKembali += actualRetur * SETTINGS.abonCup;
      }
    });

    const qtyAbon = Math.ceil(abonKembali);

    // === Nilai OH (bahan baku + kemasan rusak) — identik dgn hitungOHValue aplikasi ===
    let ohValue = 0;
    if (ohRusak.beras > 1) ohValue += nilaiBahan("b-brs01", Math.ceil(ohRusak.beras));
    if (ohRusak.puding > 1) ohValue += nilaiBahan("b-pud01", Math.ceil(ohRusak.puding / konvPuding));
    if (ohRusak.oat > 1) ohValue += nilaiBahan("b-oat01", Math.ceil(ohRusak.oat / konvOat));
    if (ohRusak.sayurHijau > 1) ohValue += nilaiBahan("b-sh01", Math.ceil(ohRusak.sayurHijau));
    if (ohRusak.sayurBuah > 1) ohValue += nilaiBahan("b-sb01", Math.ceil(ohRusak.sayurBuah));
    if (ohRusak.sayurProtein > 1) ohValue += nilaiBahan("b-sp01", Math.ceil(ohRusak.sayurProtein));
    if (kemasanRusak.puding > 0) {
      ohValue += nilaiBahan("b-cuppud01", kemasanRusak.puding);
      ohValue += nilaiBahan("b-plas01", kemasanRusak.puding);
    }
    if (kemasanRusak.oatmeal > 0) {
      ohValue += nilaiBahan("b-cupoat1", kemasanRusak.oatmeal);
      ohValue += nilaiBahan("b-ttoat01", kemasanRusak.oatmeal);
    }

    // === Nilai pemotongan (Pemakaian Produksi/Kemasan) utk HPP ===
    const { data: pemMov } = await supabase
      .from("stok_movement")
      .select("bahan_id, qty, keterangan")
      .eq("tipe", "OUT")
      .or(`keterangan.ilike.%Pemakaian Produksi [${tanggal}%,keterangan.ilike.%Pemakaian Kemasan [${tanggal}]%`);
    let pemotonganValue = 0;
    (pemMov || []).forEach((m: any) => {
      const ket = m.keterangan || "";
      const label = ket.startsWith("Pemakaian Produksi [")
        ? ket.slice("Pemakaian Produksi [".length, ket.lastIndexOf("]"))
        : ket;
      if (ket.startsWith("Pemakaian Produksi [") && label !== tanggal && !label.startsWith(tanggal + " + ")) return;
      pemotonganValue += nilaiBahan(m.bahan_id, Number(m.qty) || 0);
    });
    const hppValue = Math.max(0, Math.round(pemotonganValue - ohValue));

    console.log(`  Omzet: ${totalSalesRevenue.toLocaleString("id-ID")} (${penjualan.length} record penjualan)`);
    console.log(`  Jurnal: OUT-SALES (110000/120000 Debit / 410000 Kredit) Rp ${totalSalesRevenue.toLocaleString("id-ID")} | OUT-OH Rp ${ohValue.toLocaleString("id-ID")} | OUT-HPP Rp ${hppValue.toLocaleString("id-ID")}`);
    console.log(`  Movement IN abon (Retur Bahan Baku): qty=${qtyAbon} gr${abonKembali <= 1 ? " (skip, OH abon <= 1 gr)" : ""}`);
    console.log(`  Movement OUT RUSAK:OH: TIDAK disentuh (tetap seperti sebelum siklus dibuka)`);

    if (!APPLY) continue;

    // 5. Jurnal siklus — hapus lama (semua ref), lalu buat ulang. Split omzet
    //    kas/bank dipertahankan dari jurnal lama (baris Debit 120000 = bank).
    const { data: oldJ } = await supabase.from("jurnal").select("id, ref, tipe, jumlah, kode_akun").eq("tanggal", tanggal).in("ref", ["OUT-SALES", "OUT-OH", "OUT-HPP"]);
    const existingBank = (oldJ || [])
      .filter((j: any) => j.ref === "OUT-SALES" && j.tipe === "Debit" && j.kode_akun === "120000")
      .reduce((s: number, j: any) => s + Number(j.jumlah), 0);
    const bank = Math.min(existingBank, totalSalesRevenue);
    const kas = totalSalesRevenue - bank;
    for (const j of oldJ || []) await supabase.from("jurnal").delete().eq("id", j.id);

    const jurnalRows: any[] = [];
    if (kas > 0) {
      jurnalRows.push({ id: uid(), tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kode_akun: "110000", akun: "Kas Rupiah", tipe: "Debit", jumlah: kas, kategori: "Aset" });
    }
    if (bank > 0) {
      jurnalRows.push({ id: uid(), tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kode_akun: "120000", akun: "Bank", tipe: "Debit", jumlah: bank, kategori: "Aset" });
    }
    jurnalRows.push({ id: uid(), tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kode_akun: "410000", akun: "Pendapatan Utama", tipe: "Kredit", jumlah: totalSalesRevenue, kategori: "Pendapatan" });
    if (ohValue > 0) {
      jurnalRows.push(
        { id: uid(), tanggal, ref: "OUT-OH", keterangan: `OH (sisa tidak terjual) Tanggal ${tanggal}`, kode_akun: "543000", akun: "OH", tipe: "Debit", jumlah: ohValue, kategori: "Beban" },
        { id: uid(), tanggal, ref: "OUT-OH", keterangan: `OH (sisa tidak terjual) Tanggal ${tanggal}`, kode_akun: "140000", akun: "Persediaan", tipe: "Kredit", jumlah: ohValue, kategori: "Aset" }
      );
    }
    if (hppValue > 0) {
      jurnalRows.push(
        { id: uid(), tanggal, ref: "OUT-HPP", keterangan: `HPP (bahan baku terjual) Tanggal ${tanggal}`, kode_akun: "541000", akun: "HPP Bahan Utama", tipe: "Debit", jumlah: hppValue, kategori: "Beban" },
        { id: uid(), tanggal, ref: "OUT-HPP", keterangan: `HPP (bahan baku terjual) Tanggal ${tanggal}`, kode_akun: "140000", akun: "Persediaan", tipe: "Kredit", jumlah: hppValue, kategori: "Aset" }
      );
    }
    const { error: jErr } = await supabase.from("jurnal").insert(jurnalRows);
    if (jErr) throw new Error(`jurnal ${tanggal}: ` + jErr.message);

    // 6. Movement IN abon (OH abon kembali ke gudang) — hapus lama, buat ulang.
    //    RUSAK:OH OUT dibiarkan apa adanya (sudah benar).
    const { data: oldMovIn } = await supabase.from("stok_movement").select("id").eq("tanggal", tanggal).eq("tipe", "IN").or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%");
    for (const m of oldMovIn || []) await supabase.from("stok_movement").delete().eq("id", m.id);

    if (abonKembali > 1) {
      const { error: mErr } = await supabase.from("stok_movement").insert([{ id: uid(), tanggal, bahan_id: "b-ab01", tipe: "IN", qty: qtyAbon, keterangan: `Retur Bahan Baku (g) [${tanggal}]` }]);
      if (mErr) throw new Error(`stok_movement ${tanggal} b-ab01: ` + mErr.message);
    }
    console.log(`  ✅ Siklus ${tanggal} DITUTUP ULANG (${oldJ?.length || 0} jurnal lama dihapus, ${jurnalRows.length} jurnal dibuat, ${abonKembali > 1 ? 1 : 0} movement IN abon dibuat; RUSAK:OH dibiarkan).`);
    totalClosed++;
  }

  console.log(`\n=== RINGKASAN ===`);
  console.log(APPLY
    ? `Siklus ditutup ulang: ${totalClosed} tanggal (dari ${totalEligible} yang beromzet). Omzet kembali muncul di laporan.`
    : `Dry-run selesai: ${totalEligible} tanggal beromzet akan ditutup. Jalankan dengan --apply untuk eksekusi.`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
