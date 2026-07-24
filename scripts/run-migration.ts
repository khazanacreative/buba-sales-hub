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

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");

async function execSql(sql: string): Promise<boolean> {
  // Try via RPC (requires pg_exec function to be installed)
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: sql });
    if (!error) return true;
    console.log("  RPC method failed:", error.message);
  } catch (rpcErr: any) {
    console.log("  RPC method not available:", rpcErr.message || rpcErr);
  }

  // Try via REST API using fetch to the Supabase management endpoint
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ sql_text: sql })
    });
    if (response.ok) return true;
    console.log("  REST method failed:", await response.text());
  } catch (restErr: any) {
    console.log("  REST method not available:", restErr.message || restErr);
  }

  return false;
}

async function runMigrations() {
  // Read all migration files sorted by name
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Tidak ada file migrasi ditemukan di", MIGRATIONS_DIR);
    return;
  }

  console.log(`Ditemukan ${files.length} file migrasi:\n`);

  let successCount = 0;
  const failedFiles: string[] = [];

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf-8");

    console.log(`▶ Menjalankan migrasi: ${file}`);
    
    const applied = await execSql(sql);
    if (applied) {
      console.log(`  ✅ ${file} berhasil!\n`);
      successCount++;
    } else {
      console.log(`  ❌ ${file} gagal dijalankan secara otomatis.\n`);
      failedFiles.push(file);
    }
  }

  // Summary
  console.log("========================================");
  console.log(`Ringkasan: ${successCount}/${files.length} migrasi berhasil.\n`);

  if (failedFiles.length > 0) {
    // Generate combined SQL file for manual execution
    const combinedPath = path.resolve(process.cwd(), "scripts/combined-migration.sql");
    const combinedSql = files
      .map(f => `-- === ${f} ===\n` + fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"))
      .join("\n\n");
    fs.writeFileSync(combinedPath, combinedSql, "utf-8");

    console.log("❌ Migrasi yang gagal:");
    for (const f of failedFiles) {
      console.log(`   - ${f}`);
    }
    console.log(`\n📄 File gabungan telah dibuat: scripts/combined-migration.sql`);
    console.log("\nSilakan buka Supabase Dashboard → SQL Editor dan jalankan file tersebut.");
    console.log(`\nDashboard URL: ${supabaseUrl.replace("https://", "https://app.supabase.com/project/").split(".supabase")[0]}`);
  } else {
    console.log("✅ Semua migrasi berhasil dijalankan!");
  }
}

runMigrations().catch(console.error);
