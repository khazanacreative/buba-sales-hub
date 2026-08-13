/**
 * CEK DAMPAK ATURAN OH LAMA (ceil) — sisa gram yang terpotong terlalu banyak
 *
 * READ-ONLY. Menemukan record penjualan Bubur/Nasi Tim yang punya sisa_gram
 * (OH dalam gram) di mana aturan LAMA (Math.ceil) menghitung cup sisa LEBIH
 * banyak daripada aturan BARU (floor + bulat naik hanya jika desimal > 0,5).
 *
 * Contoh: 541 gr ÷ 108 = 5,009 → lama 6 cup, baru 5 cup (terpotong 1 cup).
 *         549 gr ÷ 108 = 5,083 → lama 6 cup, baru 5 cup (terpotong 1 cup).
 *
 * Perbedaan ini berdampak pada RUSAK bahan baku (beras/sayur) saat siklus
 * ditutup: stok terpotong untuk 1 cup ekstra per record terdampak.
 *
 * Cara pakai:
 *   npx tsx scripts/cek-dampak-aturan-oh.ts              → semua data
 *   npx tsx scripts/cek-dampak-aturan-oh.ts 30           → 30 hari terakhir
 *   npx tsx scripts/cek-dampak-aturan-oh.ts 30 --ringkas → hanya ringkasan
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

// Gram per cup — Bubur 118, Nasi Tim 108 (aturan pembulatan & RUSAK)
const GPC: Record<string, number> = { "p-bubur": 118, "p-nasitim": 108 };

// Aturan LAMA (sudah diganti): sisa > 50 gr → Math.ceil(gram / gpc)
const oldCups = (grams: number, gpc: number) => (grams <= 50 ? 0 : Math.ceil(grams / gpc));

// Aturan BARU: sisa gram ÷ gpc dulu, baru bulat naik 1 cup jika desimal > 0,5
const newCups = (grams: number, gpc: number) => {
  if (grams <= 50) return 0;
  const cups = Math.floor(grams / gpc);
  const frac = grams / gpc - cups;
  return cups + (frac > 0.5 ? 1 : 0);
};

const VARIANT_GPC: Record<string, number> = {
  bubur_d: 118, bubur_i: 118, tim_d: 108, tim_i: 108,
};
const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0 };
const parseSplit = (catatan?: string | null) => {
  const m = catatan?.match(/D:(\d+),I:(\d+)/);
  return m ? { d: Number(m[1]), i: Number(m[2]) } : { d: 0, i: 0 };
};

async function main() {
  const args = process.argv.slice(2);
  const days = args.find((a) => /^\d+$/.test(a));
  const RINGKAS = args.includes("--ringkas");

  let query = supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, qty, harga, sisa_gram, variant")
    .in("produk_id", ["p-bubur", "p-nasitim"])
    .not("sisa_gram", "is", null)
    .order("tanggal", { ascending: false });

  if (days) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Number(days));
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    query = query.gte("tanggal", cutoffISO);
    console.log(`=== CEK DAMPAK ATURAN OH (sejak ${cutoffISO}, ${days} hari terakhir) ===\n`);
  } else {
    console.log(`=== CEK DAMPAK ATURAN OH (SEMUA data) ===\n`);
  }

  const { data: sales, error: errS } = await query;
  if (errS) {
    console.error("❌ Gagal membaca penjualan:", errS.message);
    process.exit(1);
  }

  // Distribusi per tanggal utk clamp cup ke jumlah terkirim per varian
  const { data: dists } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, catatan")
    .in("produk_id", ["p-bubur", "p-nasitim"])
    .eq("status", "Disetujui");
  const distByDate = new Map<string, Record<string, any>>();
  for (const d of (dists || []) as any[]) {
    const row = distByDate.get(d.tanggal_kirim) || {};
    const o = row[d.outlet_id] || { ...ZERO };
    const split = parseSplit(d.catatan);
    if (split.d > 0 || split.i > 0) {
      if (d.produk_id === "p-bubur") { o.bubur_d += split.d; o.bubur_i += split.i; }
      else { o.tim_d += split.d; o.tim_i += split.i; }
    } else {
      const half = Math.round(d.qty / 2);
      if (d.produk_id === "p-bubur") { o.bubur_d += half; o.bubur_i += d.qty - half; }
      else { o.tim_d += half; o.tim_i += d.qty - half; }
    }
    row[d.outlet_id] = o;
    distByDate.set(d.tanggal_kirim, row);
  }

  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  // Tanggal yang siklusnya DITUTUP (ada movement RUSAK:OH OUT) — di sinilah
  // over-pemotongan aturan lama benar-benar tercatat ke stok.
  const { data: rusakMov } = await supabase
    .from("stok_movement")
    .select("tanggal")
    .eq("tipe", "OUT")
    .like("keterangan", "RUSAK:OH%");
  const closedDates = new Set((rusakMov || []).map((m: any) => m.tanggal));

  const affected: any[] = [];
  for (const p of (sales || []) as any[]) {
    const gpc = VARIANT_GPC[p.variant] || GPC[p.produk_id];
    if (!gpc) continue;
    const sisa = Number(p.sisa_gram) || 0;
    if (sisa <= 0) continue;
    // Clamp ke jumlah terkirim varian — cup tidak boleh melebihi distribusi
    const distVar = (distByDate.get(p.tanggal)?.[p.outlet_id] || ZERO)[p.variant] || 0;
    const o = Math.min(oldCups(sisa, gpc), distVar || Infinity);
    const n = Math.min(newCups(sisa, gpc), distVar || Infinity);
    if (o !== n) {
      affected.push({
        tanggal: p.tanggal,
        outlet: outletNames.get(p.outlet_id) || p.outlet_id,
        produk: p.produk_id === "p-bubur" ? "Bubur" : "Nasi Tim",
        variant: p.variant || "-",
        sisa,
        gpc,
        oldCups: o,
        newCups: n,
        selisih: o - n,
        qty: p.qty,
        closed: closedDates.has(p.tanggal),
      });
    }
  }

  const byTanggal = new Map<string, any[]>();
  affected.forEach((r) => {
    if (!byTanggal.has(r.tanggal)) byTanggal.set(r.tanggal, []);
    byTanggal.get(r.tanggal)!.push(r);
  });

  const totalSelisihCup = affected.reduce((s, r) => s + r.selisih, 0);

  console.log(`📊 Record penjualan TERDAMPAK (aturan lama != aturan baru): ${affected.length}`);
  console.log(`   • ${byTanggal.size} tanggal berbeda`);
  console.log(`   • ${new Set(affected.map((r) => r.outlet)).size} outlet berbeda`);
  console.log(`   • Total selisih cup (terpotong ekstra di aturan lama): ${totalSelisihCup} cup`);
  console.log(`   • Semua terdampak punya desimal ≤ 0,5 (mis. 541÷108 = 5,009 → lama 6, baru 5); desimal > 0,5 hasilnya sama di kedua aturan (tidak terdampak)\n`);

  if (RINGKAS) {
    console.log("Daftar tanggal & outlet terdampak (siklus tertutup = RUSAK sudah tercatat):");
    [...byTanggal.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .forEach(([tgl, rows]) => {
        const outletsSet = new Set(rows.map((r) => r.outlet));
        const cup = rows.reduce((s, r) => s + r.selisih, 0);
        const closed = rows.every((r) => r.closed) ? "🔒 ditutup" : rows.some((r) => r.closed) ? "⚠️ sebagian ditutup" : "terbuka";
        console.log(`  ${tgl} | ${outletsSet.size} outlet (${[...outletsSet].join(", ")}) | ${rows.length} record | +${cup} cup | ${closed}`);
      });
    return;
  }

  console.log("Detail per record (aturan lama vs baru):\n");
  [...byTanggal.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([tgl, rows]) => {
      const cup = rows.reduce((s, r) => s + r.selisih, 0);
      const closed = rows.every((r) => r.closed) ? "🔒" : rows.some((r) => r.closed) ? "⚠️" : "○";
      console.log(`── ${tgl} ${closed} (${rows.length} record, +${cup} cup) ──`);
      rows.forEach((r) => {
        const frac = (r.sisa / r.gpc - Math.floor(r.sisa / r.gpc)).toFixed(3);
        console.log(
          `   ${r.outlet.padEnd(16)} ${r.produk} ${r.variant.padEnd(7)} sisa=${String(r.sisa).padStart(4)}g ÷ ${r.gpc} (des ${frac}) → lama ${r.oldCups} cup, baru ${r.newCups} cup (selisih ${r.selisih})${r.closed ? " [RUSAK tercatat]" : ""}`
        );
      });
      console.log();
    });
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
