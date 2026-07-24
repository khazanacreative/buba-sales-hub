/**
 * Fix OH Abon data for 2026-07-03
 *
 * Masalah:
 * - o-sidokare: qty=1, sisa=1 (seharusnya terjual=0, retur=2)
 * - 9 outlet lain: tidak ada record penjualan (seharusnya terjual=0, retur=2)
 * - o-gunung-gangsir & o-mca: sisa=null (sudah diupdate ke 0)
 * - StokMov b-ab01: 15 OH entries + 1 retur qty=19 (double count)
 *
 * Perbaikan:
 * 1. DELETE o-sidokare record yang salah (qty tdk bisa 0 karena constraint)
 *    → display Laporan akan fallback: sold=0, retur=stokAwal
 * 2. DELETE semua stokMov b-ab01 IN, INSERT 1 retur qty=20
 */

const uid = () => Math.random().toString(36).slice(2, 10);

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
const TGL = "2026-07-03";

async function fix() {
  console.log(`=== FIX OH ABON ${TGL} ===\n`);

  // ======== STEP 1: DELETE incorrect o-sidokare record ========
  console.log("1. Menghapus record o-sidokare yang salah...");
  const { data: sidRec } = await supabase
    .from("penjualan")
    .select("id, qty, sisa_gram")
    .eq("tanggal", TGL)
    .eq("outlet_id", "o-sidokare")
    .eq("produk_id", "p-abon")
    .single();

  if (sidRec) {
    console.log(`   Ditemukan: id=${sidRec.id}, qty=${sidRec.qty}, sisa=${sidRec.sisa_gram}`);
    const { error: delErr } = await supabase.from("penjualan").delete().eq("id", sidRec.id);
    if (delErr) {
      console.error(`   ERROR: ${delErr.message}`);
    } else {
      console.log("   ✅ Dihapus. Display akan fallback ke sold=0, retur=2.");
    }
  } else {
    console.log("   ℹ️  Tidak ditemukan (sudah dihapus sebelumnya)");
  }

  // ======== STEP 2: FIX stok_movement b-ab01 ========
  console.log("\n2. Memperbaiki stok_movement b-ab01...");

  // 2a. Delete all existing b-ab01 entries
  const { data: existing } = await supabase
    .from("stok_movement")
    .select("id, qty, keterangan")
    .eq("tanggal", TGL)
    .eq("bahan_id", "b-ab01");

  if (existing && existing.length > 0) {
    console.log(`   Menghapus ${existing.length} entries lama:`);
    existing.forEach((m: any) => console.log(`     id=${m.id}, qty=${m.qty}, ket="${m.keterangan}"`));

    const ids = existing.map((m: any) => m.id);
    const { error: delErr } = await supabase.from("stok_movement").delete().in("id", ids);
    if (delErr) {
      console.error(`   ERROR delete: ${delErr.message}`);
    } else {
      console.log(`   ✅ ${ids.length} entries dihapus`);
    }
  } else {
    console.log("   ℹ️  Tidak ada entries lama");
  }

  // 2b. Insert correct retur: 10 outlets × 2 pcs = 20 pcs
  const { error: insErr } = await supabase.from("stok_movement").insert({
    id: uid(),
    tanggal: TGL,
    bahan_id: "b-ab01",
    tipe: "IN",
    qty: 20,
    keterangan: "Retur Bahan Baku (pcs) [2026-07-03]",
  });
  if (insErr) {
    console.error(`   ERROR insert: ${insErr.message}`);
  } else {
    console.log("   ✅ Insert: IN b-ab01 qty=20 (Retur Bahan Baku (pcs))");
  }

  // ======== VERIFY ========
  console.log("\n=== VERIFIKASI ===\n");

  const { data: penj } = await supabase
    .from("penjualan")
    .select("outlet_id, qty, sisa_gram, variant")
    .eq("tanggal", TGL)
    .eq("produk_id", "p-abon")
    .order("outlet_id");

  console.log(`Penjualan p-abon ${TGL}: ${penj?.length || 0} records`);
  let totalQty = 0, totalSisa = 0;
  penj?.forEach((r: any) => {
    console.log(`  ${r.outlet_id}: qty=${r.qty}, sisa=${r.sisa_gram}, variant=${r.variant}`);
    totalQty += r.qty || 0;
    totalSisa += r.sisa_gram || 0;
  });
  console.log(`  Total terjual=${totalQty}, OH=${totalSisa}`);
  console.log(`  Expected: 2 records (o-gunung-gangsir qty=5, o-mca qty=2)`);

  const { data: stok } = await supabase
    .from("stok_movement")
    .select("tipe, qty, keterangan")
    .eq("tanggal", TGL)
    .eq("bahan_id", "b-ab01");

  console.log(`\nStokMov b-ab01 ${TGL}: ${stok?.length || 0} entries`);
  let totalIn = 0;
  stok?.forEach((m: any) => {
    console.log(`  ${m.tipe}: qty=${m.qty}, ket="${m.keterangan}"`);
    if (m.tipe === "IN") totalIn += m.qty;
  });
  console.log(`  Total IN: ${totalIn} (expected: 20)`);

  console.log("\n✅ SELESAI!");
}

fix().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
