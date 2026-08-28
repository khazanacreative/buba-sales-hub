import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const anon = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const TABLES = [
  'outlets', 'produk', 'penjualan', 'produksi', 'jurnal',
  'coa', 'bahan_baku', 'stok_movement', 'karyawan', 'absensi',
  'permohonan_stok', 'users', 'kode_bantu', 'hpp_produk', 'hpp_bahan', 'hpp_consumable'
];

async function main() {
  console.log('=== DIAGNOSA RLS & AKSES DATA ===\n');

  // 1. Cek RLS status via admin (service_role)
  console.log('--- 1. RLS STATUS (via service_role) ---');
  const { data: rlsStatus, error: rlsErr } = await admin.rpc('exec_sql', {
    query: `SELECT relname, relrowsecurity FROM pg_class WHERE relrowsecurity = true ORDER BY relname`
  });
  if (rlsErr) {
    console.log('  ❌ exec_sql error:', rlsErr.message);
  } else {
    const tables = (rlsStatus as any[]) || [];
    if (tables.length === 0) {
      console.log('  ✅ Tidak ada tabel dengan RLS aktif');
    } else {
      console.log(`  ⚠️ ${tables.length} tabel dengan RLS AKTIF:`);
      tables.forEach((t: any) => console.log(`    - ${t.relname}`));
    }
  }

  // 2. Cek policies
  console.log('\n--- 2. RLS POLICIES ---');
  const { data: policies, error: polErr } = await admin.rpc('exec_sql', {
    query: `SELECT tablename, policyname, cmd, roles, qual FROM pg_policies ORDER BY tablename, policyname`
  });
  if (polErr) {
    console.log('  ❌ exec_sql error:', polErr.message);
  } else {
    const pols = (policies as any[]) || [];
    if (pols.length === 0) {
      console.log('  ✅ Tidak ada policy');
    } else {
      console.log(`  ⚠️ ${pols.length} policies ditemukan:`);
      pols.forEach((p: any) => console.log(`    ${p.tablename}: [${p.cmd}] role=${p.roles} policy="${p.policyname}"`));
    }
  }

  // 3. Test anon key akses ke setiap tabel
  console.log('\n--- 3. TEST ANON KEY ACCESS ---');
  for (const table of TABLES) {
    const { data: anonData, error: anonErr } = await anon.from(table).select('*').limit(5);
    const { data: adminData } = await admin.from(table).select('*').limit(5);
    
    const anonCount = anonErr ? 'ERROR' : (anonData?.length ?? 0);
    const adminCount = adminData?.length ?? 0;
    const status = anonErr 
      ? `❌ ERROR: ${anonErr.message}` 
      : anonCount === 0 && adminCount > 0 
        ? `❌ EMPTY (admin sees ${adminCount}+)` 
        : anonCount === adminCount 
          ? `✅ OK (${anonCount})` 
          : `⚠️ PARTIAL (${anonCount} vs ${adminCount})`;
    
    console.log(`  ${table}: ${status}`);
  }

  // 4. Cek exec_sql function availability
  console.log('\n--- 4. EXEC_SQL FUNCTION ---');
  const { error: fnErr } = await admin.rpc('exec_sql', { query: 'SELECT 1' });
  console.log(fnErr ? `  ❌ ${fnErr.message}` : '  ✅ exec_sql available');
}

main().catch(e => { console.error(e); process.exit(1); });
