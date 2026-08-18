/**
 * KOREKSI KEMASAN 2026-08-08 — sesuaikan pemotongan kemasan (Pemakaian Kemasan)
 * dengan DISTRIBUSI AKHIR.
 *
 * Latar belakang: pada 08-08 kemasan dipotong mengikuti realisasi produksi
 * (puding 51, oat 12) tepat sesuai aturan "kemasan menyesuaikan jumlah pasca
 * produksi". Setelah itu distribusi diubah (1 puding ditukar ke oatmeal) menjadi
 * puding 50 / oat 13 tanpa potong ulang kemasan → drift ±1:
 *   - CUP PUDING & PLASTIK SEALER : 51 → 50
 *   - CUP OAT & TUTUP OAT          : 12 → 13
 *
 * Saldo stok gudang dihitung dinamis dari stok_movement, jadi cukup update qty
 * record yang bersangkutan. Tidak ada jurnal yang perlu dikoreksi (08-08 ditutup
 * sebelum refactor alur keuangan — hanya punya OUT-SALES format lama).
 *
 * Cara pakai:
 *   npx tsx scripts/koreksi-kemasan-0808.ts          (DRY-RUN)
 *   npx tsx scripts/koreksi-kemasan-0808.ts --apply  (menulis ke DB)
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

const TANGGAL = "2026-08-08";
const LABEL = `Pemakaian Kemasan [${TANGGAL}]`;

// qty potong baru = distribusi akhir (puding 50, oatmeal 13)
const KOREKSI: Record<string, number> = {
  "b-cuppud01": 50, // CUP PUDING
  "b-plas01": 50,   // PLASTIK SEALER
  "b-cupoat1": 13,  // CUP OAT
  "b-ttoat01": 13   // TUTUP OAT
};

async function main() {
  const APPLY = process.argv.includes("--apply");
  console.log(`=== KOREKSI KEMASAN ${TANGGAL} → cocok dengan distribusi akhir ===`);
  console.log(`Mode: ${APPLY ? "✅ MENULIS KE DATABASE (--apply)" : "🔍 DRY-RUN (tidak menulis)"}\n`);

  // 1. Movement pemotongan kemasan 08-08
  const { data: movs, error: mErr } = await supabase
    .from("stok_movement")
    .select("id, bahan_id, qty, keterangan")
    .eq("tipe", "OUT")
    .eq("keterangan", LABEL);
  if (mErr) { console.error("❌ Gagal baca stok_movement:", mErr.message); process.exit(1); }

  // 2. Distribusi akhir (permohonan_stok Disetujui) puding/oatmeal
  const { data: reqs, error: rErr } = await supabase
    .from("permohonan_stok")
    .select("produk_id, qty")
    .eq("tanggal_kirim", TANGGAL)
    .eq("status", "Disetujui")
    .in("produk_id", ["p-puding", "p-oatmeal"]);
  if (rErr) { console.error("❌ Gagal baca permohonan_stok:", rErr.message); process.exit(1); }
  const dist = { puding: 0, oatmeal: 0 };
  (reqs || []).forEach((r: any) => {
    if (r.produk_id === "p-puding") dist.puding += r.qty || 0;
    else dist.oatmeal += r.qty || 0;
  });

  console.log(`Distribusi akhir: puding=${dist.puding}, oatmeal=${dist.oatmeal}\n`);
  console.log("Perubahan qty movement Pemakaian Kemasan:");

  const changes: { id: string; bahanId: string; lama: number; baru: number }[] = [];
  for (const bahanId of Object.keys(KOREKSI)) {
    const mov = (movs || []).filter((m: any) => m.bahan_id === bahanId);
    const target = KOREKSI[bahanId];
    if (mov.length === 0) {
      console.log(`  ⚠️  ${bahanId}: TIDAK ADA movement Pemakaian Kemasan utk dikoreksi!`);
      continue;
    }
    for (const m of mov) {
      const lama = Number(m.qty);
      if (lama === target) {
        console.log(`  ✅ ${bahanId} (id=${m.id}): qty=${lama} sudah benar`);
      } else {
        console.log(`  🔄 ${bahanId} (id=${m.id}): qty ${lama} → ${target}`);
        changes.push({ id: m.id, bahanId, lama, baru: target });
      }
    }
  }

  console.log(`\nTotal movement akan diubah: ${changes.length}`);
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
      .from("stok_movement")
      .update({ qty: c.baru })
      .eq("id", c.id);
    if (error) {
      console.error(`  ❌ Gagal update id=${c.id} (${c.bahanId}): ${error.message}`);
    } else {
      ok++;
      console.log(`  ✅ ${c.bahanId} (id=${c.id}) qty ${c.lama} → ${c.baru}`);
    }
  }
  console.log(`\n✅ ${ok}/${changes.length} record berhasil diperbarui.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
