/**
 * Apply RLS migration via raw HTTPS (bypasses PostgREST schema cache issues).
 *
 * Usage:
 *   npx tsx scripts/apply-rls.ts           # enable RLS
 *   npx tsx scripts/apply-rls.ts --rollback # disable RLS
 */

import https from "https";
import fs from "fs";
import path from "path";

// Load .env
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

const TABLES = [
  "outlets", "produk", "penjualan", "produksi", "jurnal",
  "coa", "bahan_baku", "stok_movement", "karyawan", "absensi",
  "permohonan_stok", "users", "kode_bantu",
  "hpp_produk", "hpp_bahan", "hpp_consumable",
];

/** Execute SQL via exec_sql RPC using raw HTTPS (avoids SDK schema cache). */
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

async function enableRLS() {
  console.log("🔒 Enabling RLS on all tables...\n");

  for (const table of TABLES) {
    // 1. Enable RLS (idempotent)
    const r1 = await execSQL(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    if (!r1.ok) {
      console.log(`  ❌ ${table}: enable RLS failed — ${r1.body}`);
      continue;
    }

    // 2. Drop existing policy (idempotent)
    await execSQL(`DROP POLICY IF EXISTS "full_access_${table}" ON public.${table}`);

    // 3. Create permissive policy for anon
    const r3 = await execSQL(
      `CREATE POLICY "full_access_${table}" ON public.${table} FOR ALL TO anon USING (true) WITH CHECK (true)`
    );
    if (!r3.ok) {
      console.log(`  ❌ ${table}: create policy failed — ${r3.body}`);
      continue;
    }

    console.log(`  ✅ ${table}`);
  }

  // Verify
  console.log("\n📊 Verification:");
  const rl = await execSQL(
    `SELECT relname, relrowsecurity FROM pg_class WHERE relrowsecurity = true AND relname IN (${TABLES.map((t) => `'${t}'`).join(",")}) ORDER BY relname`
  );
  console.log(`  RLS enabled: ${rl.ok ? rl.body : rl.body}`);

  const pol = await execSQL(
    `SELECT tablename, policyname FROM pg_policies WHERE tablename IN (${TABLES.map((t) => `'${t}'`).join(",")}) ORDER BY tablename`
  );
  console.log(`  Policies: ${pol.ok ? pol.body : pol.body}`);
}

async function rollbackRLS() {
  console.log("🔓 Rolling back RLS (disabling all)...\n");

  for (const table of TABLES) {
    await execSQL(`DROP POLICY IF EXISTS "full_access_${table}" ON public.${table}`);
    const r = await execSQL(`ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY`);
    if (!r.ok) {
      console.log(`  ❌ ${table}: ${r.body}`);
    } else {
      console.log(`  ✅ ${table}`);
    }
  }
}

async function main() {
  const rollback = process.argv.includes("--rollback");
  if (rollback) {
    await rollbackRLS();
    console.log("\n✅ Rollback complete — RLS disabled on all tables");
  } else {
    await enableRLS();
    console.log("\n✅ RLS enabled on all tables with permissive anon policies");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
