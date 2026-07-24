/**
 * Buka Semua Tutup Siklus
 * 
 * Hapus record yang dibuat saat saveStep5 (tutup siklus):
 * 1. stok_movement IN: "Retur Bahan Baku*" dan "OH abon*"
 * 2. jurnal: ref = "OUT-SALES"
 * 
 * Data penjualan TIDAK dihapus — agar bisa diedit ulang.
 * Setelah ini, admin bisa mengubah data dan menutup siklus lagi.
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const uid = () => Math.random().toString(36).slice(2, 10);

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

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]);

async function bukaSiklus() {
  console.log("=== BUKA SEMUA TUTUP SIKLUS ===\n");

  // ========= STEP 1: Hapus stok_movement Retur/OH =========
  console.log("1. Mencari stok_movement IN (Retur Bahan / OH abon)...");
  
  const { data: returMov, error: rmErr } = await supabase
    .from("stok_movement")
    .select("id, tanggal, bahan_id, qty, keterangan")
    .eq("tipe", "IN")
    .or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%")
    .order("tanggal", { ascending: false });

  if (rmErr) {
    console.error("  ERROR query:", rmErr.message);
    return;
  }

  if (!returMov || returMov.length === 0) {
    console.log("  ℹ️  Tidak ada stok_movement Retur/OH ditemukan");
  } else {
    console.log(`  Ditemukan ${returMov.length} records dari ${new Set(returMov.map(r => r.tanggal)).size} tanggal:`);
    
    const grouped: Record<string, typeof returMov> = {};
    returMov.forEach(r => {
      if (!grouped[r.tanggal]) grouped[r.tanggal] = [];
      grouped[r.tanggal].push(r);
    });
    
    Object.entries(grouped).forEach(([tgl, records]) => {
      console.log(`  ${tgl}: ${records.length} records`);
      records.forEach(r => console.log(`    id=${r.id}, ${r.bahan_id} qty=${r.qty}, "${r.keterangan?.substring(0, 50)}"`));
    });

    // Konfirmasi
    console.log(`\n  >>> Akan menghapus ${returMov.length} records stok_movement`);

    const ids = returMov.map(r => r.id);
    const batchSize = 50;
    let deleted = 0;
    
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { error: delErr } = await supabase.from("stok_movement").delete().in("id", batch);
      if (delErr) {
        console.error(`  ERROR batch ${i}-${i + batch.length}: ${delErr.message}`);
      } else {
        deleted += batch.length;
      }
    }
    console.log(`  ✅ ${deleted} stok_movement berhasil dihapus`);
  }

  // ========= STEP 2: Hapus jurnal OUT-SALES =========
  console.log("\n2. Mencari jurnal OUT-SALES...");
  
  const { data: jurnal, error: jErr } = await supabase
    .from("jurnal")
    .select("id, tanggal, ref, keterangan")
    .eq("ref", "OUT-SALES")
    .order("tanggal", { ascending: false });

  if (jErr) {
    console.error("  ERROR query:", jErr.message);
    return;
  }

  if (!jurnal || jurnal.length === 0) {
    console.log("  ℹ️  Tidak ada jurnal OUT-SALES ditemukan");
  } else {
    console.log(`  Ditemukan ${jurnal.length} records dari ${new Set(jurnal.map(r => r.tanggal)).size} tanggal:`);
    
    const grouped: Record<string, typeof jurnal> = {};
    jurnal.forEach(r => {
      if (!grouped[r.tanggal]) grouped[r.tanggal] = [];
      grouped[r.tanggal].push(r);
    });
    
    Object.entries(grouped).forEach(([tgl, records]) => {
      console.log(`  ${tgl}: ${records.length} records`);
      records.forEach(r => console.log(`    id=${r.id}, "${r.keterangan?.substring(0, 60)}"`));
    });

    const ids = jurnal.map(r => r.id);
    const batchSize = 50;
    let deleted = 0;

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { error: delErr } = await supabase.from("jurnal").delete().in("id", batch);
      if (delErr) {
        console.error(`  ERROR batch ${i}-${i + batch.length}: ${delErr.message}`);
      } else {
        deleted += batch.length;
      }
    }
    console.log(`  ✅ ${deleted} jurnal berhasil dihapus`);
  }

  // ========= VERIFIKASI =========
  console.log("\n=== VERIFIKASI ===\n");

  const { data: verifyRm } = await supabase
    .from("stok_movement")
    .select("id")
    .eq("tipe", "IN")
    .or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%")
    .limit(1);
  
  console.log(`StokMov Retur/OH tersisa: ${verifyRm?.length || 0}`);

  const { data: verifyJr } = await supabase
    .from("jurnal")
    .select("id")
    .eq("ref", "OUT-SALES")
    .limit(1);
  
  console.log(`Jurnal OUT-SALES tersisa: ${verifyJr?.length || 0}`);

  console.log(`\n✅ Selesai! Semua siklus sudah dibuka.`);
  console.log(`   Data penjualan tetap aman — bisa diedit ulang di aplikasi.`);
  console.log(`   Jalankan saveStep5 (Tutup Siklus) lagi setelah selesai mengedit.`);
}

bukaSiklus().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
