import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGET_DATE = '2026-08-27';
const PROD_IDS = ['p-bubur', 'p-nasitim', 'p-oatmeal', 'p-puding', 'p-abon'];
const uid = () => Math.random().toString(36).slice(2, 10);

const OUTLET_IDS = [
  'o-gunung-gangsir',
  'o-sidohwayah',
  'o-randu-pitu',
  'o-kuti',
  'o-gempeng',
];

async function main() {
  console.log('=== Fix oatmeal & puding di 5 outlet (27 Agustus) ===\n');

  // 1. Get existing records
  const { data: existing } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  const outletRecords = (existing || []).filter((r: any) => OUTLET_IDS.includes(r.outlet_id));

  // 2. Fix Pending → Disetujui for production products
  const pendingRecords = outletRecords.filter(
    (r: any) => r.status === 'Pending' && PROD_IDS.includes(r.produk_id)
  );

  console.log(`📋 Pending records perlu diapprove: ${pendingRecords.length}`);
  for (const r of pendingRecords) {
    console.log(`   ✅ ${r.outlet_id} - ${r.produk_id}: qty=${r.qty}`);
    await supabase
      .from('permohonan_stok')
      .update({ status: 'Disetujui' })
      .eq('id', r.id);
  }

  // 3. Create missing production products
  const missingRecords: Array<{ outlet_id: string; produk_id: string; qty: number }> = [];
  
  for (const outletId of OUTLET_IDS) {
    const outletProds = outletRecords.filter(
      (r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id)
    );
    for (const prodId of PROD_IDS) {
      if (!outletProds.find((r: any) => r.produk_id === prodId)) {
        const refRecord = outletRecords.find(
          (r: any) => r.produk_id === prodId && r.outlet_id !== outletId && r.qty > 0
        );
        missingRecords.push({
          outlet_id: outletId,
          produk_id: prodId,
          qty: refRecord ? refRecord.qty : 0,
        });
      }
    }
  }

  if (missingRecords.length > 0) {
    console.log(`\n📝 Membuat ${missingRecords.length} record baru...`);
    for (const r of missingRecords) {
      const { error } = await supabase.from('permohonan_stok').insert({
        id: uid(),
        tanggal: TARGET_DATE,
        tanggal_kirim: TARGET_DATE,
        ...r,
        status: 'Disetujui',
        catatan: '',
        qty_rencana: r.qty,
        catatan_rencana: null,
      });
      if (error) {
        console.error(`   ❌ Error ${r.outlet_id} - ${r.produk_id}:`, error.message);
      } else {
        console.log(`   ✅ ${r.outlet_id} - ${r.produk_id}: qty=${r.qty}`);
      }
    }
  }

  // 4. Verify
  console.log('\n\n=== VERIFIKASI AKHIR ===');
  const { data: verify } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  for (const outletId of OUTLET_IDS) {
    const records = (verify || []).filter(
      (r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id)
    );
    console.log(`\n${outletId}:`);
    for (const prodId of PROD_IDS) {
      const rec = records.find((r: any) => r.produk_id === prodId);
      if (!rec) {
        console.log(`   ❌ ${prodId}: TIDAK ADA`);
      } else if (rec.status === 'Disetujui') {
        console.log(`   ✅ ${prodId}: qty=${rec.qty} (Disetujui)`);
      } else {
        console.log(`   ⚠️  ${prodId}: qty=${rec.qty} (${rec.status})`);
      }
    }
  }
}

main().catch(console.error);
