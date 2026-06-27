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

async function runMigration() {
  const migrationPath = path.resolve(process.cwd(), "supabase/migrations/20260627000002_add_role_to_karyawan.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8");
  
  console.log("Running migration: 20260627000002_add_role_to_karyawan.sql");
  console.log("SQL:");
  console.log(sql);
  console.log("---");

  // Try via RPC (requires pg_exec function to be installed)
  try {
    const { error } = await supabase.rpc("exec_sql", { sql_text: sql });
    if (error) {
      throw error;
    }
    console.log("Migration applied successfully via RPC!");
    return;
  } catch (rpcErr: any) {
    console.log("RPC method not available:", rpcErr.message || rpcErr);
  }

  // Try via REST API using fetch to the Supabase management endpoint
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseAnonKey,
        "Authorization": `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ sql_text: sql })
    });
    if (response.ok) {
      console.log("Migration applied successfully via REST!");
      return;
    }
    console.log("REST method failed:", await response.text());
  } catch (restErr: any) {
    console.log("REST method not available:", restErr.message || restErr);
  }

  // If both methods fail, provide instructions to run via Supabase Dashboard
  console.log("\n========================================");
  console.log("Could not run migration automatically.");
  console.log("Please run this SQL manually in the Supabase Dashboard SQL Editor:");
  console.log("========================================");
  console.log(sql);
  console.log("========================================");
  console.log(`\nDashboard URL: ${supabaseUrl.replace("https://", "https://app.supabase.com/project/").split(".supabase")[0]}`);
}

runMigration().catch(console.error);
