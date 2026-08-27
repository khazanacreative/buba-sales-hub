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
  // Get ALL permohonan_stok for Aug 27
  const { data: allRecords } = await supabase
    .from('permohonan_stok')
    .select('*')
    .eq('tanggal', TARGET_DATE)
    .order('outlet_id');

  console.log(`=== SEMUA record permohonan_stok 27 Agustus (${allRecords?.length || 0} records) ===\n`);

  // Group by outlet
  const byOutlet = new Map<string, any[]>();
  for (const r of allRecords || []) {
    if (!byOutlet.has(r.outlet_id)) byOutlet.set(r.outlet_id, []);
    byOutlet.get(r.outlet_id)!.push(r);
  }

  for (const [outletId, records] of byOutlet) {
    console.log(`\n${outletId}:`);
    for (const r of records) {
      console.log(`  ${r.produk_id}: qty=${r.qty}, status=${r.status}, catatan="${(r.catatan || '').slice(0, 50)}", created=${r.created_at?.slice(0, 19) || 'N/A'}`);
    }
  }
}

main().catch(console.error);
