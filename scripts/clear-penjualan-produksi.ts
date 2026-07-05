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
  console.log("🧹 Mengosongkan semua data transaksional...\n");

  console.log("1. Menghapus stok_movement...");
  const { error: stokErr } = await supabase
    .from("stok_movement")
    .delete()
    .neq("id", "");
  if (stokErr) console.error("   ❌ Gagal:", stokErr.message);
  else console.log("   ✅ stok_movement berhasil dikosongkan.");

  console.log("2. Menghapus permohonan_stok (distribusi)...");
  const { error: permohonanErr } = await supabase
    .from("permohonan_stok")
    .delete()
    .neq("id", "");
  if (permohonanErr) console.error("   ❌ Gagal:", permohonanErr.message);
  else console.log("   ✅ permohonan_stok berhasil dikosongkan.");

  console.log("3. Menghapus produksi...");
  const { error: produksiErr } = await supabase
    .from("produksi")
    .delete()
    .neq("id", "");
  if (produksiErr) console.error("   ❌ Gagal:", produksiErr.message);
  else console.log("   ✅ produksi berhasil dikosongkan.");

  console.log("4. Menghapus penjualan...");
  const { error: penjualanErr } = await supabase
    .from("penjualan")
    .delete()
    .neq("id", "");
  if (penjualanErr) console.error("   ❌ Gagal:", penjualanErr.message);
  else console.log("   ✅ penjualan berhasil dikosongkan.");

  console.log("5. Menghapus jurnal (termasuk OUT-SALES)...");
  const { error: jurnalErr } = await supabase
    .from("jurnal")
    .delete()
    .neq("id", "");
  if (jurnalErr) console.error("   ❌ Gagal:", jurnalErr.message);
  else console.log("   ✅ jurnal berhasil dikosongkan.");

  console.log("\n✅ Selesai! Semua data transaksional telah dikosongkan:");
  console.log("   - stok_movement");
  console.log("   - permohonan_stok (distribusi)");
  console.log("   - produksi");
  console.log("   - penjualan");
  console.log("   - jurnal");
  console.log("\n📌 Tabel master (outlets, produk, bahan_baku, coa, karyawan, users) tetap aman.");
  console.log("📌 Refresh browser untuk melihat perubahan di aplikasi.\n");
  process.exit(0);
}

clearData().catch(console.error);
