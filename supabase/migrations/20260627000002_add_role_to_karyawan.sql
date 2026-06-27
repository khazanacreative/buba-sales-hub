-- Migration: Add role column to karyawan table for merged user account management
-- Date: 2026-06-27

ALTER TABLE karyawan ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'outlet';
