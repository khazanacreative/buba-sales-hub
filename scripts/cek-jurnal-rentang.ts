/**
 * CEK JURNAL — read-only. Tampilkan semua jurnal dalam rentang 08-08 s/d 12-08
 * (semua ref) untuk verifikasi keberadaan OUT-SALES.
 *   npx tsx scripts/cek-jurnal-rentang.ts
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
  const DARI = "2026-08-08";
  const SAMPAI = "2026-08-12";

  const { data: all, error: e1 } = await supabase
    .from("jurnal")
    .select("id, tanggal, ref, akun, tipe, jumlah")
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI)
    .order("tanggal", { ascending: true });
  if (e1) { console.error("❌ Query jurnal:", e1.message); process.exit(1); }

  console.log(`Jurnal ${DARI} s/d ${SAMPAI}: ${all?.length || 0} baris\n`);
  (all || []).forEach((j: any) => {
    console.log(`  ${j.tanggal} | ref=${j.ref} | ${j.tipe} ${j.akun} | Rp ${(j.jumlah || 0).toLocaleString()}`);
  });

  const outSales = (all || []).filter((j: any) => j.ref === "OUT-SALES");
  console.log(`\nOUT-SALES: ${outSales.length} baris (${new Set(outSales.map((j: any) => j.tanggal)).size} tanggal)`);
}

main();
