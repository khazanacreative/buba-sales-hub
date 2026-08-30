-- Tambah kolom saldo_awal ke tabel kode_bantu
ALTER TABLE public.kode_bantu
  ADD COLUMN IF NOT EXISTS saldo_awal NUMERIC DEFAULT 0;
