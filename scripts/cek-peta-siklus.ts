/**
 * DIAGNOSTIK READ-ONLY — peta data Juli-Agustus 2026: tanggal dengan jurnal OUT-SALES,
 * penjualan, dan produksi. Untuk memverifikasi tanggal mana siklusnya tertutup.
 *   npx tsx scripts/cek-peta-siklus.ts
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
  const DARI = "2026-07-01";
  const SAMPAI = "2026-08-31";

  const { data: jurnal, error: e1 } = await supabase
    .from("jurnal")
    .select("tanggal, ref")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (e1) { console.error("❌ Query jurnal:", e1.message); process.exit(1); }
  const outSales = new Set((jurnal || []).filter((j: any) => j.ref === "OUT-SALES").map((j: any) => j.tanggal));

  const { data: penjualan, error: e2 } = await supabase
    .from("penjualan")
    .select("tanggal")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (e2) { console.error("❌ Query penjualan:", e2.message); process.exit(1); }
  const salesDates = new Set((penjualan || []).map((p: any) => p.tanggal));

  const { data: produksi, error: e3 } = await supabase
    .from("produksi")
    .select("tanggal")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (e3) { console.error("❌ Query produksi:", e3.message); process.exit(1); }
  const prodDates = new Set((produksi || []).map((p: any) => p.tanggal));

  console.log(`Peta data ${DARI} s/d ${SAMPAI}:\n`);
  console.log("  Tanggal dgn OUT-SALES (siklus TERTUTUP):");
  [...outSales].sort().forEach((t) => console.log(`    ${t}`));
  if (!outSales.size) console.log("    (tidak ada)");

  console.log("\n  Tanggal dgn penjualan (per produk tercatat):");
  [...salesDates].sort().forEach((t) => console.log(`    ${t}`));
  if (!salesDates.size) console.log("    (tidak ada)");

  console.log("\n  Tanggal dgn produksi:");
  [...prodDates].sort().forEach((t) => console.log(`    ${t}`));
  if (!prodDates.size) console.log("    (tidak ada)");

  console.log("\n  Tanggal produksi TANPA OUT-SALES (siklus TERBUKA):");
  const open = [...prodDates].sort().filter((t) => !outSales.has(t));
  open.forEach((t) => console.log(`    ${t}`));
  if (!open.length) console.log("    (semua tertutup)");
}

main();
