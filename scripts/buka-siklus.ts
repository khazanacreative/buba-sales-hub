/**
 * Buka Tutup Siklus (dengan filter tanggal + dry-run)
 *
 * Hapus record yang dibuat saat saveStep5 (tutup siklus):
 * 1. stok_movement IN: "Retur Bahan Baku*" dan "OH abon*"
 * 2. jurnal: ref = "OUT-SALES"
 *
 * Data penjualan TIDAK dihapus — agar bisa diedit ulang.
 * Setelah ini, admin bisa mengubah data dan menutup siklus lagi
 * (jurnal & stok IN retur/OH akan dibuat ulang otomatis saat tutup ulang).
 *
 * Cara pakai:
 *   npx tsx scripts/buka-siklus.ts                              # dry-run, SEMUA tanggal
 *   npx tsx scripts/buka-siklus.ts --dari=2026-08-01 --sampai=2026-08-07   # dry-run rentang 1-7
 *   npx tsx scripts/buka-siklus.ts --dari=2026-08-01 --sampai=2026-08-07 --apply   # eksekusi
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

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const DARI = dariArg ? dariArg.split("=")[1] : null;
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : null;

function dateFilter(query: any, col: string) {
  if (DARI) query = query.gte(col, DARI);
  if (SAMPAI) query = query.lte(col, SAMPAI);
  return query;
}

async function deleteBatch(table: string, ids: string[], label: string) {
  const batchSize = 50;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { error } = await supabase.from(table).delete().in("id", batch);
    if (error) console.error(`  ERROR batch ${i}-${i + batch.length}: ${error.message}`);
    else deleted += batch.length;
  }
  console.log(`  ✅ ${label}: ${deleted} record dihapus`);
}

async function bukaSiklus() {
  const rangeLabel = DARI && SAMPAI ? `${DARI} s.d. ${SAMPAI}` : DARI ? `mulai ${DARI}` : SAMPAI ? `sampai ${SAMPAI}` : "SEMUA tanggal";
  console.log(`=== BUKA TUTUP SIKLUS (${rangeLabel}) ===`);
  console.log(`Mode: ${APPLY ? "✅ EKSEKUSI (--apply)" : "🔍 DRY-RUN (hanya laporan, tidak menghapus)"}\n`);

  // ========= STEP 1: stok_movement IN (Retur Bahan / OH abon) =========
  console.log("1. Mencari stok_movement IN (Retur Bahan / OH abon)...");

  let q1 = supabase
    .from("stok_movement")
    .select("id, tanggal, bahan_id, qty, keterangan")
    .eq("tipe", "IN")
    .or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%")
    .order("tanggal", { ascending: false });
  q1 = dateFilter(q1, "tanggal");
  const { data: returMov, error: rmErr } = await q1;

  if (rmErr) {
    console.error("  ERROR query:", rmErr.message);
    return;
  }

  if (!returMov || returMov.length === 0) {
    console.log("  ℹ️  Tidak ada stok_movement Retur/OH dalam rentang ini");
  } else {
    console.log(`  Ditemukan ${returMov.length} records dari ${new Set(returMov.map((r) => r.tanggal)).size} tanggal:`);
    const grouped: Record<string, typeof returMov> = {};
    returMov.forEach((r) => {
      if (!grouped[r.tanggal]) grouped[r.tanggal] = [];
      grouped[r.tanggal].push(r);
    });
    Object.entries(grouped).forEach(([tgl, records]) => {
      console.log(`  ${tgl}: ${records.length} records`);
      records.forEach((r) => console.log(`    id=${r.id}, ${r.bahan_id} qty=${r.qty}, "${r.keterangan?.substring(0, 50)}"`));
    });
    if (APPLY) {
      await deleteBatch("stok_movement", returMov.map((r) => r.id), "stok_movement");
    } else {
      console.log(`  👉 Akan menghapus ${returMov.length} records stok_movement`);
    }
  }

  // ========= STEP 2: jurnal siklus (OUT-SALES / OUT-OH / OUT-HPP) =========
  console.log("\n2. Mencari jurnal siklus (OUT-SALES/OH/HPP)...");

  let q2 = supabase
    .from("jurnal")
    .select("id, tanggal, ref, keterangan")
    .in("ref", ["OUT-SALES", "OUT-OH", "OUT-HPP"])
    .order("tanggal", { ascending: false });
  q2 = dateFilter(q2, "tanggal");
  const { data: jurnal, error: jErr } = await q2;

  if (jErr) {
    console.error("  ERROR query:", jErr.message);
    return;
  }

  if (!jurnal || jurnal.length === 0) {
    console.log("  ℹ️  Tidak ada jurnal siklus dalam rentang ini");
  } else {
    console.log(`  Ditemukan ${jurnal.length} records dari ${new Set(jurnal.map((r) => r.tanggal)).size} tanggal:`);
    const grouped: Record<string, typeof jurnal> = {};
    jurnal.forEach((r) => {
      if (!grouped[r.tanggal]) grouped[r.tanggal] = [];
      grouped[r.tanggal].push(r);
    });
    Object.entries(grouped).forEach(([tgl, records]) => {
      console.log(`  ${tgl}: ${records.length} records`);
      records.forEach((r) => console.log(`    id=${r.id}, "${r.keterangan?.substring(0, 60)}"`));
    });
    if (APPLY) {
      await deleteBatch("jurnal", jurnal.map((r) => r.id), "jurnal");
    } else {
      console.log(`  👉 Akan menghapus ${jurnal.length} records jurnal`);
    }
  }

  // ========= VERIFIKASI =========
  console.log("\n=== VERIFIKASI ===\n");
  if (APPLY) {
    let v1 = supabase.from("stok_movement").select("id").eq("tipe", "IN").or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%");
    v1 = dateFilter(v1, "tanggal");
    const { data: verifyRm } = await v1;
    let v2 = supabase.from("jurnal").select("id").in("ref", ["OUT-SALES", "OUT-OH", "OUT-HPP"]);
    v2 = dateFilter(v2, "tanggal");
    const { data: verifyJr } = await v2;
    console.log(`StokMov Retur/OH tersisa: ${verifyRm?.length || 0}`);
    console.log(`Jurnal siklus tersisa: ${verifyJr?.length || 0}`);
    console.log(`\n✅ Selesai! Siklus ${rangeLabel} sudah dibuka.`);
    console.log(`   Data penjualan tetap aman — bisa diedit ulang di aplikasi.`);
    console.log(`   Jalankan saveStep5 (Tutup Siklus) lagi setelah selesai mengedit.`);
  } else {
    console.log(`\n👉 DRY-RUN selesai. Jalankan dengan --apply untuk benar-benar membuka siklus ${rangeLabel}.`);
  }
}

bukaSiklus().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
