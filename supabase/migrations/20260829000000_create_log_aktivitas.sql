-- Tabel log aktivitas untuk melacak semua operasi CRUD di aplikasi.
-- Menyimpan informasi siapa, kapan, apa yang dilakukan, dan detail perubahan.
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  username TEXT NOT NULL,
  nama_user TEXT,
  aksi TEXT NOT NULL,          -- 'CREATE', 'UPDATE', 'DELETE'
  modul TEXT NOT NULL,         -- 'Outlet', 'Produk', 'BahanBaku', 'Karyawan', 'User', 'COA', 'Penjualan', 'Produksi', 'Stok', 'Absensi', 'Jurnal', 'Setting', dll
  record_id TEXT,              -- ID record yang diubah (opsional)
  detail TEXT,                 -- Deskripsi perubahan (JSON string atau teks)
  nilai_lama TEXT,             -- JSON snapshot data sebelum diubah (opsional)
  nilai_baru TEXT              -- JSON snapshot data sesudah diubah (opsional)
);

-- Index untuk pencarian berdasarkan tanggal dan modul
CREATE INDEX IF NOT EXISTS idx_log_aktivitas_created_at ON log_aktivitas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_log_aktivitas_modul ON log_aktivitas(modul);
CREATE INDEX IF NOT EXISTS idx_log_aktivitas_username ON log_aktivitas(username);
