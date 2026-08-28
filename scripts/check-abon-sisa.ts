import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_OUTLETS = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
const OUTLET_NAMES: Record<string, string> = {
  'o-gunung-gangsir': 'Gunung Gangsir',
  'o-kuti': 'Kuti',
  'o-randu-pitu': 'Randu Pitu',
  'o-sidohwayah': 'Sidohwayah',
  'o-gempeng': 'Gempeng',
};

async function main() {
  // 1. Check raw penjualan records
  console.log('=== RAW penjualan abon records (27 Aug) ===');
  for (const oid of TARGET_OUTLETS) {
    const { data } = await db.from('penjualan')
      .select('*')
      .eq('tanggal', '2026-08-27')
      .eq('produk_id', 'p-abon')
      .eq('outlet_id', oid);
    
    console.log(`\n${OUTLET_NAMES[oid]} (${oid}):`);
    if (!data || data.length === 0) {
      console.log('  ❌ NO penjualan records!');
    } else {
      data.forEach(r => {
        console.log(`  id=${r.id} qty=${r.qty} variant=${r.variant} sisa_gram=${r.sisa_gram} (type: ${typeof r.sisa_gram}) harga=${r.harga} produk_id=${r.produk_id}`);
      });
    }
  }

  // 2. Check permohonan_stok for ALL dates with tanggal_kirim=27 Aug AND also 
  // check if there's any additional matching in the store's range query
  console.log('\n\n=== permohonan_stok abon (Aug 25-29) ===');
  for (const oid of TARGET_OUTLETS) {
    const { data } = await db.from('permohonan_stok')
      .select('id, outlet_id, tanggal, tanggal_kirim, produk_id, qty, qty_rencana, status, catatan')
      .eq('outlet_id', oid)
      .eq('produk_id', 'p-abon')
      .gte('tanggal_kirim', '2026-08-25')
      .lte('tanggal_kirim', '2026-08-29');
    
    console.log(`\n${OUTLET_NAMES[oid]} (${oid}):`);
    if (!data || data.length === 0) {
      console.log('  ❌ NO records!');
    } else {
      data.forEach(r => {
        console.log(`  id=${r.id} qty=${r.qty} qty_rencana=${r.qty_rencana} status=${r.status} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim} catatan="${r.catatan}"`);
      });
    }
  }

  // 3. Simulate what the store would load and how the admin view would process it
  console.log('\n\n=== SIMULASI: How admin view computes abon for Gunung Gangsir ===');
  
  // Get all permohonan_stok in range
  const { data: allPS } = await db.from('permohonan_stok')
    .select('*')
    .eq('outlet_id', 'o-gunung-gangsir')
    .eq('produk_id', 'p-abon')
    .gte('tanggal_kirim', '2026-08-01')
    .lte('tanggal_kirim', '2026-08-27');
  
  console.log(`Total permohonan_stok records for abon in range: ${allPS?.length}`);
  allPS?.forEach(r => {
    console.log(`  id=${r.id} qty=${r.qty} status=${r.status} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim}`);
  });

  // 4. Also check: are there OTHER penjualan records that could cause the sisa to show 8?
  console.log('\n\n=== ALL penjualan records for o-gunung-gangsir Aug 25-27 ===');
  const { data: allPJ } = await db.from('penjualan')
    .select('id, outlet_id, tanggal, produk_id, variant, qty, sisa_gram, harga')
    .eq('outlet_id', 'o-gunung-gangsir')
    .gte('tanggal', '2026-08-25')
    .lte('tanggal', '2026-08-27')
    .eq('produk_id', 'p-abon');
  
  allPJ?.forEach(r => {
    console.log(`  id=${r.id} tanggal=${r.tanggal} qty=${r.qty} variant=${r.variant} sisa_gram=${r.sisa_gram}`);
  });

  // 5. Check if there are penjualan records for OTHER produk_ids that might be mapped as "abon"
  console.log('\n\n=== ALL penjualan for o-gunung-gangsir Aug 27 (any produk) ===');
  const { data: allPJ27 } = await db.from('penjualan')
    .select('id, outlet_id, tanggal, produk_id, variant, qty, sisa_gram')
    .eq('outlet_id', 'o-gunung-gangsir')
    .eq('tanggal', '2026-08-27');
  
  allPJ27?.forEach(r => {
    console.log(`  id=${r.id} produk_id=${r.produk_id} variant=${r.variant} qty=${r.qty} sisa_gram=${r.sisa_gram}`);
  });
}

main().catch(e => console.error(e));
