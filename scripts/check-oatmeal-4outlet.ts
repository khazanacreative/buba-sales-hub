import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_DATE = '2026-08-27';
const NO_OATMEAL_OUTLETS = ['o-kesambi', 'o-mca', 'o-gempeng', 'o-kuti'];

async function main() {
  console.log('=== Cek oatmeal di outlet yang TIDAK seharusnya punya (27 Agustus) ===\n');

  const { data: records } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE)
    .eq('produk_id', 'p-oatmeal');

  console.log(`Total oatmeal records pada 27 Agustus: ${(records || []).length}\n`);

  for (const outletId of NO_OATMEAL_OUTLETS) {
    const found = (records || []).filter((r: any) => r.outlet_id === outletId);
    if (found.length === 0) {
      console.log(`✅ ${outletId}: TIDAK ADA oatmeal (sesuai)`);
    } else {
      console.log(`❌ ${outletId}: ADA oatmeal (${found.length} record):`);
      for (const r of found) {
        console.log(`   id=${r.id}, qty=${r.qty}, status=${r.status}`);
      }
    }
  }

  // Reference: other outlets with oatmeal
  console.log('\n=== Outlet LAIN yang punya oatmeal (referensi) ===');
  const otherOatmeal = (records || []).filter((r: any) => !NO_OATMEAL_OUTLETS.includes(r.outlet_id));
  for (const r of otherOatmeal) {
    console.log(`  ${r.outlet_id}: id=${r.id}, qty=${r.qty}, status=${r.status}`);
  }

  // Check ALL production products for all outlets on Aug 27 to verify consistency
  console.log('\n=== Ringkasan SEMUA produk produksi per outlet (27 Agustus) ===');
  const { data: allProd } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  const PROD_IDS = ['p-bubur', 'p-nasitim', 'p-oatmeal', 'p-puding', 'p-abon'];
  const outletMap = new Map<string, any[]>();
  for (const r of (allProd || []) as any[]) {
    if (PROD_IDS.includes(r.produk_id)) {
      if (!outletMap.has(r.outlet_id)) outletMap.set(r.outlet_id, []);
      outletMap.get(r.outlet_id)!.push(r);
    }
  }

  const sortedOutlets = [...outletMap.keys()].sort();
  for (const outletId of sortedOutlets) {
    const recs = outletMap.get(outletId)!;
    const prodSummary = PROD_IDS.map(p => {
      const r = recs.find((x: any) => x.produk_id === p);
      if (!r) return `${p}=❌`;
      return `${p}=(${r.qty},${r.status})`;
    }).join(' | ');
    console.log(`  ${outletId}: ${prodSummary}`);
  }
}

main().catch(console.error);
