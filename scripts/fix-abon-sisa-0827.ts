import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Target: abon penjualan records where sisa_gram > dist (caused by orphan deletion)
const TARGETS = [
  { outlet_id: 'o-gunung-gangsir', dist: 5, oldQty: 2, oldSisa: 8, newSisa: 3 },
  { outlet_id: 'o-kuti', dist: 2, oldQty: 0, oldSisa: 4, newSisa: 2 },
  { outlet_id: 'o-randu-pitu', dist: 2, oldQty: 1, oldSisa: 3, newSisa: 1 },
  { outlet_id: 'o-sidohwayah', dist: 2, oldQty: 0, oldSisa: 4, newSisa: 2 },
  { outlet_id: 'o-gempeng', dist: 2, oldQty: 1, oldSisa: 3, newSisa: 1 },
];

const OUTLET_NAMES: Record<string, string> = {
  'o-gunung-gangsir': 'Gunung Gangsir',
  'o-kuti': 'Kuti',
  'o-randu-pitu': 'Randu Pitu',
  'o-sidohwayah': 'Sidohwayah',
  'o-gempeng': 'Gempeng',
};

async function main() {
  console.log('=== Fixing penjualan sisa_gram for abon (Aug 27) ===\n');

  for (const t of TARGETS) {
    const name = OUTLET_NAMES[t.outlet_id] || t.outlet_id;

    // Find the penjualan record
    const { data: pj, error: e1 } = await db.from('penjualan')
      .select('id, qty, sisa_gram')
      .eq('tanggal', '2026-08-27')
      .eq('outlet_id', t.outlet_id)
      .eq('produk_id', 'p-abon')
      .eq('variant', 'abon')
      .single();

    if (e1 || !pj) {
      console.log(`❌ ${name}: penjualan record not found!`);
      continue;
    }

    console.log(`${name} (${t.outlet_id}):`);
    console.log(`  Current: qty=${pj.qty} sisa_gram=${pj.sisa_gram}`);
    console.log(`  Fix: sisa_gram ${pj.sisa_gram} → ${t.newSisa} (dist=${t.dist}, terjual=${pj.qty})`);

    const { error: e2 } = await db.from('penjualan')
      .update({ sisa_gram: t.newSisa })
      .eq('id', pj.id);

    if (e2) {
      console.log(`  ❌ Update failed: ${e2.message}`);
    } else {
      console.log(`  ✅ Updated!`);
    }
  }

  // Also fix stok_movements for OH abon
  console.log('\n=== Fixing stok_movements for OH abon ===\n');
  for (const t of TARGETS) {
    const name = OUTLET_NAMES[t.outlet_id] || t.outlet_id;
    const sisaGram = t.newSisa * 10; // OH abon stored in grams in stok_mov

    // Find existing movements
    const { data: movs } = await db.from('stok_movements')
      .select('id, qty, keterangan')
      .eq('keterangan', `OH abon dari ${t.outlet_id} tanggal 2026-08-27`);

    if (movs && movs.length > 0) {
      for (const m of movs) {
        console.log(`${name}: Updating stok_movement ${m.id} qty=${m.qty} → ${sisaGram}`);
        const { error } = await db.from('stok_movements')
          .update({ qty: sisaGram })
          .eq('id', m.id);
        if (error) console.log(`  ❌ ${error.message}`);
        else console.log(`  ✅ Updated!`);
      }
    } else {
      console.log(`${name}: No stok_movement found for OH abon`);
    }
  }

  // Verify
  console.log('\n=== Verification ===\n');
  for (const t of TARGETS) {
    const name = OUTLET_NAMES[t.outlet_id] || t.outlet_id;
    const { data: pj } = await db.from('penjualan')
      .select('qty, sisa_gram')
      .eq('tanggal', '2026-08-27')
      .eq('outlet_id', t.outlet_id)
      .eq('produk_id', 'p-abon')
      .single();

    if (pj) {
      const ohPct = t.dist > 0 ? ((pj.sisa_gram / t.dist) * 100).toFixed(1) : '0';
      console.log(`${name}: dist=${t.dist} qty=${pj.qty} sisa=${pj.sisa_gram} OH=${ohPct}%`);
    }
  }
}

main().catch(e => console.error(e));
