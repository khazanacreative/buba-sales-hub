-- Migration: Rollback RLS (disable all)
-- Date: 2026-08-28
-- Use this if you need to revert RLS changes.

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'outlets', 'produk', 'penjualan', 'produksi', 'jurnal',
    'coa', 'bahan_baku', 'stok_movement', 'karyawan', 'absensi',
    'permohonan_stok', 'users', 'kode_bantu',
    'hpp_produk', 'hpp_bahan', 'hpp_consumable'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "full_access_%I" ON public.%I', tbl, tbl);
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'RLS disabled for table: %', tbl;
  END LOOP;
END $$;
