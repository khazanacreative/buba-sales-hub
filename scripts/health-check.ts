/**
 * Supabase Health Check — Monitor koneksi & status PostgREST
 *
 * Usage:
 *   npx tsx scripts/health-check.ts              # sekali (single check)
 *   npx tsx scripts/health-check.ts --watch       # periodik setiap 30 detik
 *   npx tsx scripts/health-check.ts --watch 10    # periodik setiap 10 detik
 */

import { createClient } from "@supabase/supabase-js";
import https from "https";

// ── Env ──────────────────────────────────────────────────────────────────────
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

const URL = env["VITE_SUPABASE_URL"] || "https://mrydrongthbximtflbps.supabase.co";
const ANON_KEY = env["VITE_SUPABASE_ANON_KEY"] || "";
const SERVICE_KEY = env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || "";

// ── Types ────────────────────────────────────────────────────────────────────
interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const color = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const pass = (s: string) => color.green(`✅ ${s}`);
const fail = (s: string) => color.red(`❌ ${s}`);
const warn = (s: string) => color.yellow(`⚠️  ${s}`);

function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

// ── Raw HTTP check (independent of supabase-js) ──────────────────────────────
function httpGet(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<{ status: number; body: string; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: body.substring(0, 500), latencyMs: Date.now() - start }));
    });
    req.on("error", (e) => reject(e));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── Check functions ──────────────────────────────────────────────────────────

async function checkRawHTTP(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await httpGet(`${URL}/rest/v1/?apikey=${ANON_KEY}`, { apikey: ANON_KEY });
    const latencyMs = Date.now() - start;
    if (res.status === 200) return { name: "HTTP API (raw)", ok: true, detail: `200 OK`, latencyMs };
    if (res.status === 503) return { name: "HTTP API (raw)", ok: false, detail: `503 PostgREST unhealthy — ${res.body.substring(0, 120)}`, latencyMs };
    return { name: "HTTP API (raw)", ok: false, detail: `HTTP ${res.status} — ${res.body.substring(0, 120)}`, latencyMs };
  } catch (e: any) {
    return { name: "HTTP API (raw)", ok: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

async function checkAnonQuery(): Promise<CheckResult> {
  const client = createClient(URL, ANON_KEY);
  const start = Date.now();
  try {
    const { data, error, count } = await client.from("outlets").select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;
    if (error) return { name: "Anon → outlets (SELECT)", ok: false, detail: `${error.code}: ${error.message}`, latencyMs };
    return { name: "Anon → outlets (SELECT)", ok: true, detail: `${count ?? "?"} rows`, latencyMs };
  } catch (e: any) {
    return { name: "Anon → outlets (SELECT)", ok: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

async function checkServiceQuery(): Promise<CheckResult> {
  if (!SERVICE_KEY) return { name: "Service → outlets (SELECT)", ok: true, detail: "skipped (no service key)", latencyMs: 0 };
  const client = createClient(URL, SERVICE_KEY);
  const start = Date.now();
  try {
    const { data, error, count } = await client.from("outlets").select("id", { count: "exact", head: true });
    const latencyMs = Date.now() - start;
    if (error) return { name: "Service → outlets (SELECT)", ok: false, detail: `${error.code}: ${error.message}`, latencyMs };
    return { name: "Service → outlets (SELECT)", ok: true, detail: `${count ?? "?"} rows`, latencyMs };
  } catch (e: any) {
    return { name: "Service → outlets (SELECT)", ok: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

async function checkAnonMultiTable(): Promise<CheckResult> {
  const client = createClient(URL, ANON_KEY);
  const tables = ["outlets", "produk", "penjualan", "produksi", "jurnal", "permohonan_stok"];
  const start = Date.now();
  try {
    const results = await Promise.all(
      tables.map(async (t) => {
        const { error, count } = await client.from(t).select("id", { count: "exact", head: true });
        return { table: t, ok: !error, count: count ?? 0, error: error?.message };
      })
    );
    const latencyMs = Date.now() - start;
    const failed = results.filter((r) => !r.ok);
    const details = results.map((r) => `${r.table}:${r.ok ? r.count : "ERR"}`).join(", ");
    if (failed.length > 0) {
      return { name: "Anon → multi-table count", ok: false, detail: `${failed.length}/${tables.length} failed — ${details}`, latencyMs };
    }
    return { name: "Anon → multi-table count", ok: true, detail: details, latencyMs };
  } catch (e: any) {
    return { name: "Anon → multi-table count", ok: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

async function checkExecSQL(): Promise<CheckResult> {
  if (!SERVICE_KEY) return { name: "RPC exec_sql", ok: true, detail: "skipped (no service key)", latencyMs: 0 };
  const client = createClient(URL, SERVICE_KEY);
  const start = Date.now();
  try {
    const { data, error } = await client.rpc("exec_sql", { query: "SELECT 1 AS ok" });
    const latencyMs = Date.now() - start;
    if (error) return { name: "RPC exec_sql", ok: false, detail: `${error.code}: ${error.message}`, latencyMs };
    return { name: "RPC exec_sql", ok: true, detail: `response: ${JSON.stringify(data).substring(0, 60)}`, latencyMs };
  } catch (e: any) {
    return { name: "RPC exec_sql", ok: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function runChecks(): Promise<boolean> {
  const now = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  console.log(`\n${color.bold(`── Health Check ── ${now} ──`)}`);
  console.log(`${color.gray(`Project: ${URL}`)}\n`);

  const checks = await Promise.all([checkRawHTTP(), checkAnonQuery(), checkServiceQuery(), checkAnonMultiTable(), checkExecSQL()]);

  let allOk = true;
  for (const c of checks) {
    const icon = c.ok ? pass("") : fail("");
    const latency = color.gray(`(${formatMs(c.latencyMs)})`);
    const label = color.bold(c.name.padEnd(35));
    console.log(`  ${icon} ${label} ${c.detail} ${latency}`);
    if (!c.ok) allOk = false;
  }

  console.log(`\n  ${allOk ? color.green("🟢 ALL HEALTHY") : color.red("🔴 ISSUES DETECTED")}`);
  return allOk;
}

async function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes("--watch");
  const watchIdx = args.indexOf("--watch");
  const intervalSec = watchIdx >= 0 && args[watchIdx + 1] ? parseInt(args[watchIdx + 1]) || 30 : 30;

  if (!ANON_KEY) {
    console.error("❌ Missing VITE_SUPABASE_ANON_KEY in .env");
    process.exit(1);
  }

  if (!watchMode) {
    // Single check
    const ok = await runChecks();
    process.exit(ok ? 0 : 1);
  }

  // Watch mode
  console.log(color.cyan(`🔄 Watching every ${intervalSec}s — press Ctrl+C to stop`));
  let checkCount = 0;
  const failures: string[] = [];

  const tick = async () => {
    checkCount++;
    const ok = await runChecks();
    const ts = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
    if (!ok) failures.push(`[${ts}] check #${checkCount} FAILED`);

    // Summary after every 10 checks
    if (checkCount % 10 === 0) {
      console.log(`\n${color.bold(`── Summary after ${checkCount} checks ──`)}`);
      console.log(`  Failures: ${failures.length}`);
      if (failures.length > 0) {
        console.log(`  Last failures:`);
        failures.slice(-5).forEach((f) => console.log(`    ${color.red(f)}`));
      }
    }
  };

  await tick();
  setInterval(tick, intervalSec * 1000);
}

main().catch((e) => { console.error(e); process.exit(1); });
