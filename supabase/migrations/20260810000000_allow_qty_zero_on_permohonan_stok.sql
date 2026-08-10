-- Izinkan qty = 0 pada permohonan_stok (kasus distribusi aktual 0 untuk produk/outlet
-- yang direncanakan — kapro boleh menginput jumlah distribusi berbeda dari rencana,
-- termasuk 0, karena distribusi mengikuti hasil masak aktual).
--
-- Latar belakang: Langkah 3 Produksi/Distribusi menyimpan distribusi aktual dengan
-- update permohonan_stok.qty = jumlah yang dikirim. Jika rencana ada tetapi hasil
-- masak / kiriman aktual = 0 (mis. varian Bubur Ikan tidak jadi dibuat hari itu),
-- update qty=0 ditolak constraint "permohonan_stok_qty_check" (qty > 0) → error 23514
-- → SELURUH simpanan distribusi GAGAL ("Gagal menyimpan hasil produksi & distribusi").
--
-- Solusi: longgarkan menjadi qty >= 0 (qty negatif tetap tidak boleh) — konsisten
-- dengan migrasi 20260806000000_allow_qty_zero_on_penjualan.sql untuk tabel penjualan.
ALTER TABLE permohonan_stok DROP CONSTRAINT IF EXISTS permohonan_stok_qty_check;
ALTER TABLE permohonan_stok ADD CONSTRAINT permohonan_stok_qty_check CHECK (qty >= 0);
