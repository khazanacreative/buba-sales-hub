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
  // 1. Check permohonan_stok for abon on Aug 27
  console.log('=== PERMOHONAN STOK (Abon) - 27 Agustus ===\n');
  const { data: psData } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .eq('produk_id', 'p-abon');

  for (const oid of TARGET_OUTLETS) {
    const records = (psData || []).filter((r: any) => r.outlet_id === oid);
    console.log(`📍 ${TARGET_NAMES[oid]} (${oid}):`);
    if (records.length === 0) {
      console.log('  ⚠️  TIDAK ADA record abon');
    } else if (records.length > 1) {
      console.log(`  🔴 DUPLIKAT! ${records.length} records:`);
      for (const r of records) {
        console.log(`     id=${r.id} qty=${r.qty} status=${r.status} catatan="${r.catatan || ''}"`);
      }
    } else {
      const r = records[0];
      console.log(`  ✅ OK: id=${r.id} qty=${r.qty} status=${r.status}`);
    }
  }

  // 2. Check penjualan for abon on Aug 27
  console.log('\n=== PENJUALAN (Abon) - 27 Agustus ===\n');
  const { data: penData } = await supabase
    .from('penjualan')
    .select('*')
    .eq('tanggal', '2026-08-27')
    .eq('produk_id', 'p-abon');

  console.log(`Total penjualan abon records: ${(penData || []).length}\n`);

  for (const oid of TARGET_OUTLETS) {
    const records = (penData || []).filter((r: any) => r.outlet_id === oid);
    console.log(`📍 ${TARGET_NAMES[oid]} (${oid}):`);
    if (records.length === 0) {
      console.log('  ⚠️  TIDAK ADA penjualan abon');
    } else if (records.length > 1) {
      console.log(`  🔴 DUPLIKAT! ${records.length} records:`);
      for (const r of records) {
        console.log(`     id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram} harga=${r.harga}`);
      }
    } else {
      const r = records[0];
      console.log(`  ✅ OK: id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram}`);
    }
  }

  // 3. Check ALL penjualan abon on Aug 27 (all outlets) to see overall picture
  console.log('\n=== SEMUA PENJUALAN ABON - 27 Agustus (semua outlet) ===\n');
  const allPenAbon = (penData || []).reduce((acc: Record<string, any[]>, r: any) => {
    if (!acc[r.outlet_id]) acc[r.outlet_id] = [];
    acc[r.outlet_id].push(r);
    return acc;
  }, {} as Record<string, any[]>);
  
  for (const [oid, records] of Object.entries(allPenAbon)) {
    const name = TARGET_NAMES[oid] || oid;
    if (records.length > 1) {
      console.log(`🔴 ${name}: ${records.length} records (DUPLIKAT!)`);
      for (const r of records) {
        console.log(`   id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram}`);
      }
    }
  }

  // 4. Summary
  console.log('\n\n========== RINGKASAN ==========');
  for (const oid of TARGET_OUTLETS) {
    const psRecords = (psData || []).filter((r: any) => r.outlet_id === oid);
    const penRecords = (penData || []).filter((r: any) => r.outlet_id === oid);
    const psStatus = psRecords.length > 1 ? '🔴 DUPLIKAT' : psRecords.length === 0 ? '⚠️ KOSONG' : '✅ OK';
    const penStatus = penRecords.length > 1 ? '🔴 DUPLIKAT' : penRecords.length === 0 ? '⚠️ KOSONG' : '✅ OK';
    console.log(`  ${TARGET_NAMES[oid]}: Distribusi=${psStatus} (${psRecords.length}), Penjualan=${penStatus} (${penRecords.length})`);
  }
}

main().catch(console.error);
