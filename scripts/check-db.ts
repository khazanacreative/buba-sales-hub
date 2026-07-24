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
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
      value = value.substring(1, value.length - 1);
    } else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") {
      value = value.substring(1, value.length - 1);
    }
    env[match[1]] = value;
  }
});

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]);

async function check() {
  // Users
  const { data: users, error: ue } = await supabase.from("users").select("*");
  console.log("=== USERS ===");
  if (ue) { console.log("Error:", ue.message); process.exit(1); }
  console.log("Count:", users?.length);
  if (users) users.forEach(u => console.log(" ", u.username, "has-password:", !!u.password, "role:", u.role, "outlet_id:", u.outlet_id, "karyawan_id:", u.karyawan_id));

  // Other tables - just counts
  for (const tbl of ["outlets", "karyawan", "coa", "bahan_baku", "produk", "produksi", "penjualan", "jurnal", "stok_movement"]) {
    const { count } = await supabase.from(tbl).select("*", { count: "exact", head: true });
    console.log(`=== ${tbl.toUpperCase()}: ${count} ===`);
  }

  process.exit(0);
}

check().catch((err) => { console.error(err); process.exit(1); });
