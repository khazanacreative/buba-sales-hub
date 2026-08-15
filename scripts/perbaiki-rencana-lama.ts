/**
 * PERBAIKI RENCANA LAMA — restore rencana (qty_rencana/catatan_rencana) untuk
 * tanggal yang terdampak bug "distribusi menimpa rencana" (diperbaiki 2026-08-14).
 *
 * Latar belakang: sebelum fix, Langkah 3 (distribusi) menimpa permohonan_stok.qty
 * & catatan dengan distribusi AKTUAL. Migrasi qty_rencana backfill qty_rencana =
 * qty, jadi untuk tanggal dengan distribusi != rencana, kolom rencana ikut salah
 * (menampilkan angka aktual). Rencana ASLI per produk masih tersimpan di
 * produksi.qty_rencana (ditulis saat saveStep3 dengan angka rencana yang benar).
 *
 * Perbaikan:
 *   1. Untuk setiap tanggal terdampak (Σ qty_rencana DB != Σ produksi.qty_rencana
 *      per produk), rekonstruksi qty_rencana/catatan_rencana per outlet secara
 *      proporsional terhadap distribusi aktual (largest remainder agar total
 *      persis sama dengan rencana asli). Split D/I bubur & nasi tim dibagi
 *      proporsional terpisah.
 *   2. BUKA kembali siklus tanggal terdampak yang masih TERTUTUP (hapus jurnal
 *      OUT-SALES + stok_movement IN "Retur Bahan"/"OH abon") — sesuai permintaan
 *      agar data bisa divalidasi/diisi ulang lalu ditutup lagi.
 *
 * Cara pakai:
 *   npx tsx scripts/perbaiki-rencana-lama.ts                    # dry-run
 *   npx tsx scripts/perbaiki-rencana-lama.ts --dari=... --sampai=...
 *   npx tsx scripts/perbaiki-rencana-lama.ts --apply            # eksekusi
 *   npx tsx scripts/perbaiki-rencana-lama.ts --apply --dari=2026-08-01 --sampai=2026-08-14
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

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const dariArg = args.find((a) => a.startsWith("--dari="));
const sampaiArg = args.find((a) => a.startsWith("--sampai="));
const DARI = dariArg ? dariArg.split("=")[1] : null;
const SAMPAI = sampaiArg ? sampaiArg.split("=")[1] : null;

function parseSplit(catatan?: string) {
  const match = catatan?.match(/D:(\d+),I:(\d+)/);
  if (match) return { d: Number(match[1]), i: Number(match[2]) };
  return { d: 0, i: 0 };
}

const hasSplit = (catatan?: string) => /D:\d+,I:\d+/.test(catatan || "");

// Ganti prefix split [D:X,I:Y] pada catatan, pertahankan bagian lain (varian dst).
function replaceSplit(catatan: string | undefined, d: number, i: number) {
  const rest = (catatan || "").replace(/\[D:\d+,I:\d+\]\s*/, "");
  return `[D:${d},I:${i}] ${rest}`.trim();
}

// Alokasikan `total` ke item-item (key + weight) secara proporsional, jumlah persis.
function allocateProportionally(items: { key: string; weight: number }[], total: number): Record<string, number> {
  const result: Record<string, number> = {};
  const weighted = items.filter((it) => it.weight > 0);
  const sumWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (sumWeight <= 0 || total <= 0) return result;
  const floors = weighted.map((it) => {
    const share = (it.weight * total) / sumWeight;
    return { key: it.key, value: Math.floor(share), frac: share - Math.floor(share) };
  });
  const allocated = floors.reduce((s, f) => s + f.value, 0);
  let remaining = Math.max(0, total - allocated);
  floors.sort((a, b) => b.frac - a.frac);
  let idx = 0;
  while (remaining > 0 && floors.length > 0) {
    floors[idx % floors.length].value += 1;
    remaining -= 1;
    idx += 1;
  }
  floors.forEach((f) => { result[f.key] = f.value; });
  return result;
}

async function main() {
  const rangeLabel = DARI && SAMPAI ? `${DARI} s.d. ${SAMPAI}` : DARI ? `mulai ${DARI}` : SAMPAI ? `sampai ${SAMPAI}` : "SEMUA tanggal";
  console.log(`=== PERBAIKI RENCANA LAMA (${rangeLabel}) ===`);
  console.log(`Mode: ${APPLY ? "✅ EKSEKUSI (--apply)" : "🔍 DRY-RUN (hanya laporan)"}\n`);

  // ---------- 1. Muat data ----------
  let pq = supabase.from("produksi").select("tanggal, produk_id, qty_rencana, qty_realisasi");
  if (DARI) pq = pq.gte("tanggal", DARI);
  if (SAMPAI) pq = pq.lte("tanggal", SAMPAI);
  const { data: produksi, error: prodErr } = await pq;
  if (prodErr) throw new Error("produksi: " + prodErr.message);

  let rq = supabase
    .from("permohonan_stok")
    .select("id, tanggal_kirim, outlet_id, produk_id, qty, qty_rencana, catatan, catatan_rencana")
    .like("produk_id", "p-%");
  if (DARI) rq = rq.gte("tanggal_kirim", DARI);
  if (SAMPAI) rq = rq.lte("tanggal_kirim", SAMPAI);
  const { data: permohonan, error: psErr } = await rq;
  if (psErr) throw new Error("permohonan_stok: " + psErr.message);

  const { data: jurnal, error: jErr } = await supabase
    .from("jurnal").select("id, tanggal").eq("ref", "OUT-SALES");
  if (jErr) throw new Error("jurnal: " + jErr.message);
  const closedDates = new Set((jurnal || []).map((j: any) => j.tanggal));

  // ---------- 2. Distribusi aktual & rencana DB per tanggal per produk ----------
  const actualByDate: Record<string, Record<string, { d: number; i: number; total: number }>> = {};
  const rencanaDbByDate: Record<string, Record<string, { d: number; i: number; total: number }>> = {};
  (permohonan || []).forEach((r: any) => {
    const tgl = r.tanggal_kirim;
    if (!actualByDate[tgl]) actualByDate[tgl] = {};
    if (!rencanaDbByDate[tgl]) rencanaDbByDate[tgl] = {};
    const act = (actualByDate[tgl][r.produk_id] = actualByDate[tgl][r.produk_id] || { d: 0, i: 0, total: 0 });
    const ren = (rencanaDbByDate[tgl][r.produk_id] = rencanaDbByDate[tgl][r.produk_id] || { d: 0, i: 0, total: 0 });
    const qty = Number(r.qty) || 0;
    const renQty = r.qty_rencana != null ? Number(r.qty_rencana) : qty;
    act.total += qty;
    ren.total += renQty;
    if (r.produk_id === "p-bubur" || r.produk_id === "p-nasitim") {
      const sp = parseSplit(r.catatan);
      const hasSp = hasSplit(r.catatan);
      act.d += hasSp ? sp.d : qty;
      act.i += hasSp ? sp.i : 0;
      const rp = parseSplit(r.catatan_rencana || r.catatan);
      const hasRp = hasSplit(r.catatan_rencana || r.catatan);
      ren.d += hasRp ? rp.d : renQty;
      ren.i += hasRp ? rp.i : 0;
    } else {
      act.d += qty;
      ren.d += renQty;
    }
  });

  // ---------- 3. Rencana asli per tanggal dari produksi.qty_rencana ----------
  // produksi menyimpan bubur/tim sebagai 2 record (rencana D & rencana I) dengan
  // produk_id sama, dibedakan oleh qty_rencana. Produk lain 1 record.
  // Kumpulkan dulu semua nilai qty_rencana per tanggal/produk, lalu tetapkan D/I
  // dengan mencocokkan ke distribusi aktual (split di catatan permohonan_stok)
  // — urutan record dari fetch tidak dijamin.
  const planValsByDate: Record<string, Record<string, number[]>> = {};
  (produksi || []).forEach((p: any) => {
    const key = p.produk_id;
    if (!planValsByDate[p.tanggal]) planValsByDate[p.tanggal] = {};
    (planValsByDate[p.tanggal][key] = planValsByDate[p.tanggal][key] || []).push(Number(p.qty_rencana) || 0);
  });
  const planByDate: Record<string, Record<string, { d: number; i: number; total: number }>> = {};
  Object.entries(planValsByDate).forEach(([tgl, prods]) => {
    if (!planByDate[tgl]) planByDate[tgl] = {};
    Object.entries(prods).forEach(([prod, vals]) => {
      const total = vals.reduce((s, v) => s + v, 0);
      if (prod === "p-bubur" || prod === "p-nasitim") {
        const act = actualByDate[tgl]?.[prod] || { d: 0, i: 0, total: 0 };
        if (vals.length >= 2) {
          // Record lebih dekat ke distribusi aktual D → D (luberan/susut kecil).
          const [a, b] = vals;
          if (Math.abs(a - act.d) <= Math.abs(b - act.d)) {
            planByDate[tgl][prod] = { d: a, i: b, total };
          } else {
            planByDate[tgl][prod] = { d: b, i: a, total };
          }
        } else {
          planByDate[tgl][prod] = { d: vals[0] || 0, i: 0, total };
        }
      } else {
        planByDate[tgl][prod] = { d: total, i: 0, total };
      }
    });
  });

  // ---------- 4. Laporan per tanggal ----------
  const dates = [...new Set([...Object.keys(planByDate), ...Object.keys(actualByDate)])].sort();
  const affectedDates: string[] = [];
  console.log("Tanggal | Produk | Rencana(asli) | Distribusi(aktual) | Rencana(DB) | Status\n" + "-".repeat(100));
  dates.forEach((tgl) => {
    const products = [...new Set([
      ...Object.keys(planByDate[tgl] || {}),
      ...Object.keys(actualByDate[tgl] || {})
    ])].sort();
    let dateAffected = false;
    products.forEach((prod) => {
      const plan = planByDate[tgl]?.[prod] || { d: 0, i: 0, total: 0 };
      const act = actualByDate[tgl]?.[prod] || { d: 0, i: 0, total: 0 };
      const ren = rencanaDbByDate[tgl]?.[prod] || { d: 0, i: 0, total: 0 };
      const isSplit = prod === "p-bubur" || prod === "p-nasitim";
      const planStr = isSplit ? `${plan.d}+${plan.i}` : `${plan.total}`;
      const actStr = isSplit ? `${act.d}+${act.i}` : `${act.total}`;
      const renStr = isSplit ? `${ren.d}+${ren.i}` : `${ren.total}`;
      const affected = plan.total !== ren.total;
      if (affected) dateAffected = true;
      const flag = affected ? "🔴 rencana DB salah" : (plan.total !== act.total ? "🟡 plan != aktual (rencana DB sudah benar)" : "✅");
      console.log(`${tgl} | ${prod.padEnd(10)} | ${planStr.padEnd(14)} | ${actStr.padEnd(22)} | ${renStr.padEnd(12)} | ${flag}`);
    });
    if (dateAffected) affectedDates.push(tgl);
  });

  console.log(`\nTanggal TERDAMPAK (rencana DB perlu diperbaiki): ${affectedDates.length} tanggal`);
  affectedDates.forEach((t) => console.log(`  - ${t} ${closedDates.has(t) ? "(siklus TERTUTUP)" : "(siklus terbuka)"}`));

  if (!APPLY) {
    console.log("\n👉 DRY-RUN selesai. Jalankan dengan --apply untuk: (1) restore rencana, (2) buka siklus tanggal terdampak yang tertutup.");
    return;
  }

  // ---------- 5. EKSEKUSI ----------
  console.log("\n=== EKSEKUSI ===");
  let updatedRecords = 0;
  let reopenedDates = 0;

  for (const tgl of affectedDates) {
    // --- 5a. Restore rencana per outlet (proporsional terhadap distribusi aktual) ---
    const dayReqs = (permohonan || []).filter((r: any) => r.tanggal_kirim === tgl);
    const products = [...new Set(dayReqs.map((r: any) => r.produk_id))];
    for (const prod of products) {
      const plan = planByDate[tgl]?.[prod] || { d: 0, i: 0, total: 0 };
      if (plan.total <= 0) continue;
      const isSplit = prod === "p-bubur" || prod === "p-nasitim";
      const outlets = dayReqs.filter((r: any) => r.produk_id === prod);
      // Distribusi aktual per outlet (untuk proporsi)
      const weightsD: { key: string; weight: number }[] = [];
      const weightsI: { key: string; weight: number }[] = [];
      outlets.forEach((r: any) => {
        if (isSplit) {
          const sp = parseSplit(r.catatan);
          const hasSp = hasSplit(r.catatan);
          weightsD.push({ key: r.outlet_id, weight: hasSp ? sp.d : Number(r.qty) || 0 });
          weightsI.push({ key: r.outlet_id, weight: hasSp ? sp.i : 0 });
        } else {
          weightsD.push({ key: r.outlet_id, weight: Number(r.qty) || 0 });
        }
      });
      const allocD = allocateProportionally(weightsD, isSplit ? plan.d : plan.total);
      const allocI = isSplit ? allocateProportionally(weightsI, plan.i) : {};

      for (const r of outlets) {
        const d = allocD[r.outlet_id] || 0;
        const i = allocI[r.outlet_id] || 0;
        const newQtyRencana = isSplit ? d + i : d;
        const newCatatanRencana = isSplit ? replaceSplit(r.catatan_rencana || r.catatan || "", d, i) : (r.catatan_rencana || r.catatan || "");
        const { error } = await supabase
          .from("permohonan_stok")
          .update({ qty_rencana: newQtyRencana, catatan_rencana: newCatatanRencana })
          .eq("id", r.id);
        if (error) {
          console.error(`  ❌ update ${r.id} (${tgl} ${prod} ${r.outlet_id}): ${error.message}`);
        } else {
          updatedRecords++;
          console.log(`  ✅ ${tgl} ${prod} ${r.outlet_id}: qty_rencana ${Number(r.qty_rencana)} → ${newQtyRencana} (${isSplit ? `[D:${d},I:${i}]` : ""})`);
        }
      }
    }

    // --- 5b. Buka siklus jika masih tertutup ---
    if (closedDates.has(tgl)) {
      const outSales = (jurnal || []).filter((j: any) => j.tanggal === tgl);
      let delJ = 0, delM = 0;
      for (const j of outSales) {
        const { error } = await supabase.from("jurnal").delete().eq("id", j.id);
        if (!error) delJ++;
      }
      let mq = supabase
        .from("stok_movement")
        .select("id")
        .eq("tanggal", tgl)
        .eq("tipe", "IN")
        .or("keterangan.ilike.%Retur Bahan%,keterangan.ilike.%OH abon%");
      const { data: movs } = await mq;
      for (const m of (movs || [])) {
        const { error } = await supabase.from("stok_movement").delete().eq("id", m.id);
        if (!error) delM++;
      }
      console.log(`  🔓 Siklus ${tgl} DIBUKA (hapus ${delJ} jurnal OUT-SALES, ${delM} stok IN retur/OH)`);
      reopenedDates++;
    }
  }

  console.log(`\n=== RINGKASAN ===`);
  console.log(`Record permohonan_stok diperbarui: ${updatedRecords}`);
  console.log(`Siklus dibuka kembali: ${reopenedDates}`);
  console.log(`\n✅ Selesai! Untuk tanggal yang siklusnya dibuka: verifikasi di aplikasi lalu tutup siklus lagi (saveStep4).`);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
