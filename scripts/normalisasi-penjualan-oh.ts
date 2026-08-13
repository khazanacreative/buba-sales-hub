/**
 * NORMALISASI PENJUALAN — Qty tersimpan diselaraskan dengan aturan OH 50g
 *
 * Latar belakang:
 *   Sebelum fitur "aturan OH 50g", sisa Bubur/Nasi Tim dikonversi ke cup dengan
 *   pembulatan ke BAWAH (floor):  sisaCups = floor(sisaGram / gramPerCup)
 *   Aturan baru:                  sisa ≤ 50 gr → 0 cup; sisa > 50 gr → ceil(sisaGram / gramPerCup)
 *   Akibatnya record lama punya qty (terjual) = dist − floor(...), sedangkan tab
 *   Sisa (OH), Riwayat & Rekap kini membaca qty tersimpan sebagai sumber kebenaran
 *   dengan aturan baru — selisih 1 cup per baris yang membuat omzet tidak konsisten.
 *
 * Script ini menghitung ulang qty untuk SETIAP record penjualan dengan aturan OH 50g:
 *   newQty = max(0, distVarian − min(sisaCups, distVarian))
 *   total  = newQty × harga   (kolom total dipakai tab Rekap)
 *
 * Sumber distribusi = permohonan_stok ber-status Disetujui (sama dgn logika aplikasi,
 * termasuk split [D:X,I:Y] di catatan). Idempotent — record yang sudah sesuai aturan
 * baru tidak berubah.
 *
 * ⚠️ PERHATIAN:
 *  1. Item cup/pcs (oatmeal, puding, abon) juga ikut dikoreksi — aturan OH 50g memang
 *     hanya untuk bubur/tim, tapi record cup/pcs yang qty+sisa ≠ dist (selisih dari
 *     era sebelum varian / bug lama) ikut diselaraskan agar konsisten. Gunakan
 *     --gram-only jika ingin HANYA memperbaiki bubur/tim (aturan floor → OH 50g).
 *  2. Sebagian qty bisa NAIK (mis. sisa=0 tapi qty tersimpan < dist) — bukan hanya
 *     turun 1 cup. Ini koreksi record yang memang tidak konsisten di kedua arah.
 *  3. Record lama tanpa variant (D+I digabung) dinormalisasi secara agregat
 *     (dist total base), karena aplikasi kini selalu menyimpan per-varian.
 *  4. Disarankan backup dulu sebelum --apply: npx tsx scripts/backup-db.ts
 *
 * Cara pakai (DRY-RUN — tidak menulis apa pun):
 *   npx tsx scripts/normalisasi-penjualan-oh.ts [jumlah_hari=30]
 *
 * Menulis perubahan ke database:
 *   npx tsx scripts/normalisasi-penjualan-oh.ts [jumlah_hari=30] --apply
 *
 * Opsi lain:
 *   --skip-closed   JANGAN normalisasi tanggal yang siklusnya sudah ditutup
 *                   (ada jurnal OUT-SALES). Secara default tanggal tertutup TETAP
 *                   dinormalisasi tapi dilaporkan jelas agar Anda bisa meninjau.
 *   --gram-only     Hanya normalisasi bubur/tim (item berbasis gram).
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

// ===== Konstanta — SAMA dengan aplikasi (Laporan.tsx / produksi-utils.ts) =====
const GRAM_PER_CUP: Record<string, number> = {
  "p-bubur": 118,
  "p-nasitim": 108,
  "p-oatmeal": 100,
  "p-puding": 80,
  "p-abon": 10,
};
const PROD_IDS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];
// Produk berbasis gram (sisa_gram menyimpan GRAM → konversi dgn aturan OH 50g)
const GRAM_BASED = new Set(["p-bubur", "p-nasitim"]);
// OH_MIN_GRAM — sisa ≤ 50 gr dianggap 0 cup (semua terjual)
const OH_MIN_GRAM = 50;

const parseSplit = (catatan?: string | null) => {
  const match = catatan?.match(/D:(\d+),I:(\d+)/);
  if (match) return { d: Number(match[1]), i: Number(match[2]) };
  return { d: 0, i: 0 };
};

// Aturan OH 50g (identik dgn sisaGramToCups di produksi-utils.ts):
// sisa gram ÷ gram/cup, baru bulat naik 1 cup jika desimalnya > 0,5.
function sisaGramToCups(sisaGram: number, gramPerCup: number): number {
  const grams = Math.max(0, Number(sisaGram) || 0);
  if (grams <= OH_MIN_GRAM) return 0;
  const cups = Math.floor(grams / gramPerCup);
  const frac = grams / gramPerCup - cups;
  return cups + (frac > 0.5 ? 1 : 0);
}

// ===== Main =====
async function main() {
  const args = process.argv.slice(2);
  const days = Number(args.find((a) => /^\d+$/.test(a)) || 30);
  const APPLY = args.includes("--apply");
  const SKIP_CLOSED = args.includes("--skip-closed");
  const GRAM_ONLY = args.includes("--gram-only");
  const dariArg = args.find((a) => a.startsWith("--dari="));
  const sampaiArg = args.find((a) => a.startsWith("--sampai="));
  // Batas rentang eksplisit — lebih sempit dari cutoff jumlah-hari bila diberikan
  const DARI = dariArg ? dariArg.split("=")[1] : null;
  const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : null;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  const lower = DARI || cutoffISO;
  const upper = SAMPAI || null;
  const rangeLabel = upper ? `${lower} s.d. ${upper}` : `sejak ${lower}, ${days} hari`;

  console.log(`=== NORMALISASI PENJUALAN — ATURAN OH 50g (${rangeLabel}) ===`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}${SKIP_CLOSED ? " · melewati tanggal siklus tertutup (--skip-closed)" : ""}${GRAM_ONLY ? " · hanya bubur/tim (--gram-only)" : ""}\n`);

  // 1. Nama outlet (untuk laporan yang lebih terbaca)
  const { data: outlets } = await supabase.from("outlets").select("id, nama");
  const outletNames = new Map((outlets || []).map((o: any) => [o.id, o.nama]));

  // 2. Tanggal yang siklusnya sudah ditutup (ada jurnal OUT-SALES)
  let jq = supabase.from("jurnal").select("tanggal").eq("ref", "OUT-SALES").gte("tanggal", lower);
  if (upper) jq = jq.lte("tanggal", upper);
  const { data: jurnals } = await jq;
  const closedDates = new Set((jurnals || []).map((j: any) => j.tanggal));

  // 3. Distribusi disetujui (sumber dist per varian)
  let dq = supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, outlet_id, produk_id, qty, status, catatan")
    .in("produk_id", PROD_IDS)
    .eq("status", "Disetujui")
    .gte("tanggal_kirim", lower);
  if (upper) dq = dq.lte("tanggal_kirim", upper);
  const { data: dists, error: errD } = await dq;
  if (errD) {
    console.error("❌ Gagal membaca permohonan_stok:", errD.message);
    process.exit(1);
  }

  // Map: key `${tanggal}|${outletId}|${produkId}|${variant}` → dist
  const distMap = new Map<string, number>();
  (dists || []).forEach((r: any) => {
    const split = parseSplit(r.catatan);
    const base = r.produk_id;
    if (base === "p-bubur" || base === "p-nasitim") {
      const prefix = base === "p-bubur" ? "bubur" : "tim";
      const keyD = `${r.tanggal_kirim}|${r.outlet_id}|${base}|${prefix}_d`;
      const keyI = `${r.tanggal_kirim}|${r.outlet_id}|${base}|${prefix}_i`;
      distMap.set(keyD, (distMap.get(keyD) || 0) + (split.d || r.qty));
      distMap.set(keyI, (distMap.get(keyI) || 0) + (split.i || 0));
    } else {
      const key = `${r.tanggal_kirim}|${r.outlet_id}|${base}|${base.replace("p-", "")}`;
      distMap.set(key, (distMap.get(key) || 0) + r.qty);
    }
  });

  // 4. Record penjualan produk produksi
  let sq = supabase
    .from("penjualan")
    .select("id, tanggal, outlet_id, produk_id, qty, harga, total, sisa_gram, variant")
    .in("produk_id", PROD_IDS)
    .gte("tanggal", lower);
  if (upper) sq = sq.lte("tanggal", upper);
  sq = sq.order("tanggal", { ascending: false });
  const { data: sales, error: errS } = await sq;
  if (errS) {
    console.error("❌ Gagal membaca penjualan:", errS.message);
    process.exit(1);
  }

  console.log(`Distribusi disetujui: ${(dists || []).length} record | Penjualan: ${(sales || []).length} record | Siklus tertutup: ${closedDates.size} tanggal\n`);

  // 5. Normalisasi per record
  const rows: any[] = [];
  let changed = 0, changedClosed = 0, unchanged = 0, noDist = 0, skipClosed = 0, skipCup = 0, changedCup = 0, changedGram = 0;

  for (const p of (sales || [])) {
    const gpc = GRAM_PER_CUP[p.produk_id] || 118;
    const isGram = GRAM_BASED.has(p.produk_id);
    // Variant: untuk cup/pcs gunakan produkId sebagai varian (sisa_gram = cup/pcs langsung)
    const variant = p.variant ?? (isGram ? null : p.produk_id.replace("p-", ""));

    if (GRAM_ONLY && !isGram) {
      skipCup++;
      continue;
    }

    // Record gram tanpa variant = data lama D+I digabung → gunakan dist total base
    const distKey = variant
      ? `${p.tanggal}|${p.outlet_id}|${p.produk_id}|${variant}`
      : null;
    const distKeyCombined = `${p.tanggal}|${p.outlet_id}|${p.produk_id}`;
    let dist = distKey ? distMap.get(distKey) : undefined;
    if (dist === undefined && !variant && isGram) {
      // Legasi gabungan: dist = dist_d + dist_i
      const prefix = p.produk_id === "p-bubur" ? "bubur" : "tim";
      dist = (distMap.get(`${distKeyCombined}|${prefix}_d`) || 0) + (distMap.get(`${distKeyCombined}|${prefix}_i`) || 0);
    }

    if (dist === undefined || dist <= 0) {
      noDist++;
      continue;
    }

    const sisa = p.sisa_gram ?? 0;
    const sisaCups = isGram ? sisaGramToCups(sisa, gpc) : sisa;
    const newQty = Math.max(0, dist - Math.min(sisaCups, dist));

    const isClosed = closedDates.has(p.tanggal);
    const rowChanged = newQty !== p.qty;
    if (rowChanged && isClosed && SKIP_CLOSED) {
      skipClosed++;
      continue;
    }

    if (rowChanged) {
      if (isGram) changedGram++; else changedCup++;
      if (isClosed) changedClosed++; else changed++;
      rows.push({ ...p, outlet: outletNames.get(p.outlet_id) || p.outlet_id, status: isClosed ? "CHANGE_CLOSED" : "CHANGE", dist, sisaCups, newQty });
    } else {
      unchanged++;
    }
  }

  // 6. Laporan — hanya baris yang berubah (skip dirangkum di RINGKASAN)
  const printable = rows;
  printable.forEach((r) => {
    const tag = r.status === "CHANGE_CLOSED" ? "⚠️ " : "🔄 ";
    const before = `qty ${r.qty}`;
    const after = r.newQty !== undefined ? ` → ${r.newQty} (total ${(r.newQty * r.harga).toLocaleString()})` : "";
    const sisaLabel = GRAM_BASED.has(r.produk_id) ? `${r.sisa_gram ?? 0}g` : `${r.sisa_gram ?? 0} cup/pcs`;
    console.log(
      `${tag}${r.tanggal} | ${r.outlet} | ${r.produk_id}${r.variant ? ` [${r.variant}]` : " [gabungan]"} | ` +
      `dist=${r.dist} | sisa=${sisaLabel} (${r.sisaCups} cup) | ${before}${after}${r.status === "CHANGE_CLOSED" ? " 🔒" : ""}`
    );
  });

  console.log("\n=== RINGKASAN ===");
  console.log(`  ✅ Tidak berubah (sudah sesuai aturan baru): ${unchanged}`);
  console.log(`  🔄 Perlu dinormalisasi: ${changed} baris (tanggal terbuka)`);
  console.log(`  ⚠️  Perlu dinormalisasi (siklus sudah ditutup 🔒): ${changedClosed} baris`);
  if (!GRAM_ONLY) console.log(`     ├─ bubur/tim (aturan OH 50g): ${changedGram} baris`);
  if (!GRAM_ONLY) console.log(`     └─ cup/pcs (qty+sisa≠dist): ${changedCup} baris`);
  if (skipClosed > 0) console.log(`  ⏭️  Dilewati (--skip-closed): ${skipClosed} baris`);
  if (skipCup > 0) console.log(`  ⏭️  Dilewati (--gram-only): ${skipCup} baris cup/pcs`);
  if (noDist > 0) console.log(`  ⏭️  Dilewati (tidak ada distribusi Disetujui): ${noDist} baris`);

  const totalToFix = changed + changedClosed;
  if (!APPLY) {
    console.log(`\n👉 DRY-RUN selesai — ${totalToFix} baris akan diubah. Jalankan dgn --apply untuk menulis.`);
  } else if (totalToFix > 0) {
    console.log(`\n👉 Menulis ${totalToFix} baris ke database...`);
    let ok = 0;
    for (const r of printable) {
      if (r.status !== "CHANGE" && r.status !== "CHANGE_CLOSED") continue;
      const { error } = await supabase
        .from("penjualan")
        .update({ qty: r.newQty, total: r.newQty * r.harga })
        .eq("id", r.id);
      if (error) {
        console.error(`  ❌ Gagal update id=${r.id}: ${error.message}`);
      } else {
        ok++;
      }
    }
    console.log(`  ✅ ${ok} baris berhasil diperbarui.`);
  } else {
    console.log("\n👉 Tidak ada baris yang perlu diubah.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
