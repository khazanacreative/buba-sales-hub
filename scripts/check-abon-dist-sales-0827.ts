import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_OUTLETS = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
const TARGET_NAMES: Record<string, string> = {
  'o-gunung-gangsir': 'Gunung Gangsir',
  'o-kuti': 'Kuti',
  'o-randu-pitu': 'Randu Pitu',
  'o-sidohwayah': 'Sidohwayah',
  'o-gempeng': 'Gempeng',
};

async function main() {
  // 1. Permohonan Stok - all products for target outlets
  console.log('=== PERMOHONAN STOK - 27 Agustus (5 Outlet Target) ===\n');
  const { data: psAll } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .in('outlet_id', TARGET_OUTLETS);

  // Group by outlet
  for (const oid of TARGET_OUTLETS) {
    const records = (psAll || []).filter(r => r.outlet_id === oid);
    console.log(`📍 ${TARGET_NAMES[oid]} (${oid}):`);
    
    // Check abon specifically
    const abonRecords = records.filter(r => r.produk_id === 'p-abon');
    console.log(`  Abon: ${abonRecords.length} records`);
    for (const r of abonRecords) {
      console.log(`    id=${r.id} qty=${r.qty} status=${r.status} catatan="${r.catatan || ''}"`);
    }
    if (abonRecords.length > 1) {
      console.log(`  🔴 DUPLIKAT ABON DITEMUKAN!`);
    }
    
    // Also show all other products briefly
    const otherProducts = records.filter(r => r.produk_id !== 'p-abon');
    if (otherProducts.length > 0) {
      console.log(`  Produk lain: ${otherProducts.length} records`);
      for (const r of otherProducts) {
        console.log(`    ${r.produk_id}: qty=${r.qty} status=${r.status}`);
      }
    }
    console.log('');
  }

  // 2. Penjualan - all products for target outlets
  console.log('\n=== PENJUALAN - 27 Agustus (5 Outlet Target) ===\n');
  const { data: penAll } = await supabase
    .from('penjualan')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .in('outlet_id', TARGET_OUTLETS);

  for (const oid of TARGET_OUTLETS) {
    const records = (penAll || []).filter(r => r.outlet_id === oid);
    console.log(`📍 ${TARGET_NAMES[oid]} (${oid}):`);
    
    const abonRecords = records.filter(r => r.produk_id === 'p-abon');
    console.log(`  Abon: ${abonRecords.length} records`);
    for (const r of abonRecords) {
      console.log(`    id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram} harga=${r.harga}`);
    }
    if (abonRecords.length > 1) {
      console.log(`  🔴 DUPLIKAT PENJUALAN ABON DITEMUKAN!`);
    }
    console.log('');
  }

  // 3. Stok Movement
  console.log('\n=== STOK MOVEMENT (Abon) - 27 Agustus ===\n');
  const { data: movAll } = await supabase
    .from('stok_movement')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .or('bahan_id.eq.b-ab01,keterangan.ilike.%abon%');

  for (const oid of TARGET_OUTLETS) {
    const name = TARGET_NAMES[oid];
    const records = (movAll || []).filter((m: any) => {
      const ket = (m.keterangan || '').toLowerCase();
      return ket.includes(name.toLowerCase()) || ket.includes(oid.replace('o-', ''));
    });
    
    if (records.length > 0) {
      console.log(`📍 ${name}:`);
      for (const r of records) {
        console.log(`  ${r.tipe}: id=${r.id} qty=${r.qty} keterangan="${r.keterangan}"`);
      }
    }
  }
}

main().catch(console.error);
