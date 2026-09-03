/**
 * Apply saldo_awal migration to kode_bantu table.
 * Usage: npx tsx scripts/apply-saldo-awal-migration.ts
 */

import https from "https";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const env: Record<string, string> = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .forEach((l) => {
      const m = l.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (m) env[m[1]] = (m[2] || "").replace(/^["']|["']$/g, "");
    });
}

const SUPABASE_URL = env["VITE_SUPABASE_URL"];
const SERVICE_KEY = env["VITE_SUPABASE_SERVICE_ROLE_KEY"];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

function execSQL(sql: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
    const body = JSON.stringify({ sql_text: sql });
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode || 0, body: data.substring(0, 500) })
        );
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("🔧 Applying saldo_awal migration to kode_bantu...\n");

  const sql = `ALTER TABLE public.kode_bantu ADD COLUMN IF NOT EXISTS saldo_awal NUMERIC DEFAULT 0;`;
  const result = await execSQL(sql);

  if (result.ok) {
    console.log("✅ Migration applied successfully!");
    console.log(`   Response: ${result.body}`);
  } else {
    console.error(`❌ Migration failed (HTTP ${result.status})`);
    console.error(`   Response: ${result.body}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
