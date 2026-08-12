/**
 * REGENERATE JURNAL OUT-SALES — omzet mengikuti qty terjual terkini.
 *
 * Menghitung ulang jurnal OUT-SALES untuk rentang tanggal dari record
 * penjualan: total = Σ(qty × harga) per tanggal (identik dgn saveStep4/5
 * Produksi). Hanya memproses tanggal yang SUDAH punya jurnal OUT-SALES
 * (siklus sudah ditutup); tanggal tanpa jurnal dilewati (siklus masih
 * terbuka — jurnal akan dibuat otomatis saat siklus ditutup).
 *
 * Struktur jurnal yang ditulis (sama persis dgn aplikasi):
 *   Debit  : 131000 Piutang usaha      (Aset)
 *   Kredit : 410000 Pendapatan Utama   (Pendapatan)
 *   keterangan: "Penjualan Outlet MPASI Tanggal <tanggal>", ref "OUT-SALES"
 *
 * Cara pakai:
 *   npx tsx scripts/regenerate-jurnal-out-sales.ts                                      (DRY-RUN, 08-08 s/d 12-08)
 *   npx tsx scripts/regenerate-jurnal-out-sales.ts --apply                              (menulis ke DB)
 *   npx tsx scripts/regenerate-jurnal-out-sales.ts --dari=2026-08-08 --sampai=2026-08-12 --apply
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) { console.error("❌ .env tidak ditemukan"); process.exit(1); }
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || "").replace(/^["']|["']$/g, "");
});
const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const DARI = dariArg ? dariArg.split("=")[1] : "2026-08-08";
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : "2026-08-12";

async function main() {
  console.log("=== REGENERATE JURNAL OUT-SALES (omzet = Σ qty × harga) ===");
  console.log(`Rentang: ${DARI} s/d ${SAMPAI}`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  // 1. Penjualan per tanggal → total revenue
  const { data: sales, error: errSales } = await supabase
    .from("penjualan")
    .select("tanggal, qty, harga")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (errSales) { console.error("❌ Query penjualan:", errSales.message); process.exit(1); }

  const totalPerDate = new Map<string, number>();
  (sales || []).forEach((p: any) => {
    totalPerDate.set(p.tanggal, (totalPerDate.get(p.tanggal) || 0) + p.qty * p.harga);
  });

  // 2. Jurnal OUT-SALES yang sudah ada di rentang
  const { data: jurnal, error: errJurnal } = await supabase
    .from("jurnal")
    .select("id, tanggal, ref, tipe, jumlah")
    .eq("ref", "OUT-SALES")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (errJurnal) { console.error("❌ Query jurnal:", errJurnal.message); process.exit(1); }

  const jurnalPerDate = new Map<string, { id: string; jumlah: number }[]>();
  (jurnal || []).forEach((j: any) => {
    if (!jurnalPerDate.has(j.tanggal)) jurnalPerDate.set(j.tanggal, []);
    jurnalPerDate.get(j.tanggal)!.push(j);
  });

  const dates = [...new Set([...totalPerDate.keys(), ...jurnalPerDate.keys()])].sort();
  let toUpdate = 0;
  let toDelete = 0;
  let skipped = 0;

  dates.forEach((tgl) => {
    const newTotal = Math.round(totalPerDate.get(tgl) || 0);
    const existing = jurnalPerDate.get(tgl) || [];
    const oldTotal = existing.length > 0 ? Math.round((existing[0]?.jumlah || 0)) : 0;

    if (existing.length === 0) {
      console.log(`  ${tgl} | siklus BELUM ditutup (tanpa jurnal) — dilewati, jurnal dibuat saat tutup siklus`);
      skipped++;
      return;
    }

    if (newTotal === oldTotal && existing.length === 2) {
      console.log(`  ${tgl} | sudah sesuai: Rp ${newTotal.toLocaleString()} — tidak diubah`);
      return;
    }

    if (newTotal > 0) {
      console.log(`  ${tgl} | jurnal lama Rp ${oldTotal.toLocaleString()} → Rp ${newTotal.toLocaleString()} (${existing.length} baris dihapus, 2 baris dibuat)`);
      toUpdate++;
    } else {
      console.log(`  ${tgl} | jurnal lama Rp ${oldTotal.toLocaleString()} → total 0 — jurnal dihapus (tidak ada penjualan)`);
      toDelete++;
    }
  });

  console.log(`\nRingkasan: ${toUpdate} tanggal di-update, ${toDelete} tanggal jurnalnya dihapus, ${skipped} tanggal dilewati (siklus terbuka).`);
  if (toUpdate === 0 && toDelete === 0) {
    console.log("ℹ️  Tidak ada perubahan yang diperlukan.");
    return;
  }
  if (!APPLY) {
    console.log("\n🔍 DRY-RUN selesai. Jalankan dengan --apply untuk menulis ke database.");
    return;
  }

  // ==== MENULIS KE DATABASE ====
  console.log("\nMenulis perubahan...");
  let ok = 0;

  for (const tgl of dates) {
    const newTotal = Math.round(totalPerDate.get(tgl) || 0);
    const existing = jurnalPerDate.get(tgl) || [];
    if (existing.length === 0) continue; // siklus terbuka — jangan dibuatkan
    if (newTotal > 0) {
      const oldTotal = existing.length > 0 ? Math.round(existing[0]?.jumlah || 0) : 0;
      if (newTotal === oldTotal && existing.length === 2) continue; // sudah sesuai
    }

    // Hapus baris lama
    const { error: delErr } = await supabase.from("jurnal").delete().in("id", existing.map((j: any) => j.id));
    if (delErr) { console.error(`  ❌ ${tgl} (hapus): ${delErr.message}`); continue; }

    // Buat ulang (hanya jika total > 0 — sama dgn perilaku aplikasi)
    if (newTotal > 0) {
      const rows = [
        { id: randomUUID(), tanggal: tgl, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tgl}`, kode_akun: "131000", akun: "Piutang usaha", tipe: "Debit", jumlah: newTotal, kategori: "Aset" },
        { id: randomUUID(), tanggal: tgl, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tgl}`, kode_akun: "410000", akun: "Pendapatan Utama", tipe: "Kredit", jumlah: newTotal, kategori: "Pendapatan" }
      ];
      const { error: insErr } = await supabase.from("jurnal").insert(rows);
      if (insErr) { console.error(`  ❌ ${tgl} (insert): ${insErr.message}`); continue; }
    }
    ok++;
  }
  console.log(`✅ Selesai: ${ok} tanggal diproses.`);
}

main();
