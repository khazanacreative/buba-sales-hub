/**
 * HAPUS DUPLIKAT PERMOHONAN STOK — bersihkan record Disetujui ganda
 *
 * Latar belakang: tombol "Simpan Rencana" (saveStep1 di halaman Produksi)
 * sebelumnya tidak punya pengaman klik-ganda. Jika saveStep1 terpicu dua kali
 * beruntun, dua batch IDENTIK ter-insert ke permohonan_stok → duplikat per
 * (tanggal_kirim, outlet, produk). Aplikasi menjumlahkan semua record Disetujui,
 * sehingga distribusi yang tampil di outlet & admin menjadi 2× lipat
 * (mis. Kuti 2+2=4 padahal 2; Sidohwayah 3+3=6 padahal 3).
 *
 * Script ini mencari record permohonan_stok ber-status Disetujui yang lebih
 * dari satu per (tanggal_kirim, outlet_id, produk_id) pada produk produksi
 * (p-*), lalu menghapus record ekstra — menyisakan SATU record per kunci.
 * Hanya menyentuh record produksi; permohonan/retur perlengkapan (b-*) tidak
 * diproses.
 *
 * ⚠️ PERHATIAN:
 *  1. Pastikan duplikat benar-benar identik (qty sama) sebelum --apply —
 *     DRY-RUN menampilkan semua pasangan duplikat utk ditinjau.
 *  2. Jika outlet sudah menginput OH berdasarkan distribusi yang membengkak,
 *     jalankan juga sinkronisasi penjualan setelahnya:
 *     npx tsx scripts/sinkron-oatmeal-outlet.ts --apply
 *  3. Disarankan backup dulu: npx tsx scripts/backup-db.ts
 *
 * Cara pakai:
 *   npx tsx scripts/hapus-duplikat-permohonan.ts                     (DRY-RUN)
 *   npx tsx scripts/hapus-duplikat-permohonan.ts --apply             (menulis)
 *   npx tsx scripts/hapus-duplikat-permohonan.ts --dari=2026-08-18 --sampai=2026-08-18 --apply
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("Error: .env file not found at", envPath);
  process.exit(1);
}
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

const supabaseUrl = env["VITE_SUPABASE_URL"];
const supabaseKey = env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"];
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ VITE_SUPABASE_URL dan Service Role / Anon Key harus di-set di .env");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes("--apply");
  const dariArg = args.find((a) => a.startsWith("--dari="));
  const sampaiArg = args.find((a) => a.startsWith("--sampai="));
  const DARI = dariArg ? dariArg.split("=")[1] : "2026-08-01";
  const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : new Date().toISOString().slice(0, 10);

  console.log("=== HAPUS DUPLIKAT PERMOHONAN STOK (Disetujui) ===");
  console.log(`Rentang: ${DARI} s.d. ${SAMPAI}`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  const { data: reqs, error } = await supabase
    .from("permohonan_stok")
    .select("id, tanggal_kirim, outlet_id, produk_id, qty, qty_rencana, catatan, catatan_rencana, status")
    .eq("status", "Disetujui")
    .gte("tanggal_kirim", DARI)
    .lte("tanggal_kirim", SAMPAI);
  if (error) {
    console.error("❌ Gagal membaca permohonan_stok:", error.message);
    process.exit(1);
  }

  // Kelompokkan per (tanggal_kirim, outlet, produk) — hanya produk produksi (p-*)
  const byKey = new Map<string, any[]>();
  (reqs || []).forEach((r: any) => {
    if (!String(r.produk_id || "").startsWith("p-")) return;
    const key = `${r.tanggal_kirim}|${r.outlet_id}|${r.produk_id}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  });

  const toDelete: any[] = [];
  const dupeKeys: string[] = [];

  byKey.forEach((recs, key) => {
    if (recs.length <= 1) return;
    dupeKeys.push(key);
    // Sisakan SATU record: utamakan yang catatan_rencana-nya tidak NULL
    // (format simpanan aplikasi sekarang), jika ada; selain itu record pertama.
    const keep = recs.find((r: any) => r.catatan_rencana != null) || recs[0];
    recs.filter((r) => r.id !== keep.id).forEach((r) => toDelete.push(r));
  });

  const [tanggal, outletId, produkId] = dupeKeys[0]?.split("|") || [];
  console.log(`Record Disetujui produk produksi: ${(reqs || []).length} | Grup duplikat: ${dupeKeys.length}\n`);

  for (const key of dupeKeys) {
    const [tgl, oid, pid] = key.split("|");
    const recs = byKey.get(key)!;
    const totalQty = recs.reduce((s, r) => s + r.qty, 0);
    console.log(`⚠️  ${tgl} | ${outletNames.get(oid) || oid} | ${pid} | ${recs.length} record (qty ${recs.map((r) => r.qty).join(" + ")} = ${totalQty}) — seharusnya 1 record`);
    recs.forEach((r) => {
      const action = toDelete.some((d) => d.id === r.id) ? "🗑️  HAPUS" : "✅ KEEP";
      console.log(`     ${action} ${r.id} | qty=${r.qty} | qty_rencana=${r.qty_rencana} | catatan="${r.catatan}"`);
    });
  }
  if (dupeKeys.length === 0) console.log("  (tidak ada duplikat) ✓");

  console.log(`\nTotal record akan dihapus: ${toDelete.length}`);
  if (toDelete.length === 0) {
    console.log("👉 Tidak ada yang perlu dihapus.");
    return;
  }
  if (!APPLY) {
    console.log(`👉 DRY-RUN selesai. Jalankan dengan --apply untuk menghapus ${toDelete.length} record.`);
    return;
  }

  let ok = 0;
  for (const r of toDelete) {
    const { error: dErr } = await supabase.from("permohonan_stok").delete().eq("id", r.id);
    if (dErr) {
      console.error(`  ❌ Gagal hapus id=${r.id}: ${dErr.message}`);
    } else {
      ok++;
      console.log(`  ✅ Dihapus ${r.id} (${r.tanggal_kirim} | ${outletNames.get(r.outlet_id) || r.outlet_id} | ${r.produk_id})`);
    }
  }
  console.log(`\n✅ ${ok}/${toDelete.length} record berhasil dihapus.`);
  console.log(`👉 Jika outlet sudah input OH dengan distribusi yang membengkak, jalankan juga:`);
  console.log(`   npx tsx scripts/sinkron-oatmeal-outlet.ts --apply`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
