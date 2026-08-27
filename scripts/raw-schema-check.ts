import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Get raw column names from permohonan_stok
  const { data: sample } = await supabase.from('permohonan_stok').select('*').limit(2);
  console.log('=== permohonan_stok columns ===');
  if (sample && sample.length > 0) {
    console.log(JSON.stringify(sample[0], null, 2));
  }

  // 2. Get raw data for Aug 27
  const { data: aug27 } = await supabase.from('permohonan_stok').select('*').eq('tanggal', '2026-08-27');
  console.log(`\n=== All Aug 27 data (${aug27?.length || 0} rows) ===`);
  
  // Group by outlet_id
  const byOutlet = new Map<string, any[]>();
  for (const r of aug27 || []) {
    const key = r.outlet_id || 'unknown';
    if (!byOutlet.has(key)) byOutlet.set(key, []);
    byOutlet.get(key)!.push(r);
  }
  
  for (const [outlet, records] of byOutlet) {
    console.log(`\n${outlet}:`);
    for (const r of records) {
      const keys = Object.keys(r);
      const namaKey = keys.find(k => k.includes('nama') && k.includes('produk'));
      const qtyKey = keys.find(k => k === 'qty');
      const statusKey = keys.find(k => k.includes('status'));
      
      console.log(`  ${r[namaKey || 'nama_produk'] || r.nama_produk || JSON.stringify(r)}: qty=${r.qty}, status=${r[statusKey || 'status']}`);
    }
  }
  
  // 3. Check stok_harian columns
  const { data: shSample } = await supabase.from('stok_harian').select('*').limit(2);
  console.log('\n=== stok_harian columns ===');
  if (shSample && shSample.length > 0) {
    console.log(JSON.stringify(shSample[0], null, 2));
  } else {
    console.log('No data');
  }
  
  // 4. Check stok_harian for Aug 27
  const { data: shAug27 } = await supabase.from('stok_harian').select('*').eq('tanggal', '2026-08-27');
  console.log(`\nstok_harian Aug 27: ${shAug27?.length || 0} rows`);
  
  // 5. Check outlet table raw
  const { data: outletSample } = await supabase.from('outlet').select('*').limit(2);
  console.log('\n=== outlet columns ===');
  if (outletSample && outletSample.length > 0) {
    console.log(JSON.stringify(outletSample[0], null, 2));
  } else {
    // Try getting outlet IDs from permohonan_stok
    const outletIds = [...new Set((aug27 || []).map((r: any) => r.outlet_id))];
    console.log('No outlet table data. Outlet IDs from permohonan_stok:', outletIds);
  }
}

main().catch(console.error);
