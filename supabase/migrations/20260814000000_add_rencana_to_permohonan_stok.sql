-- Simpan RENCANA (Langkah 1 Pra-Produksi) terpisah dari DISTRIBUSI AKTUAL (Langkah 3).
--
-- Latar belakang: Langkah 3 Produksi/Distribusi menyimpan distribusi aktual dengan
-- update permohonan_stok.qty = jumlah yang dikirim (bisa berbeda dari rencana saat
-- luberan/penyusutan). Karena qty & catatan juga dibaca sebagai RENCANA oleh
-- Langkah 1 (pra-produksi) dan Langkah 2 (pemotongan bahan baku), rencana ikut
-- berubah menjadi angka aktual → pra-produksi & pemotongan stok bahan baku membesar
-- padahal seharusnya hanya kemasan yang mengikuti hasil aktual.
--
-- Solusi: dua kolom tambahan yang menyimpan rencana Langkah 1 dan TIDAK pernah
-- ditimpa saat Langkah 3 disimpan:
--   - qty_rencana        = total rencana per produk/outlet
--   - catatan_rencana    = catatan rencana (split [D:X,I:Y] + varian)
-- qty & catatan tetap menyimpan distribusi aktual (dipakai laporan OH/dikirim).
-- Data lama di-backfill dari qty/catatan (rencana asli tidak bisa dipulihkan).
ALTER TABLE permohonan_stok ADD COLUMN IF NOT EXISTS qty_rencana INTEGER;
ALTER TABLE permohonan_stok ADD COLUMN IF NOT EXISTS catatan_rencana TEXT;

UPDATE permohonan_stok SET qty_rencana = qty WHERE qty_rencana IS NULL;
UPDATE permohonan_stok SET catatan_rencana = catatan WHERE catatan_rencana IS NULL;
