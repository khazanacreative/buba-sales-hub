/**
 * Script: Reset Transaksi
 * Menghapus SEMUA data dari tabel penjualan, produksi, dan stok_movement.
 * Data Master (Outlet, Karyawan, COA, Produk, Bahan Baku) TIDAK terpengaruh.
 *
 * Usage: node scripts/reset-transaksi.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      // Remove quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
    return vars;
  } catch {
    return {};
  }
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL || "https://mrydrongthbximtflbps.supabase.co";
const key = env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWRyb25ndGhieGltdGZsYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTg0ODEsImV4cCI6MjA5NzM3NDQ4MX0.fD09-tBBXi9o37AOB8sgMUhrDG7sSNmyeriZq1VG1Cg";

const supabase = createClient(url, key);

const TABLES = ["penjualan", "produksi", "stok_movement"];

async function countTable(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table}: ${error.message}`);
  return count || 0;
}

async function deleteAll(table) {
  // Use .delete().neq("id", "") to delete all rows with anon key + RLS
  const { error, count } = await supabase.from(table).delete().neq("id", "");
  if (error) throw new Error(`Delete ${table}: ${error.message}`);
  return count || 0;
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  RESET TRANSAKSI — Hapus Data Produksi,     ║");
  console.log("║  Penjualan, dan Stok Movement               ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // Step 1: Count existing data
  console.log("📊 Data saat ini:");
  const counts = {};
  for (const table of TABLES) {
    counts[table] = await countTable(table);
    console.log(`   ${table}: ${counts[table]} records`);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) {
    console.log("\n✅ Semua tabel sudah kosong. Tidak ada yang perlu dihapus.");
    return;
  }

  console.log(`\n⚠️  Total ${total} records akan dihapus PERMANEN.\n`);

  // Step 2: Delete
  console.log("🗑️  Menghapus data...");
  for (const table of TABLES) {
    const deleted = await deleteAll(table);
    console.log(`   ✅ ${table}: ${deleted || counts[table]} records dihapus`);
  }

  // Step 3: Verify
  console.log("\n📊 Verifikasi setelah reset:");
  for (const table of TABLES) {
    const remaining = await countTable(table);
    console.log(`   ${table}: ${remaining} records`);
  }

  console.log("\n✅ Reset transaksi selesai! Master data (Outlet, Karyawan, COA, Produk, Bahan Baku) tetap aman.");
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
