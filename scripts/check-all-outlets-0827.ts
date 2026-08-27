import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // List all outlets
  const { data: outlets } = await supabase.from('outlet').select('id, nama').order('nama');
  console.log('=== Semua outlet ===');
  for (const o of outlets || []) {
    console.log(`  "${o.nama}" (ID: ${o.id})`);
  }

  // Check permohonan_stok on Aug 27 for all outlets - find oatmeal/puding with qty=0
  console.log('\n=== Cek permohonan_stok 27 Agustus - oatmeal & puding qty=0 ===');
  const { data: records } = await supabase
    .from('permohonan_stok')
    .select('id, nama_produk, qty, status_permohonan, outlet_id, tanggal')
    .eq('tanggal', '2026-08-27');

  const outletMap = new Map((outlets || []).map((o: any) => [o.id, o.nama]));
  
  // Find oatmeal/puding with qty=0
  const problems = (records || []).filter((r: any) => 
    ['oatmeal', 'puding'].includes(r.nama_produk) && r.qty === 0
  );
  
  console.log(`\nDitemukan ${problems.length} record oatmeal/puding dengan qty=0:`);
  for (const r of problems) {
    console.log(`  ${outletMap.get(r.outlet_id) || r.outlet_id} - ${r.nama_produk}: qty=${r.qty}, status=${r.status_permohonan}`);
  }

  // Also find outlets that are MISSING oatmeal or puding entirely
  console.log('\n=== Outlet yang TIDAK ADA record oatmeal/puding di 27 Agustus ===');
  const allOutletIds = (outlets || []).map((o: any) => o.id);
  const recordsWithOutlet = (records || []).map((r: any) => ({ ...r, outlet_name: outletMap.get(r.outlet_id) || r.outlet_id }));
  
  for (const outlet of outlets || []) {
    for (const product of ['oatmeal', 'puding']) {
      const found = recordsWithOutlet.find((r: any) => r.outlet_id === outlet.id && r.nama_produk === product);
      if (!found) {
        console.log(`  ${outlet.nama} - ${product}: TIDAK ADA`);
      }
    }
  }
}

main().catch(console.error);
