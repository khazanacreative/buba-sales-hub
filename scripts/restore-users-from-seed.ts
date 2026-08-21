#!/usr/bin/env node
/**
 * Restore Karyawan & Users dari Seed Data
 *
 * Script ini memulihkan data karyawan dan user account yang sudah terhapus.
 * - Insert semua karyawan dari SEED_KARYAWAN (skip jika sudah ada)
 * - Insert semua user account dari SEED_USERS (skip jika sudah ada)
 * - Pastikan setiap karyawan punya linked user account
 *
 * Usage:
 *   npx tsx scripts/restore-users-from-seed.ts           → restore semua
 *   npx tsx scripts/restore-users-from-seed.ts --dry-run  → preview saja
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
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
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

// ── Seed data (same as src/lib/seed.ts) ─────────────────────
const OUTLET_NAMES = [
  "Gunung Gangsir", "Randu Pitu", "Kuti", "Sidohwayah", "Gempeng",
  "Kesambi", "Permata", "MCA", "Sugihwaras", "Sidokare",
  "Kenongo", "Kepadangan", "Pagerwojo"
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SEED_OUTLETS = OUTLET_NAMES.map((name) => ({
  id: `o-${slug(name)}`,
  nama: name,
  lokasi: "-"
}));

const SEED_KARYAWAN = [
  {
    id: "k-tl", nama: "Tim Leader", posisi: "TL (Tim Leader)", role: "tl",
    outlet_id: null, gaji_pokok: 0, bonus_omset: 0, bonus_ulasan: 0, bonus_oh: 0,
    tunjangan_harian: 0, overtime_rate: 0, jam_masuk: "07:00", jam_pulang: "15:00"
  },
  {
    id: "k-gudang", nama: "Pegawai Gudang", posisi: "Pegawai Gudang", role: "gudang",
    outlet_id: null, gaji_pokok: 20000, bonus_omset: 0, bonus_ulasan: 0, bonus_oh: 0,
    tunjangan_harian: 5000, overtime_rate: 10000, jam_masuk: "07:00", jam_pulang: "15:00"
  },
  {
    id: "k-produksi", nama: "Kepala Produksi", posisi: "Kepala Produksi", role: "produksi",
    outlet_id: null, gaji_pokok: 25000, bonus_omset: 0, bonus_ulasan: 0, bonus_oh: 0,
    tunjangan_harian: 10000, overtime_rate: 15000, jam_masuk: "07:30", jam_pulang: "15:00"
  },
  ...SEED_OUTLETS.map((o) => ({
    id: `k-${o.id}-1`,
    nama: `Staff ${o.nama} A`,
    posisi: "Kasir",
    role: "outlet",
    outlet_id: o.id,
    gaji_pokok: 17500, bonus_omset: 0, bonus_ulasan: 0, bonus_oh: 0,
    tunjangan_harian: 5000, overtime_rate: 10000, jam_masuk: "07:00", jam_pulang: "14:00"
  }))
];

const SEED_USERS = [
  { username: "admin", password: "admin123", nama: "Administrator", role: "admin", outlet_id: null, karyawan_id: null },
  { username: "khazana", password: "Fazana@10", nama: "Super Admin", role: "admin", outlet_id: null, karyawan_id: null },
  { username: "produksi", password: "produksi123", nama: "Kepala Produksi", role: "admin", outlet_id: null, karyawan_id: "k-produksi" },
  { username: "gudang", password: "gudang123", nama: "Pegawai Gudang", role: "gudang", outlet_id: null, karyawan_id: "k-gudang" },
  { username: "tl", password: "tl123", nama: "Tim Leader", role: "tl", outlet_id: null, karyawan_id: "k-tl" },
  ...SEED_OUTLETS.map((o) => {
    const username = o.id.replace("o-", "");
    return {
      username,
      password: "buba123",
      nama: o.nama,
      role: "outlet",
      outlet_id: o.id,
      karyawan_id: `k-${o.id}-1`
    };
  })
];

// ── Parse args ──────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

// ── Helpers ─────────────────────────────────────────────────
async function fetchAll(table: string): Promise<any[]> {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

async function insertBatch(table: string, rows: any[]): Promise<number> {
  if (!rows.length) return 0;
  let inserted = 0;
  // Try batch first
  const { error } = await supabase.from(table).insert(rows);
  if (!error) {
    return rows.length;
  }
  // Fallback: one by one
  for (const row of rows) {
    const { error: e } = await supabase.from(table).insert(row);
    if (!e) inserted++;
  }
  return inserted;
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  🔄 RESTORE KARYAWAN & USERS");
  console.log("═══════════════════════════════════════");
  if (dryRun) console.log("  🔍 MODE: DRY RUN\n");

  // 1. Fetch current data
  const [currentKaryawan, currentUsers] = await Promise.all([
    fetchAll("karyawan"),
    fetchAll("users")
  ]);

  console.log(`\n📊 Status saat ini:`);
  console.log(`   Karyawan: ${currentKaryawan.length} records`);
  console.log(`   Users:    ${currentUsers.length} records`);

  // Build sets for quick lookup
  const existingKaryawanIds = new Set(currentKaryawan.map((k: any) => k.id));
  const existingUsernames = new Set(currentUsers.map((u: any) => u.username));

  // 2. Find missing karyawan
  const missingKaryawan = SEED_KARYAWAN.filter(k => !existingKaryawanIds.has(k.id));
  console.log(`\n📋 Karyawan yang perlu di-insert: ${missingKaryawan.length}`);
  if (missingKaryawan.length > 0) {
    missingKaryawan.forEach(k => console.log(`   + ${k.id} (${k.nama})`));
  }

  // 3. Find missing users
  const missingUsers = SEED_USERS.filter(u => !existingUsernames.has(u.username));
  console.log(`\n📋 Users yang perlu di-insert: ${missingUsers.length}`);
  if (missingUsers.length > 0) {
    missingUsers.forEach(u => console.log(`   + ${u.username} (${u.nama}) [${u.role}]`));
  }

  // 4. Check karyawan without user account
  const karyawanWithUser = new Set(
    currentUsers.filter((u: any) => u.karyawan_id).map((u: any) => u.karyawan_id)
  );
  const orphanKaryawan = currentKaryawan.filter((k: any) => !karyawanWithUser.has(k.id));
  if (orphanKaryawan.length > 0) {
    console.log(`\n⚠️  Karyawan tanpa user account: ${orphanKaryawan.length}`);
    orphanKaryawan.forEach((k: any) => console.log(`   ! ${k.id} (${k.nama})`));
  }

  if (dryRun) {
    console.log("\n  ℹ️  Dry run selesai. Tidak ada perubahan.");
    return;
  }

  // 5. Insert missing karyawan
  if (missingKaryawan.length > 0) {
    console.log(`\n📥 Inserting ${missingKaryawan.length} karyawan...`);
    const inserted = await insertBatch("karyawan", missingKaryawan);
    console.log(`   ✅ ${inserted}/${missingKaryawan.length} karyawan inserted`);
  }

  // 6. Insert missing users
  if (missingUsers.length > 0) {
    console.log(`\n📥 Inserting ${missingUsers.length} users...`);
    const inserted = await insertBatch("users", missingUsers);
    console.log(`   ✅ ${inserted}/${missingUsers.length} users inserted`);
  }

  // 7. Final verification
  console.log("\n🔍 Verifikasi akhir...");
  const [finalKaryawan, finalUsers] = await Promise.all([
    fetchAll("karyawan"),
    fetchAll("users")
  ]);

  const finalUserKaryawanIds = new Set(
    finalUsers.filter((u: any) => u.karyawan_id).map((u: any) => u.karyawan_id)
  );
  const finalOrphan = finalKaryawan.filter((k: any) => !finalUserKaryawanIds.has(k.id));

  console.log(`\n📊 Hasil akhir:`);
  console.log(`   Karyawan: ${finalKaryawan.length} records`);
  console.log(`   Users:    ${finalUsers.length} records`);
  console.log(`   Karyawan tanpa user: ${finalOrphan.length}`);

  if (finalOrphan.length > 0) {
    console.log(`\n⚠️  Masih ada karyawan tanpa user account:`);
    finalOrphan.forEach((k: any) => console.log(`   - ${k.id} (${k.nama})`));
  }

  console.log("\n═══════════════════════════════════════");
  console.log("  ✅ RESTORE SELESAI");
  console.log("═══════════════════════════════════════");
  console.log("\n  💡 Refresh halaman web untuk melihat perubahan.");
}

main().catch((err) => {
  console.error("\n❌ ERROR:", err);
  process.exit(1);
});
