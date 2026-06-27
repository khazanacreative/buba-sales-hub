import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SEED_BAHAN } from "../src/lib/seed.ts";

// Parse .env file manually
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
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.substring(1, value.length - 1);
    } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabaseUrl = env["VITE_SUPABASE_URL"];
const supabaseAnonKey = env["VITE_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined in .env");
  process.exit(1);
}

console.log("Supabase URL:", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seedBahan() {
  try {
    // Step 1: Add konversi_gram column if it doesn't exist
    console.log("\n1. Memastikan kolom konversi_gram ada...");
    try {
      // Try a simple query that would fail if column doesn't exist
      const { error: testErr } = await supabase
        .from("bahan_baku")
        .select("konversi_gram")
        .limit(1);
      
      if (testErr && testErr.message?.includes("konversi_gram")) {
        // Column doesn't exist, add it via raw SQL
        console.log("   Kolom konversi_gram belum ada, menambahkan...");
        const { error: alterErr } = await supabase.rpc("exec_sql", {
          sql_text: "ALTER TABLE bahan_baku ADD COLUMN IF NOT EXISTS konversi_gram NUMERIC;"
        });
        if (alterErr) {
          // If RPC fails, column might already exist or RPC not available
          console.log("   Note: Tidak bisa tambah kolom via RPC, lanjut tanpa konversi_gram.");
        } else {
          console.log("   Kolom konversi_gram berhasil ditambahkan.");
        }
      } else {
        console.log("   Kolom konversi_gram sudah ada.");
      }
    } catch (e) {
      console.log("   (skip) Tidak bisa cek kolom, lanjut insert tanpa konversi_gram.");
    }

    // Step 2: Check existing data
    const { count: existingCount } = await supabase
      .from("bahan_baku")
      .select("*", { count: "exact", head: true });
    console.log(`\n2. Data bahan_baku saat ini: ${existingCount} records`);

    // Step 3: Delete existing bahan records
    console.log("3. Menghapus data bahan_baku yang ada...");
    const { error: delErr } = await supabase.from("bahan_baku").delete().neq("id", "");
    if (delErr) throw delErr;
    console.log("   Data bahan_baku berhasil dihapus.");

    // Step 4: Seed with proper data - try with konversi_gram first, fallback without
    console.log("4. Menyimpan data bahan_baku baru...");
    const seedBahanMapped = SEED_BAHAN.map((b) => ({
      id: b.id,
      kode: b.kode,
      nama: b.nama,
      satuan: b.satuan,
      stok_min: b.stokMin,
      stok_awal: b.stokAwal,
      harga_beli: b.hargaBeli,
      konversi_gram: b.konversiGram ?? null
    }));

    const { error: insertErr } = await supabase.from("bahan_baku").insert(seedBahanMapped);
    if (insertErr) {
      // If fails due to konversi_gram, try without it
      if (insertErr.message?.includes("konversi_gram")) {
        console.log("   Kolom konversi_gram tidak tersedia, insert tanpa konversi_gram...");
        const seedSimple = SEED_BAHAN.map((b) => ({
          id: b.id,
          kode: b.kode,
          nama: b.nama,
          satuan: b.satuan,
          stok_min: b.stokMin,
          stok_awal: b.stokAwal,
          harga_beli: b.hargaBeli
        }));
        const { error: retryErr } = await supabase.from("bahan_baku").insert(seedSimple);
        if (retryErr) throw retryErr;
        console.log(`   ${seedSimple.length} bahan baku berhasil disimpan (tanpa konversi_gram).`);
      } else {
        throw insertErr;
      }
    } else {
      console.log(`   ${seedBahanMapped.length} bahan baku berhasil disimpan.`);
    }

    // Verify
    console.log("\n5. Verifikasi hasil...");
    const { count: newCount } = await supabase
      .from("bahan_baku")
      .select("*", { count: "exact", head: true });
    console.log(`   Total bahan_baku: ${newCount} records`);

    // Show sample
    const { data: sample } = await supabase
      .from("bahan_baku")
      .select("kode, nama, stok_awal, harga_beli")
      .limit(5);
    console.log("   Sample:", JSON.stringify(sample, null, 2));

    console.log("\n✅ Seed bahan baku berhasil!");
    console.log("   Silakan refresh halaman web untuk melihat perubahan.");
  } catch (error) {
    console.error("\n❌ Error seeding bahan baku:", error);
    process.exit(1);
  }
}

seedBahan();
