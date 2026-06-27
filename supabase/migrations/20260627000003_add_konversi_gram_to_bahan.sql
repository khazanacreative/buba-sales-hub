-- Migration: Add konversi_gram column to bahan_baku for gram conversion tracking
-- Date: 2026-06-27

ALTER TABLE bahan_baku ADD COLUMN IF NOT EXISTS konversi_gram NUMERIC;
