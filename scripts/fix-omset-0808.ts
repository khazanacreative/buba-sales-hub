/**
 * FIX OMSET 2026-08-08 — terapkan angka terjual yang dikonfirmasi user (manual).
 *
 * Untuk tiap outlet yang dikoreksi:
 *   1. qty (terjual) diubah sesuai konfirmasi user.
 *   2. sisa_gram disesuaikan agar KONSISTEN: sisaCups + qty = dist (aturan OH 50g:
 *      sisa ≤ 50g → 0 cup; sisa > 50g → ceil(sisaGram/gramPerCup); cup/pcs → langsung).
 *   3. total disetel = qty × harga untuk SEMUA record outlet tsb (agar tab Rekap
 *      sama dengan Sisa OH & Riwayat).
 *
 * Nilai sisa_gram dipilih pada batas atas cup yang sesuai (mendekati nilai asli):
 *   sisaCups = dist − qty;  sisaGram = sisaCups × gramPerCup (bubur/tim)
 *   sisaCups = dist − qty;  sisaGram = sisaCups (oatmeal/puding/abon)
 *
 * Cara pakai:
 *   npx tsx scripts/fix-omset-0808.ts          (DRY-RUN)
 *   npx tsx scripts/fix-omset-0808.ts --apply  (menulis ke DB)
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

const TANGGAL = "2026-08-08";
const PRODUK_BY_VARIANT: Record<string, string> = {
  bubur_d: "p-bubur", bubur_i: "p-bubur", tim_d: "p-nasitim", tim_i: "p-nasitim",
  oatmeal: "p-oatmeal", puding: "p-puding", abon: "p-abon",
};
const GRAM_BASED = new Set(["p-bubur", "p-nasitim"]);

// ===== KOREKSI — qty (terjual) per outlet per varian (dikonfirmasi user) =====
// sisaGram diturunkan otomatis: sisaCups = dist − qty → sisaGram = sisaCups × gpc.
const CORRECTIONS: Record<string, Record<string, number>> = {
  "o-gunung-gangsir": { abon: 2 },
  "o-randu-pitu": { tim_d: 11 },
  "o-kuti": { bubur_d: 11 },
  "o-sidohwayah": { tim_d: 6, abon: 2 },
  "o-kesambi": { bubur_d: 15 },
  "o-permata": { bubur_d: 18 },
  "o-mca": { bubur_d: 9 },
  "o-sugihwaras": { abon: 0, bubur_d: 7 },
  "o-sidokare": { bubur_d: 9 },
};

async function main() {
  const APPLY = process.argv.includes("--apply");
  console.log(`=== FIX OMSET ${TANGGAL} — angka terjual dikonfirmasi user ===`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  const { data: sales } = await supabase
    .from("penjualan")
    .select("id, outlet_id, produk_id, variant, qty, harga, total, sisa_gram")
    .eq("tanggal", TANGGAL);
  const { data: dists } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, status, catatan")
    .eq("tanggal_kirim", TANGGAL).eq("status", "Disetujui");
  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const oNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  // dist per varian
  const distMap = new Map<string, number>();
  const parseSplit = (catatan?: string | null) => { const m = catatan?.match(/D:(\d+),I:(\d+)/); return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 }; };
  (dists || []).forEach((r: any) => {
    const sp = parseSplit(r.catatan);
    if (r.produk_id === "p-bubur" || r.produk_id === "p-nasitim") {
      const pre = r.produk_id === "p-bubur" ? "bubur" : "tim";
      distMap.set(`${r.outlet_id}|${r.produk_id}|${pre}_d`, (distMap.get(`${r.outlet_id}|${r.produk_id}|${pre}_d`) || 0) + (sp.d || r.qty));
      distMap.set(`${r.outlet_id}|${r.produk_id}|${pre}_i`, (distMap.get(`${r.outlet_id}|${r.produk_id}|${pre}_i`) || 0) + (sp.i || 0));
    } else {
      const v = r.produk_id.replace("p-", "");
      distMap.set(`${r.outlet_id}|${r.produk_id}|${v}`, (distMap.get(`${r.outlet_id}|${r.produk_id}|${v}`) || 0) + r.qty);
    }
  });

  // Identik dgn sisaGramToCups di produksi-utils.ts: bagi dulu, baru bulat
  // naik 1 cup jika desimalnya > 0,5 (mis. 541/108 = 5,009 → 5 cup).
  const sisaGramToCups = (g: number, gpc: number) => { const gg = Math.max(0, Number(g) || 0); if (gg <= 50) return 0; const c = Math.floor(gg / gpc); return c + ((gg / gpc - c) > 0.5 ? 1 : 0); };

  // Hitung perubahan yang akan dilakukan
  interface Change { rec: any; newQty: number; newSisa: number; newTotal: number; totalOnly: boolean; }
  const changes: Change[] = [];
  let checked = 0;

  for (const p of (sales || [])) {
    const fixes = CORRECTIONS[p.outlet_id];
    if (!fixes) continue;
    checked++;
    const dist = distMap.get(`${p.outlet_id}|${p.produk_id}|${p.variant}`) ?? 0;
    const gpc = p.produk_id === "p-bubur" ? 118 : p.produk_id === "p-nasitim" ? 108 : p.produk_id === "p-oatmeal" ? 100 : p.produk_id === "p-puding" ? 80 : 10;
    const isGram = GRAM_BASED.has(p.produk_id);

    let newQty = p.qty;
    if (fixes[p.variant] !== undefined) newQty = fixes[p.variant];

    // Sisa: hanya diubah bila (a) qty berubah, atau (b) sisa lama TIDAK konsisten
    // dengan qty (sisaCups + qty ≠ dist). Kalau sisa lama sudah konsisten, biarkan
    // agar tidak mengubah input outlet yang sebenarnya.
    const storedSisa = p.sisa_gram ?? 0;
    const storedCups = isGram ? sisaGramToCups(storedSisa, gpc) : storedSisa;
    let newSisa = storedSisa;
    const sisaCups = Math.max(0, dist - newQty);
    if (newQty !== p.qty || storedCups !== sisaCups) {
      newSisa = isGram ? sisaCups * gpc : sisaCups;
    }
    const newTotal = newQty * p.harga;

    const changed = newQty !== p.qty || newSisa !== storedSisa || newTotal !== (p.total ?? 0);
    if (changed) {
      changes.push({
        rec: p,
        newQty,
        newSisa,
        newTotal,
        totalOnly: newQty === p.qty && newSisa === storedSisa,
      });
    }
  }

  // Laporan
  const byOutlet = new Map<string, Change[]>();
  for (const c of changes) {
    if (!byOutlet.has(c.rec.outlet_id)) byOutlet.set(c.rec.outlet_id, []);
    byOutlet.get(c.rec.outlet_id)!.push(c);
  }
  for (const [oid, list] of byOutlet) {
    console.log(`\n${oNames.get(oid) || oid}:`);
    for (const c of list) {
      const p = c.rec;
      const parts: string[] = [];
      if (c.newQty !== p.qty) parts.push(`qty ${p.qty} → ${c.newQty}`);
      if (c.newSisa !== (p.sisa_gram ?? 0)) parts.push(`sisa ${p.sisa_gram ?? 0} → ${c.newSisa}`);
      if (c.newTotal !== (p.total ?? 0)) parts.push(`total ${p.total} → ${c.newTotal}`);
      console.log(`   [${p.variant}] ${parts.join(" | ")}`);
    }
  }

  console.log(`\nTotal record akan diubah: ${changes.length} (dari ${checked} record outlet terkoreksi)`);
  if (changes.length === 0) {
    console.log("👉 Tidak ada perubahan yang diperlukan.");
    return;
  }
  if (!APPLY) {
    console.log(`👉 Jalankan dengan --apply untuk menulis ${changes.length} record.`);
    return;
  }

  let ok = 0;
  for (const c of changes) {
    const { error } = await supabase
      .from("penjualan")
      .update({ qty: c.newQty, total: c.newTotal, sisa_gram: c.newSisa })
      .eq("id", c.rec.id);
    if (error) {
      console.error(`  ❌ Gagal update id=${c.rec.id} [${c.rec.variant}]: ${error.message}`);
    } else {
      ok++;
    }
  }
  console.log(`\n✅ ${ok}/${changes.length} record berhasil diperbarui.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
