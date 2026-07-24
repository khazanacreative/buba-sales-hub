-- === 20260627000000_add_karyawan_columns.sql ===
-- Migration: Add per-employee columns for attendance, overtime, and allowance
-- Date: 2026-06-27

ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS tunjangan_harian NUMERIC DEFAULT 0;
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC DEFAULT 0;
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS jam_masuk VARCHAR DEFAULT '07:30';
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS jam_pulang VARCHAR DEFAULT '15:00';


-- === 20260627000001_add_karyawan_id_to_users.sql ===
-- Migration: Add karyawan_id to users for linking employee records
-- Date: 2026-06-27

ALTER TABLE users ADD COLUMN IF NOT EXISTS karyawan_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_karyawan_id ON users (karyawan_id);


-- === 20260627000002_add_role_to_karyawan.sql ===
-- Migration: Add role column to karyawan table for merged user account management
-- Date: 2026-06-27

ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'outlet';


-- === 20260627000003_add_konversi_gram_to_bahan.sql ===
-- Migration: Add konversi_gram column to bahan_baku for gram conversion tracking
-- Date: 2026-06-27

ALTER TABLE bahan_baku ADD COLUMN IF NOT EXISTS konversi_gram NUMERIC;


-- === 20260627000004_add_unique_username_to_users.sql ===
-- Migration: Add unique constraint on users.username
-- Date: 2026-06-27

-- First clean up any duplicate usernames (keep the one with karyawan_id if available)
DELETE FROM users a USING users b 
WHERE a.username = b.username 
  AND a.karyawan_id IS NULL 
  AND b.karyawan_id IS NOT NULL;

DELETE FROM users a USING users b 
WHERE a.username = b.username 
  AND a.ctid < b.ctid;

-- Add unique constraint
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);


-- === 20260627000005_add_produksi_to_role_check.sql ===
-- Migration: Allow 'produksi' as a valid role in users table
-- Date: 2026-06-27
-- Fix: users_role_check constraint was blocking role='produksi' inserts

-- Drop old check constraint (name may vary; try both common names)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_role;

-- Re-add constraint with 'produksi' included
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'outlet', 'produksi'));


-- === 20260627000006_add_bonus_oh_to_karyawan.sql ===
ALTER TABLE karyawan ADD COLUMN bonus_oh integer DEFAULT 0;


-- === 20260627000007_add_sisa_gram_to_penjualan.sql ===
ALTER TABLE penjualan ADD COLUMN sisa_gram integer DEFAULT NULL;


-- === 20260627000008_add_variant_to_penjualan.sql ===
-- Migration: Add variant column to penjualan for per-variant sisaGram tracking
-- Date: 2026-06-27
-- Bubur/Tim punya 2 varian (D/I) yang masing-masing bisa punya sisaGram berbeda.
-- Sebelumnya sisaGram digabung per base produk → hilang data per-varian.

ALTER TABLE penjualan ADD COLUMN IF NOT EXISTS variant VARCHAR DEFAULT NULL;
