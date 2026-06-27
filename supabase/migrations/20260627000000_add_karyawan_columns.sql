-- Migration: Add per-employee columns for attendance, overtime, and allowance
-- Date: 2026-06-27

ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS tunjangan_harian NUMERIC DEFAULT 0;
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS overtime_rate NUMERIC DEFAULT 0;
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS jam_masuk VARCHAR DEFAULT '07:30';
ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS jam_pulang VARCHAR DEFAULT '15:00';
