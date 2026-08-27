/**
 * CLEAN ORPHAN JURNAL — Hapus entri jurnal yang tidak memiliki pasangan
 * (orphan = tidak ada entri lain dengan tanggal + jumlah sama, tipe berlawanan).
 *
 * Di tabel Daftar Jurnal (UI), setiap transaksi ditampilkan sebagai 2 baris:
 *   - Baris Debit: kolom Debit terisi, kolom Kredit "-"
 *   - Baris Kredit: kolom Debit "-", kolom Kredit terisi
 *
 * Orphan = baris yang TIDAK punya pasangan → tidak ditampilkan di UI,
 * tapi tetap ada di database → "tidak relevan".
 *
 * Cara pakai:
 *   npx tsx scripts/clean-orphan-jurnal.ts                     (DRY-RUN)
 *   npx tsx scripts/clean-orphan-jurnal.ts --apply             (hapus dari DB)
 *   npx tsx scripts/clean-orphan-jurnal.ts --dari=2026-08-01   (filter tanggal)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// --- Load .env ---
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env tidak ditemukan");
  process.exit(1);
}
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

// --- CLI args ---
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dariArg = args.find((a) => a.startsWith("--dari="));
const DARI = dariArg ? dariArg.split("=")[1] : undefined;

async function main() {
  console.log("=== CLEAN ORPHAN JURNAL ===");
  console.log(`Mode: ${APPLY ? "✅ HAPUS dari DB (--apply)" : "🔍 DRY-RUN (tidak menghapus)"}`);
  if (DARI) console.log(`Filter: tanggal >= ${DARI}`);
  console.log();

  // 1. Fetch all jurnal entries
  let query = supabase
    .from("jurnal")
    .select("id, tanggal, ref, kode_akun, akun, tipe, jumlah, kategori, keterangan");

  if (DARI) {
    query = query.gte("tanggal", DARI);
  }

  const { data: allJurnal, error } = await query.order("tanggal", { ascending: true });

  if (error) {
    console.error("❌ Query jurnal gagal:", error.message);
    process.exit(1);
  }

  console.log(`Total jurnal entries: ${allJurnal?.length || 0}`);

  if (!allJurnal || allJurnal.length === 0) {
    console.log("ℹ️  Tidak ada data jurnal.");
    return;
  }

  // 2. Find orphan entries (no matching pair: same tanggal + jumlah, opposite tipe)
  const orphans: typeof allJurnal = [];
  const paired = new Set<string>(); // track IDs that are part of a pair

  for (const j of allJurnal) {
    if (paired.has(j.id)) continue;

    // Find a matching pair: same tanggal, same jumlah, opposite tipe, different id
    const pair = allJurnal.find(
      (o) =>
        o.id !== j.id &&
        o.tanggal === j.tanggal &&
        Math.abs(Number(o.jumlah) - Number(j.jumlah)) < 1 && // handle numeric precision
        o.tipe !== j.tipe
    );

    if (pair) {
      paired.add(j.id);
      paired.add(pair.id);
    } else {
      orphans.push(j);
    }
  }

  console.log(`\nOrphan entries ditemukan: ${orphans.length}`);
  console.log(`Paired entries: ${paired.size} (${paired.size / 2} transaksi)`);
  console.log();

  if (orphans.length === 0) {
    console.log("✅ Tidak ada orphan entries. Semua jurnal sudah berpasangan.");
    return;
  }

  // 3. Group orphans by tanggal for readability
  const byDate = new Map<string, typeof orphans>();
  for (const o of orphans) {
    const d = o.tanggal;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(o);
  }

  console.log("--- Detail Orphan Entries ---\n");
  for (const [tgl, entries] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`📅 ${tgl} (${entries.length} orphan):`);
    for (const e of entries) {
      console.log(
        `   [${e.tipe}] ${e.kode_akun || "?"} ${e.akun} | Rp ${(Number(e.jumlah) || 0).toLocaleString("id-ID")} | ref=${e.ref || "-"} | "${e.keterangan || ""}"`
      );
    }
    console.log();
  }

  // 4. Summary
  const totalJumlah = orphans.reduce((s, o) => s + (Number(o.jumlah) || 0), 0);
  console.log("--- Ringkasan ---");
  console.log(`  Jumlah orphan : ${orphans.length} baris`);
  console.log(`  Total nilai   : Rp ${totalJumlah.toLocaleString("id-ID")}`);
  console.log();

  if (!APPLY) {
    console.log("🔍 DRY-RUN selesai. Tidak ada yang dihapus.");
    console.log("   Jalankan dengan --apply untuk menghapus orphan entries.");
    return;
  }

  // 5. Delete orphan entries
  console.log("🗑️  Menghapus orphan entries...");
  const ids = orphans.map((o) => o.id);

  // Delete in batches of 50
  const BATCH = 50;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const { error: delErr } = await supabase.from("jurnal").delete().in("id", batch);
    if (delErr) {
      console.error(`  ❌ Batch ${i / BATCH + 1} gagal:`, delErr.message);
    } else {
      deleted += batch.length;
      console.log(`  ✅ Batch ${i / BATCH + 1}: ${batch.length} baris dihapus`);
    }
  }

  console.log(`\n✅ Selesai: ${deleted} orphan entries dihapus dari database.`);
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
