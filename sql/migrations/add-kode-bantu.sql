-- ============================================================================
-- MIGRASI: Tabel Kode Bantu (Sub-account / Person tracking untuk Hutang & Piutang)
-- ============================================================================
-- Kode Bantu digunakan untuk akun:
--   - 210000 (Hutang Usaha) → prefix "H-" → contoh: H-001, H-002
--   - 130000 (Piutang Karyawan) / 131000 (Piutang usaha) → prefix "C-" → contoh: C-001, C-002
--
-- Setiap kode bantu mewakili satu person (kreditur/debitur) sehingga buku
-- pembantu bisa menampilkan transaksi per person, bukan hanya per akun COA.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.kode_bantu (
  id TEXT PRIMARY KEY,
  kode TEXT NOT NULL,
  kode_akun TEXT NOT NULL,
  nama TEXT NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index untuk pencarian cepat
CREATE INDEX IF NOT EXISTS idx_kode_bantu_kode_akun ON kode_bantu(kode_akun);
CREATE INDEX IF NOT EXISTS idx_kode_bantu_kode ON kode_bantu(kode);

-- Kode bantu untuk akun Hutang/piutang saja
ALTER TABLE public.kode_bantu
  DROP CONSTRAINT IF EXISTS kode_bantu_kode_akun_check;
ALTER TABLE public.kode_bantu
  ADD CONSTRAINT kode_bantu_kode_akun_check
  CHECK (kode_akun IN ('210000', '130000', '131000'));

-- ============================================================================
-- Tambahkan kolom kode_bantu_id di tabel jurnal (optional, NULL = tidak linked)
-- ============================================================================
ALTER TABLE public.jurnal
  ADD COLUMN IF NOT EXISTS kode_bantu_id TEXT;

-- Foreign key optional (jika ingin strict referential integrity)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'jurnal_kode_bantu_id_fkey'
  ) THEN
    ALTER TABLE public.jurnal
      ADD CONSTRAINT jurnal_kode_bantu_id_fkey
      FOREIGN KEY (kode_bantu_id) REFERENCES public.kode_bantu(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index untuk performa query
CREATE INDEX IF NOT EXISTS idx_jurnal_kode_bantu_id ON jurnal(kode_bantu_id);

-- ============================================================================
-- Contoh penggunaan di TypeScript:
-- ============================================================================
--
-- import { db } from '@/lib/store';
--
-- // Tambah kode bantu (Hutang Usaha)
-- await db.addKodeBantu({
--   kode: 'H-001',
--   kodeAkun: '210000',
--   nama: 'Pak Ahmad',
--   keterangan: 'Supplier bahan baku utama'
-- });
--
-- // Tambah kode bantu (Piutang Karyawan/Usaha)
-- await db.addKodeBantu({
--   kode: 'C-001',
--   kodeAkun: '130000',
--   nama: 'Budi Santoso',
--   keterangan: 'Staff outlet Gunung Gangsir'
-- });
--
-- // Update kode bantu
-- await db.updateKodeBantu('id-kode-bantu', {
--   nama: 'Pak Ahmad Updated',
--   keterangan: 'Catatan baru'
-- });
--
-- // Hapus kode bantu
-- await db.deleteKodeBantu('id-kode-bantu');
--
-- // Tambah jurnal entry yang ter-link ke kode bantu
-- await db.addJurnal({
--   tanggal: '2024-01-15',
--   keterangan: 'Pembelian bahan',
--   kodeAkun: '210000',
--   akun: 'Hutang Usaha',
--   tipe: 'Kredit',
--   jumlah: 500000,
--   kategori: 'Kewajiban',
--   kodeBantuId: 'id-kode-bantu'  // <-- link ke kode bantu
-- });
