/**
 * CEK POTONGAN GANDA (READ-ONLY) — verifikasi tanggal yang siklusnya sudah
 * ditutup tidak punya pemotongan stok GANDA akibat campuran versi lama/baru.
 *
 * Latar belakang: sebelum refactor, Langkah 2 mencampur cup & tutup (kemasan)
 * ke label "Pemakaian Produksi [...]" bersama bahan baku. Setelah refactor:
 *   - Langkah 2  → "Pemakaian Produksi [<label>]"   = BAHAN BAKU saja
 *   - Langkah 3  → "Pemakaian Kemasan [<tanggal>]"  = KEMASAN saja
 * Kode baru membersihkan kemasan format lama saat Langkah 3 disimpan ulang,
 * tetapi tanggal yang TIDAK diproses ulang bisa masih menyimpan:
 *   1. Kemasan di label "Pemakaian Produksi" (sisa format lama) → potongan
 *      kemasan dobel bila tanggal tsb juga punya "Pemakaian Kemasan".
 *   2. Bahan baku dobel dalam satu label (re-validasi ganda sebelum fix
 *      hapus-dulu-baru-tulis).
 *
 * Cara pakai:
 *   npx tsx scripts/cek-potongan-ganda.ts
 *   npx tsx scripts/cek-potongan-ganda.ts --dari=2026-08-01 --sampai=2026-08-14
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

const KEMASAN_BAHAN = new Set(["b-cuppud01", "b-plas01", "b-cupoat1", "b-ttoat01"]);

async function main() {
  const args = process.argv.slice(2);
  const dari = args.find((a) => a.startsWith("--dari="))?.split("=")[1];
  const sampai = args.find((a) => a.startsWith("--sampai="))?.split("=")[1];

  console.log("============================================");
  console.log("  CEK POTONGAN GANDA (BAHAN & KEMASAN)");
  console.log(`  Rentang: ${dari || "semua"} s/d ${sampai || "semua"}`);
  console.log("============================================\n");

  const { data: movs, error: mErr } = await supabase
    .from("stok_movement")
    .select("id, tanggal, bahan_id, tipe, qty, keterangan")
    .order("tanggal", { ascending: true });
  if (mErr) { console.error("Error stok_movement:", mErr.message); process.exit(1); }

  const { data: bahan, error: bErr } = await supabase.from("bahan_baku").select("id, nama, satuan");
  if (bErr) { console.error("Error bahan_baku:", bErr.message); process.exit(1); }
  const namaBahan = new Map((bahan || []).map((b: any) => [b.id, `${b.nama} (${b.satuan})`]));

  // Tanggal yang siklusnya TERTUTUP = punya jurnal OUT-SALES
  const { data: jurnal, error: jErr } = await supabase
    .from("jurnal").select("tanggal").eq("ref", "OUT-SALES");
  if (jErr) { console.error("Error jurnal:", jErr.message); process.exit(1); }
  const closedDates = new Set((jurnal || []).map((j: any) => j.tanggal));

  const inRange = (t: string) => {
    if (dari && t < dari) return false;
    if (sampai && t > sampai) return false;
    return true;
  };

  const all = (movs || []).filter((m: any) => inRange(m.tanggal));

  // ==== 1. Kelompokkan OUT berdasarkan label ====
  const produksiByLabel: Record<string, { tanggal: string; items: any[] }> = {};
  const kemasanByTgl: Record<string, any[]> = {};
  const lainOut: any[] = [];

  for (const m of all) {
    if (m.tipe !== "OUT") continue;
    const k = m.keterangan || "";
    const mProduksi = k.match(/^Pemakaian Produksi \[(.+)\]$/);
    const mKemasan = k.match(/^Pemakaian Kemasan \[(.+)\]$/);
    if (mProduksi) {
      const label = mProduksi[1];
      if (!produksiByLabel[label]) produksiByLabel[label] = { tanggal: m.tanggal, items: [] };
      produksiByLabel[label].items.push(m);
    } else if (mKemasan) {
      const tgl = mKemasan[1];
      if (!kemasanByTgl[tgl]) kemasanByTgl[tgl] = [];
      kemasanByTgl[tgl].push(m);
    } else if (/^RUSAK:OH/.test(k)) {
      // OH rusak — bukan pemotongan produksi, tidak dicek di sini
    } else {
      lainOut.push(m);
    }
  }

  let masalah = 0;
  const tampil = (flag: string, pesan: string) => {
    console.log(`  ${flag} ${pesan}`);
    if (flag === "❌") masalah++;
  };

  // ==== 2. Duplikat bahan dalam satu label "Pemakaian Produksi" ====
  console.log("=== 1. DUP BAHAN BAKU per label 'Pemakaian Produksi' ===");
  let adaLabel = false;
  Object.entries(produksiByLabel).sort().forEach(([label, g]) => {
    adaLabel = true;
    const byBahan: Record<string, any[]> = {};
    g.items.forEach((m) => {
      if (!byBahan[m.bahan_id]) byBahan[m.bahan_id] = [];
      byBahan[m.bahan_id].push(m);
    });
    const dups = Object.entries(byBahan).filter(([, items]) => items.length > 1);
    const closed = [...g.items].some((m) => closedDates.has(m.tanggal));
    if (dups.length > 0) {
      tampil("❌", `Label "${label}" (${g.items.length} item, tgl cut ${g.tanggal}) punya bahan DOBEL:`);
      dups.forEach(([bahanId, items]) => {
        tampil("❌", `     ${bahanId} ${namaBahan.get(bahanId) || ""} × ${items.length} → ` +
          items.map((i) => `qty=${i.qty} @${i.tanggal}`).join("; "));
      });
    } else if (closed) {
      console.log(`  ✅ Label "${label}" (${g.items.length} item) — tidak ada dup (siklus tertutup)`);
    } else {
      console.log(`  ➖ Label "${label}" (${g.items.length} item) — tidak ada dup (siklus TERBUKA)`);
    }
  });
  if (!adaLabel) console.log("  (tidak ada label Pemakaian Produksi)");

  // ==== 3. Kemasan: dobel antara format lama (Pemakaian Produksi) & baru (Pemakaian Kemasan) ====
  console.log("\n=== 2. KEMASAN DOBEL (lama di 'Pemakaian Produksi' + baru di 'Pemakaian Kemasan') ===");
  // Peta: tanggal -> kemasan yang muncul di label Pemakaian Produksi (format lama)
  const kemasanDiProduksi: Record<string, Record<string, any[]>> = {};
  Object.entries(produksiByLabel).forEach(([label, g]) => {
    // tanggal cut (m.tanggal) dipakai sbg kunci tanggal — pemotongan lama dicatat di tanggal cut
    g.items.forEach((m) => {
      if (!KEMASAN_BAHAN.has(m.bahan_id)) return;
      if (!kemasanDiProduksi[m.tanggal]) kemasanDiProduksi[m.tanggal] = {};
      if (!kemasanDiProduksi[m.tanggal][m.bahan_id]) kemasanDiProduksi[m.tanggal][m.bahan_id] = [];
      kemasanDiProduksi[m.tanggal][m.bahan_id].push({ ...m, label });
    });
  });

  const tanggalKemasan = [...new Set([...Object.keys(kemasanByTgl), ...Object.keys(kemasanDiProduksi)])].sort();
  let adaKemasan = false;
  for (const tgl of tanggalKemasan) {
    const baru = kemasanByTgl[tgl] || [];
    const lama = kemasanDiProduksi[tgl] || {};
    adaKemasan = true;
    const closed = closedDates.has(tgl);
    const status = closed ? "(siklus TERTUTUP)" : "(siklus TERBUKA)";
    if (Object.keys(lama).length > 0) {
      Object.entries(lama).forEach(([bahanId, items]) => {
        const jgBaru = baru.some((m) => m.bahan_id === bahanId);
        const extra = jgBaru ? " — JUGA ADA di 'Pemakaian Kemasan' (kemasan DOBEL!)" : " (hanya format lama)";
        tampil(jgBaru ? "❌" : "⚠️", `${tgl} ${status}: ${bahanId} ${namaBahan.get(bahanId) || ""} masih di "Pemakaian Produksi"${extra}`);
        items.forEach((i) => console.log(`        qty=${i.qty} @${i.tanggal} label="${i.label}"`));
        if (jgBaru) baru.filter((m) => m.bahan_id === bahanId).forEach((i) => console.log(`        qty=${i.qty} @${i.tanggal} di "Pemakaian Kemasan"`));
      });
    } else if (baru.length > 0) {
      console.log(`  ✅ ${tgl} ${status}: kemasan hanya di "Pemakaian Kemasan" (${baru.length} item)`);
    }
  }
  if (!adaKemasan) console.log("  (tidak ada pemotongan kemasan sama sekali)");

  // ==== 4. Bahan baku dobel antar label (mis. tanggal sama dicut 2x dgn label berbeda) ====
  console.log("\n=== 3. BAHAN BAKU dobel antar-label untuk tanggal cut yang sama ===");
  const bahanPerTanggalCut: Record<string, Record<string, any[]>> = {};
  Object.entries(produksiByLabel).forEach(([label, g]) => {
    g.items.forEach((m) => {
      if (KEMASAN_BAHAN.has(m.bahan_id)) return;
      if (!bahanPerTanggalCut[m.tanggal]) bahanPerTanggalCut[m.tanggal] = {};
      if (!bahanPerTanggalCut[m.tanggal][m.bahan_id]) bahanPerTanggalCut[m.tanggal][m.bahan_id] = [];
      bahanPerTanggalCut[m.tanggal][m.bahan_id].push({ ...m, label });
    });
  });
  let adaCut = false;
  Object.entries(bahanPerTanggalCut).sort().forEach(([tgl, byBahan]) => {
    adaCut = true;
    const closed = closedDates.has(tgl);
    Object.entries(byBahan).forEach(([bahanId, items]) => {
      if (items.length <= 1) return;
      tampil("❌", `${tgl} ${closed ? "(TERTUTUP)" : "(terbuka)"}: ${bahanId} ${namaBahan.get(bahanId) || ""} dicut ${items.length}× → ` +
        items.map((i) => `qty=${i.qty} @label "${i.label}"`).join("; "));
    });
  });
  if (!adaCut) console.log("  (tidak ada pemotongan bahan baku)");

  // ==== 4. KEMASAN vs JUMLAH PASCA PRODUKSI (total distribusi) per tanggal ====
  // Aturan: kemasan (cup & tutup puding/oatmeal) menyesuaikan jumlah pasca
  // produksi = total distribusi aktual ke outlet, 1 cup/1 tutup per porsi.
  // Bandingkan qty potong dgn permohonan_stok.qty (distribusi aktual) utk
  // p-puding & p-oatmeal pada tanggal yang sama.
  console.log("\n=== 4. KEMASAN vs JUMLAH PASCA PRODUKSI (realisasi produksi / total distribusi) ===");
  const { data: reqs, error: rErr } = await supabase
    .from("permohonan_stok")
    .select("tanggal_kirim, produk_id, qty")
    .in("produk_id", ["p-puding", "p-oatmeal"]);
  if (rErr) { console.error("Error permohonan_stok:", rErr.message); process.exit(1); }
  const distPerTgl: Record<string, { puding: number; oatmeal: number }> = {};
  (reqs || []).forEach((r: any) => {
    if (!inRange(r.tanggal_kirim)) return;
    if (!distPerTgl[r.tanggal_kirim]) distPerTgl[r.tanggal_kirim] = { puding: 0, oatmeal: 0 };
    distPerTgl[r.tanggal_kirim][r.produk_id === "p-puding" ? "puding" : "oatmeal"] += r.qty || 0;
  });
  // Realisasi produksi (qty_realisasi) — sumber "jumlah pasca produksi" saat kemasan dipotong
  const { data: prods, error: pErr2 } = await supabase
    .from("produksi")
    .select("tanggal, produk_id, qty_realisasi")
    .in("produk_id", ["p-puding", "p-oatmeal"]);
  if (pErr2) { console.error("Error produksi:", pErr2.message); process.exit(1); }
  const realisasiPerTgl: Record<string, { puding: number; oatmeal: number }> = {};
  (prods || []).forEach((p: any) => {
    if (!inRange(p.tanggal)) return;
    if (!realisasiPerTgl[p.tanggal]) realisasiPerTgl[p.tanggal] = { puding: 0, oatmeal: 0 };
    realisasiPerTgl[p.tanggal][p.produk_id === "p-puding" ? "puding" : "oatmeal"] += p.qty_realisasi || 0;
  });
  const KEMASAN_MAP: Record<string, string> = {
    "b-cuppud01": "puding",
    "b-plas01": "puding",
    "b-cupoat1": "oatmeal",
    "b-ttoat01": "oatmeal"
  };
  let adaKemasanCek = false;
  Object.entries(kemasanByTgl).sort().forEach(([tgl, items]) => {
    adaKemasanCek = true;
    const closed = closedDates.has(tgl);
    const dist = distPerTgl[tgl];
    if (!dist || (dist.puding === 0 && dist.oatmeal === 0)) {
      console.log(`  ➖ ${tgl} ${closed ? "(TERTUTUP)" : "(terbuka)"}: tidak ada distribusi puding/oatmeal utk dibandingkan`);
      return;
    }
    const byBahan: Record<string, number> = {};
    items.forEach((m) => { byBahan[m.bahan_id] = (byBahan[m.bahan_id] || 0) + m.qty; });
    const status = closed ? "(TERTUTUP)" : "(terbuka)";
    const real = realisasiPerTgl[tgl] || { puding: 0, oatmeal: 0 };
    let ok = true;
    Object.entries(KEMASAN_MAP).forEach(([bahanId, produk]) => {
      const potong = byBahan[bahanId] || 0;
      const harapanDist = dist[produk as "puding" | "oatmeal"] || 0;
      const harapanReal = real[produk as "puding" | "oatmeal"] || 0;
      if (potong !== harapanDist) {
        ok = false;
        if (potong === harapanReal) {
          tampil("⚠️", `${tgl} ${status}: ${bahanId} ${namaBahan.get(bahanId) || ""} potong=${potong} = realisasi produksi ${produk} (${harapanReal}) ≠ distribusi akhir ${harapanDist} — distribusi diubah setelah produksi, kemasan tidak dipotong ulang`);
        } else {
          tampil("❌", `${tgl} ${status}: ${bahanId} ${namaBahan.get(bahanId) || ""} potong=${potong} ≠ realisasi ${harapanReal} ≠ distribusi ${harapanDist}`);
        }
      }
    });
    if (ok) {
      console.log(`  ✅ ${tgl} ${status}: kemasan 1:1 dgn distribusi (puding ${dist.puding}, oatmeal ${dist.oatmeal})`);
    }
  });
  if (!adaKemasanCek) console.log("  (tidak ada pemotongan kemasan)");

  // ==== Ringkasan ====
  console.log("\n============================================");
  if (masalah === 0) {
    console.log("  ✅ TIDAK ADA potongan ganda ditemukan.");
  } else {
    console.log(`  ❌ ${masalah} masalah potongan ganda ditemukan (lihat detail di atas).`);
  }
  console.log(`  Total movement OUT diproses: ${all.filter((m) => m.tipe === "OUT").length}`);
  console.log("============================================\n");
  process.exit(masalah === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
