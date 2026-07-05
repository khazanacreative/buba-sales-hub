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
}

export interface AkunCOA {
  kode: string;
  nama: string;
  tipe: string;
  kategori: AkunKategori;
}

export type Role = 'admin' | 'outlet' | 'produksi';

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
}
