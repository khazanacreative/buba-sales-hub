-- Migration: Add karyawan_id to users for linking employee records
-- Date: 2026-06-27

ALTER TABLE users ADD COLUMN IF NOT EXISTS karyawan_id TEXT;
CREATE INDEX IF NOT EXISTS idx_users_karyawan_id ON users (karyawan_id);
