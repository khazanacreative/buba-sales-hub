/**
 * DIAGNOSTIK READ-ONLY — cek jurnal OUT-SALES, penjualan & produksi untuk 2026-08-05..07.
 *   npx tsx scripts/cek-tanggal-0507.ts
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) { console.error("❌ .env tidak ditemukan"); process.exit(1); }
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) env[m[1]] = (m[2] || "").replace(/^["']|["']$/g, "");
});
const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]);

async function main() {
  const DARI = "2026-08-05";
  const SAMPAI = "2026-08-07";

  // 1. Jurnal
  const { data: jurnal, error: e1 } = await supabase
    .from("jurnal")
    .select("id, tanggal, ref, tipe, akun, jumlah")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI)
    .order("tanggal");
  if (e1) { console.error("❌ Query jurnal:", e1.message); process.exit(1); }
  console.log(`JURNAL ${DARI} s/d ${SAMPAI}: ${jurnal?.length || 0} baris`);
  (jurnal || []).forEach((j: any) => {
    console.log(`  ${j.tanggal} | ${j.ref} | ${j.tipe} ${j.akun} | Rp ${(j.jumlah || 0).toLocaleString()}`);
  });
  const outSalesDates = new Set((jurnal || []).filter((j: any) => j.ref === "OUT-SALES").map((j: any) => j.tanggal));
  console.log(`  Tanggal dgn OUT-SALES: ${outSalesDates.size ? [...outSalesDates].join(", ") : "TIDAK ADA"}`);

  // 2. Penjualan
  const { data: penjualan, error: e2 } = await supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, qty, harga, sisa_gram")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI)
    .order("tanggal");
  if (e2) { console.error("❌ Query penjualan:", e2.message); process.exit(1); }
  const byDate = new Map<string, { n: number; qty: number; omset: number }>();
  (penjualan || []).forEach((p: any) => {
    const rec = byDate.get(p.tanggal) || { n: 0, qty: 0, omset: 0 };
    rec.n += 1;
    rec.qty += Number(p.qty) || 0;
    rec.omset += (Number(p.qty) || 0) * (Number(p.harga) || 0);
    byDate.set(p.tanggal, rec);
  });
  console.log(`\nPENJUALAN ${DARI} s/d ${SAMPAI}: ${penjualan?.length || 0} record`);
  [...byDate.entries()].forEach(([t, r]) => {
    console.log(`  ${t}: ${r.n} record | Σqty=${r.qty} | Σomset=Rp ${r.omset.toLocaleString()}`);
  });
  if (!byDate.size) console.log("  (tidak ada penjualan sama sekali di rentang ini)");

  // 2b. Permohonan stok
  const { data: permohonan, error: e4 } = await supabase
    .from("permohonan_stok")
    .select("id, tanggal, outlet_id, produk_id, qty, status")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI)
    .order("tanggal");
  if (e4) { console.error("❌ Query permohonan:", e4.message); process.exit(1); }
  console.log(`\nPERMOHONAN STOK ${DARI} s/d ${SAMPAI}: ${permohonan?.length || 0} record`);
  const permDates = new Map<string, number>();
  (permohonan || []).forEach((p: any) => permDates.set(p.tanggal, (permDates.get(p.tanggal) || 0) + 1));
  [...permDates.entries()].forEach(([t, n]) => console.log(`  ${t}: ${n} record`));
  if (!permDates.size) console.log("  (tidak ada)");

  // 3. Produksi
  const { data: produksi, error: e3 } = await supabase
    .from("produksi")
    .select("id, tanggal, produk_id, qty_rencana, qty_realisasi")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (e3) { console.error("❌ Query produksi:", e3.message); process.exit(1); }
  const prodDates = new Set((produksi || []).map((p: any) => p.tanggal));
  console.log(`\nPRODUKSI ${DARI} s/d ${SAMPAI}: ${produksi?.length || 0} record (${prodDates.size} tanggal: ${[...prodDates].join(", ") || "-"})`);
}

main();
