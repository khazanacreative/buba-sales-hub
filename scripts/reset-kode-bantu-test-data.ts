/**
 * Reset data test: hapus semua kode bantu & jurnal terkait.
 * Usage: npx tsx scripts/reset-kode-bantu-test-data.ts
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
  console.log("🗑️  Reset data test kode bantu...\n");

  // 1. Hapus jurnal yang link ke kode_bantu
  console.log("1️⃣  Hapus jurnal terkait kode bantu...");
  const r1 = await execSQL(`DELETE FROM public.jurnal WHERE kode_bantu_id IS NOT NULL`);
  console.log(`   ${r1.ok ? "✅" : "❌"} HTTP ${r1.status}: ${r1.body}\n`);

  // 2. Hapus semua kode_bantu
  console.log("2️⃣  Hapus semua kode bantu...");
  const r2 = await execSQL(`DELETE FROM public.kode_bantu`);
  console.log(`   ${r2.ok ? "✅" : "❌"} HTTP ${r2.status}: ${r2.body}\n`);

  // 3. Verifikasi
  console.log("3️⃣  Verifikasi...");
  const r3 = await execSQL(`SELECT COUNT(*) as cnt FROM public.kode_bantu`);
  console.log(`   kode_bantu: ${r3.body}`);
  const r4 = await execSQL(`SELECT COUNT(*) as cnt FROM public.jurnal WHERE kode_bantu_id IS NOT NULL`);
  console.log(`   jurnal (kode_bantu): ${r4.body}\n`);

  console.log("✅ Reset selesai!");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
