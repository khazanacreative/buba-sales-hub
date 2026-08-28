import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const TARGETS = [
  { outlet_id: 'o-mca', dist: 2, newSisa: 2, penjualan_id: 'rl9y2xrt' },
  { outlet_id: 'o-sidokare', dist: 2, newSisa: 2, penjualan_id: 'p5cj3uz1' },
];

const OUTLET_NAMES: Record<string, string> = {
  'o-mca': 'MCA',
  'o-sidokare': 'Sidokare',
};

async function main() {
  for (const t of TARGETS) {
    const name = OUTLET_NAMES[t.outlet_id];
    console.log(name + ': Updating sisa_gram → ' + t.newSisa);
    
    const { error } = await db.from('penjualan')
      .update({ sisa_gram: t.newSisa })
      .eq('id', t.penjualan_id);

    if (error) console.log('  ❌ ' + error.message);
    else console.log('  ✅ Updated!');
  }

  // Verify
  console.log('\n=== Verification ===');
  for (const t of TARGETS) {
    const name = OUTLET_NAMES[t.outlet_id];
    const { data } = await db.from('penjualan')
      .select('qty, sisa_gram')
      .eq('id', t.penjualan_id).single();
    if (data) {
      const ohPct = ((data.sisa_gram / t.dist) * 100).toFixed(1);
      console.log(name + ': dist=' + t.dist + ' qty=' + data.qty + ' sisa=' + data.sisa_gram + ' OH=' + ohPct + '%');
    }
  }
}

main().catch(e => console.error(e));
