/**
 * SINKRON OATMEAL OUTLET — selaraskan qty penjualan oatmeal dgn distribusi
 * admin/produksi (permohonan_stok Disetujui).
 *
 * Latar belakang: outlet mencatat penjualan (qty terjual + sisa_gram dlm cup)
 * dari jumlah yang DIDISTRIBUSIKAN oleh admin/produksi. Jika distribusi diubah
 * setelah outlet menyimpan (mis. 08-08: 1 puding ditukar → 1 oat), record lama
 * menjadi tidak sinkron: qty + sisa ≠ dist. Aturan invariant utk item cup:
 *   qty_terjual + sisa_cup = dist
 *
 * Script ini menghitung ulang qty utk SETIAP record penjualan oatmeal:
 *   newQty = max(0, dist − min(sisa, dist))
 *   total  = newQty × harga   (kolom total dipakai tab Rekap & omzet)
 *
 * Sumber distribusi = permohonan_stok ber-status Disetujui (sama dgn logika
 * aplikasi). Idempotent — record yang sudah sinkron tidak berubah.
 *
 * ⚠️ PERHATIAN:
 *  1. HANYA oatmeal (p-oatmeal). Record cup/pcs lain (puding/abon) TIDAK disentuh.
 *  2. Distribusi yang outlet-nya BELUM input OH (tidak ada record penjualan)
 *     TIDAK dibuatkan record — biarkan outlet yang menginput (tanggal terbuka).
 *  3. Jika record yang berubah ada di tanggal siklus TERTUTUP (ada jurnal
 *     OUT-SALES), omzet jurnal harus diregenerasi agar tetap konsisten:
 *     npx tsx scripts/regenerate-jurnal-out-sales.ts --dari=<tgl> --sampai=<tgl> --apply
 *  4. Disarankan backup dulu sebelum --apply: npx tsx scripts/backup-db.ts
 *
 * Cara pakai (DRY-RUN — tidak menulis apa pun):
 *   npx tsx scripts/sinkron-oatmeal-outlet.ts
 *
 * Menulis perubahan ke database:
 *   npx tsx scripts/sinkron-oatmeal-outlet.ts --apply
 *
 * Opsi:
 *   --dari=2026-08-01   (default 2026-08-01)
 *   --sampai=2026-08-18 (default hari ini)
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

const PRODUK = "p-oatmeal";
const GRAM_PER_CUP = 100; // oatmeal — sisa_gram disimpan dlm CUP

async function main() {
  const args = process.argv.slice(2);
  const APPLY = args.includes("--apply");
  const dariArg = args.find((a) => a.startsWith("--dari="));
  const sampaiArg = args.find((a) => a.startsWith("--sampai="));
  const DARI = dariArg ? dariArg.split("=")[1] : "2026-08-01";
  const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : new Date().toISOString().slice(0, 10);

  console.log("=== SINKRON OATMEAL OUTLET — qty = dist − sisa ===");
  console.log(`Rentang: ${DARI} s.d. ${SAMPAI}`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  // 1. Nama outlet (utk laporan terbaca)
  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  // 2. Tanggal siklus tertutup (ada jurnal OUT-SALES)
  const { data: jurnals } = await supabase
    .from("jurnal")
    .select("tanggal")
    .eq("ref", "OUT-SALES")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  const closedDates = new Set((jurnals || []).map((j: any) => j.tanggal));

  // 3. Distribusi oatmeal Disetujui per (tanggal, outlet) → dist
  const { data: dists, error: errD } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, status")
    .eq("produk_id", PRODUK)
    .eq("status", "Disetujui")
    .gte("tanggal_kirim", DARI)
    .lte("tanggal_kirim", SAMPAI);
  if (errD) {
    console.error("❌ Gagal membaca permohonan_stok:", errD.message);
    process.exit(1);
  }

  const distByKey = new Map<string, number>();
  (dists || []).forEach((r: any) => {
    const key = `${r.tanggal_kirim}|${r.outlet_id}`;
    distByKey.set(key, (distByKey.get(key) || 0) + (r.qty || 0));
  });

  // 4. Record penjualan oatmeal
  const { data: sales, error: errS } = await supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, qty, harga, total, sisa_gram, variant")
    .eq("produk_id", PRODUK)
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI)
    .order("tanggal", { ascending: false });
  if (errS) {
    console.error("❌ Gagal membaca penjualan:", errS.message);
    process.exit(1);
  }

  console.log(`Distribusi oatmeal Disetujui: ${(dists || []).length} record | Penjualan oatmeal: ${(sales || []).length} record | Siklus tertutup: ${closedDates.size} tanggal\n`);

  // 5. Hitung ulang qty per record
  const changes: any[] = [];
  const anomalies: string[] = [];
  let unchanged = 0, noDist = 0;

  for (const p of sales || []) {
    const key = `${p.tanggal}|${p.outlet_id}`;
    const dist = distByKey.get(key) ?? 0;

    if (dist <= 0) {
      noDist++;
      continue; // yatim — biarkan, bukan urusan sinkronisasi
    }

    const sisa = Number(p.sisa_gram) || 0; // dlm CUP utk oatmeal
    const newQty = Math.max(0, dist - Math.min(sisa, dist));
    const newTotal = newQty * p.harga;

    if (sisa > dist) {
      anomalies.push(
        `${p.tanggal} | ${outletNames.get(p.outlet_id) || p.outlet_id} | sisa=${sisa} cup MELEBIHI dist=${dist} cup — qty dipaksa 0`
      );
    }

    if (newQty === p.qty) {
      unchanged++;
      continue;
    }

    const isClosed = closedDates.has(p.tanggal);
    changes.push({
      ...p,
      outlet: outletNames.get(p.outlet_id) || p.outlet_id,
      dist,
      sisa,
      newQty,
      newTotal,
      isClosed,
    });
  }

  // 6. Laporan
  changes.forEach((r) => {
    const tag = r.isClosed ? "⚠️ " : "🔄 ";
    console.log(
      `${tag}${r.tanggal} | ${r.outlet} | dist=${r.dist} | sisa=${r.sisa} cup | ` +
      `qty ${r.qty} → ${r.newQty} | total ${(r.qty * r.harga).toLocaleString()} → ${r.newTotal.toLocaleString()}${r.isClosed ? " 🔒" : ""}`
    );
  });
  anomalies.forEach((a) => console.log(`  ⚠️ ANOMALI: ${a}`));

  console.log("\n=== RINGKASAN ===");
  console.log(`  ✅ Sudah sinkron (qty = dist − sisa): ${unchanged}`);
  console.log(`  🔄 Perlu diperbaiki: ${changes.length} baris`);
  if (noDist > 0) console.log(`  ⏭️  Dilewati (tidak ada distribusi Disetujui): ${noDist} baris`);
  if (anomalies.length > 0) console.log(`  ⚠️  Anomali sisa > dist: ${anomalies.length} baris`);
  const changedClosed = changes.filter((c) => c.isClosed).length;
  if (changedClosed > 0) {
    console.log(`  🔒 ${changedClosed} baris di tanggal siklus TERTUTUP — setelah --apply jalankan:`);
    console.log(`     npx tsx scripts/regenerate-jurnal-out-sales.ts --dari=${DARI} --sampai=${SAMPAI} --apply`);
  }

  if (changes.length === 0) {
    console.log("\n👉 Tidak ada yang perlu disinkronkan.");
    return;
  }
  if (!APPLY) {
    console.log(`\n👉 DRY-RUN selesai — ${changes.length} baris akan diubah. Jalankan dengan --apply untuk menulis.`);
    return;
  }

  // 7. Tulis ke database
  console.log(`\n👉 Menulis ${changes.length} baris ke database...`);
  let ok = 0;
  for (const r of changes) {
    const { error } = await supabase
      .from("penjualan")
      .update({ qty: r.newQty, total: r.newTotal })
      .eq("id", r.id);
    if (error) {
      console.error(`  ❌ Gagal update id=${r.id}: ${error.message}`);
    } else {
      ok++;
      console.log(`  ✅ ${r.tanggal} | ${r.outlet} | id=${r.id} | qty ${r.qty} → ${r.newQty} | total → ${r.newTotal.toLocaleString()}`);
    }
  }
  console.log(`\n✅ ${ok}/${changes.length} baris berhasil diperbarui.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
