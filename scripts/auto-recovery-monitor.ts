/**
 * Supabase Auto-Recovery Monitor
 *
 * Secara periodik mengecek koneksi Supabase.
 * Saat PostgREST pulih → notifikasi ke terminal + kirim pesan (opsional).
 *
 * Usage:
 *   npx tsx scripts/auto-recovery-monitor.ts                     # default: cek tiap 15 detik
 *   npx tsx scripts/auto-recovery-monitor.ts --interval 30       # cek tiap 30 detik
 *   npx tsx scripts/auto-recovery-monitor.ts --webhook <URL>     # kirim POST ke webhook saat pulih
 *   npx tsx scripts/auto-recovery-monitor.ts --telegram          # kirim ke Telegram (set env TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
 *
 * Environment variables (di .env):
 *   TELEGRAM_BOT_TOKEN   = token dari @BotFather
 *   TELEGRAM_CHAT_ID     = chat ID tujuan (bisa个人/group)
 */

import fs from "fs";
import path from "path";
import https from "https";
import http from "http";

// ── Load .env ────────────────────────────────────────────────────────────────
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
const TELEGRAM_BOT_TOKEN = env["TELEGRAM_BOT_TOKEN"] || "";
const TELEGRAM_CHAT_ID = env["TELEGRAM_CHAT_ID"] || "";

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const intervalSec = parseInt(getArg("--interval") || "15");
const webhookUrl = getArg("--webhook");
const useTelegram = args.includes("--telegram");

// ── Colors ───────────────────────────────────────────────────────────────────
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m\x1b[30m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[37m${s}\x1b[0m`,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function now(): string {
  return new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function ts(): string {
  return new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
}

function postJSON(url: string, body: string, headers: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        timeout: 10000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, body: data.substring(0, 300) }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

// ── Health check ─────────────────────────────────────────────────────────────
async function checkHealth(): Promise<{ healthy: boolean; detail: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(URL, SERVICE_KEY || ANON_KEY);

    // Test 1: Simple count query
    const { error: e1, count } = await client.from("outlets").select("id", { count: "exact", head: true });

    // Test 2: RPC (validates PostgREST schema cache)
    let rpcOk = true;
    if (SERVICE_KEY) {
      const { error: rpcErr } = await client.rpc("exec_sql", { query: "SELECT 1" });
      if (rpcErr && rpcErr.code === "PGRST002") rpcOk = false;
    }

    const latencyMs = Date.now() - start;

    if (e1?.code === "PGRST002" || !rpcOk) {
      return { healthy: false, detail: `PGRST002 (PostgREST schema cache unhealthy)`, latencyMs };
    }
    if (e1) {
      return { healthy: false, detail: `${e1.code}: ${e1.message}`, latencyMs };
    }
    return { healthy: true, detail: `outlets=${count ?? "?"} rows`, latencyMs };
  } catch (e: any) {
    return { healthy: false, detail: e.message || String(e), latencyMs: Date.now() - start };
  }
}

// ── Notifications ────────────────────────────────────────────────────────────
async function notifyRecovery(checks: number, downtimeDuration: string) {
  const msg = `🟢 Supabase RECOVERED!\nProject: ${URL}\nDowntime: ~${downtimeDuration}\nChecks before recovery: ${checks}\nTime: ${now()}`;

  // Terminal bell
  process.stdout.write("\x07");

  // Console banner
  console.log(`\n${c.bgGreen(" 🟢 SUPABASE RECOVERED ")}`);
  console.log(c.green(msg));

  // Telegram
  if (useTelegram && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await postJSON(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: "HTML" })
      );
      console.log(c.green("  📱 Telegram notification sent"));
    } catch (e: any) {
      console.log(c.yellow(`  ⚠️  Telegram failed: ${e.message}`));
    }
  }

  // Webhook
  if (webhookUrl) {
    try {
      const res = await postJSON(webhookUrl, JSON.stringify({ event: "supabase_recovered", message: msg, timestamp: new Date().toISOString() }));
      console.log(c.green(`  🔔 Webhook notified (${res.status})`));
    } catch (e: any) {
      console.log(c.yellow(`  ⚠️  Webhook failed: ${e.message}`));
    }
  }
}

async function notifyDown() {
  const msg = `🔴 Supabase DOWN\nProject: ${URL}\nTime: ${now()}`;

  if (useTelegram && TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
    try {
      await postJSON(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: "HTML" })
      );
    } catch { /* silent */ }
  }

  if (webhookUrl) {
    try {
      await postJSON(webhookUrl, JSON.stringify({ event: "supabase_down", message: msg, timestamp: new Date().toISOString() }));
    } catch { /* silent */ }
  }
}

// ── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.bold("═══════════════════════════════════════════════════════════"));
  console.log(c.bold("  Supabase Auto-Recovery Monitor"));
  console.log(c.bold("═══════════════════════════════════════════════════════════"));
  console.log(`${c.gray("  Project:")}   ${URL}`);
  console.log(`${c.gray("  Interval:")}  every ${intervalSec}s`);
  console.log(`${c.gray("  Webhook:")}   ${webhookUrl || "(none)"}`);
  console.log(`${c.gray("  Telegram:")}  ${useTelegram ? `${TELEGRAM_BOT_TOKEN ? "✅ configured" : "❌ missing TELEGRAM_BOT_TOKEN"}` : "disabled"}`);
  console.log(`${c.gray("  Started:")}   ${now()}`);
  console.log(c.bold("═══════════════════════════════════════════════════════════\n"));

  if (!ANON_KEY) {
    console.error(c.red("❌ Missing VITE_SUPABASE_ANON_KEY in .env"));
    process.exit(1);
  }

  let wasHealthy = false;
  let downSince: Date | null = null;
  let checksWhileDown = 0;
  let totalChecks = 0;
  let recoveryCount = 0;
  const history: { time: string; ok: boolean; latencyMs: number; detail: string }[] = [];

  // Initial check
  const first = await checkHealth();
  totalChecks++;
  wasHealthy = first.healthy;
  if (!first.healthy) downSince = new Date();
  history.push({ time: ts(), ok: first.healthy, latencyMs: first.latencyMs, detail: first.detail });

  const icon = first.healthy ? c.bgGreen(" OK ") : c.bgRed(" DOWN ");
  console.log(`  [${ts()}] #${totalChecks} ${icon} ${first.detail} ${c.gray(`(${first.latencyMs}ms)`)}`);

  if (!first.healthy) {
    console.log(c.yellow(`  ⏳ Waiting for recovery... checking every ${intervalSec}s\n`));
  }

  // Loop
  setInterval(async () => {
    totalChecks++;
    const result = await checkHealth();
    history.push({ time: ts(), ok: result.healthy, latencyMs: result.latencyMs, detail: result.detail });

    // Keep last 100 entries
    if (history.length > 100) history.shift();

    if (result.healthy) {
      if (!wasHealthy) {
        // ← RECOVERED!
        recoveryCount++;
        checksWhileDown = downSince ? Math.floor((Date.now() - downSince.getTime()) / (intervalSec * 1000)) : checksWhileDown;
        const downtime = downSince ? formatDuration(Date.now() - downSince.getTime()) : "unknown";

        await notifyRecovery(checksWhileDown, downtime);

        downSince = null;
        checksWhileDown = 0;
      }
      wasHealthy = true;

      // Show OK sparingly (every 10th check to avoid spam)
      if (totalChecks % 10 === 0) {
        console.log(`  [${ts()}] #${totalChecks} ${c.bgGreen(" OK ")} ${result.detail} ${c.gray(`(${result.latencyMs}ms)`)}`);
      }
    } else {
      if (wasHealthy) {
        // ← Just went DOWN
        downSince = new Date();
        checksWhileDown = 0;
        console.log(`\n  [${ts()}] #${totalChecks} ${c.bgRed(" DOWN ")} ${c.red(result.detail)} ${c.gray(`(${result.latencyMs}ms)`)}`);
        console.log(c.yellow(`  ⏳ Monitoring for recovery... checking every ${intervalSec}s`));
        await notifyDown();
      }
      wasHealthy = false;
      checksWhileDown++;

      // Show every check while down
      const icon = c.bgRed(" DOWN ");
      console.log(`  [${ts()}] #${totalChecks} ${icon} ${c.red(result.detail)} ${c.gray(`(${result.latencyMs}ms)`)} ${c.gray(`[${checksWhileDown} retries]`)}`);
    }
  }, intervalSec * 1000);
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

main().catch((e) => {
  console.error(c.red("Fatal error:"), e);
  process.exit(1);
});
