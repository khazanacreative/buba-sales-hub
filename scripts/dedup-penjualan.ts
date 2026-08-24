/**
 * CLEANUP — Hapus record penjualan duplikat.
 *
 * Untuk setiap kombinasi (outlet_id, tanggal, produk_id, variant),
 * hanya SATU record dipertahankan (yang paling baru berdasarkan id).
 * Record duplikat dihapus.
 *
 * READ-ONLY dry run default. Tambah --apply untuk eksekusi hapus.
 *
 * Cara pakai:
 *   npx tsx scripts/dedup-penjualan.ts           # dry run
 *   npx tsx scripts/dedup-penjualan.ts --apply   # eksekusi hapus
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envPath = ".env";
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

const supabase = createClient(env["VITE_SUPABASE_URL"]!, env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]!);
const APPLY = process.argv.includes("--apply");

async function main() {
  const PROD_IDS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];

  // Fetch ALL penjualan for production products
  const { data: all, error } = await supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, variant")
    .in("produk_id", PROD_IDS)
    .order("tanggal", { ascending: false });

  if (error || !all) {
    console.error("Gagal fetch penjualan:", error);
    process.exit(1);
  }

  console.log(`Total records: ${all.length}`);

  // Group by (outlet_id, tanggal, produk_id, variant)
  const groups = new Map<string, any[]>();
  for (const r of all) {
    const key = `${r.outlet_id}|${r.tanggal}|${r.produk_id}|${r.variant ?? "-"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  let totalDupes = 0;
  const idsToDelete: string[] = [];

  for (const [key, records] of groups) {
    if (records.length <= 1) continue;
    totalDupes += records.length - 1;
    // Keep the first one (most recent due to ordering), delete the rest
    const [keep, ...dups] = records;
    idsToDelete.push(...dups.map((r) => r.id));
    if (!APPLY) {
      const [outlet, tgl, produk, variant] = key.split("|");
      console.log(`  DUP: ${outlet} ${tgl} ${produk} v=${variant} → keep ${keep.id.slice(0,8)}, delete ${dups.length} dups`);
    }
  }

  console.log(`\n${totalDupes} duplicate records found.`);

  if (totalDupes === 0) {
    console.log("Tidak ada duplikat. Selesai.");
    return;
  }

  if (!APPLY) {
    console.log(`\nDry run. Tambah --apply untuk menghapus ${totalDupes} record.`);
    return;
  }

  // Delete in batches of 100
  let deleted = 0;
  for (let i = 0; i < idsToDelete.length; i += 100) {
    const batch = idsToDelete.slice(i, i + 100);
    const { error: delErr } = await supabase.from("penjualan").delete().in("id", batch);
    if (delErr) {
      console.error(`Gagal hapus batch ${i}:`, delErr);
    } else {
      deleted += batch.length;
    }
  }

  console.log(`\n✅ ${deleted} duplicate records berhasil dihapus.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
