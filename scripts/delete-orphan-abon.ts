import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Orphan abon records: tanggal=Aug 26, tanggal_kirim=Aug 27
// Record pengganti (tanggal=Aug 27, tgl_kirim=Aug 27) sudah ada
const ORPHAN_IDS = [
  'rj74s343',  // Gunung Gangsir
  '1m332k51',  // Kuti
  'vpgkpkwy',  // Randu Pitu
  '2kmnm907',  // Sidohwayah
  'c94rvydm',  // Gempeng
  'atgt9dqb',  // Sidokare
  '3vy3988b',  // MCA
];

async function main() {
  console.log('=== HAPUS RECORD ORPHAN ABON (tanggal=26/08, tgl_kirim=27/08) ===\n');

  for (const id of ORPHAN_IDS) {
    const { data: ps } = await supabase.from('permohonan_stok').select('outlet_id, produk_id, tanggal, tanggal_kirim, qty, status').eq('id', id).single();
    
    if (!ps) {
      console.log(`  ⚠️ ${id}: Record tidak ditemukan (mungkin sudah dihapus)`);
      continue;
    }
    
    console.log(`  🗑️ Menghapus ${id}: outlet=${ps.outlet_id} tanggal=${ps.tanggal} tgl_kirim=${ps.tanggal_kirim} qty=${ps.qty} status=${ps.status}`);
    
    const { error } = await supabase.from('permohonan_stok').delete().eq('id', id);
    
    if (error) {
      console.log(`  ❌ Gagal: ${error.message}`);
    } else {
      console.log(`  ✅ Berhasil dihapus`);
    }
  }

  // Verifikasi
  console.log('\n=== Verifikasi: Cek sisa abon records tgl_kirim=27 Agustus ===');
  const { data: remaining } = await supabase
    .from('permohonan_stok')
    .select('id, outlet_id, tanggal, tanggal_kirim, qty, status')
    .eq('tanggal_kirim', '2026-08-27')
    .eq('produk_id', 'p-abon');
  
  const targetOutlets = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
  const names: Record<string, string> = {
    'o-gunung-gangsir': 'Gunung Gangsir', 'o-kuti': 'Kuti',
    'o-randu-pitu': 'Randu Pitu', 'o-sidohwayah': 'Sidohwayah', 'o-gempeng': 'Gempeng'
  };

  for (const oid of targetOutlets) {
    const records = (remaining || []).filter((r: any) => r.outlet_id === oid);
    console.log(`  ${names[oid]}: ${records.length} record(s)`);
    for (const r of records) {
      console.log(`    id=${r.id} qty=${r.qty} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim} status=${r.status}`);
    }
    if (records.length === 1) {
      console.log(`    ✅ Sekarang hanya 1 record — tidak ada duplikat`);
    }
  }
}

main().catch(console.error);
