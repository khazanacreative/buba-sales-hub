-- Migration: Enable RLS on ALL tables with permissive policies
-- Date: 2026-08-28
--
-- Strategy:
--   1. ENABLE ROW LEVEL SECURITY on every table
--   2. CREATE POLICY "full_access" for anon role → allows SELECT/INSERT/UPDATE/DELETE
--      This keeps the app working with the current anon key setup.
--   3. Later, when Supabase Auth is added, tighten policies per-user/role.
--
-- ⚠️ Service role bypasses RLS by default — no policies needed for it.

-- ── Helper: enable RLS + create full-access policy for anon ──────────────────
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
    -- Enable RLS (idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- Drop existing policies to avoid conflicts
    EXECUTE format('DROP POLICY IF EXISTS "full_access_%I" ON public.%I', tbl, tbl);

    -- Create permissive policy: anon can do everything
    EXECUTE format(
      'CREATE POLICY "full_access_%I" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)',
      tbl, tbl
    );

    RAISE NOTICE 'RLS enabled + policy created for table: %', tbl;
  END LOOP;
END $$;

-- Verify: show RLS status for all tables
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.tablename) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = relnamespace
JOIN pg_tables t ON t.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN (
    'outlets', 'produk', 'penjualan', 'produksi', 'jurnal',
    'coa', 'bahan_baku', 'stok_movement', 'karyawan', 'absensi',
    'permohonan_stok', 'users', 'kode_bantu',
    'hpp_produk', 'hpp_bahan', 'hpp_consumable'
  )
ORDER BY tablename;
