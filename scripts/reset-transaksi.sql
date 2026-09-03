-- =============================================================================
-- RESET TRANSAKSI: Hapus semua data Produksi, Penjualan, dan Stok Movement
-- Data Master (Outlet, Karyawan, COA, Produk, Bahan Baku) TIDAK terpengaruh
-- =============================================================================

-- Disable RLS temporarily if needed (run as service_role)
-- ALTER TABLE penjualan DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE produksi DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE stok_movement DISABLE ROW LEVEL SECURITY;

-- Hapus semua data
DELETE FROM penjualan;
DELETE FROM produksi;
DELETE FROM stok_movement;

-- Re-enable RLS
-- ALTER TABLE penjualan ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE produksi ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stok_movement ENABLE ROW LEVEL SECURITY;

-- Verifikasi
SELECT 'penjualan' as tabel, COUNT(*) as sisa FROM penjualan
UNION ALL
SELECT 'produksi', COUNT(*) FROM produksi
UNION ALL
SELECT 'stok_movement', COUNT(*) FROM stok_movement;
