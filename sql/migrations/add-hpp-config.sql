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

-- ============================================================================
-- MIGRASI: HPP Config (3-tabel: header + bahan + consumable)
-- ============================================================================
-- Struktur ini mendukung gambar form "PERHITUNGAN HPP PRODUK" yang terdiri dari:
--   - BAHAN BAKU (table): nama item, satuan, berat, harga, jadi → HPP Bahan = (berat × harga) / jadi
--   - CONSUMABLE (table): nama item, satuan, berat, harga, jumlah → HPP Consumable = jumlah × harga
--   - TOTAL HPP = Σ HPP Bahan + Σ HPP Consumable (auto-calc di UI)
--   - HARGA JUAL & GPM (Gross Profit Margin) = (hargaJual - hpp) / hargaJual × 100

-- 1) Header per produk (1 row per produk, FK ke produk)
CREATE TABLE IF NOT EXISTS public.hpp_produk (
  id TEXT PRIMARY KEY,
  produk_id TEXT NOT NULL,
  harga_jual NUMERIC NOT NULL DEFAULT 0,
  catatan TEXT,
  aktif BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT hpp_produk_produk_unique UNIQUE (produk_id),
  CONSTRAINT hpp_produk_produk_fk FOREIGN KEY (produk_id) REFERENCES public.produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_produk_produk ON hpp_produk(produk_id);
CREATE INDEX IF NOT EXISTS idx_hpp_produk_aktif ON hpp_produk(aktif);

-- 2) Detail Bahan Baku (N row per hpp_produk)
-- HPP per row = (berat × harga) / jadi
CREATE TABLE IF NOT EXISTS public.hpp_bahan (
  id TEXT PRIMARY KEY,
  hpp_produk_id TEXT NOT NULL,
  nama_item TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'g',
  berat NUMERIC NOT NULL DEFAULT 0,    -- berat/volume per satuan
  harga NUMERIC NOT NULL DEFAULT 0,    -- harga beli per satuan (Rp)
  jadi NUMERIC NOT NULL DEFAULT 0,     -- hasil jadi dalam CUP (denominator)
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT hpp_bahan_hpp_produk_fk FOREIGN KEY (hpp_produk_id) REFERENCES public.hpp_produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_bahan_produk ON hpp_bahan(hpp_produk_id);

-- 3) Detail Consumable / Packaging (N row per hpp_produk)
-- HPP per row = jumlah × harga
CREATE TABLE IF NOT EXISTS public.hpp_consumable (
  id TEXT PRIMARY KEY,
  hpp_produk_id TEXT NOT NULL,
  nama_item TEXT NOT NULL,
  satuan TEXT NOT NULL DEFAULT 'pcs',
  berat NUMERIC NOT NULL DEFAULT 0,    -- berat per pcs
  harga NUMERIC NOT NULL DEFAULT 0,    -- harga beli per satuan (Rp)
  jumlah NUMERIC NOT NULL DEFAULT 0,   -- jumlah pcs (cth: 50 cup butuh 50 cup)
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT hpp_consumable_hpp_produk_fk FOREIGN KEY (hpp_produk_id) REFERENCES public.hpp_produk(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hpp_consumable_produk ON hpp_consumable(hpp_produk_id);

-- ============================================================================
-- Akun COA target (otomatis dipakai Laporan HPP untuk jurnal):
--   540000 HPP                (header)
--   541000 HPP Bahan Utama    ← hpp_bahan
--   542000 HPP Pendukung      ← hpp_consumable
--   543000 OH                 (jika ditambah nanti)
--   520001 GAJI               (jika ditambah nanti)
--   570000 BEBAN LAIN-LAIN    (jika ditambah nanti)
-- ============================================================================

-- ============================================================================
-- Contoh penggunaan di TypeScript:
-- ============================================================================
--
-- import { db } from '@/lib/store';
--
-- // 1. Tambah HPP header untuk produk Abon
-- const header = await db.addHppProduk({
--   produkId: 'p-abon',
--   hargaJual: 5000,
--   aktif: true,
-- });
--
-- // 2. Tambah bahan baku (Abon: 1 sachet @200g = 20 cup, harga Rp 20.000/sachet)
-- await db.addHppBahan({
--   hppProdukId: header.id,    // 'xxx-uuid'
--   namaItem: 'Abon',
--   satuan: 'sachet',
--   berat: 200,
--   harga: 20000,
--   jadi: 20,
--   urutan: 1,
-- });
-- // HPP = (200 × 20000) / 20 = 200.000 / 20 = 10.000... wait, contoh di gambar
-- // HPP = (200 × 20000) / 20 = Rp 1.000 per cup
--
-- // 3. Tambah consumable (Cup: 1 pack @50 cup = Rp 9.000)
-- await db.addHppConsumable({
--   hppProdukId: header.id,
--   namaItem: 'Cup',
--   satuan: 'pack',
--   berat: 50,
--   harga: 9000,
--   jumlah: 50,  // 50 cup = 50 cup → 1 cup butuh 1 cup
--   urutan: 1,
-- });
-- // HPP Consumable = 50 × 9000 = Rp 450.000 / 50 = Rp 9.000... wait, contoh di gambar
-- // HPP = (jumlah 50 × harga 9000) / 50 cup = Rp 180 per cup (sesuai gambar: 50 cup, 9000, 50, 180)
-- // FORMULA SEBENARNYA di gambar: HPP = jumlah × harga (per batch), DIBAGI cup per batch TERSIMPAN
-- // Untuk konsistensi dengan formula gambar, struktur consumable kita pakai:
-- //   jumlah = jumlah pcs dalam 1 batch, harga = harga 1 pack, HPP = jumlah × harga / qty per batch
-- // Tapi field jumlah di form adalah jumlah total pcs (cth: 50 cup butuh 50 cup)
--
-- // 4. Tambah consumable (Stiker: 1 pack @50 stiker = Rp 5.000)
-- await db.addHppConsumable({
--   hppProdukId: header.id,
--   namaItem: 'Stiker',
--   satuan: 'pack',
--   berat: 100,
--   harga: 5000,
--   jumlah: 50,
--   urutan: 2,
-- });
-- // HPP = 50 × 5000 = Rp 250.000 / 50 cup batch = Rp 5.000/cup
-- // Tapi di gambar: berat 100, jadi 50, HPP 100 → pakai rumus (jumlah × harga) / jadi_cup_batch
-- // Untuk OAT, contoh di gambar: HPP 200 → 100 × 89000 / 44500 ... wait, jadi 200, harga 89000, HPP 200
-- // → (200 × 89000) / 200 = Rp 89.000/cup ... tapi gambar 200 × 445
-- // OK, FORMULA: HPP = (berat × harga) / jadi ... untuk BAHAN saja
-- // Untuk consumable: HPP = (jumlah × harga) / jumlah_cup
-- // tapi struktur DB consumable tidak punya field "jumlah_cup" lagi
-- // SOLUSI: di UI MasterData, untuk Consumable gunakan field:
-- //   nama = "Cup 50pcs", berat = 50, harga = 9000, jumlah = 1 (per cup)
-- // atau HPP Consumable pakai rumus sederhana: HPP per cup = harga (1 pack untuk 1 cup batch)
-- // Untuk simplifikasi, di UI kita pakai rumus (jumlah × harga) / batchSize
-- // dimana batchSize = jumlah (dalam unit cup) sehingga HPP per cup = harga / 1
-- // Lihat HppConfigSection.tsx untuk implementasi detail
--
-- // 5. Hapus HPP untuk produk (CASCADE otomatis hapus semua bahan + consumable)
-- await db.deleteHppProduk(header.id);
--
-- // 6. Query di Laporan HPP
-- const headers = await db.getHppProduk?.(); // (TODO jika ditambah getter)
-- // hitung total HPP per produk: qtyTerjual × totalHppPerCup
-- // totalHppPerCup = Σ (berat × harga / jadi) untuk semua bahan
--                + Σ (jumlah × harga / batch) untuk semua consumable
-- ============================================================================


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
