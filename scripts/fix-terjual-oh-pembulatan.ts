/**
 * FIX TERJUAL OH BUBUR & NASI TIM — pembulatan SETELAH gramasi (aturan baru).
 *
 * qty (terjual) pada record penjualan Bubur/Nasi Tim dihitung ulang dengan:
 *   Terjual = (Stok Awal gr − OH gr) ÷ Gram Pembulatan, dibulatkan biasa
 *   Stok Awal gr      = distribusi Disetujui (per varian) × Gram Pembulatan
 *   Gram Pembulatan   = Bubur 118 gr, Nasi Tim 108 gr
 *   OH (sisa_gram)    = TIDAK diubah — tetap nilai asli yang diinput outlet.
 *   total             = disetel ulang = qty × harga (agar konsisten).
 *
 * Contoh Kenongo 12-8 (bubur): 12 cup → 1.416g − OH 149g = 1.267g;
 *   1.267 ÷ 118 = 10,737 → terjual 11 (dulu 10).
 * Contoh Kesambi 12-8 (tim): 12 cup → 1.296g − OH 213g = 1.083g;
 *   1.083 ÷ 108 = 10,028 → terjual 10 (dulu 11).
 *
 * Cara pakai:
 *   npx tsx scripts/fix-terjual-oh-pembulatan.ts                      (DRY-RUN, Agustus)
 *   npx tsx scripts/fix-terjual-oh-pembulatan.ts --apply              (menulis ke DB)
 *   npx tsx scripts/fix-terjual-oh-pembulatan.ts --dari 2026-08-01 --sampai 2026-08-12 --apply
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

// ==== Konfigurasi ====
// Gram per cup utk pembulatan hitung terjual (aturan baru): Bubur 118, Nasi Tim 108.
const GRAM_PEMBULATAN: Record<string, number> = { "p-bubur": 118, "p-nasitim": 108 };
const VARIANT_PREFIX: Record<string, string> = { "p-bubur": "bubur", "p-nasitim": "tim" };
const VARIANTS = ["bubur_d", "bubur_i", "tim_d", "tim_i"];

const today = new Date();
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
};
const DARI = arg("--dari") || "2026-08-01";
const SAMPAI = arg("--sampai") || todayISO;

// Rumus baru: Terjual = (Dist × G − OH) ÷ G, dibulatkan biasa, clamp [0, Dist].
const hitungTerjualOh = (distCups: number, ohGram: number, gpc: number): number => {
  const dist = Math.max(0, Number(distCups) || 0);
  const oh = Math.max(0, Number(ohGram) || 0);
  if (dist <= 0) return 0;
  return Math.max(0, Math.min(Math.round((dist * gpc - oh) / gpc), dist));
};

// Split [D:x,I:y] dari catatan; fallback ke r.qty utk data lama tanpa format split.
const parseSplit = (catatan?: string | null) => {
  const m = catatan?.match(/D:(\d+),I:(\d+)/);
  return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 };
};

async function main() {
  const APPLY = process.argv.includes("--apply");
  console.log("=== FIX TERJUAL OH — pembulatan setelah gramasi (Bubur 118 / Tim 108) ===");
  console.log(`Rentang: ${DARI} s/d ${SAMPAI}`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  const { data: sales, error: errSales } = await supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, variant, qty, harga, total, sisa_gram")
    .in("produk_id", ["p-bubur", "p-nasitim"])
    .gte("tanggal", DARI)
    .lte("tanggal", SAMPAI);
  if (errSales) { console.error("❌ Query penjualan:", errSales.message); process.exit(1); }

  const { data: dists, error: errDists } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, status, catatan")
    .in("produk_id", ["p-bubur", "p-nasitim"])
    .eq("status", "Disetujui")
    .gte("tanggal_kirim", DARI)
    .lte("tanggal_kirim", SAMPAI);
  if (errDists) { console.error("❌ Query permohonan_stok:", errDists.message); process.exit(1); }

  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const oNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  // Distribusi Disetujui per (outlet, tanggal, produk, varian)
  const distMap = new Map<string, number>();
  (dists || []).forEach((r: any) => {
    const sp = parseSplit(r.catatan);
    const pre = VARIANT_PREFIX[r.produk_id];
    if (!pre) return;
    const hasSplit = /D:\d+,I:\d+/.test(r.catatan || "");
    distMap.set(`${r.outlet_id}|${r.tanggal_kirim}|${r.produk_id}|${pre}_d`,
      (distMap.get(`${r.outlet_id}|${r.tanggal_kirim}|${r.produk_id}|${pre}_d`) || 0) + (hasSplit ? sp.d : r.qty));
    distMap.set(`${r.outlet_id}|${r.tanggal_kirim}|${r.produk_id}|${pre}_i`,
      (distMap.get(`${r.outlet_id}|${r.tanggal_kirim}|${r.produk_id}|${pre}_i`) || 0) + (hasSplit ? sp.i : 0));
  });

  const changes: { rec: any; newQty: number; newTotal: number; dist: number }[] = [];
  let checked = 0;
  let skippedNoDist = 0;
  let skippedNoSisa = 0;
  let skippedNoVariant = 0;

  for (const p of (sales || [])) {
    if (!VARIANTS.includes(p.variant)) { skippedNoVariant++; continue; }
    if (p.sisa_gram === null || p.sisa_gram === undefined) { skippedNoSisa++; continue; }
    const gpc = GRAM_PEMBULATAN[p.produk_id];
    if (!gpc) { skippedNoVariant++; continue; }
    checked++;
    const dist = distMap.get(`${p.outlet_id}|${p.tanggal}|${p.produk_id}|${p.variant}`) ?? 0;
    if (dist <= 0) { skippedNoDist++; continue; }
    const newQty = hitungTerjualOh(dist, p.sisa_gram, gpc);
    const newTotal = newQty * p.harga;
    if (newQty !== p.qty || newTotal !== (p.total ?? 0)) {
      changes.push({ rec: p, newQty, newTotal, dist });
    }
  }

  console.log(`Record bubur/tim dicek: ${checked} (skip tanpa sisa: ${skippedNoSisa}, tanpa varian: ${skippedNoVariant}, tanpa distribusi: ${skippedNoDist})`);
  console.log(`Perubahan yang akan dilakukan: ${changes.length}\n`);

  changes.forEach(({ rec: p, newQty, newTotal, dist }) => {
    const gpc = GRAM_PEMBULATAN[p.produk_id];
    const sebelum = p.qty;
    const stokGr = dist * gpc;
    const ratio = ((stokGr - p.sisa_gram) / gpc).toFixed(4);
    const nama = oNames.get(p.outlet_id) || p.outlet_id;
    console.log(
      `  ${p.tanggal} | ${nama.padEnd(16)} | ${(p.produk_id === "p-bubur" ? "Bubur " : "Tim   ")} ${p.variant.replace(/^[a-z]+_/, "")} | ` +
      `dist ${dist} cup (${stokGr}g) − OH ${p.sisa_gram}g → ${ratio} → terjual ${sebelum} → ${newQty} (total ${p.harga}×${newQty} = Rp ${newTotal.toLocaleString()})`
    );
  });

  if (changes.length === 0) {
    console.log("ℹ️  Tidak ada perubahan — semua record sudah konsisten dengan aturan baru.");
    return;
  }

  if (!APPLY) {
    console.log("\n🔍 DRY-RUN selesai. Jalankan dengan --apply untuk menulis ke database.");
    return;
  }

  // ==== MENULIS KE DATABASE ====
  console.log("\nMenulis perubahan...");
  let ok = 0;
  for (const { rec: p, newQty, newTotal } of changes) {
    const { error } = await supabase
      .from("penjualan")
      .update({ qty: newQty, total: newTotal })
      .eq("id", p.id);
    if (error) {
      console.error(`  ❌ ${p.id}: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`✅ Selesai: ${ok}/${changes.length} record diperbarui.`);
}

main();
