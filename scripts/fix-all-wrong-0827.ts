import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_DATE = '2026-08-27';
const uid = () => Math.random().toString(36).slice(2, 10);

// All outlets
const ALL_OUTLETS = [
  'o-kesambi', 'o-mca', 'o-gunung-gangsir', 'o-kuti', 'o-randu-pitu',
  'o-gempeng', 'o-sugihwaras', 'o-permata', 'o-sidokare', 'o-sidohwayah',
];

// Records that should NOT have existed (created by my earlier wrong scripts)
// These are all p-bubur, p-nasitim, p-abon with qty=0 that I inserted
const RECORDS_TO_DELETE_OUTLETS = ['o-gunung-gangsir', 'o-sidohwayah', 'o-randu-pitu', 'o-kuti', 'o-gempeng'];
const WRONG_PRODUCTS = ['p-bubur', 'p-nasitim', 'p-abon'];

async function main() {
  console.log('=== STEP 1: Hapus semua record yang salah dibuat (qty=0) ===\n');

  // Get ALL production product records for Aug 27
  const { data: allRecords } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  // Find records to delete: wrong outlets + wrong products + qty=0 or empty catatan
  const toDelete: any[] = [];
  for (const r of allRecords || []) {
    if (
      RECORDS_TO_DELETE_OUTLETS.includes(r.outlet_id) &&
      WRONG_PRODUCTS.includes(r.produk_id) &&
      (r.catatan === '' || r.catatan === null)
    ) {
      toDelete.push(r);
    }
  }

  console.log(`Records to delete: ${toDelete.length}`);
  for (const r of toDelete) {
    console.log(`  DELETE: ${r.outlet_id} - ${r.produk_id} qty=${r.qty}`);
    await supabase.from('permohonan_stok').delete().eq('id', r.id);
  }

  // STEP 2: Fix abon - should be 2 for all, 5 for gunung-gangsir
  console.log('\n=== STEP 2: Fix abon (2 semua, 5 Gunung Gangsir) ===\n');

  // Get existing abon records
  const abonRecords = (allRecords || []).filter((r: any) => r.produk_id === 'p-abon');

  for (const outletId of ALL_OUTLETS) {
    const existing = abonRecords.find((r: any) => r.outlet_id === outletId);
    const correctQty = outletId === 'o-gunung-gangsir' ? 5 : 2;

    if (existing) {
      if (existing.qty !== correctQty) {
        console.log(`  UPDATE ${outletId} abon: ${existing.qty} → ${correctQty}`);
        await supabase.from('permohonan_stok').update({ qty: correctQty }).eq('id', existing.id);
      } else {
        console.log(`  OK ${outletId} abon=${correctQty}`);
      }
    } else {
      console.log(`  CREATE ${outletId} abon=${correctQty}`);
      await supabase.from('permohonan_stok').insert({
        id: uid(),
        tanggal: TARGET_DATE,
        tanggal_kirim: TARGET_DATE,
        outlet_id: outletId,
        produk_id: 'p-abon',
        qty: correctQty,
        status: 'Disetujui',
        catatan: '',
        qty_rencana: correctQty,
        catatan_rencana: null,
      });
    }
  }

  // STEP 3: Verify final state
  console.log('\n\n=== VERIFIKASI FINAL ===\n');
  const { data: finalData } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  const PROD_IDS = ['p-bubur', 'p-nasitim', 'p-oatmeal', 'p-puding', 'p-abon'];
  
  for (const outletId of ALL_OUTLETS) {
    const records = (finalData || []).filter(
      (r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id)
    );
    const summary = PROD_IDS.map(p => {
      const r = records.find((x: any) => x.produk_id === p);
      if (!r) return `${p}=❌`;
      return `${p}=${r.qty}`;
    }).join(' | ');
    console.log(`${outletId}: ${summary}`);
  }
}

main().catch(console.error);
