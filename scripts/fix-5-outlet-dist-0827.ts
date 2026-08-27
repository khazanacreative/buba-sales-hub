/**
 * PERBAIKAN: 5 Outlet Hilang Distribusi 27 Agustus 2026
 *
 * Masalah: Outlet Kesambi, Permata, Sidohwayah, Sidokare, MCA tidak
 * muncul distribusinya di tanggal 27 Agustus sehingga tidak bisa input OH.
 *
 * Penyebab: Data permohonan_stok terpotong aturan 1000 baris Supabase
 * sehingga record untuk 5 outlet tersebut tidak termuat di state aplikasi.
 *
 * Solusi: Cek dan buat record permohonan_stok untuk 5 outlet tersebut
 * dengan status "Disetujui" berdasarkan pola outlet lain di tanggal yang sama.
 *
 * Cara pakai: npx tsx scripts/fix-5-outlet-dist-0827.ts
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

const TARGET_DATE = "2026-08-27";
const MISSING_OUTLETS = ["Kesambi", "Permata", "Sidohwayah", "Sidokare", "MCA"];
const PROD_IDS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];

const uid = () => Math.random().toString(36).slice(2, 10);

async function main() {
  console.log(`=== PERBAIKAN DISTRIBUSI 5 OUTLET (${TARGET_DATE}) ===\n`);

  // 1. Load outlets
  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletMap = new Map((outlets || []).map((o: any) => [o.nama, o.id]));
  const missingIds = MISSING_OUTLETS.map((n) => ({ nama: n, id: outletMap.get(n) })).filter((o) => o.id);
  console.log(`Outlet yang perlu diperiksa:`);
  missingIds.forEach((o) => console.log(`  - ${o.nama} (${o.id})`));

  // 2. Check existing permohonan_stok for target date
  const { data: existing } = await supabase
    .from("permohonan_stok")
    .select("id, outlet_id, produk_id, qty, status, tanggal_kirim, catatan")
    .eq("tanggal_kirim", TARGET_DATE);

  const existingMap = new Map<string, any>();
  (existing || []).forEach((r: any) => {
    existingMap.set(`${r.outlet_id}|${r.produk_id}`, r);
  });

  console.log(`\nRecord existing untuk ${TARGET_DATE}: ${(existing || []).length}`);

  // 3. Check which outlets/produk are missing
  const missingRecords: any[] = [];
  const statusFixes: any[] = [];

  for (const outlet of missingIds) {
    for (const prodId of PROD_IDS) {
      const key = `${outlet.id}|${prodId}`;
      const rec = existingMap.get(key);

      if (!rec) {
        missingRecords.push({ outletId: outlet.id, outletName: outlet.nama, produkId: prodId });
      } else if (rec.status !== "Disetujui") {
        statusFixes.push({ id: rec.id, outletName: outlet.nama, produkId: prodId, oldStatus: rec.status });
      }
    }
  }

  if (missingRecords.length === 0 && statusFixes.length === 0) {
    console.log("\n✅ Semua 5 outlet sudah memiliki distribusi Disetujui. Tidak ada yang perlu diperbaiki.");
    return;
  }

  // 4. Find reference outlet (one that HAS distribution) to copy pattern
  const refOutlet = (existing || []).find((r: any) =>
    r.status === "Disetujui" && PROD_IDS.includes(r.produk_id) && !missingIds.some((m) => m.id === r.outlet_id)
  );

  if (missingRecords.length > 0) {
    console.log(`\n📋 Record yang HILANG (${missingRecords.length}):`);
    missingRecords.forEach((r) => console.log(`  ❌ ${r.outletName} → ${r.produkId}`));

    if (!refOutlet) {
      console.log("\n⚠️ Tidak ada referensi outlet dengan distribusi Disetujui. Membuat record dengan qty=0.");
    } else {
      console.log(`\nGunakan referensi dari outlet lain untuk pola distribusi.`);
    }

    // Insert missing records
    const inserts = missingRecords.map((r) => {
      // Find reference qty from other outlets
      const refRec = (existing || []).find(
        (e: any) => e.produk_id === r.produkId && e.status === "Disetujui" && e.outlet_id !== r.outletId
      );
      const qty = refRec ? refRec.qty : 0;
      const catatan = refRec ? refRec.catatan : "";

      return {
        id: uid(),
        tanggal: TARGET_DATE,
        tanggal_kirim: TARGET_DATE,
        outlet_id: r.outletId,
        produk_id: r.produkId,
        qty,
        qty_rencana: qty,
        status: "Disetujui",
        catatan,
        catatan_rencana: catatan,
      };
    });

    console.log(`\n🔄 Menyimpan ${inserts.length} record baru...`);
    const { error } = await supabase.from("permohonan_stok").insert(inserts);
    if (error) {
      console.error("❌ Gagal insert:", error.message);
    } else {
      console.log(`✅ Berhasil menyimpan ${inserts.length} record permohonan_stok.`);
    }
  }

  // 5. Fix status for records that exist but aren't Disetujui
  if (statusFixes.length > 0) {
    console.log(`\n📋 Record yang STATUSNYA salah (${statusFixes.length}):`);
    statusFixes.forEach((r) => console.log(`  ⚠️ ${r.outletName} → ${r.produkId} (status: ${r.oldStatus} → Disetujui)`));

    for (const fix of statusFixes) {
      const { error } = await supabase
        .from("permohonan_stok")
        .update({ status: "Disetujui" })
        .eq("id", fix.id);
      if (error) {
        console.error(`  ❌ Gagal update ${fix.outletName}/${fix.produkId}:`, error.message);
      } else {
        console.log(`  ✅ ${fix.outletName}/${fix.produkId} → Disetujui`);
      }
    }
  }

  // 6. Verify
  console.log("\n🔍 Verifikasi...");
  const { data: verify } = await supabase
    .from("permohonan_stok")
    .select("outlet_id, produk_id, status, qty")
    .eq("tanggal_kirim", TARGET_DATE);

  for (const outlet of missingIds) {
    const records = (verify || []).filter((r: any) => r.outlet_id === outlet.id);
    const disetujui = records.filter((r: any) => r.status === "Disetujui");
    console.log(`  ${outlet.nama}: ${disetujui.length}/${PROD_IDS.length} produk Disetujui`);
  }

  console.log("\n✅ Selesai. Silakan refresh aplikasi dan cek tab Sisa (OH).");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
