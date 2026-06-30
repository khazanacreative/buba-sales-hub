import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Parse .env file manually (same pattern as run-migration.ts)
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

async function clearPenjualan() {
  console.log("Menghapus semua data penjualan...");

  // Delete all records from penjualan table
  const { data, error } = await supabase.from("penjualan").delete().neq("id", "");

  if (error) {
    console.error("Gagal menghapus data penjualan:", error.message);
    process.exit(1);
  }

  console.log("✅ Semua data penjualan berhasil dihapus!");
  process.exit(0);
}

clearPenjualan().catch(console.error);
