import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_DATE = '2026-08-27';

async function main() {
  // Fetch ALL permohonan_stok for Aug 27 (what store would have)
  const { data: allPs } = await supabase.from('permohonan_stok').select('*').eq('tanggal', TARGET_DATE);
  
  console.log(`=== Total permohonan_stok Aug 27: ${(allPs||[]).length} ===\n`);
  
  // Check for ANY product duplicates per outlet (not just abon)
  const byOutletProduct = new Map<string, any[]>();
  for (const r of allPs || []) {
    const key = `${r.outlet_id}|${r.produk_id}`;
    if (!byOutletProduct.has(key)) byOutletProduct.set(key, []);
    byOutletProduct.get(key)!.push(r);
  }
  
  console.log('=== Duplikat per Outlet+Produk ===');
  let dupCount = 0;
  for (const [key, recs] of byOutletProduct) {
    if (recs.length > 1) {
      const [oid, pid] = key.split('|');
      console.log(`  🔴 ${oid} × ${pid}: ${recs.length} records`);
      for (const r of recs) {
        console.log(`    id=${r.id} qty=${r.qty} qty_rencana=${r.qty_rencana} status=${r.status} catatan="${(r.catatan||'').slice(0,40)}" tgl_kirim=${r.tanggal_kirim}`);
      }
      dupCount++;
    }
  }
  if (dupCount === 0) console.log('  ✅ Tidak ada duplikat');
  
  // Now check the specific abon records and simulate loadGridFromReqs
  console.log('\n=== Simulasi loadGridFromReqs untuk Abon ===');
  const TARGET_IDS = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
  const NAMES: Record<string, string> = {
    'o-gunung-gangsir': 'Gunung Gangsir', 'o-kuti': 'Kuti',
    'o-randu-pitu': 'Randu Pitu', 'o-sidohwayah': 'Sidohwayah', 'o-gempeng': 'Gempeng'
  };
  
  for (const oid of TARGET_IDS) {
    // Simulate: filter by tanggalKirim === tanggal, statuses includes null/Pending/Disetujui
    const dayReqs = (allPs || []).filter((r: any) => 
      r.tanggal_kirim === TARGET_DATE && [null, 'Pending', 'Disetujui'].includes(r.status ?? null)
    );
    const abonReqs = dayReqs.filter((r: any) => r.outlet_id === oid && r.produk_id === 'p-abon');
    
    console.log(`\n  ${NAMES[oid]}:`);
    console.log(`    dayReqs (all products): ${dayReqs.length}`);
    console.log(`    abon records: ${abonReqs.length}`);
    for (const r of abonReqs) {
      console.log(`    → id=${r.id} qty=${r.qty} status=${r.status}`);
    }
    
    // Simulate loadGridFromReqs (uses = assignment, not +=)
    let abonVal = 0;
    for (const r of abonReqs) {
      abonVal = r.qty; // = not +=
    }
    console.log(`    loadGridFromReqs result: abon = ${abonVal}`);
  }
  
  // Check if there's a view in DB that unions permohonan_stok
  console.log('\n=== Cek duplikat dengan UNION query ===');
  
  // Check ALL permohonan_stok for abon across ALL dates that have tanggal_kirim = Aug 27
  const { data: byTglKirim } = await supabase
    .from('permohonan_stok')
    .select('id, outlet_id, qty, status, tanggal, tanggal_kirim')
    .eq('tanggal_kirim', TARGET_DATE)
    .eq('produk_id', 'p-abon');
  
  console.log(`Records with tanggal_kirim=Aug 27 for abon: ${(byTglKirim||[]).length}`);
  for (const r of byTglKirim || []) {
    console.log(`  ${r.outlet_id}: id=${r.id} qty=${r.qty} status=${r.status} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim}`);
  }
  
  // Also check records where tanggal != tanggal_kirim for abon
  const diffDates = (byTglKirim || []).filter((r: any) => r.tanggal !== TARGET_DATE);
  if (diffDates.length > 0) {
    console.log(`\n🔴 Records with tanggal != tanggal_kirim for abon: ${diffDates.length}`);
    for (const r of diffDates) {
      console.log(`  ${r.outlet_id}: id=${r.id} qty=${r.qty} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim}`);
    }
  }
  
  // Check if there are abon records with tanggal=Aug 27 but different tanggal_kirim
  const { data: byTgl } = await supabase
    .from('permohonan_stok')
    .select('id, outlet_id, qty, status, tanggal, tanggal_kirim')
    .eq('tanggal', TARGET_DATE)
    .eq('produk_id', 'p-abon');
    
  console.log(`\nRecords with tanggal=Aug 27 for abon: ${(byTgl||[]).length}`);
  for (const r of byTgl || []) {
    console.log(`  ${r.outlet_id}: id=${r.id} qty=${r.qty} status=${r.status} tanggal=${r.tanggal} tgl_kirim=${r.tanggal_kirim}`);
  }
}

main().catch(console.error);
