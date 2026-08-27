import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Check outlet table
  const { count: outletCount, error: outletErr } = await supabase.from('outlet').select('*', { count: 'exact', head: true });
  console.log(`outlet table: ${outletCount} rows`, outletErr ? `ERROR: ${outletErr.message}` : '');

  // 2. Check permohonan_stok table
  const { count: psCount, error: psErr } = await supabase.from('permohonan_stok').select('*', { count: 'exact', head: true });
  console.log(`permohonan_stok table: ${psCount} rows`, psErr ? `ERROR: ${psErr.message}` : '');

  // 3. Check stok_harian table
  const { count: shCount, error: shErr } = await supabase.from('stok_harian').select('*', { count: 'exact', head: true });
  console.log(`stok_harian table: ${shCount} rows`, shErr ? `ERROR: ${shErr.message}` : '');

  // 4. Check what tables exist
  const { data: tables, error: tablesErr } = await supabase.rpc('get_table_names');
  if (tables) {
    console.log('\nAll tables:', JSON.stringify(tables));
  } else {
    // Try querying a few known tables
    const tableNames = ['outlet', 'permohonan_stok', 'stok_harian', 'produk', 'distribusi'];
    for (const t of tableNames) {
      const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
      console.log(`  ${t}: ${count ?? 'N/A'} rows ${error ? `(${error.message})` : ''}`);
    }
  }

  // 5. Sample some data from permohonan_stok with Aug 27
  const { data: sampleData } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .limit(10);
  
  console.log(`\nSample permohonan_stok for 2026-08-27 (up to 10 rows):`);
  if (sampleData && sampleData.length > 0) {
    for (const r of sampleData) {
      console.log(`  outlet_id=${r.outlet_id}, produk=${r.nama_produk}, qty=${r.qty}, status=${r.status_permohonan}`);
    }
  } else {
    console.log('  No data found');
  }
  
  // 6. Sample stok_harian
  const { data: shSample } = await supabase
    .from('stok_harian')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .limit(10);
    
  console.log(`\nSample stok_harian for 2026-08-27 (up to 10 rows):`);
  if (shSample && shSample.length > 0) {
    for (const r of shSample) {
      console.log(`  outlet_id=${r.outlet_id}, produk=${r.nama_produk}, qty=${r.qty}`);
    }
  } else {
    console.log('  No data found');
  }

  // 7. Check all dates in permohonan_stok
  const { data: dates } = await supabase
    .from('permohonan_stok')
    .select('tanggal')
    .order('tanggal', { ascending: false })
    .limit(20);
  
  console.log('\nLatest dates in permohonan_stok:');
  const uniqueDates = [...new Set((dates || []).map((d: any) => d.tanggal))];
  for (const d of uniqueDates) {
    console.log(`  ${d}`);
  }
}

main().catch(console.error);
