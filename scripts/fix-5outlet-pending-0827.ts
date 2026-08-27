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

// 5 outlets with issues
const OUTLET_IDS = [
  'o-gunung-gangsir',
  'o-sidohwayah',
  'o-randu-pitu',
  'o-kuti',
  'o-gempeng',
];

async function main() {
  console.log('=== Fix oatmeal & puding di 5 outlet (27 Agustus) ===\n');

  // 1. Get existing records for these outlets on Aug 27
  const { data: existing } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  const outletRecords = (existing || []).filter((r: any) => OUTLET_IDS.includes(r.outlet_id));

  // 2. Fix Pending → Disetujui for production products
  const pendingRecords = outletRecords.filter(
    (r: any) => r.status === 'Pending' && PROD_IDS.includes(r.produk_id)
  );

  console.log(`\n📋 Pending records perlu diapprove: ${pendingRecords.length}`);
  for (const r of pendingRecords) {
    console.log(`   ${r.outlet_id} - ${r.produk_id}: qty=${r.qty} (Pending → Disetujui)`);
    await supabase
      .from('permohonan_stok')
      .update({ status: 'Disetujui' })
      .eq('id', r.id);
  }

  // 3. Find missing products for each outlet
  console.log('\n🔍 Cek produk yang hilang...');
  const missingRecords: Array<{ outlet_id: string; produk_id: string; qty: number; catatan: string }> = [];

  for (const outletId of OUTLET_IDS) {
    const outletProds = outletRecords.filter(
      (r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id)
    );

    for (const prodId of PROD_IDS) {
      const exists = outletProds.find((r: any) => r.produk_id === prodId);
      if (!exists) {
        // Find reference qty from other outlets
        const refRecord = outletRecords.find(
          (r: any) => r.produk_id === prodId && r.outlet_id !== outletId && r.qty > 0
        );
        const qty = refRecord ? refRecord.qty : 0;
        missingRecords.push({
          outlet_id: outletId,
          produk_id: prodId,
          qty,
          catatan: '',
        });
        console.log(`   ❌ ${outletId} - ${prodId}: HILANG (qty ref: ${qty})`);
      }
    }
  }

  // 4. Create missing records
  if (missingRecords.length > 0) {
    console.log(`\n📝 Membuat ${missingRecords.length} record baru...`);
    const inserts = missingRecords.map((r) => ({
      tanggal: TARGET_DATE,
      tanggal_kirim: TARGET_DATE,
      ...r,
      status: 'Disetujui',
      qty_rencana: r.qty,
      catatan_rencana: '',
    }));

    const { error } = await supabase.from('permohonan_stok').insert(inserts);
    if (error) {
      console.error('Error inserting:', error.message);
    } else {
      console.log('   ✅ Berhasil!');
    }
  } else {
    console.log('\n✅ Tidak ada record yang hilang');
  }

  // 5. Verify all 5 outlets
  console.log('\n\n=== VERIFIKASI AKHIR ===');
  const { data: verify } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE);

  for (const outletId of OUTLET_IDS) {
    const records = (verify || []).filter(
      (r: any) => r.outlet_id === outletId && PROD_IDS.includes(r.produk_id)
    );
    const disetujui = records.filter((r: any) => r.status === 'Disetujui');
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
