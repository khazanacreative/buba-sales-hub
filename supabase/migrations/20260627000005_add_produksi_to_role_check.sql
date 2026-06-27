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
