import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);
const uid = () => Math.random().toString(36).slice(2, 10);

const MISSING = [
  { outlet_id: 'o-gunung-gangsir', qty: 5 },
  { outlet_id: 'o-kuti', qty: 2 },
  { outlet_id: 'o-randu-pitu', qty: 2 },
  { outlet_id: 'o-gempeng', qty: 2 },
  { outlet_id: 'o-sidohwayah', qty: 2 },
];

async function main() {
  console.log('=== Membuat abon yang hilang ===\n');
  for (const m of MISSING) {
    const { error } = await supabase.from('permohonan_stok').insert({
      id: uid(),
      tanggal: '2026-08-27',
      tanggal_kirim: '2026-08-27',
      outlet_id: m.outlet_id,
      produk_id: 'p-abon',
      qty: m.qty,
      status: 'Disetujui',
      catatan: '',
      qty_rencana: m.qty,
      catatan_rencana: null,
    });
    if (error) console.error(`❌ ${m.outlet_id}: ${error.message}`);
    else console.log(`✅ ${m.outlet_id}: abon=${m.qty}`);
  }

  // Verify all abon
  console.log('\n=== VERIFIKASI ABON ===');
  const { data } = await supabase.from('permohonan_stok').select('*').eq('tanggal','2026-08-27').eq('produk_id','p-abon');
  for (const r of (data || []).sort((a: any, b: any) => a.outlet_id.localeCompare(b.outlet_id))) {
    console.log(`  ${r.outlet_id}: abon=${r.qty}`);
  }
}
main();
