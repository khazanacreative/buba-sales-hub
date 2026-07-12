-- Migration: Add variant column to penjualan for per-variant sisaGram tracking
-- Date: 2026-06-27
-- Bubur/Tim punya 2 varian (D/I) yang masing-masing bisa punya sisaGram berbeda.
-- Sebelumnya sisaGram digabung per base produk → hilang data per-varian.

ALTER TABLE penjualan ADD COLUMN IF NOT EXISTS variant VARCHAR DEFAULT NULL;
