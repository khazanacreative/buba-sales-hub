const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "../.env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') value = value.substring(1, value.length - 1);
    else if (value.length > 0 && value.charAt(0) === "'" && value.charAt(value.length - 1) === "'") value = value.substring(1, value.length - 1);
    env[match[1]] = value;
  }
});

console.log("URL:", env["VITE_SUPABASE_URL"]);
console.log("KEY:", env["VITE_SUPABASE_ANON_KEY"]?.substring(0, 20) + "...");

const supabase = createClient(env["VITE_SUPABASE_URL"], env["VITE_SUPABASE_ANON_KEY"]);

async function check() {
  try {
    const promise = supabase.from("users").select("*");
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 10000));
    const { data: users, error: ue } = await Promise.race([promise, timeout]);
    
    console.log("=== USERS ===");
    if (ue) { console.log("Error:", ue.message); }
    console.log("Count:", users?.length ?? 0);
    if (users) users.forEach(u => console.log(" ", u.username, "| pw:", (u.password||"").substring(0,5), "| role:", u.role, "| kid:", u.karyawan_id));
  } catch(e) {
    console.log("Users query failed:", e.message || e);
  }

  const tables = ["outlets","karyawan","coa","bahan_baku","produk","produksi","penjualan","jurnal","stok_movement","permohonan_stok"];
  for (const tbl of tables) {
    try {
      const promise = supabase.from(tbl).select("*", { count: "exact", head: true });
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 8000));
      const { count } = await Promise.race([promise, timeout]);
      console.log(`=== ${tbl}: ${count} ===`);
    } catch(e) {
      console.log(`=== ${tbl}: ERROR (${e.message || e}) ===`);
    }
  }
  process.exit(0);
}

check().catch((err) => { console.error(err); process.exit(1); });
