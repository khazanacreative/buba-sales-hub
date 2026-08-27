-- ============================================================================
-- MIGRASI: Tabel COA (Chart of Accounts) untuk Tab Keuangan
-- ============================================================================
-- Tabel referensi akun yang digunakan oleh semua sub-tab keuangan:
-- Neraca, Kode Bantu, Buku Pembantu, Buku Besar, Arus Kas, Laba Rugi
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.coa (
  kode TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  tipe TEXT NOT NULL,
  kategori TEXT NOT NULL CHECK (kategori IN ('Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'Beban')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk pencarian berdasarkan kategori
CREATE INDEX IF NOT EXISTS idx_coa_kategori ON coa(kategori);

-- ============================================================================
-- Contoh penggunaan di TypeScript:
-- ============================================================================
--
-- import { db } from '@/lib/store';
--
-- // Fetch semua COA (sudah ada via useDB())
-- const { coa } = useDB();
--
-- // Tambah COA baru
-- await db.addCoA({
--   kode: '590000',
--   nama: 'Biaya Komisi',
--   tipe: 'Biaya',
--   kategori: 'Beban'
-- });
--
-- // Update COA
-- await db.updateCoA('590000', {
--   nama: 'Biaya Komisi Marketplace'
-- });
--
-- // Hapus COA
-- await db.deleteCoA('590000');
