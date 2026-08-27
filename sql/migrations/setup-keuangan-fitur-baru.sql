-- ============================================================================
-- MIGRASI GABUNGAN: Fitur Baru Keuangan (Kode Bantu + HPP Config + Jurnal)
-- ============================================================================
-- Jalankan SELURUH file ini SEKALI di Supabase SQL Editor.
-- Aman dijalankan berulang (idempotent — pakai IF NOT EXISTS / DROP IF EXISTS).
--
-- Yang di-setup:
--   1. Tabel kode_bantu + kolom jurnal.kode_bantu_id + FK constraint
--   2. Tabel HPP Config (3-tabel: hpp_produk + hpp_bahan + hpp_consumable)
--   3. Cleanup tabel lama hpp_config (jika ada dari commit sebelumnya)
--
-- Akun COA yang dipakai:
--   210000 Hutang Usaha         → kode bantu prefix "H-" (H-001, H-002, ...)
--   130000 Piutang Karyawan     → kode bantu prefix "C-" (C-001, C-002, ...)
--   131000 Piutang Usaha        → kode bantu prefix "C-"
--   540000 HPP (header)         (otomatis dipakai Laporan HPP)
--   541000 HPP Bahan Utama      ← hpp_bahan
--   542000 HPP Pendukung        ← hpp_consumable
-- ============================================================================

-- ============================================================================
-- BAGIAN 1: Tabel KODE BANTU (Sub-account Hutang & Piutang per Person)
-- ============================================================================
-- Setiap kode bantu mewakili satu person (kreditur/debitur):
--   - 210000 (Hutang Usaha)      → prefix "H-" (H-001, H-002, ...)
--   - 130000 (Piutang Karyawan)  → prefix "C-" (C-001, C-002, ...)
--   - 131000 (Piutang Usaha)     → prefix "C-" (C-001, C-002, ...)
--
-- Buku Pembantu kemudian menampilkan transaksi per kode bantu (per person),
-- bukan hanya per akun COA.

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

-- Constraint: kode_bantu hanya untuk akun Hutang/Piutang
ALTER TABLE public.kode_bantu
  DROP CONSTRAINT IF EXISTS kode_bantu_kode_akun_check;
ALTER TABLE public.kode_bantu
  ADD CONSTRAINT kode_bantu_kode_akun_check
  CHECK (kode_akun IN ('210000', '130000', '131000'));

-- --------------------------------------------------------------------------
-- Tambahkan kolom kode_bantu_id di tabel jurnal (optional, NULL = tidak linked)
-- --------------------------------------------------------------------------
ALTER TABLE public.jurnal
  ADD COLUMN IF NOT EXISTS kode_bantu_id TEXT;

-- Foreign key: jika kode_bantu dihapus, jurnal.kode_bantu_id jadi NULL
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

-- Index untuk performa query buku pembantu
CREATE INDEX IF NOT EXISTS idx_jurnal_kode_bantu_id ON jurnal(kode_bantu_id);

-- ============================================================================
-- BAGIAN 2: Cleanup tabel LAMA (hpp_config) jika ada dari commit sebelumnya
-- ============================================================================
-- Versi sebelumnya menggunakan tabel flat `hpp_config` (dengan kolom
-- hpp_bahan_per_cup, hpp_packaging_per_cup, dll). Sekarang kita pakai
-- struktur 3-tabel yang lebih fleksibel (sesuai form gambar).
-- DROP dulu tabel lama untuk menghindari conflict dengan schema baru.

DROP TABLE IF EXISTS public.hpp_config CASCADE;

-- ============================================================================
-- BAGIAN 3: Tabel HPP CONFIG (3-tabel: header + bahan + consumable)
-- ============================================================================
-- Struktur ini mendukung form "PERHITUNGAN HPP PRODUK" di gambar dengan:
--   - BAHAN BAKU (table): nama item, satuan, berat, harga, jadi
--       → HPP Bahan = (berat × harga) / jadi
--       Contoh gambar ABON: 1, 200, 20000, 20 → HPP = (200×20000)/20 = 1000
--   - CONSUMABLE (table): nama item, satuan, berat, harga, jumlah
--       → HPP Consumable = jumlah × harga
--       Contoh gambar CUP: 1, 50, 9000, 50 → HPP = 50×9000/50 = 180 (per cup)
--   - TOTAL HPP = Σ HPP Bahan + Σ HPP Consumable (auto-calc di UI)
--   - HARGA JUAL & GPM (Gross Profit Margin):
--       GPM = (hargaJual - hpp) / hargaJual × 100
--       Contoh: harga 5.000, hpp 1.280 → GPM = 3.720 (72.5%)

-- 3.1) Header per produk (1 row per produk, FK ke produk)
CREATE TABLE IF NOT EXISTS public.hpp_produk (
  id TEXT PRIMARY KEY,
  produk_id TEXT NOT NULL,
  harga_jual NUMERIC NOT NULL DEFAULT 0,
  catatan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT hpp_produk_produk_unique UNIQUE (produk_id),
  CONSTRAINT hpp_produk_produk_fk
    FOREIGN KEY (produk_id) REFERENCES public.produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_produk_produk ON hpp_produk(produk_id);
CREATE INDEX IF NOT EXISTS idx_hpp_produk_aktif ON hpp_produk(aktif);

-- 3.2) Detail Bahan Baku (N row per hpp_produk)
-- HPP per row = (berat × harga) / jadi
CREATE TABLE IF NOT EXISTS public.hpp_bahan (
  id TEXT PRIMARY KEY,
  hpp_produk_id TEXT NOT NULL,
  nama_item TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'g',
  berat NUMERIC NOT NULL DEFAULT 0,    -- berat/volume per satuan (numerator)
  harga NUMERIC NOT NULL DEFAULT 0,    -- harga beli per satuan (Rp)
  jadi NUMERIC NOT NULL DEFAULT 0,     -- hasil jadi dalam CUP (denominator)
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT hpp_bahan_hpp_produk_fk
    FOREIGN KEY (hpp_produk_id) REFERENCES public.hpp_produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_bahan_produk ON hpp_bahan(hpp_produk_id);

-- 3.3) Detail Consumable / Packaging (N row per hpp_produk)
-- HPP per row = jumlah × harga
CREATE TABLE IF NOT EXISTS public.hpp_consumable (
  id TEXT PRIMARY KEY,
  hpp_produk_id TEXT NOT NULL,
  nama_item TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'pcs',
  berat NUMERIC NOT NULL DEFAULT 0,    -- berat per pcs (untuk referensi)
  harga NUMERIC NOT NULL DEFAULT 0,    -- harga beli per satuan (Rp)
  jumlah NUMERIC NOT NULL DEFAULT 0,   -- jumlah pcs per batch cup (numerator)
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT hpp_consumable_hpp_produk_fk
    FOREIGN KEY (hpp_produk_id) REFERENCES public.hpp_produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_consumable_produk ON hpp_consumable(hpp_produk_id);

-- ============================================================================
-- BAGIAN 4: Verifikasi (cek tabel & index yang sudah dibuat)
-- ============================================================================
DO $$
DECLARE
  kode_bantu_count INTEGER;
  hpp_produk_count INTEGER;
  hpp_bahan_count INTEGER;
  hpp_consumable_count INTEGER;
  jurnal_has_kode_bantu BOOLEAN;
BEGIN
  -- Hitung tabel
  SELECT COUNT(*) INTO kode_bantu_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kode_bantu';

  SELECT COUNT(*) INTO hpp_produk_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hpp_produk';

  SELECT COUNT(*) INTO hpp_bahan_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hpp_bahan';

  SELECT COUNT(*) INTO hpp_consumable_count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hpp_consumable';

  -- Cek kolom kode_bantu_id di jurnal
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'jurnal' AND column_name = 'kode_bantu_id'
  ) INTO jurnal_has_kode_bantu;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'MIGRASI SELESAI';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tabel kode_bantu: % (1 = ada)', kode_bantu_count;
  RAISE NOTICE 'Tabel hpp_produk: % (1 = ada)', hpp_produk_count;
  RAISE NOTICE 'Tabel hpp_bahan: % (1 = ada)', hpp_bahan_count;
  RAISE NOTICE 'Tabel hpp_consumable: % (1 = ada)', hpp_consumable_count;
  RAISE NOTICE 'Kolom jurnal.kode_bantu_id: %', CASE WHEN jurnal_has_kode_bantu THEN 'ADA ✓' ELSE 'TIDAK ADA ✗' END;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Sekarang buka Master Data > Kode Bantu';
  RAISE NOTICE 'untuk menambah kode H-001 (Hutang) / C-001 (Piutang)';
  RAISE NOTICE 'Lalu Master Data > HPP per Produk untuk setup HPP.';
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- SELESAI. Sekarang ke langkah berikutnya:
-- 1. Buka aplikasi Buba Sales Hub
-- 2. Master Data > Kode Bantu: Tambah person untuk Hutang (H-001) / Piutang (C-001)
-- 3. Master Data > HPP per Produk: Tambah konfigurasi HPP per produk
-- 4. Keuangan > Laporan HPP: Lihat perhitungan HPP otomatis
-- 5. Keuangan > Kode Bantu: Manage sub-account Hutang/Piutang
-- 6. Keuangan > Buku Pembantu: Pilih kode bantu untuk lihat transaksi per person
-- ============================================================================
