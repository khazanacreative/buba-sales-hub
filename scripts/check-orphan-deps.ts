import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// The 7 orphan abon records (tanggal=Aug 26, tgl_kirim=Aug 27)
const ORPHAN_IDS = ['rj74s343', '1m332k51', 'vpgkpkwy', '2kmnm907', 'c94rvydm', 'atgt9dqb', '3vy3988b'];

async function main() {
  console.log('=== Cek dependensi sebelum hapus record orphan ===\n');

  // 1. Check penjualan - do any reference these permohonan_stok records?
  // Penjualan doesn't have foreign key to permohonan_stok, but check by outlet+date
  for (const id of ORPHAN_IDS) {
    const { data: ps } = await supabase.from('permohonan_stok').select('id, outlet_id, produk_id, tanggal, tanggal_kirim, qty, status').eq('id', id).single();
    if (!ps) { console.log(`  ⚠️ Record ${id} tidak ditemukan`); continue; }
    
    console.log(`\n  Record ${id}: outlet=${ps.outlet_id} produk=${ps.produk_id} tanggal=${ps.tanggal} tgl_kirim=${ps.tanggal_kirim} qty=${ps.qty}`);
    
    // Check if there's a NEWER record for same outlet+produk (the replacement)
    const { data: newer } = await supabase
      .from('permohonan_stok')
      .select('id, tanggal, tanggal_kirim, qty, status')
      .eq('outlet_id', ps.outlet_id)
      .eq('produk_id', ps.produk_id)
      .eq('tanggal_kirim', ps.tanggal_kirim)
      .neq('id', id);
    
    if (newer && newer.length > 0) {
      console.log(`  ✅ Record pengganti ada:`);
      for (const n of newer) {
        console.log(`     id=${n.id} tanggal=${n.tanggal} tgl_kirim=${n.tanggal_kirim} qty=${n.qty} status=${n.status}`);
      }
    } else {
      console.log(`  ⚠️ TIDAK ada record pengganti!`);
    }
  }

  // 2. Check if there are penjualan records for abon on Aug 27 for these outlets
  console.log('\n=== Penjualan Abon Aug 27 ===');
  const targetOutlets = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
  for (const oid of targetOutlets) {
    const { data: pen } = await supabase
      .from('penjualan')
      .select('id, outlet_id, qty, variant, sisaGram, tanggal, produk_id')
      .eq('outlet_id', oid)
      .eq('tanggal', '2026-08-27')
      .eq('produk_id', 'p-abon');
    
    console.log(`  ${oid}: ${(pen||[]).length} records`);
    for (const p of pen || []) {
      console.log(`    id=${p.id} qty=${p.qty} variant=${p.variant} sisaGram=${p.sisaGram}`);
    }
  }

  // 3. Check stok_movement for abon OH
  console.log('\n=== Stok Movement Abon (OH) Aug 27 ===');
  const { data: movs } = await supabase
    .from('stok_movement')
    .select('id, outlet_id, tipe, qty, keterangan')
    .eq('tanggal', '2026-08-27')
    .eq('bahan_id', 'b-ab01');
  
  for (const m of movs || []) {
    const isTarget = targetOutlets.some(oid => (m.keterangan || '').includes(oid));
    if (isTarget) {
      console.log(`  ${m.tipe}: id=${m.id} qty=${m.qty} ket="${m.keterangan}"`);
    }
  }
}

main().catch(console.error);
