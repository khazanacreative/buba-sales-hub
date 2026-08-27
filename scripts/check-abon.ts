import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

async function main() {
  const { data } = await supabase.from('permohonan_stok').select('*').eq('tanggal','2026-08-27').eq('produk_id','p-abon');
  console.log('Abon records on Aug 27:', (data || []).length);
  for (const r of data || []) {
    console.log(`  ${r.outlet_id}: id=${r.id}, qty=${r.qty}, status=${r.status}, catatan="${r.catatan}"`);
  }
}
main();
