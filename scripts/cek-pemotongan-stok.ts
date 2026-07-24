/**
 * Cek apakah pemotongan stok bahan untuk produksi berjalan dengan baik.
 * 
 * Scenario:
 * - Pemotongan untuk 2 hari sekali terpotong misal tanggal 11
 * - Untuk persiapan masak tanggal 12 dan 13
 * - Terpotong saat di tanggal 11
 * - Jadi ketika memasak di tanggal 12 stok masih tersisa di data bahan sebelum tgl 13 diisi
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

async function cekPemotonganStok() {
  console.log("============================================");
  console.log("  VERIFIKASI PEMOTONGAN STOK PRODUKSI");
  console.log("============================================\n");

  // ========= 1. Ambil semua bahan baku =========
  const { data: bahan, error: bErr } = await supabase.from("bahan_baku").select("*").order("id");
  if (bErr) { console.error("Error bahan:", bErr.message); process.exit(1); }

  console.log("=== DAFTAR BAHAN BAKU ===");
  console.log(`Total: ${bahan?.length || 0} bahan\n`);

  // ========= 2. Ambil semua stok movement =========
  const { data: movs, error: mErr } = await supabase
    .from("stok_movement")
    .select("*")
    .order("tanggal", { ascending: true });

  if (mErr) { console.error("Error stok_movement:", mErr.message); process.exit(1); }

  console.log("=== SEMUA STOK MOVEMENT ===");
  console.log(`Total: ${movs?.length || 0} records\n`);

  // Group by keterangan type
  const produksiOutMovs = (movs || []).filter(m => m.keterangan?.includes("Pemakaian Produksi"));
  const returMovs = (movs || []).filter(m => m.tipe === "IN" && (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon")));
  const opnameMovs = (movs || []).filter(m => m.keterangan?.includes("Stok Opname"));
  const otherMovs = (movs || []).filter(m => 
    !m.keterangan?.includes("Pemakaian Produksi") && 
    !(m.tipe === "IN" && (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon"))) &&
    !m.keterangan?.includes("Stok Opname")
  );

  console.log(`  Pemakaian Produksi (OUT):  ${produksiOutMovs.length} records`);
  console.log(`  Retur Bahan/OH Abon (IN):  ${returMovs.length} records`);
  console.log(`  Stok Opname:                ${opnameMovs.length} records`);
  console.log(`  Lainnya:                    ${otherMovs.length} records\n`);

  // ========= 3. Detail Pemakaian Produksi =========
  console.log("=== DETAIL PEMAKAIAN PRODUKSI (OUT) ===");
  if (produksiOutMovs.length === 0) {
    console.log("  (Tidak ada data pemakaian produksi)\n");
  } else {
    // Group by tanggal
    const byDate: Record<string, typeof produksiOutMovs> = {};
    produksiOutMovs.forEach(m => {
      if (!byDate[m.tanggal]) byDate[m.tanggal] = [];
      byDate[m.tanggal].push(m);
    });

    Object.entries(byDate).sort().forEach(([tgl, records]) => {
      console.log(`\n  📅 Tanggal: ${tgl} (${records.length} items)`);
      let totalQty = 0;
      records.forEach(r => {
        const b = bahan?.find(x => x.id === r.bahan_id);
        console.log(`     ${b?.nama || r.bahan_id.padEnd(10)} | ${r.tipe} | qty: ${r.qty} | ${r.keterangan}`);
        totalQty += r.qty;
      });
      console.log(`     Total qty: ${totalQty}`);
    });
    console.log();
  }

  // ========= 4. Hitung saldo setiap bahan =========
  console.log("=== SALDO BAHAN (stok_awal + IN - OUT) ===");
  console.log("  (Semua movement dihitung tanpa filter tanggal)\n");
  
  const hasil: { id: string; nama: string; satuan: string; stokAwal: number; totalIN: number; totalOUT: number; saldo: number }[] = [];

  (bahan || []).forEach(b => {
    let totalIN = 0, totalOUT = 0;
    (movs || []).forEach(m => {
      if (m.bahan_id !== b.id) return;
      if (m.tipe === "IN") totalIN += m.qty;
      else if (m.tipe === "OUT") totalOUT += m.qty;
    });
    const saldo = b.stok_awal + totalIN - totalOUT;
    hasil.push({ id: b.id, nama: b.nama, satuan: b.satuan, stokAwal: b.stok_awal, totalIN, totalOUT, saldo });
  });

  // Sort by saldo (lowest first)
  hasil.sort((a, b) => a.saldo - b.saldo);
  
  console.log("  No | Nama Bahan".padEnd(30) + " | Satuan".padEnd(10) + " | Stok Awal".padEnd(12) + " | Total IN".padEnd(10) + " | Total OUT".padEnd(10) + " | Saldo");
  console.log("  " + "-".repeat(95));
  hasil.forEach((h, i) => {
    console.log(`  ${(i+1).toString().padStart(2)} | ${h.nama.padEnd(24)}  | ${h.satuan.padEnd(8)}  | ${h.stokAwal.toString().padStart(8)}  | ${h.totalIN.toString().padStart(8)}  | ${h.totalOUT.toString().padStart(8)}  | ${h.saldo}`);
  });
  console.log();

  // ========= 5. Cek scenario: Apakah pemotongan untuk 2 hari kerja terpotong di tanggal yang tepat? =========
  console.log("=== VERIFIKASI SKENARIO ===");
  console.log("  Scenario: Pemotongan untuk persiapan masak tanggal 12 & 13 terpotong di tanggal 11\n");

  // Cari semua tanggal yang ada di Pemakaian Produksi
  const produksiTanggal = [...new Set(produksiOutMovs.map(m => m.tanggal))].sort();
  console.log(`  Tanggal pemakaian produksi: ${produksiTanggal.join(", ") || "(tidak ada)"}`);

  // Cek apakah ada data produksi (produksi table)
  const { data: produksiData, error: pErr } = await supabase.from("produksi").select("tanggal, produk_id, qty_realisasi").order("tanggal");
  if (pErr) { console.error("Error produksi:", pErr.message); }
  else {
    const produksiTanggalList = [...new Set((produksiData || []).map(p => p.tanggal))].sort();
    console.log(`  Tanggal produksi aktual: ${produksiTanggalList.join(", ") || "(tidak ada)"}`);

    // Cek apakah setiap tanggal produksi memiliki OUT movement
    console.log("\n  Cross-check: Apakah setiap tanggal produksi punya pemotongan stok?");
    produksiTanggalList.forEach(tgl => {
      const hasMov = produksiOutMovs.some(m => m.tanggal === tgl);
      console.log(`     ${tgl}: ${hasMov ? "✅ Ada pemotongan" : "❌ TIDAK ada pemotongan!"}`);
    });
  }

  // ========= 6. Verifikasi khusus: Cek urutan waktu =========
  console.log("\n=== VERIFIKASI URUTAN WAKTU ===");
  console.log("  Apakah pemotongan terjadi SEBELUM produksi aktual?\n");

  // Cek permohonan_stok (rencana produksi)
  const { data: permohonan, error: psErr } = await supabase
    .from("permohonan_stok")
    .select("*")
    .order("tanggal_kirim", { ascending: true });

  if (psErr) { console.error("Error permohonan_stok:", psErr.message); }
  else if (permohonan && permohonan.length > 0) {
    const planTanggal = [...new Set(permohonan.map(p => p.tanggal_kirim))].sort();
    console.log(`  Tanggal kirim (rencana distribusi): ${planTanggal.join(", ")}`);
    console.log(`  Tanggal dibuat: ${[...new Set(permohonan.map(p => p.tanggal))].sort().join(", ")}`);
    
    // Cek apakah tanggal dibuat (permohonan.tanggal) lebih awal dari tanggal kirim
    console.log("\n  Verifikasi: rencana dibuat sebelum tanggal kirim?");
    let allGood = true;
    permohonan.forEach(p => {
      const isBefore = p.tanggal <= p.tanggal_kirim;
      if (!isBefore) {
        console.log(`     ❌ ${p.tanggal} -> ${p.tanggal_kirim}: rencana dibuat SETELAH tanggal kirim!`);
        allGood = false;
      }
    });
    if (allGood) console.log("     ✅ Semua rencana dibuat sebelum/sama dengan tanggal kirim");
  } else {
    console.log("  (Tidak ada permohonan stok)\n");
  }

  // ========= 7. Ringkasan =========
  console.log("\n============================================");
  console.log("  RINGKASAN");
  console.log("============================================\n");

  const issues: string[] = [];

  if (produksiOutMovs.length === 0) issues.push("❌ Tidak ada pemotongan stok produksi sama sekali!");
  
  // Cek apakah ada pemakaian produksi yang tanggalnya SAMA dengan tanggal produksi (bukan sebelum)
  if (produksiData && produksiData.length > 0 && produksiOutMovs.length > 0) {
    const prodDates = [...new Set(produksiData.map(p => p.tanggal))];
    const movDates = [...new Set(produksiOutMovs.map(m => m.tanggal))];
    
    // Cek apakah ada tanggal produksi yang tidak ada pemotongan di H-1
    prodDates.forEach(tgl => {
      const prevDay = new Date(tgl);
      prevDay.setDate(prevDay.getDate() - 1);
      const prevDayStr = prevDay.toISOString().slice(0, 10);
      
      // The movement could be on the same day or the previous day
      const hasMovOnDay = movDates.includes(tgl);
      const hasMovPrevDay = movDates.includes(prevDayStr);
      
      if (!hasMovOnDay && !hasMovPrevDay) {
        issues.push(`❌ Produksi tanggal ${tgl} tidak punya pemotongan stok (H-0 atau H-1)!`);
      }
    });
  }

  if (issues.length === 0) {
    console.log("  ✅ Semua pemotongan stok berjalan dengan baik!");
    console.log("  ✅ Stok bahan terpotong sesuai dengan tanggal produksi.");
    console.log("  ✅ Saldo bahan (stok_awal + IN - OUT) mencerminkan ketersediaan stok secara real-time.");
    console.log(`\n  Total ${produksiOutMovs.length} pemotongan stok OUT untuk produksi.`);
    console.log(`  Total ${returMovs.length} stok IN untuk retur bahan/OH.`);
  } else {
    issues.forEach(issue => console.log(`  ${issue}`));
  }

  console.log("\n  NOTE: Fungsi saldoBahan() TIDAK memfilter berdasarkan tanggal.");
  console.log("  Semua movement (IN/OUT) langsung mempengaruhi saldo saat dicatat.");
  console.log("  Jadi meskipun pemotongan dicatat di tanggal 12 (hari masak),");
  console.log("  saldo sudah langsung berkurang saat itu juga (TIDAK menunggu tanggal).");

  process.exit(0);
}

cekPemotonganStok().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
