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

async function clearData() {
  console.log("1. Menghapus data stok_movement (hapus dulu karena ada FK ke produksi)...");
  const { error: stokErr } = await supabase
    .from("stok_movement")
    .delete()
    .neq("id", "");

  if (stokErr) {
    console.error("   ❌ Gagal menghapus stok_movement:", stokErr.message);
  } else {
    console.log("   ✅ Data stok_movement berhasil dihapus.");
  }

  console.log("2. Menghapus data produksi...");
  const { error: produksiErr } = await supabase
    .from("produksi")
    .delete()
    .neq("id", "");

  if (produksiErr) {
    console.error("   ❌ Gagal menghapus produksi:", produksiErr.message);
  } else {
    console.log("   ✅ Data produksi berhasil dihapus.");
  }

  console.log("3. Menghapus data penjualan...");
  const { error: penjualanErr } = await supabase
    .from("penjualan")
    .delete()
    .neq("id", "");

  if (penjualanErr) {
    console.error("   ❌ Gagal menghapus penjualan:", penjualanErr.message);
  } else {
    console.log("   ✅ Data penjualan berhasil dihapus.");
  }

  console.log("\nSelesai! Tabel penjualan, produksi, dan stok_movement telah dikosongkan.");
  console.log("Tabel lain (outlets, produk, bahan_baku, users, dll) tetap aman.");
  process.exit(0);
}

clearData().catch(console.error);
