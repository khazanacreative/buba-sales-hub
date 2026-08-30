export interface Outlet {
  id: string;
  nama: string;
  lokasi: string;
}

export interface Produk {
  id: string;
  nama: string;
  harga: number;
  satuan: string;
}

export interface Penjualan {
  id: string;
  tanggal: string;
  outletId: string;
  produkId: string;
  qty: number;
  harga: number;
  total: number;
  sisaGram?: number; // sisa OH dalam gram untuk bubur/tim
  variant?: string; // 'bubur_d' | 'bubur_i' | 'tim_d' | 'tim_i' | null = single-variant
}

export interface Produksi {
  id: string;
  tanggal: string;
  produkId: string;
  qtyRencana: number;
  qtyRealisasi: number;
}

export type AkunKategori =
  | 'Aset'
  | 'Kewajiban'
  | 'Ekuitas'
  | 'Pendapatan'
  | 'Beban';

export interface Jurnal {
  id: string;
  tanggal: string;
  ref?: string;
  keterangan: string;
  kodeAkun?: string;
  akun: string;
  tipe: 'Debit' | 'Kredit';
  jumlah: number;
  kategori: AkunKategori;
  kodeBantuId?: string;   // Optional: link ke KodeBantu.id
}

export interface AkunCOA {
  kode: string;
  nama: string;
  tipe: string;
  kategori: AkunKategori;
}

// === Kode Bantu (Sub-account / Person tracking) ===
// Digunakan untuk akun Hutang Usaha (210000) → "H-001" dan
// Piutang Karyawan/Usaha (130000/131000) → "C-001".
// Setiap kode bantu mewakili satu person/kreditur/debitur.
export interface KodeBantu {
  id: string;
  kode: string;           // e.g. "H-001" (Hutang) atau "C-001" (Piutang/Customer)
  kodeAkun: string;       // "210000" (Hutang Usaha) atau "130000"/"131000" (Piutang)
  nama: string;           // Nama person / kreditur / debitur
  keterangan?: string;    // Catatan tambahan (alamat, no HP, dll)
  createdAt?: string;     // ISO date string
}

// === HPP PRODUK (Master Data Perhitungan HPP per Produk) ===
// Struktur 3-tabel: HppProduk (header) → HppBahan (detail bahan baku)
//                                    → HppConsumable (detail consumable/packaging)
//
// HPP Final dihitung otomatis:
//   hpp = Σ(HPP Bahan Baku) + Σ(HPP Consumable)
//   GPM = (hargaJual - hpp) / hargaJual × 100
//
// Tiap produk (Bubur, Nasi Tim, Oatmeal, Puding, Abon) punya 1 HppProduk
// yang berisi daftar bahan baku + consumable.

// Header — 1 row per produk
export interface HppProduk {
  id: string;
  produkId: string;            // FK ke produk.id (1:1)
  hargaJual: number;           // Harga jual (untuk hitung GPM)
  catatan?: string;            // Catatan opsional
  aktif: boolean;              // enable/disable
  updatedAt?: string;
}

// Detail Bahan Baku — N row per HppProduk
// HPP = (berat / jadi) × harga
export interface HppBahan {
  id: string;
  hppProdukId: string;         // FK ke hpp_produk.id
  namaItem: string;            // Cth: Beras, Daging, Oatmeal, Keju, Puding
  satuan: string;              // Cth: g, kg, ml, sachet
  berat: number;               // Berat/Volume per satuan (numerator)
  harga: number;               // Harga beli per satuan (Rp)
  jadi: number;                // Hasil jadi dalam CUP (denominator)
  // hpp = (berat * harga) / jadi  (auto-calc di UI, TIDAK disimpan)
  urutan: number;              // Untuk display order
}

// Detail Consumable — N row per HppProduk
// HPP = jumlah × harga
export interface HppConsumable {
  id: string;
  hppProdukId: string;         // FK ke hpp_produk.id
  namaItem: string;            // Cth: Cup, Tutup, Sendok, Stiker, Plastik
  satuan: string;              // Cth: pcs, pack, rim
  berat: number;               // Berat per pcs (untuk referensi)
  harga: number;               // Harga beli per satuan (Rp)
  jumlah: number;              // Jumlah pcs per batch cup (mis. 50 cup = 50 cup)
  // hpp = jumlah * harga  (auto-calc di UI, TIDAK disimpan)
  urutan: number;
}

export type Role = 'admin' | 'outlet' | 'produksi' | 'gudang' | 'tl';

export interface UserAccount {
  username: string;
  password: string;
  nama: string;
  role: Role;
  outletId?: string;
  karyawanId?: string;
}

// === Stok Gudang ===
export interface BahanBaku {
  id: string;
  kode: string;
  nama: string;
  satuan: string;
  stokMin: number;
  stokAwal: number;
  hargaBeli: number;
  konversiGram?: number;
}

export type StokMovementType = 'IN' | 'OUT';

export interface StokMovement {
  id: string;
  tanggal: string;
  bahanId: string;
  tipe: StokMovementType;
  qty: number;
  keterangan?: string;
  produksiId?: string; // when OUT triggered by produksi
}

// === Absensi ===
export interface Karyawan {
  id: string;
  nama: string;
  posisi: string;
  role: string;
  outletId?: string;
  gajiPokok: number; // per hari
  bonusOmset?: number;
  bonusUlasan?: number;
  bonusOH?: number;
  tunjanganHarian?: number;
  overtimeRate?: number;
  jamMasuk?: string; // "HH:mm"
  jamPulang?: string; // "HH:mm"
  username?: string;
  password?: string;
}

export type StatusAbsen = 'Hadir' | 'Izin' | 'Sakit' | 'Alpha';

export interface Absensi {
  id: string;
  tanggal: string;
  karyawanId: string;
  jamMasuk?: string; // "HH:mm"
  jamPulang?: string;
  status: StatusAbsen;
  catatan?: string;
  bonus?: number;
  tunjangan?: number;
  overtime?: number; // hours
}

// === Permohonan Stok ===
export type PermohonanStokStatus = "Pending" | "Disetujui" | "Ditolak";

export interface PermohonanStok {
  id: string;
  tanggal: string;
  tanggalKirim: string;
  outletId: string;
  produkId: string;
  qty: number;
  status: PermohonanStokStatus;
  catatan?: string;
  // Rencana Langkah 1 (pra-produksi) — tidak ditimpa saat Langkah 3 (distribusi
  // aktual) disimpan. qty & catatan tetap = distribusi aktual.
  qtyRencana?: number;
  catatanRencana?: string;
}

// === Log Aktivitas ===
// Mencatat semua operasi CRUD untuk audit trail.
export interface LogAktivitas {
  id: string;
  createdAt: string;       // ISO timestamp
  username: string;        // username pelaku
  namaUser?: string;       // nama lengkap pelaku
  aksi: 'CREATE' | 'UPDATE' | 'DELETE';
  modul: string;           // 'Outlet', 'Produk', 'BahanBaku', 'Karyawan', 'User', dll
  recordId?: string;       // ID record yang diubah
  detail?: string;         // deskripsi perubahan
  nilaiLama?: string;      // JSON snapshot sebelum diubah
  nilaiBaru?: string;      // JSON snapshot sesudah diubah
}
