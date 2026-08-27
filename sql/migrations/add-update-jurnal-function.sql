-- ============================================================================
-- MIGRASI: Update Jurnal Entry di Supabase
-- ============================================================================
-- File ini untuk dokumentasi migrasi jurnal table di Supabase.
-- 
-- Karena supabase client (js) sudah supporting update via .update(),
-- fungsi updateJurnal ditambahkan di src/lib/store.ts
--
-- TABEL: jurnal
-- Kolom yang bisa diupdate:
--   - tanggal (DATE)
--   - ref (TEXT)
--   - keterangan (TEXT)
--   - kode_akun (TEXT)
--   - akun (TEXT)
--   - tipe (TEXT: 'Debit' | 'Kredit')
--   - jumlah (NUMERIC)
--   - kategori (TEXT)
-- ============================================================================

-- Contoh penggunaan di TypeScript:
--
-- import { db } from '@/lib/store';
-- 
-- // Update jurnal
-- await db.updateJurnal('jurnal-id-123', {
--   tanggal: '2024-01-15',
--   keterangan: 'Perbaikan catatan',
--   jumlah: 500000
-- });
--
-- // Delete jurnal (sudah ada)
-- await db.deleteJurnal('jurnal-id-123');
--
-- // Add jurnal baru (sudah ada)
-- await db.addJurnal({
--   tanggal: '2024-01-15',
--   keterangan: 'Pembelian bahan',
--   kodeAkun: '210000',
--   akun: 'Hutang Usaha',
--   tipe: 'Kredit',
--   jumlah: 500000,
--   kategori: 'Kewajiban'
-- });

-- ============================================================================
-- DESKRIPSI TABEL JURNAL (untuk referensi)
-- ============================================================================
/*
CREATE TABLE public.jurnal (
  id TEXT PRIMARY KEY,
  tanggal DATE NOT NULL,
  ref TEXT,
  keterangan TEXT,
  kode_akun TEXT NOT NULL,
  akun TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK (tipe IN ('Debit', 'Kredit')),
  jumlah NUMERIC NOT NULL,
  kategori TEXT NOT NULL CHECK (kategori IN ('Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'Beban')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes untuk performa query
CREATE INDEX idx_jurnal_tanggal ON jurnal(tanggal);
CREATE INDEX idx_jurnal_kode_akun ON jurnal(kode_akun);
CREATE INDEX idx_jurnal_kategori ON jurnal(kategori);
CREATE INDEX idx_jurnal_tipe ON jurnal(tipe);

-- Foreign key reference (opsional, jika ada tabel coa)
-- ALTER TABLE jurnal ADD FOREIGN KEY (kode_akun) REFERENCES coa(kode);
*/