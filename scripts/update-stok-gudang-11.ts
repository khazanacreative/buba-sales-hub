/**
 * Update Stok Gudang per Tanggal 11 (Juli 2026)
 * 
 * Script ini akan menyesuaikan stok gudang ke nilai target
 * dengan mencatat stok movement (IN/OUT) bertanggal 2026-07-11.
 * 
 * Cara menjalankan:
 *   npx tsx scripts/update-stok-gudang-11.ts
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

// === TARGET STOK per Tanggal 11 (Juli 2026) ===
// Mapping: nama_bahan => { targetQty, id }
const TARGETS: Record<string, { id: string; target: number; label: string }> = {
  Abon:    { id: "b-ab01",    target: 41,   label: "Abon (pcs)" },
  Sendok:  { id: "b-sen01",   target: 22,   label: "Sendok (Pack)" },
  Tisyu:   { id: "b-ts01",    target: 10,   label: "Tisyu (pcs)" },
  Kresek:  { id: "b-krs01",   target: 23,   label: "Kresek (PACK)" },
  Oat:     { id: "b-oat01",   target: 17,   label: "Oat (sachet)" },
  Puding:  { id: "b-pud01",   target: 27,   label: "Puding (sachet)" },
  Beras:   { id: "b-brs01",   target: 7,    label: "Beras (Pack)" },
  Daging:  { id: "b-dg01",    target: 34,   label: "Daging (sachet)" },
  Ayam:    { id: "b-ay01",    target: 10,   label: "Ayam (sachet)" },
  Salmon:  { id: "b-sl01",    target: 4,    label: "Salmon (sachet)" },
  Dori:    { id: "b-dr01",    target: 6,    label: "Dori (sachet)" },
  Gurami:  { id: "b-gr01",    target: 10,   label: "Gurami (sachet)" },
  Kakap:   { id: "b-kk01",    target: 11,   label: "Kakap (sachet)" },
  Tengiri: { id: "b-tg01",    target: 7,    label: "Tengiri (sachet)" },
  Tuna:    { id: "b-tn01",    target: 0,    label: "Tuna (sachet)" },
  "Cup Bubur": { id: "b-cb01",   target: 1658, label: "Cup Bubur (biji)" },
  "Cup Oat":   { id: "b-cupoat1", target: 76,  label: "Cup Oat (biji)" },
  "Cup Puding": { id: "b-cuppud01", target: 168, label: "Cup Puding (biji)" },
};

const TANGGAL = "2026-07-11";

async function getCurrentStock(bahanId: string): Promise<number> {
  // Get the bahan record
  const { data: bahan, error: bErr } = await supabase
    .from("bahan_baku")
    .select("stok_awal")
    .eq("id", bahanId)
    .single();

  if (bErr || !bahan) {
    console.error(`  ERROR fetching bahan ${bahanId}:`, bErr?.message);
    return -1;
  }

  let saldo = bahan.stok_awal;

  // Get all stock movements for this bahan
  const { data: movs, error: mErr } = await supabase
    .from("stok_movement")
    .select("tipe, qty")
    .eq("bahan_id", bahanId);

  if (mErr) {
    console.error(`  ERROR fetching movements for ${bahanId}:`, mErr.message);
    return -1;
  }

  if (movs) {
    for (const m of movs) {
      saldo += m.tipe === "IN" ? m.qty : -m.qty;
    }
  }

  return saldo;
}

async function updateStok() {
  console.log("========================================");
  console.log("  UPDATE STOK GUDANG per Tanggal 11");
  console.log("========================================\n");

  const movements: { bahan_id: string; tanggal: string; tipe: "IN" | "OUT"; qty: number; keterangan: string }[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const [nama, info] of Object.entries(TARGETS)) {
    const current = await getCurrentStock(info.id);
    if (current < 0) {
      console.log(`❌ ${nama.padEnd(12)} GAGAL cek stok`);
      continue;
    }

    const diff = info.target - current;

    if (diff === 0) {
      console.log(`✔️  ${nama.padEnd(12)} Stok sudah ${info.target} ${info.label.split("(")[1]?.replace(")", "") || ""} (tidak perlu diubah)`);
      continue;
    }

    const tipe = diff > 0 ? "IN" : "OUT";
    const qty = Math.abs(diff);
    const direction = diff > 0 ? "naik" : "turun";

    movements.push({
      bahan_id: info.id,
      tanggal: TANGGAL,
      tipe,
      qty,
      keterangan: `Stok Opname: ${nama} dari ${current} ke ${info.target} (${direction} ${qty})`
    });

    if (tipe === "IN") totalIn += qty;
    else totalOut += qty;

    console.log(`📦 ${nama.padEnd(12)} Stok: ${current} → ${info.target} (${tipe} ${qty})`);
  }

  if (movements.length === 0) {
    console.log("\n✅ Semua stok sudah sesuai target. Tidak ada perubahan.");
    return;
  }

  console.log(`\n--- RINGKASAN ---`);
  console.log(`Total IN:  ${totalIn} items`);
  console.log(`Total OUT: ${totalOut} items`);
  console.log(`Total movement records: ${movements.length}`);

  // Simpan ke database
  console.log(`\n📝 Menyimpan ${movements.length} stok movement ke database...`);

  const BATCH_SIZE = 20;
  let saved = 0;

  for (let i = 0; i < movements.length; i += BATCH_SIZE) {
    const batch = movements.slice(i, i + BATCH_SIZE);
    const records = batch.map((m) => ({
      id: uid(),
      tanggal: m.tanggal,
      bahan_id: m.bahan_id,
      tipe: m.tipe,
      qty: m.qty,
      keterangan: m.keterangan
    }));

    const { error } = await supabase.from("stok_movement").insert(records);
    if (error) {
      console.error(`  ERROR batch ${i + 1}-${i + batch.length}:`, error.message);
    } else {
      saved += batch.length;
      console.log(`  ✅ Batch ${i + 1}-${i + batch.length} tersimpan (${saved}/${movements.length})`);
    }
  }

  console.log(`\n========================================`);
  console.log(`  ✅ Selesai! ${saved}/${movements.length} movement tersimpan.`);
  console.log(`  Semua stok bertanggal ${TANGGAL}`);
  console.log(`  Refresh halaman Stok Gudang untuk melihat perubahan.`);
  console.log(`========================================`);
}

updateStok().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
