import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;

const anon = createClient(SUPABASE_URL, ANON_KEY);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const TABLES = [
  'outlets', 'produk', 'penjualan', 'produksi', 'jurnal',
  'coa', 'bahan_baku', 'stok_movement', 'karyawan', 'absensi',
  'permohonan_stok', 'users'
];

async function main() {
  console.log('=== TEST ANON vs SERVICE_ROLE ACCESS ===\n');

  for (const table of TABLES) {
    const [anonRes, adminRes] = await Promise.all([
      anon.from(table).select('id', { count: 'exact', head: true }),
      admin.from(table).select('id', { count: 'exact', head: true }),
    ]);

    const anonCount = anonRes.error ? `ERR: ${anonRes.error.message}` : anonRes.count;
    const adminCount = adminRes.error ? `ERR: ${adminRes.error.message}` : adminRes.count;

    const anonNum = typeof anonCount === 'number' ? anonCount : -1;
    const adminNum = typeof adminCount === 'number' ? adminCount : -1;

    let status = '';
    if (anonRes.error) {
      status = `❌ ANON ERROR: ${anonRes.error.message}`;
    } else if (adminNum > 0 && anonNum === 0) {
      status = `🔴 RLS BLOCKED (admin=${adminNum}, anon=0)`;
    } else if (anonNum === adminNum) {
      status = `✅ OK (${anonNum})`;
    } else {
      status = `⚠️  PARTIAL (anon=${anonNum}, admin=${adminNum})`;
    }

    console.log(`  ${table.padEnd(20)} ${status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
