import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_OUTLETS = ['Gunung Gangsir', 'Sidohwayah', 'Randu Pitu', 'Kuti', 'Gempeng'];
const TARGET_PRODUCTS = ['oatmeal', 'puding'];
const TARGET_DATE = '2026-08-27';

async function main() {
  console.log('=== Cek data permohonan_stok untuk 5 outlet ===\n');

  // Get outlet IDs
  const { data: outlets } = await supabase.from('outlet').select('id, nama');
  const outletMap = new Map((outlets || []).map((o: any) => [o.nama, o.id]));

  for (const outletName of TARGET_OUTLETS) {
    const outletId = outletMap.get(outletName);
    if (!outletId) {
      console.log(`⚠️  Outlet "${outletName}" tidak ditemukan di tabel outlet`);
      continue;
    }

    console.log(`\n📍 ${outletName} (ID: ${outletId})`);

    // Get all permohonan_stok for this outlet on Aug 27
    const { data: records } = await supabase
      .from('permohonan_stok')
      .select('id, nama_produk, qty, status_permohonan, created_at')
      .eq('outlet_id', outletId)
      .eq('tanggal', TARGET_DATE);

    if (!records || records.length === 0) {
      console.log('   ❌ Tidak ada record sama sekali');
    } else {
      console.log('   Data yang ada:');
      for (const r of records) {
        console.log(`   - ${r.nama_produk}: qty=${r.qty}, status=${r.status_permohonan}`);
      }
    }

    // Check specifically for oatmeal and puding
    for (const product of TARGET_PRODUCTS) {
      const existing = records?.find((r: any) => r.nama_produk === product);
      if (!existing) {
        console.log(`   ❌ ${product} TIDAK ADA - perlu dibuat`);
      } else if (existing.qty === 0) {
        console.log(`   ⚠️  ${product} qty=0 - perlu diperbaiki`);
      } else {
        console.log(`   ✅ ${product} qty=${existing.qty}`);
      }
    }
  }
}

main().catch(console.error);
