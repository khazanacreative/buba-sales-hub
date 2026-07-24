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
const supabaseServiceKey = env["VITE_SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl) {
  console.error("Error: VITE_SUPABASE_URL is not defined in .env");
  process.exit(1);
}

// Use service_role key for running migrations (higher privileges).
if (!supabaseServiceKey) {
  console.error("Error: VITE_SUPABASE_SERVICE_ROLE_KEY tidak ditemukan di .env");
  console.error("");
  console.error("  🔐 Script ini memerlukan Service Role Key untuk menjalankan migrasi.");
  console.error("     Ambil dari: Supabase Dashboard → Project Settings → API → service_role key");
  console.error("");
  console.error("  Tambahkan ke file .env:");
  console.error(`    VITE_SUPABASE_SERVICE_ROLE_KEY=eyJ...`);
  console.error("");
  process.exit(1);
}

// Create a Supabase client with the service_role key
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase/migrations");
const BOOTSTRAP_MIGRATION = "20260627000009_create_exec_sql_function.sql";

async function execSql(sql: string): Promise<boolean> {
  // Try via RPC
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: sql });
    if (!error) return true;
    console.log("  RPC method failed:", error.message);
  } catch (rpcErr: any) {
    console.log("  RPC method not available:", rpcErr.message || rpcErr);
  }

  // Try via REST API
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseServiceKey,
        "Authorization": `Bearer ${supabaseServiceKey}`
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

async function generateCombinedSql(files: string[], outputPath: string) {
  const combinedSql = files
    .map((f) => `-- === ${f} ===\n` + fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf-8"))
    .join("\n\n");
  fs.writeFileSync(outputPath, combinedSql, "utf-8");
  console.log(`\n📄 File gabungan: ${outputPath}`);
}

async function checkExecSql(): Promise<boolean> {
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: "SELECT 1" });
    return !error;
  } catch {
    return false;
  }
}

async function runMigrations() {
  // Read all migration files sorted by name
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("Tidak ada file migrasi ditemukan di", MIGRATIONS_DIR);
    return;
  }

  console.log(`Ditemukan ${files.length} file migrasi:\n`);

  // Bootstrap check: ensure exec_sql function exists before running migrations
  const hasExecSql = await checkExecSql();
  if (!hasExecSql) {
    console.log("\n⚠️  Fungsi exec_sql belum tersedia di database Supabase.");
    console.log("   Fungsi ini diperlukan untuk menjalankan migrasi secara otomatis.\n");

    const bootstrapPath = path.join(MIGRATIONS_DIR, BOOTSTRAP_MIGRATION);
    if (fs.existsSync(bootstrapPath)) {
      const sql = fs.readFileSync(bootstrapPath, "utf-8");
      console.log("   Silakan jalankan SQL berikut di Supabase Dashboard → SQL Editor SATU KALI SAJA:");
      console.log("   ===========================================================");
      console.log(sql);
      console.log("   ===========================================================");
      console.log(`\n   Dashboard: ${supabaseUrl.replace("https://", "https://app.supabase.com/project/").split(".supabase")[0]}\n`);
    }

    await generateCombinedSql(files, path.resolve(process.cwd(), "scripts/combined-migration.sql"));

    console.log("\n❌ Tidak dapat menjalankan migrasi otomatis.");
    console.log("   Jalankan bootstrap migration di Dashboard, lalu jalankan script ini lagi.");
    return;
  }

  console.log("✅ Fungsi exec_sql tersedia. Menjalankan migrasi...\n");

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
    await generateCombinedSql(failedFiles, path.resolve(process.cwd(), "scripts/combined-migration.sql"));

    console.log("❌ Migrasi yang gagal:");
    for (const f of failedFiles) {
      console.log(`   - ${f}`);
    }
  } else {
    console.log("✅ Semua migrasi berhasil dijalankan!");
    const combinedPath = path.resolve(process.cwd(), "scripts/combined-migration.sql");
    if (fs.existsSync(combinedPath)) {
      fs.unlinkSync(combinedPath);
      console.log("   File combined-migration.sql sudah dihapus (semua sukses).");
    }
  }
}

runMigrations().catch(console.error);
