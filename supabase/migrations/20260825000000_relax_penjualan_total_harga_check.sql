-- Izinkan total = 0 dan harga = 0 pada penjualan
-- (kasus OH seluruh stok tidak laku → terjual = 0 → total = 0)
--
-- Sama seperti migrasi qty sebelumnya (20260806), constraint asli
-- "penjualan_total_check" (total > 0) dan "penjualan_harga_check" (harga > 0)
-- menolak insert ketika semua stok menjadi OH → error 23514
-- → seluruh simpanan outlet GAGAL.
--
-- Solusi: longgarkan menjadi >= 0 (negatif tetap tidak boleh).

-- Drop and recreate total constraint
ALTER TABLE penjualan DROP CONSTRAINT IF EXISTS penjualan_total_check;
ALTER TABLE penjualan ADD CONSTRAINT penjualan_total_check CHECK (total >= 0);

-- Drop and recreate harga constraint (if exists)
ALTER TABLE penjualan DROP CONSTRAINT IF EXISTS penjualan_harga_check;
ALTER TABLE penjualan ADD CONSTRAINT penjualan_harga_check CHECK (harga >= 0);
