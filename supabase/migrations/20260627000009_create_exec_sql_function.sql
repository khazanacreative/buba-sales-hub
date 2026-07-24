-- Migration: Create exec_sql function for running SQL via RPC
-- Date: 2026-06-27
-- ⚠️ SECURITY: Hanya grant EXECUTE ke service_role (bukan anon/authenticated).
--   Script run-migration.ts membaca VITE_SUPABASE_SERVICE_ROLE_KEY dari .env.
--   Jangan pernah grant ke anon — anon key bersifat publik di sisi klien!
--
-- Cara mendapatkan service_role key:
--   Supabase Dashboard → Project Settings → API → service_role key
--   Tambahkan ke .env: VITE_SUPABASE_SERVICE_ROLE_KEY=eyJ...

CREATE OR REPLACE FUNCTION exec_sql(sql_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  EXECUTE sql_text;
END;
$$;

-- ⛔ Hanya service_role — aman untuk script server-side
GRANT EXECUTE ON FUNCTION exec_sql TO service_role;
