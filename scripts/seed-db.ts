import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SEED_OUTLETS, SEED_PRODUK, SEED_COA, SEED_BAHAN, SEED_KARYAWAN, SEED_JURNAL } from "../src/lib/seed.ts";

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
    // Remove outer quotes if present
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
console.log("Initializing Supabase client...");
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSeed() {
  try {
    console.log("1. Cleaning up existing database tables...");
    
    // Delete in dependency order
    await supabase.from("penjualan").delete().neq("id", "");
    await supabase.from("produksi").delete().neq("id", "");
    await supabase.from("jurnal").delete().neq("id", "");
    await supabase.from("stok_movement").delete().neq("id", "");
    await supabase.from("absensi").delete().neq("id", "");
    await supabase.from("permohonan_stok").delete().neq("id", "");
    await supabase.from("karyawan").delete().neq("id", "");
    await supabase.from("users").delete().neq("username", "");
    await supabase.from("produk").delete().neq("id", "");
    await supabase.from("outlets").delete().neq("id", "");
    await supabase.from("coa").delete().neq("kode", "");
    await supabase.from("bahan_baku").delete().neq("id", "");
    
    console.log("Database cleared successfully.");

    console.log("2. Seeding outlets...");
    const { error: outletsErr } = await supabase.from("outlets").insert(SEED_OUTLETS);
    if (outletsErr) throw outletsErr;
    console.log(`Successfully seeded ${SEED_OUTLETS.length} outlets.`);

    console.log("3. Seeding produk...");
    const { error: produkErr } = await supabase.from("produk").insert(SEED_PRODUK);
    if (produkErr) throw produkErr;
    console.log(`Successfully seeded ${SEED_PRODUK.length} produk.`);

    console.log("4. Seeding users...");
    const seedUsers = [
      { username: "admin", password: "admin123", nama: "Administrator", role: "admin", outlet_id: null },
      { username: "khazana", password: "Fazana@10", nama: "Super Admin", role: "admin", outlet_id: null },
      { username: "produksi", password: "produksi123", nama: "Kepala Produksi", role: "admin", outlet_id: null },
      ...SEED_OUTLETS.map((o) => ({
        username: o.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        password: "buba123",
        nama: o.nama,
        role: "outlet",
        outlet_id: o.id
      }))
    ];
    const { error: usersErr } = await supabase.from("users").insert(seedUsers);
    if (usersErr) throw usersErr;
    console.log(`Successfully seeded ${seedUsers.length} users.`);

    console.log("5. Seeding COA accounts...");
    const seedCoaMapped = SEED_COA.map((c) => ({
      kode: c.kode,
      nama: c.nama,
      tipe: c.tipe,
      kategori: c.kategori
    }));
    const { error: coaErr } = await supabase.from("coa").insert(seedCoaMapped);
    if (coaErr) throw coaErr;
    console.log(`Successfully seeded ${seedCoaMapped.length} COA accounts.`);

    console.log("6. Seeding bahan baku...");
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
    const { error: bahanErr } = await supabase.from("bahan_baku").insert(seedBahanMapped);
    if (bahanErr) throw bahanErr;
    console.log(`Successfully seeded ${seedBahanMapped.length} bahan baku items.`);

    console.log("7. Seeding karyawan...");
    const seedKaryawanMapped = SEED_KARYAWAN.map((k) => ({
      id: k.id,
      nama: k.nama,
      posisi: k.posisi,
      outlet_id: k.outletId,
      gaji_pokok: k.gajiPokok,
      bonus_omset: k.bonusOmset,
      bonus_ulasan: k.bonusUlasan
    }));
    const { error: karyawanErr } = await supabase.from("karyawan").insert(seedKaryawanMapped);
    if (karyawanErr) throw karyawanErr;
    console.log(`Successfully seeded ${seedKaryawanMapped.length} karyawan.`);

    console.log("8. Seeding initial balanced Trial Balance journal entries...");
    const seedJurnalMapped = SEED_JURNAL.map((j) => ({
      id: j.id,
      tanggal: j.tanggal,
      ref: j.ref,
      keterangan: j.keterangan,
      kode_akun: j.kodeAkun,
      akun: j.akun,
      tipe: j.tipe,
      jumlah: j.jumlah,
      kategori: j.kategori
    }));
    const { error: jurnalErr } = await supabase.from("jurnal").insert(seedJurnalMapped);
    if (jurnalErr) throw jurnalErr;
    console.log(`Successfully seeded ${seedJurnalMapped.length} journal entries.`);

    console.log("All tables successfully seeded!");
  } catch (error) {
    console.error("Error seeding database:", error);
    process.exit(1);
  }
}

runSeed();
