#!/usr/bin/env node
/**
 * Backup SQL — Ekspor semua data Supabase ke SQL files (schema.sql + data.sql)
 *
 * Usage:
 *   npx tsx scripts/backup-sql.ts                     → backup ke backups/YYYY-MM-DD_HHmmss/
 *   npx tsx scripts/backup-sql.ts --name mybackup     → backup ke backups/mybackup/
 *   npx tsx scripts/backup-sql.ts --tables penjualan,produksi  → backup tabel tertentu saja
 *   npx tsx scripts/backup-sql.ts --schema-only       → hanya generate schema.sql
 *   npx tsx scripts/backup-sql.ts --data-only         → hanya generate data.sql
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// ── Parse .env ──────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("❌ File .env tidak ditemukan");
  process.exit(1);
}
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
  if (match) {
    let value = match[2] || "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabaseUrl = env["VITE_SUPABASE_URL"];
const supabaseKey = env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"];
if (!supabaseUrl || !supabaseKey) {
  console.error("❌ VITE_SUPABASE_URL atau SUPABASE_KEY tidak ditemukan di .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Semua tabel yang di-backup ──────────────────────────────
const ALL_TABLES = [
  "outlets",
  "produk",
  "coa",
  "bahan_baku",
  "karyawan",
  "users",
  "jurnal",
  "penjualan",
  "produksi",
  "stok_movement",
  "absensi",
  "permohonan_stok",
  "kode_bantu",
  "hpp_produk",
  "hpp_bahan",
  "hpp_consumable",
  "log_aktivitas",
];

// ── Parse args ──────────────────────────────────────────────
const args = process.argv.slice(2);
let backupName = "";
let tableFilter: string[] | null = null;
let schemaOnly = false;
let dataOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--name" && args[i + 1]) {
    backupName = args[++i];
  }
  if (args[i] === "--tables" && args[i + 1]) {
    tableFilter = args[++i].split(",").map((t) => t.trim());
  }
  if (args[i] === "--schema-only") {
    schemaOnly = true;
  }
  if (args[i] === "--data-only") {
    dataOnly = true;
  }
}

// ── Schema generation ───────────────────────────────────────
function buildSchemaSql(): string {
  const sep = "-- =============================================================================";
  const generated = new Date().toISOString();
  const lines: string[] = [];
  lines.push(sep);
  lines.push("-- SCHEMA BACKUP — Supabase PostgreSQL");
  lines.push("-- Generated: " + generated);
  lines.push("-- Source: " + supabaseUrl);
  lines.push(sep);
  lines.push("");

  function addTable(name: string, cols: string[]) {
    lines.push("-- ── " + name + " " + "-".repeat(Math.max(0, 60 - name.length)));
    lines.push("CREATE TABLE IF NOT EXISTS public." + name + " (");
    for (let i = 0; i < cols.length; i++) {
      const comma = i < cols.length - 1 ? "," : "";
      lines.push("  " + cols[i] + comma);
    }
    lines.push(");");
    lines.push("");
  }

  addTable("outlets", [
    "id TEXT PRIMARY KEY",
    "nama TEXT NOT NULL",
    "lokasi TEXT NOT NULL DEFAULT '-'",
  ]);

  addTable("produk", [
    "id TEXT PRIMARY KEY",
    "nama TEXT NOT NULL",
    "harga NUMERIC NOT NULL DEFAULT 0",
    "satuan TEXT NOT NULL DEFAULT 'cup'",
  ]);

  addTable("coa", [
    "kode TEXT PRIMARY KEY",
    "nama TEXT NOT NULL",
    "tipe TEXT NOT NULL",
    "kategori TEXT NOT NULL",
  ]);

  addTable("bahan_baku", [
    "id TEXT PRIMARY KEY",
    "kode TEXT NOT NULL",
    "nama TEXT NOT NULL",
    "satuan TEXT NOT NULL",
    "stok_min NUMERIC NOT NULL DEFAULT 0",
    "stok_awal NUMERIC NOT NULL DEFAULT 0",
    "harga_beli NUMERIC NOT NULL DEFAULT 0",
    "konversi_gram NUMERIC",
  ]);

  addTable("karyawan", [
    "id TEXT PRIMARY KEY",
    "nama TEXT NOT NULL",
    "posisi TEXT NOT NULL",
    "role TEXT DEFAULT 'outlet'",
    "outlet_id TEXT",
    "gaji_pokok NUMERIC NOT NULL DEFAULT 0",
    "bonus_omset NUMERIC DEFAULT 0",
    "bonus_ulasan NUMERIC DEFAULT 0",
    "bonus_oh INTEGER DEFAULT 0",
    "tunjangan_harian NUMERIC DEFAULT 0",
    "overtime_rate NUMERIC DEFAULT 0",
    "jam_masuk VARCHAR DEFAULT '07:30'",
    "jam_pulang VARCHAR DEFAULT '15:00'",
  ]);

  addTable("users", [
    "username TEXT PRIMARY KEY",
    "password TEXT NOT NULL",
    "nama TEXT NOT NULL",
    "role TEXT NOT NULL DEFAULT 'outlet'",
    "outlet_id TEXT",
    "karyawan_id TEXT",
  ]);

  addTable("jurnal", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT NOT NULL",
    "ref TEXT",
    "keterangan TEXT",
    "kode_akun TEXT",
    "akun TEXT NOT NULL",
    "tipe TEXT NOT NULL",
    "jumlah NUMERIC NOT NULL DEFAULT 0",
    "kategori TEXT",
    "kode_bantu_id TEXT",
  ]);

  addTable("penjualan", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT NOT NULL",
    "outlet_id TEXT NOT NULL",
    "produk_id TEXT NOT NULL",
    "qty NUMERIC NOT NULL DEFAULT 0",
    "harga NUMERIC NOT NULL DEFAULT 0",
    "total NUMERIC NOT NULL DEFAULT 0",
    "sisa_gram INTEGER DEFAULT NULL",
    "variant VARCHAR DEFAULT NULL",
    "CONSTRAINT penjualan_qty_check CHECK (qty >= 0)",
    "CONSTRAINT penjualan_total_check CHECK (total >= 0)",
    "CONSTRAINT penjualan_harga_check CHECK (harga >= 0)",
  ]);

  addTable("produksi", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT NOT NULL",
    "produk_id TEXT NOT NULL",
    "qty_rencana NUMERIC NOT NULL DEFAULT 0",
    "qty_realisasi NUMERIC NOT NULL DEFAULT 0",
  ]);

  addTable("stok_movement", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT NOT NULL",
    "bahan_id TEXT NOT NULL",
    "tipe TEXT NOT NULL",
    "qty NUMERIC NOT NULL DEFAULT 0",
    "keterangan TEXT",
    "produksi_id TEXT",
  ]);

  addTable("absensi", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT NOT NULL",
    "karyawan_id TEXT NOT NULL",
    "jam_masuk TEXT",
    "jam_pulang TEXT",
    "status TEXT NOT NULL DEFAULT 'Hadir'",
    "catatan TEXT",
    "bonus NUMERIC DEFAULT 0",
    "tunjangan NUMERIC DEFAULT 0",
    "overtime NUMERIC DEFAULT 0",
  ]);

  addTable("permohonan_stok", [
    "id TEXT PRIMARY KEY",
    "tanggal TEXT",
    "tanggal_kirim TEXT NOT NULL",
    "outlet_id TEXT NOT NULL",
    "produk_id TEXT NOT NULL",
    "qty INTEGER NOT NULL DEFAULT 0",
    "status TEXT NOT NULL DEFAULT 'Pending'",
    "catatan TEXT",
    "qty_rencana INTEGER",
    "catatan_rencana TEXT",
    "CONSTRAINT permohonan_stok_qty_check CHECK (qty >= 0)",
  ]);

  addTable("kode_bantu", [
    "id TEXT PRIMARY KEY",
    "kode TEXT NOT NULL",
    "kode_akun TEXT NOT NULL",
    "nama TEXT NOT NULL",
    "keterangan TEXT",
    "saldo_awal NUMERIC DEFAULT 0",
    "created_at TIMESTAMPTZ DEFAULT NOW()",
  ]);

  addTable("hpp_produk", [
    "id TEXT PRIMARY KEY",
    "produk_id TEXT NOT NULL",
    "harga_jual NUMERIC NOT NULL DEFAULT 0",
    "catatan TEXT",
    "aktif BOOLEAN DEFAULT true",
    "updated_at TIMESTAMPTZ DEFAULT NOW()",
  ]);

  addTable("hpp_bahan", [
    "id TEXT PRIMARY KEY",
    "hpp_produk_id TEXT NOT NULL",
    "nama_item TEXT NOT NULL",
    "satuan TEXT NOT NULL",
    "berat NUMERIC NOT NULL DEFAULT 0",
    "harga NUMERIC NOT NULL DEFAULT 0",
    "jadi NUMERIC NOT NULL DEFAULT 1",
    "urutan INTEGER NOT NULL DEFAULT 0",
  ]);

  addTable("hpp_consumable", [
    "id TEXT PRIMARY KEY",
    "hpp_produk_id TEXT NOT NULL",
    "nama_item TEXT NOT NULL",
    "satuan TEXT NOT NULL",
    "berat NUMERIC NOT NULL DEFAULT 0",
    "harga NUMERIC NOT NULL DEFAULT 0",
    "jumlah NUMERIC NOT NULL DEFAULT 0",
    "urutan INTEGER NOT NULL DEFAULT 0",
  ]);

  addTable("log_aktivitas", [
    "id TEXT PRIMARY KEY",
    "created_at TIMESTAMPTZ DEFAULT NOW()",
    "username TEXT NOT NULL",
    "nama_user TEXT",
    "aksi TEXT NOT NULL",
    "modul TEXT NOT NULL",
    "record_id TEXT",
    "detail TEXT",
    "nilai_lama TEXT",
    "nilai_baru TEXT",
  ]);
  lines.push("CREATE INDEX IF NOT EXISTS idx_log_aktivitas_created_at ON log_aktivitas(created_at DESC);");
  lines.push("CREATE INDEX IF NOT EXISTS idx_log_aktivitas_modul ON log_aktivitas(modul);");
  lines.push("CREATE INDEX IF NOT EXISTS idx_log_aktivitas_username ON log_aktivitas(username);");
  lines.push("");

  // exec_sql function — use dollar-quoted string
  lines.push("-- ── exec_sql function ───────────────────────────────────────");
  lines.push("CREATE OR REPLACE FUNCTION public.exec_sql(sql_text text)");
  lines.push("RETURNS void");
  lines.push("LANGUAGE plpgsql");
  lines.push("SECURITY DEFINER");
  lines.push("SET search_path = public");
  lines.push("AS " + "$$" + " BEGIN EXECUTE sql_text; END; " + "$$" + ";");
  lines.push("GRANT EXECUTE ON FUNCTION public.exec_sql TO service_role;");
  lines.push("");

  return lines.join("\n");
}

// ── Fetch semua data dari tabel (dengan pagination) ─────────
const PAGE_SIZE = 1000;
async function fetchTable(table: string): Promise<any[]> {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("  ⚠️  Gagal fetch " + table + ": " + error.message);
      break;
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// ── SQL value escaping ──────────────────────────────────────
function escapeSqlValue(val: any): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") {
    if (Number.isNaN(val) || !Number.isFinite(val)) return "NULL";
    return String(val);
  }
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "string") {
    return "'" + val.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
  }
  if (typeof val === "object") {
    return "'" + JSON.stringify(val).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
  }
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// ── Column order per table ──────────────────────────────────
const TABLE_COLUMNS: Record<string, string[]> = {
  outlets: ["id", "nama", "lokasi"],
  produk: ["id", "nama", "harga", "satuan"],
  coa: ["kode", "nama", "tipe", "kategori"],
  bahan_baku: ["id", "kode", "nama", "satuan", "stok_min", "stok_awal", "harga_beli", "konversi_gram"],
  karyawan: [
    "id", "nama", "posisi", "role", "outlet_id",
    "gaji_pokok", "bonus_omset", "bonus_ulasan", "bonus_oh",
    "tunjangan_harian", "overtime_rate", "jam_masuk", "jam_pulang",
  ],
  users: ["username", "password", "nama", "role", "outlet_id", "karyawan_id"],
  jurnal: ["id", "tanggal", "ref", "keterangan", "kode_akun", "akun", "tipe", "jumlah", "kategori", "kode_bantu_id"],
  penjualan: ["id", "tanggal", "outlet_id", "produk_id", "qty", "harga", "total", "sisa_gram", "variant"],
  produksi: ["id", "tanggal", "produk_id", "qty_rencana", "qty_realisasi"],
  stok_movement: ["id", "tanggal", "bahan_id", "tipe", "qty", "keterangan", "produksi_id"],
  absensi: ["id", "tanggal", "karyawan_id", "jam_masuk", "jam_pulang", "status", "catatan", "bonus", "tunjangan", "overtime"],
  permohonan_stok: ["id", "tanggal", "tanggal_kirim", "outlet_id", "produk_id", "qty", "status", "catatan", "qty_rencana", "catatan_rencana"],
  kode_bantu: ["id", "kode", "kode_akun", "nama", "keterangan", "saldo_awal", "created_at"],
  hpp_produk: ["id", "produk_id", "harga_jual", "catatan", "aktif", "updated_at"],
  hpp_bahan: ["id", "hpp_produk_id", "nama_item", "satuan", "berat", "harga", "jadi", "urutan"],
  hpp_consumable: ["id", "hpp_produk_id", "nama_item", "satuan", "berat", "harga", "jumlah", "urutan"],
  log_aktivitas: ["id", "created_at", "username", "nama_user", "aksi", "modul", "record_id", "detail", "nilai_lama", "nilai_baru"],
};

// ── Generate INSERT SQL for a table ────────────────────────
function generateInsertSql(table: string, rows: any[]): string {
  if (rows.length === 0) return "-- " + table + ": no data\n";

  const columns = TABLE_COLUMNS[table] || Object.keys(rows[0]);
  const lines: string[] = [];

  lines.push("-- " + table + " (" + rows.length + " rows)");
  lines.push("TRUNCATE TABLE public." + table + " CASCADE;");

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valueStrings = batch.map((row) => {
      const values = columns.map((col) => escapeSqlValue(row[col]));
      return "  (" + values.join(", ") + ")";
    });

    lines.push(
      "INSERT INTO public." + table + " (" + columns.map((c) => '"' + c + '"').join(", ") + ") VALUES"
    );
    lines.push(valueStrings.join(",\n") + ";");
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  const tables = tableFilter || ALL_TABLES;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const folderName = backupName || "sql-backup-" + timestamp;
  const backupDir = path.resolve(process.cwd(), "backups", folderName);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
    console.log("📁 Folder backups/" + folderName + "/ dibuat");
  }

  console.log("═══════════════════════════════════════");
  console.log("  🔒 BACKUP SQL DATABASE");
  console.log("═══════════════════════════════════════\n");

  // ── Generate schema.sql ───────────────────────────────────
  if (!dataOnly) {
    console.log("  📋 Generating schema.sql...");
    const schemaPath = path.join(backupDir, "schema.sql");
    fs.writeFileSync(schemaPath, buildSchemaSql(), "utf-8");
    console.log("  ✅ schema.sql → " + schemaPath + "\n");
  }

  // ── Generate data.sql ─────────────────────────────────────
  if (!schemaOnly) {
    console.log("  📋 Fetching data from Supabase...\n");
    const backup: Record<string, any[]> = {};
    let totalRecords = 0;

    for (const table of tables) {
      process.stdout.write("  📋 " + table + "...");
      const data = await fetchTable(table);
      backup[table] = data;
      totalRecords += data.length;
      console.log(" " + data.length + " records");
    }

    console.log("\n  📝 Generating data.sql...");

    const dataLines: string[] = [];
    dataLines.push("-- =============================================================================");
    dataLines.push("-- DATA BACKUP — Supabase PostgreSQL");
    dataLines.push("-- Generated: " + new Date().toISOString());
    dataLines.push("-- Source: " + supabaseUrl);
    dataLines.push("-- Total: " + tables.length + " tables, " + totalRecords + " records");
    dataLines.push("-- =============================================================================");
    dataLines.push("");
    dataLines.push("-- ⚠️  Run schema.sql FIRST before running this file.");
    dataLines.push("-- ⚠️  This file will TRUNCATE existing data before inserting.");
    dataLines.push("");
    dataLines.push("BEGIN;");
    dataLines.push("");

    const orderedTables = [
      "outlets",
      "produk",
      "coa",
      "bahan_baku",
      "karyawan",
      "users",
      "kode_bantu",
      "hpp_produk",
      "hpp_bahan",
      "hpp_consumable",
      "penjualan",
      "produksi",
      "jurnal",
      "stok_movement",
      "absensi",
      "permohonan_stok",
      "log_aktivitas",
    ].filter((t) => tables.includes(t));

    for (const table of orderedTables) {
      dataLines.push(generateInsertSql(table, backup[table] || []));
    }

    dataLines.push("COMMIT;");
    dataLines.push("");

    // Verification query
    dataLines.push("-- ── Verification ──────────────────────────────────────────────");
    dataLines.push("SELECT 'outlets' as tabel, COUNT(*) as jumlah FROM public.outlets");
    for (let i = 1; i < orderedTables.length; i++) {
      dataLines.push("UNION ALL SELECT '" + orderedTables[i] + "', COUNT(*) FROM public." + orderedTables[i]);
    }
    dataLines.push("ORDER BY 1;");

    const dataSql = dataLines.join("\n");
    const dataPath = path.join(backupDir, "data.sql");
    fs.writeFileSync(dataPath, dataSql, "utf-8");

    console.log("  ✅ data.sql → " + dataPath);
    console.log("     " + tables.length + " tables, " + totalRecords + " records total");
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  ✅ BACKUP SQL BERHASIL");
  console.log("  📁 Folder: backups/" + folderName + "/");
  if (!dataOnly) console.log("  📄 schema.sql — Struktur tabel + functions");
  if (!schemaOnly) console.log("  📄 data.sql — Semua data (INSERT statements)");
  console.log("═══════════════════════════════════════");
  console.log("\n💡 Cara restore:");
  console.log("   1. Buka Supabase Dashboard → SQL Editor");
  console.log("   2. Jalankan schema.sql terlebih dahulu");
  console.log("   3. Jalankan data.sql untuk mengisi data");
}

main().catch((err) => {
  console.error("\n❌ ERROR:", err);
  process.exit(1);
});
