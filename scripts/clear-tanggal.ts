import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Ubah tanggal di sini sesuai kebutuhan
const TANGGAL = "2026-07-04";

async function clearData() {
  console.log(`Menghapus data untuk tanggal: ${TANGGAL}`);

  // 1. Hapus penjualan
  console.log("1. Menghapus data penjualan...");
  const { error: penjualanErr } = await supabase
    .from("penjualan")
    .delete()
    .eq("tanggal", TANGGAL);
  if (penjualanErr) {
    console.error("   ❌ Gagal:", penjualanErr.message);
  } else {
    console.log("   ✅ Data penjualan berhasil dihapus.");
  }

  // 2. Hapus produksi
  console.log("2. Menghapus data produksi...");
  const { error: produksiErr } = await supabase
    .from("produksi")
    .delete()
    .eq("tanggal", TANGGAL);
  if (produksiErr) {
    console.error("   ❌ Gagal:", produksiErr.message);
  } else {
    console.log("   ✅ Data produksi berhasil dihapus.");
  }

  // 3. Hapus distribusi (permohonan_stok) — berdasarkan tanggal_kirim
  console.log("3. Menghapus data distribusi (permohonan_stok)...");
  const { error: distribusiErr } = await supabase
    .from("permohonan_stok")
    .delete()
    .eq("tanggal_kirim", TANGGAL);
  if (distribusiErr) {
    console.error("   ❌ Gagal:", distribusiErr.message);
  } else {
    console.log("   ✅ Data distribusi berhasil dihapus.");
  }

  console.log("\nSelesai! Hanya data tanggal", TANGGAL, "yang dihapus dari tabel penjualan, produksi, dan permohonan_stok.");
  process.exit(0);
}

clearData().catch(console.error);
