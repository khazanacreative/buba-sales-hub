/**
 * DIAGNOSTIK OATMEAL — baca-only. Menampilkan per (tanggal, outlet):
 *   - distribusi (permohonan_stok Disetujui) qty
 *   - record penjualan tersimpan (qty, sisa_gram, variant, harga, total)
 * Sumber data: Supabase via .env.
 *
 * Cara pakai:
 *   npx tsx scripts/diag-oatmeal-sync.ts [dari=2026-08-01] [sampai=2026-08-18]
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
const supabase = createClient(
  env["VITE_SUPABASE_URL"],
  env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]
);

async function main() {
  const args = process.argv.slice(2);
  const dari = args[0] || "2026-07-01";
  const sampai = args[1] || "2026-08-18";

  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  const { data: dists } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, status")
    .eq("produk_id", "p-oatmeal")
    .gte("tanggal_kirim", dari)
    .lte("tanggal_kirim", sampai);
  const approved = (dists || []).filter((r: any) => r.status === "Disetujui");

  const { data: sales } = await supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, qty, harga, total, sisa_gram, variant")
    .eq("produk_id", "p-oatmeal")
    .gte("tanggal", dari)
    .lte("tanggal", sampai)
    .order("tanggal", { ascending: false });

  console.log(`=== OATMEAL ${dari} s.d. ${sampai} ===\n`);

  // Group dist per (tanggal, outlet)
  const distByKey = new Map<string, { total: number; pending: number }>();
  (dists || []).forEach((r: any) => {
    const key = `${r.tanggal_kirim}|${r.outlet_id}`;
    if (!distByKey.has(key)) distByKey.set(key, { total: 0, pending: 0 });
    const rec = distByKey.get(key)!;
    if (r.status === "Disetujui") rec.total += r.qty || 0;
    else rec.pending += r.qty || 0;
  });

  // Sales per (tanggal, outlet)
  const salesByKey = new Map<string, any[]>();
  (sales || []).forEach((p: any) => {
    const key = `${p.tanggal}|${p.outlet_id}`;
    if (!salesByKey.has(key)) salesByKey.set(key, []);
    salesByKey.get(key)!.push(p);
  });

  const keys = new Set([...distByKey.keys(), ...salesByKey.keys()]);
  const sorted = [...keys].sort().reverse();

  for (const key of sorted) {
    const [tanggal, outletId] = key.split("|");
    const dist = distByKey.get(key);
    const recs = salesByKey.get(key) || [];
    const distLabel = dist
      ? `dist=${dist.total}${dist.pending > 0 ? ` (+${dist.pending} pending)` : ""}`
      : "dist=-";
    const salesLabel = recs.length === 0
      ? "  TIDAK ADA RECORD PENJUALAN"
      : recs.map((r: any) => `qty=${r.qty} sisa=${r.sisa_gram}${r.variant ? ` [${r.variant}]` : ""} (${r.id})`).join(" | ");
    const totalSold = recs.reduce((s, r) => s + r.qty, 0);
    const totalSisa = recs.reduce((s, r) => s + (r.sisa_gram || 0), 0);
    const mismatch = dist && dist.total > 0 && (totalSold + totalSisa !== dist.total) && recs.length > 0
      ? "  ⚠️ qty+sisa ≠ dist"
      : "";
    const noInput = dist && dist.total > 0 && recs.length === 0 ? "  ⚠️ BELUM INPUT" : "";
    console.log(`${tanggal} | ${outletNames.get(outletId) || outletId} | ${distLabel} | ${salesLabel}${mismatch}${noInput}`);
  }

  console.log("\n=== SELESAI ===");
}

main().catch((err) => { console.error(err); process.exit(1); });
