import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_DATE = '2026-08-27';

// Outlets that should NOT have oatmeal on Aug 27
const WRONG_OATMEAL = [
  { outlet_id: 'o-kesambi', id: 'ybuenxt7' },  // qty=0, existed before
  { outlet_id: 'o-mca', id: 'awl8ug3a' },      // qty=0, existed before
  { outlet_id: 'o-gempeng', id: 'gx0gbf7t' },  // qty=3, created by mistake
  { outlet_id: 'o-kuti', id: 'oaudczu1' },     // qty=3, created by mistake
];

async function main() {
  console.log('=== Hapus oatmeal yang salah (27 Agustus) ===\n');

  for (const rec of WRONG_OATMEAL) {
    const { error } = await supabase
      .from('permohonan_stok')
      .delete()
      .eq('id', rec.id);

    if (error) {
      console.error(`❌ Gagal hapus ${rec.outlet_id} (${rec.id}):`, error.message);
    } else {
      console.log(`✅ Dihapus: ${rec.outlet_id} oatmeal (${rec.id})`);
    }
  }

  // Verify
  console.log('\n=== VERIFIKASI: oatmeal di 4 outlet ===');
  const { data: verify } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE)
    .eq('produk_id', 'p-oatmeal');

  for (const rec of WRONG_OATMEAL) {
    const found = (verify || []).filter((r: any) => r.outlet_id === rec.outlet_id);
    if (found.length === 0) {
      console.log(`✅ ${rec.outlet_id}: oatmeal sudah tidak ada`);
    } else {
      console.log(`❌ ${rec.outlet_id}: masih ada oatmeal!`);
    }
  }
}

main().catch(console.error);
