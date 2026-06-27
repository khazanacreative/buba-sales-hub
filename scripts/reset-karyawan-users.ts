import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { SEED_OUTLETS, SEED_KARYAWAN } from "../src/lib/seed.ts";

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

console.log("Supabase URL:", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function resetKaryawanUsers() {
  try {
    // Step 1: Delete users first (no FK dependency on users)
    console.log("\n1. Menghapus data users...");
    const { error: delUsersErr, count: delUsersCount } = await supabase
      .from("users")
      .delete()
      .neq("username", "");
    if (delUsersErr) throw delUsersErr;
    
    // Check how many users were deleted
    const { count: beforeKaryawanCount } = await supabase
      .from("karyawan")
      .select("*", { count: "exact", head: true });
    
    // Step 2: Delete karyawan (no FK constraint found in migrations)
    console.log("2. Menghapus data karyawan...");
    const { error: delKaryawanErr } = await supabase
      .from("karyawan")
      .delete()
      .neq("id", "");
    if (delKaryawanErr) {
      // If FK constraint fails, try setting karyawan_id to null in absensi first
      console.log("   Gagal hapus langsung, coba set null absensi dulu...");
      await supabase.from("absensi").update({ karyawan_id: null }).neq("id", "");
      const { error: retryErr } = await supabase.from("karyawan").delete().neq("id", "");
      if (retryErr) throw retryErr;
    }
    console.log("   Data karyawan berhasil dihapus.");

    // Step 3: Seed karyawan with proper role
    console.log("3. Menyimpan data karyawan baru...");
    const seedKaryawanMapped = SEED_KARYAWAN.map((k) => ({
      id: k.id,
      nama: k.nama,
      posisi: k.posisi,
      role: k.role || "outlet",
      outlet_id: k.outletId,
      gaji_pokok: k.gajiPokok,
      bonus_omset: k.bonusOmset,
      bonus_ulasan: k.bonusUlasan,
      tunjangan_harian: k.tunjanganHarian ?? 0,
      overtime_rate: k.overtimeRate ?? 0,
      jam_masuk: k.jamMasuk ?? null,
      jam_pulang: k.jamPulang ?? null
    }));
    const { error: karyawanErr } = await supabase.from("karyawan").insert(seedKaryawanMapped);
    if (karyawanErr) throw karyawanErr;
    console.log(`   ${seedKaryawanMapped.length} karyawan berhasil disimpan.`);

    // Step 4: Seed users with proper karyawan_id links
    console.log("4. Menyimpan data users baru...");
    const seedUsers = [
      {
        username: "admin",
        password: "admin123",
        nama: "Administrator",
        role: "admin",
        outlet_id: null,
        karyawan_id: null
      },
      {
        username: "khazana",
        password: "Fazana@10",
        nama: "Super Admin",
        role: "admin",
        outlet_id: null,
        karyawan_id: null
      },
      {
        username: "produksi",
        password: "produksi123",
        nama: "Kepala Produksi",
        role: "admin",
        outlet_id: null,
        karyawan_id: "k-produksi"
      },
      ...SEED_OUTLETS.map((o) => ({
        username: o.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        password: "buba123",
        nama: o.nama,
        role: "outlet",
        outlet_id: o.id,
        karyawan_id: `k-${o.id}-1`
      }))
    ];

    const { error: usersErr } = await supabase.from("users").insert(seedUsers);
    if (usersErr) throw usersErr;
    console.log(`   ${seedUsers.length} users berhasil disimpan.`);

    // Verify
    console.log("\n5. Verifikasi hasil reset...");
    const { count: karyawanCount } = await supabase
      .from("karyawan")
      .select("*", { count: "exact", head: true });
    const { count: usersCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });
    
    console.log(`   Karyawan: ${karyawanCount} records`);
    console.log(`   Users: ${usersCount} records`);

    // Sample check: verify linking
    const { data: sampleKaryawan } = await supabase
      .from("karyawan")
      .select("id, nama, role")
      .limit(3);
    console.log("\n   Sample karyawan:", JSON.stringify(sampleKaryawan, null, 2));

    const { data: sampleUsers } = await supabase
      .from("users")
      .select("username, nama, role, karyawan_id")
      .limit(5);
    console.log("   Sample users:", JSON.stringify(sampleUsers, null, 2));

    console.log("\n✅ Reset karyawan + users berhasil!");
    console.log("   Silakan refresh halaman web untuk melihat perubahan.");
  } catch (error) {
    console.error("\n❌ Error reset karyawan + users:", error);
    process.exit(1);
  }
}

resetKaryawanUsers();
