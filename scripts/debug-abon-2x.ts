import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const TARGET_DATE = '2026-08-27';

// Check all abon-related penjualan with variant info
async function main() {
  console.log('=== DEBUG: Why abon shows 2x in UI ===\n');

  // 1. Check ALL penjualan for abon on Aug 27 (across all outlets)
  const { data: penAbon } = await supabase
    .from('penjualan')
    .select('*')
    .eq('tanggal', TARGET_DATE)
    .eq('produk_id', 'p-abon');

  console.log('=== ALL Penjualan Abon Aug 27 ===');
  console.log(`Total records: ${(penAbon || []).length}\n`);
  for (const r of penAbon || []) {
    console.log(`  outlet=${r.outlet_id} id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram} harga=${r.harga}`);
  }

  // 2. Check for duplicate penjualan per outlet
  console.log('\n=== Duplikat Penjualan per Outlet ===');
  const byOutlet = new Map<string, any[]>();
  for (const r of penAbon || []) {
    const k = r.outlet_id;
    if (!byOutlet.has(k)) byOutlet.set(k, []);
    byOutlet.get(k)!.push(r);
  }
  for (const [oid, recs] of byOutlet) {
    const names: Record<string, string> = {
      'o-gunung-gangsir': 'Gunung Gangsir', 'o-kuti': 'Kuti',
      'o-randu-pitu': 'Randu Pitu', 'o-sidohwayah': 'Sidohwayah', 'o-gempeng': 'Gempeng'
    };
    console.log(`  ${names[oid] || oid}: ${recs.length} records`);
    if (recs.length > 1) {
      console.log(`  🔴 DUPLIKAT!`);
      let totalQty = 0;
      for (const r of recs) {
        console.log(`    id=${r.id} qty=${r.qty} variant=${r.variant} sisaGram=${r.sisaGram}`);
        totalQty += r.qty;
      }
      console.log(`    Total qty: ${totalQty} (expected qty if 2x: would be qty from 1 record * 2)`);
    }
  }

  // 3. Check permohonan_stok - compare qty_rencana vs qty
  console.log('\n=== Permohonan Stok Abon - Compare qty vs qty_rencana ===');
  const { data: psAbon } = await supabase
    .from('permohonan_stok')
    .select('id, outlet_id, qty, qty_rencana, status, tanggal, tanggal_kirim, catatan')
    .eq('tanggal', TARGET_DATE)
    .eq('produk_id', 'p-abon');

  for (const r of psAbon || []) {
    const names: Record<string, string> = {
      'o-gunung-gangsir': 'Gunung Gangsir', 'o-kuti': 'Kuti',
      'o-randu-pitu': 'Randu Pitu', 'o-sidohwayah': 'Sidohwayah', 'o-gempeng': 'Gempeng'
    };
    const name = names[r.outlet_id] || r.outlet_id;
    const isTarget = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'].includes(r.outlet_id);
    const marker = isTarget ? '🎯' : '  ';
    console.log(`  ${marker} ${name}: qty=${r.qty} qty_rencana=${r.qty_rencana} status=${r.status} tgl_kirim=${r.tanggal_kirim}`);
  }

  // 4. Check outlet users for the 5 target outlets
  console.log('\n=== User Accounts for Target Outlets ===');
  const { data: users } = await supabase.from('users').select('*');
  const targetOutletIds = ['o-gunung-gangsir', 'o-kuti', 'o-randu-pitu', 'o-sidohwayah', 'o-gempeng'];
  for (const u of users || []) {
    if (targetOutletIds.includes(u.outlet_id)) {
      console.log(`  ${u.username} (role=${u.role}) → outlet=${u.outlet_id}`);
    }
  }

  // 5. Check if there are multiple penjualan records with same outlet+date+produk but different variants
  console.log('\n=== Penjualan Abon Grouped by Outlet+Variant ===');
  const byOutletVariant = new Map<string, any[]>();
  for (const r of penAbon || []) {
    const k = `${r.outlet_id}|${r.variant || 'null'}`;
    if (!byOutletVariant.has(k)) byOutletVariant.set(k, []);
    byOutletVariant.get(k)!.push(r);
  }
  for (const [key, recs] of byOutletVariant) {
    if (recs.length > 1) {
      console.log(`  🔴 ${key}: ${recs.length} records!`);
    }
  }
}

main().catch(console.error);
