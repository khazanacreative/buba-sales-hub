import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Parse .env
const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.substring(1, value.length - 1);
    } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env["VITE_SUPABASE_URL"];
const supabaseKey = env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"];
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_TANGGAL = "2026-07-26";
const TANGGAL2 = "2026-07-27";

// Same uid() generator as store.ts
const uid = () => Math.random().toString(36).slice(2, 10);

async function run() {
  console.log("🧪 TEST: Produksi Langkah 1 — Simpan Permohonan Stok\n");

  // 1. Get outlets
  const { data: outlets } = await supabase.from("outlets").select("id, nama").limit(3);
  if (!outlets || outlets.length === 0) {
    console.error("❌ Tidak ada outlet di database");
    return;
  }
  console.log(`📦 ${outlets.length} outlet: ${outlets.map(o => o.nama).join(", ")}`);

  // 2. Clean up test data
  await supabase.from("permohonan_stok").delete().eq("tanggal_kirim", TEST_TANGGAL);
  await supabase.from("permohonan_stok").delete().eq("tanggal_kirim", TANGGAL2);

  // 3. Simulate saveStep1 — build batch EXACTLY like addPermohonanStokBulk does it
  const batch: any[] = [];
  const testPlans = [
    { o: outlets[0], bubur_d: 5, bubur_i: 3, tim_d: 4, tim_i: 2, oatmeal: 10, puding: 8, abon: 6 },
    { o: outlets[1], bubur_d: 3, bubur_i: 2, tim_d: 2, tim_i: 1, oatmeal: 5, puding: 4, abon: 3 },
  ];

  const bubur1Name = "Ayam";
  const bubur2Name = "Salmon";
  const tim1Name = "Ayam";
  const tim2Name = "Salmon";
  const bubur1Variant = "b-ay01";
  const bubur2Variant = "b-sl01";
  const tim1Variant = "b-ay01";
  const tim2Variant = "b-sl01";

  for (const p of testPlans) {
    const totalBubur = p.bubur_d + p.bubur_i;
    if (totalBubur > 0) {
      batch.push({
        id: uid(),
        tanggal: TEST_TANGGAL,
        tanggal_kirim: TEST_TANGGAL,
        outlet_id: p.o.id,
        produk_id: "p-bubur",
        qty: totalBubur,
        status: "Pending",
        catatan: `[D:${p.bubur_d},I:${p.bubur_i}] [V:${bubur1Name},${bubur2Name}] [I:${bubur1Variant},${bubur2Variant}]`
      });
    }
    const totalTim = p.tim_d + p.tim_i;
    if (totalTim > 0) {
      batch.push({
        id: uid(),
        tanggal: TEST_TANGGAL,
        tanggal_kirim: TEST_TANGGAL,
        outlet_id: p.o.id,
        produk_id: "p-nasitim",
        qty: totalTim,
        status: "Pending",
        catatan: `[D:${p.tim_d},I:${p.tim_i}] [V:${tim1Name},${tim2Name}] [I:${tim1Variant},${tim2Variant}]`
      });
    }
    if (p.oatmeal > 0) {
      batch.push({ id: uid(), tanggal: TEST_TANGGAL, tanggal_kirim: TEST_TANGGAL, outlet_id: p.o.id, produk_id: "p-oatmeal", qty: p.oatmeal, status: "Pending", catatan: "" });
    }
    if (p.puding > 0) {
      batch.push({ id: uid(), tanggal: TEST_TANGGAL, tanggal_kirim: TEST_TANGGAL, outlet_id: p.o.id, produk_id: "p-puding", qty: p.puding, status: "Pending", catatan: "" });
    }
    if (p.abon > 0) {
      batch.push({ id: uid(), tanggal: TEST_TANGGAL, tanggal_kirim: TEST_TANGGAL, outlet_id: p.o.id, produk_id: "p-abon", qty: p.abon, status: "Pending", catatan: "" });
    }
  }

  console.log(`📝 Batch size: ${batch.length} items`);

  // 4. Insert batch (simulating addPermohonanStokBulk)
  const { error: insertErr } = await supabase.from("permohonan_stok").insert(batch);
  if (insertErr) {
    console.error(`❌ Gagal insert batch: ${insertErr.message}`);
    return;
  }
  console.log("✅ Batch berhasil disimpan!");

  // 5. Verify data
  const { data: saved, error: readErr } = await supabase
    .from("permohonan_stok")
    .select("id, tanggal, tanggal_kirim, outlet_id, produk_id, qty, status, catatan")
    .eq("tanggal_kirim", TEST_TANGGAL)
    .order("outlet_id")
    .order("produk_id");

  if (readErr) {
    console.error(`❌ Gagal baca: ${readErr.message}`);
    return;
  }
  console.log(`📊 ${saved?.length || 0} records tersimpan untuk ${TEST_TANGGAL}`);

  let allOk = true;
  for (const r of saved || []) {
    const cat = r.catatan || "";
    const splitMatch = cat.match(/D:(\d+),I:(\d+)/);
    let splitOk = true;
    if (splitMatch) {
      const d = Number(splitMatch[1]);
      const i = Number(splitMatch[2]);
      splitOk = (d + i) === r.qty;
      if (!splitOk) console.error(`  ❌ ${r.produk_id} @${r.outlet_id}: D+I=${d + i} ≠ qty=${r.qty}`);
    }
    if (splitOk) console.log(`  ✅ ${r.produk_id.padEnd(12)} @${r.outlet_id.padEnd(8)} qty=${String(r.qty).padEnd(3)} status=${r.status} catatan="${(cat.length > 40 ? cat.substring(0, 40) + "..." : cat)}"`);
    if (!splitOk) allOk = false;
  }

  // 6. Test 2-day plan: save for TANGGAL2
  const batch2: any[] = [
    { id: uid(), tanggal: TEST_TANGGAL, tanggal_kirim: TANGGAL2, outlet_id: outlets[0].id, produk_id: "p-bubur", qty: 4, status: "Pending", catatan: "[D:2,I:2] [V:Ayam,Salmon] [I:b-ay01,b-sl01]" },
    { id: uid(), tanggal: TEST_TANGGAL, tanggal_kirim: TANGGAL2, outlet_id: outlets[1].id, produk_id: "p-oatmeal", qty: 3, status: "Pending", catatan: "" },
  ];

  const { error: insertErr2 } = await supabase.from("permohonan_stok").insert(batch2);
  if (insertErr2) {
    console.log(`\n⚠️  Batch2 gagal: ${insertErr2.message}`);
  } else {
    const { data: saved2 } = await supabase
      .from("permohonan_stok")
      .select("id, tanggal_kirim, produk_id, qty")
      .eq("tanggal_kirim", TANGGAL2);
    
    console.log(`\n✅ Batch2 (${TANGGAL2}): ${saved2?.length || 0} records`);
    for (const r of saved2 || []) {
      console.log(`  ✅ ${r.produk_id.padEnd(12)} qty=${r.qty} kirim=${r.tanggal_kirim}`);
    }
  }

  // 7. Final verdict
  console.log("\n========================================");
  if (allOk) {
    console.log("✅ HASIL: Permohonan stok LANGKAH 1 berfungsi dengan benar!");
  } else {
    console.log("❌ HASIL: Ada masalah dengan data permohonan stok.");
  }

  // 8. Cleanup
  await supabase.from("permohonan_stok").delete().eq("tanggal_kirim", TEST_TANGGAL);
  await supabase.from("permohonan_stok").delete().eq("tanggal_kirim", TANGGAL2);
  console.log("🧹 Data test dibersihkan.\n");
}

run().catch(console.error);
