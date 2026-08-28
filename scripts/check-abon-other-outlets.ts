import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const OTHER_OUTLETS = ['o-mca', 'o-sidokare', 'o-kesambi', 'o-permata', 'o-sugihwaras'];
const OUTLET_NAMES: Record<string, string> = {
  'o-mca': 'MCA', 'o-sidokare': 'Sidokare', 'o-kesambi': 'Kesambi',
  'o-permata': 'Permata', 'o-sugihwaras': 'Sugihwaras',
};

async function main() {
  console.log('=== Penjualan Abon (27 Aug) - Other Outlets ===');
  for (const oid of OTHER_OUTLETS) {
    const { data } = await db.from('penjualan')
      .select('id, qty, sisa_gram, harga')
      .eq('tanggal', '2026-08-27')
      .eq('produk_id', 'p-abon')
      .eq('outlet_id', oid);
    const name = OUTLET_NAMES[oid];
    if (!data || data.length === 0) { console.log(name + ': NO record'); continue; }
    data.forEach(r => console.log(name + ': id=' + r.id + ' qty=' + r.qty + ' sisa_gram=' + r.sisa_gram + ' harga=' + r.harga));
  }

  console.log('\n=== Permohonan Stok Abon (27 Aug) ===');
  for (const oid of OTHER_OUTLETS) {
    const { data } = await db.from('permohonan_stok')
      .select('id, qty, status, tanggal_kirim')
      .eq('tanggal_kirim', '2026-08-27')
      .eq('produk_id', 'p-abon')
      .eq('outlet_id', oid);
    const name = OUTLET_NAMES[oid];
    if (!data || data.length === 0) { console.log(name + ': NO record'); continue; }
    data.forEach(r => console.log(name + ': qty=' + r.qty + ' status=' + r.status));
  }

  console.log('\n=== Analysis ===');
  for (const oid of OTHER_OUTLETS) {
    const { data: pj } = await db.from('penjualan')
      .select('qty, sisa_gram')
      .eq('tanggal', '2026-08-27').eq('produk_id', 'p-abon').eq('outlet_id', oid).single();
    const { data: ps } = await db.from('permohonan_stok')
      .select('qty')
      .eq('tanggal_kirim', '2026-08-27').eq('produk_id', 'p-abon').eq('outlet_id', oid).single();
    if (!pj || !ps) { console.log(OUTLET_NAMES[oid] + ': missing data'); continue; }
    const name = OUTLET_NAMES[oid];
    const dist = ps.qty;
    const sisa = pj.sisa_gram;
    const ohPct = dist > 0 ? ((sisa / dist) * 100).toFixed(1) : '0';
    const correctSisa = Math.max(0, dist - pj.qty);
    const needsFix = sisa > dist;
    console.log(name + ': dist=' + dist + ' qty=' + pj.qty + ' sisa=' + sisa + ' OH=' + ohPct + '%' + (needsFix ? ' ❌ NEEDS FIX → sisa should be ' + correctSisa : ' ✅ OK'));
  }
}

main().catch(e => console.error(e));
