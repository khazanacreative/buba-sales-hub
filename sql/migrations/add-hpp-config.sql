-- ============================================================================
-- MIGRASI: Tabel HPP Config (Master Data Perhitungan HPP per Produk)
-- ============================================================================
-- Setiap produk (Bubur, Nasi Tim, Oatmeal, Puding, Abon) memiliki 1 row
-- konfigurasi HPP per cup. Nilai HPP dihitung sebagai jumlah seluruh
-- komponen biaya (bahan, packaging, OH, TK, dll) dibagi jumlah cup
-- yang diproduksi.
--
-- Akun COA target (jurnal HPP otomatis):
--   540000 HPP                  (header)
--   541000 HPP Bahan Utama      ← hppBahanPerCup
--   542000 HPP Pendukung        ← hppPackagingPerCup
--   543000 OH                   ← hppOhPerCup
--   520001 GAJI                 ← biayaTenagaKerjaPerCup
--   570000 BEBAN LAIN-LAIN      ← biayaLainPerCup
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.hpp_config (
  id TEXT PRIMARY KEY,
  produk_id TEXT NOT NULL,
  hpp_bahan_per_cup NUMERIC NOT NULL DEFAULT 0,
  hpp_packaging_per_cup NUMERIC NOT NULL DEFAULT 0,
  hpp_oh_per_cup NUMERIC NOT NULL DEFAULT 0,
  biaya_tenaga_kerja_per_cup NUMERIC NOT NULL DEFAULT 0,
  biaya_lain_per_cup NUMERIC NOT NULL DEFAULT 0,
  margin_persen NUMERIC NOT NULL DEFAULT 30,
  aktif BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT hpp_config_produk_unique UNIQUE (produk_id),
  CONSTRAINT hpp_config_produk_fk FOREIGN KEY (produk_id) REFERENCES public.produk(id) ON DELETE CASCADE
);

-- Index untuk performa
CREATE INDEX IF NOT EXISTS idx_hpp_config_produk ON hpp_config(produk_id);
CREATE INDEX IF NOT EXISTS idx_hpp_config_aktif ON hpp_config(aktif);

-- ============================================================================
-- Contoh penggunaan di TypeScript:
-- ============================================================================
--
-- import { db } from '@/lib/store';
--
-- // Tambah konfigurasi HPP untuk produk Bubur
-- await db.addHppConfig({
--   produkId: 'p-bubur',
--   hppBahanPerCup: 1500,    // Rp 1.500 per cup untuk bahan utama
--   hppPackagingPerCup: 300,  // Rp 300 per cup untuk cup + tutup + sendok
--   hppOhPerCup: 500,         // Rp 500 per cup untuk overhead
--   biayaTenagaKerjaPerCup: 700, // Rp 700 per cup untuk gaji
--   biayaLainPerCup: 0,
--   marginPersen: 40,
--   aktif: true,
-- });
--
-- // Update HPP
-- await db.updateHppConfig('id-config', { hppBahanPerCup: 1800 });
--
-- // Hapus HPP config
-- await db.deleteHppConfig('id-config');
--
-- // Query di Laporan HPP
-- const configs = await db.getHppConfigs();
-- // hitung total HPP per produk: qtyTerjual × totalHppPerCup
