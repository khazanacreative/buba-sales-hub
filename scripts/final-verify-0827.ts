import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

const PROD_IDS = ['p-bubur', 'p-nasitim', 'p-oatmeal', 'p-puding', 'p-abon'];
const ALL_OUTLETS = [
  'o-kesambi', 'o-mca', 'o-gunung-gangsir', 'o-kuti', 'o-randu-pitu',
  'o-gempeng', 'o-sugihwaras', 'o-permata', 'o-sidokare', 'o-sidohwayah',
];

async function main() {
  const { data } = await supabase.from('permohonan_stok').select('*').eq('tanggal', '2026-08-27');

  console.log('=== DATA FINAL 27 AGUSTUS - PRODUK PRODUKSI ===\n');
  
  // Header
  const hdr = ['Outlet', ...PROD_IDS.map(p => p.replace('p-','')), 'Status'].join(' | ');
  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const outletId of ALL_OUTLETS) {
    const records = (data || []).filter((r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id));
    const cells = PROD_IDS.map(p => {
      const r = records.find((x: any) => x.produk_id === p);
      if (!r) return '-';
      if (r.status !== 'Disetujui') return `${r.qty}⚠`;
      return `${r.qty}`;
    });
    const allOk = records.every((r: any) => r.status === 'Disetujui');
    const status = records.length === PROD_IDS.length && allOk ? '✅' : `${records.length}/${PROD_IDS.length}`;
    console.log(`${outletId.padEnd(20)} | ${cells.join(' | ')} | ${status}`);
  }

  // Check for Pending
  const pending = (data || []).filter((r: any) => 
    PROD_IDS.includes(r.produk_id) && r.status !== 'Disetujui'
  );
  if (pending.length > 0) {
    console.log(`\n⚠️ Masih ada ${pending.length} record Pending:`);
    for (const r of pending) {
      console.log(`  ${r.outlet_id} - ${r.produk_id}: qty=${r.qty} status=${r.status}`);
    }
  } else {
    console.log('\n✅ Semua record produk produksi berstatus Disetujui');
  }
}

main();
