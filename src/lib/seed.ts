import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, UserAccount, BahanBaku, Karyawan } from "./types";

const OUTLET_NAMES = [
  "Gunung Gangsir",
  "Randu Pitu",
  "Kuti",
  "Sidohwayah",
  "Gempeng",
  "Kesambi",
  "Permata",
  "MCA",
  "Sugihwaras",
  "Sidokare",
  "Kenongo",
  "Kepadangan",
  "Pagerwojo"
];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const SEED_OUTLETS: Outlet[] = OUTLET_NAMES.map((name) => ({
  id: `o-${slug(name)}`,
  nama: name,
  lokasi: "-"
}));

export const SEED_PRODUK: Produk[] = [
  { id: "p-bubur", nama: "Bubur", harga: 3500, satuan: "cup" },
  { id: "p-nasitim", nama: "Nasi Tim", harga: 4500, satuan: "cup" },
  { id: "p-oatmeal", nama: "Oatmeal", harga: 5000, satuan: "cup" },
  { id: "p-puding", nama: "Puding", harga: 3000, satuan: "cup" },
  { id: "p-abon", nama: "Abon", harga: 5000, satuan: "pcs" },
  { id: "p-sayur", nama: "Sayur", harga: 3500, satuan: "cup" },
  // Support supplies registered as products to bypass foreign key constraints:
  { id: "b-cb01", nama: "Cup Bubur", harga: 0, satuan: "biji" },
  { id: "b-ttp01", nama: "Tutup", harga: 0, satuan: "biji" },
  { id: "b-sen01", nama: "Sendok", harga: 0, satuan: "Pack" },
  { id: "b-ts01", nama: "Tisu", harga: 0, satuan: "pcs" },
  { id: "b-krs01", nama: "Kresek", harga: 0, satuan: "PACK" },
  { id: "b-bl01", nama: "Balon + Stik", harga: 0, satuan: "biji" },
  { id: "b-plas01", nama: "Plastik Seler", harga: 0, satuan: "pcs" },
  { id: "b-cupoat1", nama: "Cup Oat", harga: 0, satuan: "biji" },
  { id: "b-cuppud01", nama: "Cup Puding", harga: 0, satuan: "biji" }
];

export const SEED_COA: AkunCOA[] = [
  { kode: "110000", nama: "Kas Rupiah", tipe: "Kas", kategori: "Aset" },
  { kode: "111000", nama: "Kas Kecil", tipe: "Kas", kategori: "Aset" },
  { kode: "120000", nama: "Bank", tipe: "Bank", kategori: "Aset" },
  { kode: "130000", nama: "Piutang Karyawan", tipe: "Akun Piutang", kategori: "Aset" },
  { kode: "131000", nama: "Piutang usaha", tipe: "Akun Piutang", kategori: "Aset" },
  { kode: "140000", nama: "Persediaan", tipe: "Persediaan", kategori: "Aset" },
  { kode: "150000", nama: "Aktiva Lancar Lainnya", tipe: "Aktiva Lancar Lainnya", kategori: "Aset" },
  { kode: "160000", nama: "Aktiva Tetap", tipe: "Aktiva Tetap", kategori: "Aset" },
  { kode: "170000", nama: "Akumulasi Penyusutan", tipe: "Akun Akumulasi Penyusutan", kategori: "Aset" },
  { kode: "180000", nama: "Biaya Dibayar Dimuka", tipe: "Biaya Dibayar Dimuka", kategori: "Aset" },
  { kode: "190000", nama: "Uang Muka Biaya", tipe: "Aktiva Lancar Lainnya", kategori: "Aset" },
  { kode: "210000", nama: "Hutang Usaha", tipe: "Akun Hutang", kategori: "Kewajiban" },
  { kode: "220000", nama: "Hutang Bank", tipe: "Hutang Jangka Panjang", kategori: "Kewajiban" },
  { kode: "310000", nama: "Modal Awal", tipe: "Modal", kategori: "Ekuitas" },
  { kode: "320000", nama: "Prive", tipe: "Modal", kategori: "Ekuitas" },
  { kode: "330000", nama: "Laba Ditahan", tipe: "Modal", kategori: "Ekuitas" },
  { kode: "340000", nama: "Laba Periode Berjalan", tipe: "Modal", kategori: "Ekuitas" },
  { kode: "410000", nama: "Pendapatan Utama", tipe: "Pendapatan", kategori: "Pendapatan" },
  { kode: "411000", nama: "Pendapatan Penunjang", tipe: "Pendapatan", kategori: "Pendapatan" },
  { kode: "412000", nama: "Pendapatan Lainnya", tipe: "Pendapatan", kategori: "Pendapatan" },
  { kode: "440000", nama: "Bunga Bank", tipe: "Pendapatan Lainnya", kategori: "Pendapatan" },
  { kode: "510000", nama: "Operasional", tipe: "Biaya", kategori: "Beban" },
  { kode: "510001", nama: "Pulse Pusat", tipe: "Biaya", kategori: "Beban" },
  { kode: "510002", nama: "Perlengkapan", tipe: "Biaya", kategori: "Beban" },
  { kode: "510003", nama: "PLN/Token", tipe: "Biaya", kategori: "Beban" },
  { kode: "510004", nama: "PDAM", tipe: "Biaya", kategori: "Beban" },
  { kode: "510005", nama: "Iuran Warga", tipe: "Biaya", kategori: "Beban" },
  { kode: "510006", nama: "LPG", tipe: "Biaya", kategori: "Beban" },
  { kode: "510007", nama: "Iuran Karcis", tipe: "Biaya", kategori: "Beban" },
  { kode: "510008", nama: "ATK", tipe: "Biaya", kategori: "Beban" },
  { kode: "510009", nama: "Titip Rombong", tipe: "Biaya", kategori: "Beban" },
  { kode: "510010", nama: "WIFI/Telepon", tipe: "Biaya", kategori: "Beban" },
  { kode: "510011", nama: "BBM", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510012", nama: "BPJS", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510013", nama: "Air Minum", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510014", nama: "Laundry", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510015", nama: "Alat Kebersihan", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510016", nama: "Konsumsi", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510017", nama: "Sewa Outlet", tipe: "Biaya", kategori: "Beban" },
  { kode: "510018", nama: "Admin Bank", tipe: "Biaya Lainnya", kategori: "Beban" },
  { kode: "510019", nama: "Ongkos", tipe: "Biaya", kategori: "Beban" },
  { kode: "510020", nama: "Pemeliharaan & Perbaikan", tipe: "Biaya", kategori: "Beban" },
  { kode: "510021", nama: "Biaya Penyusutan", tipe: "Biaya", kategori: "Beban" },
  { kode: "520000", nama: "BEBAN SUMBER DAYA MANUSIA", tipe: "Biaya", kategori: "Beban" },
  { kode: "520001", nama: "GAJI", tipe: "Biaya", kategori: "Beban" },
  { kode: "520002", nama: "THR", tipe: "Biaya", kategori: "Beban" },
  { kode: "521000", nama: "Pelatihan", tipe: "Biaya", kategori: "Beban" },
  { kode: "521001", nama: "Bonus Penjualan (SDM)", tipe: "Biaya", kategori: "Beban" },
  { kode: "521002", nama: "Akomodasi (SDM)", tipe: "Biaya", kategori: "Beban" },
  { kode: "521003", nama: "Biaya Training", tipe: "Biaya", kategori: "Beban" },
  { kode: "530000", nama: "BEBAN MARKETING", tipe: "Biaya", kategori: "Beban" },
  { kode: "530001", nama: "Bonus Penjualan (Mkt)", tipe: "Biaya", kategori: "Beban" },
  { kode: "531000", nama: "Komisi", tipe: "Biaya", kategori: "Beban" },
  { kode: "531001", nama: "Referensi / Agen", tipe: "Biaya", kategori: "Beban" },
  { kode: "531002", nama: "Bundling", tipe: "Biaya", kategori: "Beban" },
  { kode: "532000", nama: "Biaya Iklan - Offline", tipe: "Biaya", kategori: "Beban" },
  { kode: "532001", nama: "Biaya Promosi", tipe: "Biaya", kategori: "Beban" },
  { kode: "532002", nama: "IG - FB Ads", tipe: "Biaya", kategori: "Beban" },
  { kode: "532003", nama: "Domain/Hosting", tipe: "Biaya", kategori: "Beban" },
  { kode: "540000", nama: "HPP", tipe: "HPP", kategori: "Beban" },
  { kode: "541000", nama: "HPP Bahan Utama", tipe: "HPP", kategori: "Beban" },
  { kode: "542000", nama: "HPP Pendukung", tipe: "HPP", kategori: "Beban" },
  { kode: "543000", nama: "OH", tipe: "HPP", kategori: "Beban" },
  { kode: "544000", nama: "OH - Kehilangan Kas", tipe: "Biaya", kategori: "Beban" },
  { kode: "551000", nama: "Sedekah", tipe: "Biaya", kategori: "Beban" },
  { kode: "551001", nama: "DANSOS", tipe: "Biaya", kategori: "Beban" },
  { kode: "551002", nama: "Konsumsi (Sedekah)", tipe: "Biaya", kategori: "Beban" },
  { kode: "552000", nama: "Infaq", tipe: "Biaya", kategori: "Beban" },
  { kode: "552001", nama: "Masjid", tipe: "Biaya", kategori: "Beban" },
  { kode: "552002", nama: "BAITUL MAL", tipe: "Biaya", kategori: "Beban" },
  { kode: "553000", nama: "Zakat", tipe: "Biaya", kategori: "Beban" },
  { kode: "554000", nama: "Wakaf", tipe: "Biaya", kategori: "Beban" },
  { kode: "560000", nama: "EKSPANSI", tipe: "Biaya", kategori: "Beban" },
  { kode: "561000", nama: "Pembelian Barang", tipe: "Biaya", kategori: "Beban" },
  { kode: "562000", nama: "Akomodasi (Ekspansi)", tipe: "Biaya", kategori: "Beban" },
  { kode: "563000", nama: "Biaya Sewa (Ekspansi)", tipe: "Biaya", kategori: "Beban" },
  { kode: "570000", nama: "BEBAN LAIN-LAIN", tipe: "Biaya", kategori: "Beban" },
  { kode: "571000", nama: "Darurat", tipe: "Biaya", kategori: "Beban" },
  { kode: "572000", nama: "Pemeliharaan & Perbaikan (Lain)", tipe: "Biaya", kategori: "Beban" },
  { kode: "573000", nama: "Biaya Kesehatan", tipe: "Biaya", kategori: "Beban" },
  { kode: "580000", nama: "BEBAN PAJAK", tipe: "Biaya", kategori: "Beban" },
  { kode: "581000", nama: "PPH 21", tipe: "Biaya", kategori: "Beban" },
  { kode: "582000", nama: "E-Billing", tipe: "Biaya", kategori: "Beban" },
  { kode: "583000", nama: "SPT Tahunan/PPh 23", tipe: "Biaya", kategori: "Beban" },
  { kode: "584000", nama: "Pajak Bunga Bank", tipe: "Biaya", kategori: "Beban" }
];

export const SEED_JURNAL: Jurnal[] = [
  { id: "sa-1", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Kas Rupiah", kodeAkun: "110000", akun: "Kas Rupiah", tipe: "Debit", jumlah: 500, kategori: "Aset" },
  { id: "sa-2", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Kas Kecil", kodeAkun: "111000", akun: "Kas Kecil", tipe: "Debit", jumlah: 630600, kategori: "Aset" },
  { id: "sa-3", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Bank", kodeAkun: "120000", akun: "Bank", tipe: "Debit", jumlah: 6460100, kategori: "Aset" },
  { id: "sa-4", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Piutang usaha", kodeAkun: "131000", akun: "Piutang usaha", tipe: "Debit", jumlah: 49758000, kategori: "Aset" },
  { id: "sa-5", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Persediaan", kodeAkun: "140000", akun: "Persediaan", tipe: "Debit", jumlah: 7942586, kategori: "Aset" },
  { id: "sa-6", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Aktiva Lancar Lainnya", kodeAkun: "150000", akun: "Aktiva Lancar Lainnya", tipe: "Debit", jumlah: 6749500, kategori: "Aset" },
  { id: "sa-7", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Aktiva Tetap", kodeAkun: "160000", akun: "Aktiva Tetap", tipe: "Debit", jumlah: 82613000, kategori: "Aset" },
  { id: "sa-8", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Uang Muka Biaya", kodeAkun: "190000", akun: "Uang Muka Biaya", tipe: "Debit", jumlah: 10500000, kategori: "Aset" },
  { id: "sa-9", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Hutang Usaha", kodeAkun: "210000", akun: "Hutang Usaha", tipe: "Kredit", jumlah: 75083000, kategori: "Kewajiban" },
  { id: "sa-10", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Modal Awal", kodeAkun: "310000", akun: "Modal Awal", tipe: "Kredit", jumlah: 77970539, kategori: "Ekuitas" },
  { id: "sa-11", tanggal: "2026-06-01", ref: "SA", keterangan: "Saldo Awal - Laba Periode Berjalan", kodeAkun: "340000", akun: "Laba Periode Berjalan", tipe: "Kredit", jumlah: 11600747, kategori: "Ekuitas" }
];

export const SEED_PENJUALAN: Penjualan[] = [];
export const SEED_PRODUKSI: Produksi[] = [];

export const SEED_USERS: UserAccount[] = [
  { username: "admin", password: "admin123", nama: "Administrator", role: "admin" },
  { username: "khazana", password: "Fazana@10", nama: "Super Admin", role: "admin" },
  { username: "produksi", password: "produksi123", nama: "Kepala Produksi", role: "admin", karyawanId: "k-produksi" },
  ...SEED_OUTLETS.map((o) => {
    const username = o.id.replace("o-", "");
    return {
      username,
      password: "buba123",
      nama: o.nama,
      role: "outlet" as const,
      outletId: o.id,
      karyawanId: `k-${o.id}-1`
    };
  })
];

const RAW_BAHAN = [
  { kode: "BRS01", nama: "BERAS", satuan: "Pack", stokMin: 15, stokAwal: 150, hargaBeli: 15500, konversiGram: 600 },
  { kode: "DG01", nama: "DAGING", satuan: "sachet", stokMin: 3, stokAwal: 3, hargaBeli: 12000, konversiGram: 35 },
  { kode: "AY01", nama: "AYAM", satuan: "sachet", stokMin: 3, stokAwal: 24, hargaBeli: 9000, konversiGram: 35 },
  { kode: "TN01", nama: "TUNA", satuan: "sachet", stokMin: 2, stokAwal: 22, hargaBeli: 9000, konversiGram: 35 },
  { kode: "TG01", nama: "TENGIRI", satuan: "sachet", stokMin: 2, stokAwal: 1, hargaBeli: 9000, konversiGram: 35 },
  { kode: "SL01", nama: "SALMON", satuan: "sachet", stokMin: 2, stokAwal: 6, hargaBeli: 13000, konversiGram: 35 },
  { kode: "GR01", nama: "GURAMI", satuan: "sachet", stokMin: 2, stokAwal: 0, hargaBeli: 12000, konversiGram: 35 },
  { kode: "KK01", nama: "KAKAP", satuan: "sachet", stokMin: 2, stokAwal: 0, hargaBeli: 12000, konversiGram: 35 },
  { kode: "DR01", nama: "DORI", satuan: "sachet", stokMin: 2, stokAwal: 17, hargaBeli: 9000, konversiGram: 35 },
  { kode: "PUD01", nama: "PUDING", satuan: "sachet", stokMin: 5, stokAwal: 34, hargaBeli: 10000, konversiGram: 130 },
  { kode: "OAT01", nama: "OAT", satuan: "sachet", stokMin: 5, stokAwal: 25, hargaBeli: 10000, konversiGram: 154 },
  { kode: "CB01", nama: "CUP BUBUR", satuan: "biji", stokMin: 200, stokAwal: 1865, hargaBeli: 530 },
  { kode: "TTP01", nama: "TUTUP", satuan: "biji", stokMin: 200, stokAwal: 0, hargaBeli: 200 },
  { kode: "AB01", nama: "ABON", satuan: "pcs", stokMin: 5, stokAwal: 31, hargaBeli: 3000, konversiGram: 10 },
  { kode: "CUPOAT1", nama: "CUP OAT", satuan: "biji", stokMin: 50, stokAwal: 110, hargaBeli: 530 },
  { kode: "CUPPUD01", nama: "CUP PUDING", satuan: "biji", stokMin: 50, stokAwal: 10, hargaBeli: 160 },
  { kode: "SEN01", nama: "SENDOK", satuan: "Pack", stokMin: 5, stokAwal: 20, hargaBeli: 7000 },
  { kode: "TS01", nama: "TISU", satuan: "pcs", stokMin: 5, stokAwal: 7, hargaBeli: 6500 },
  { kode: "KRS01", nama: "KRESEK", satuan: "PACK", stokMin: 5, stokAwal: 37, hargaBeli: 4000 },
  { kode: "BL01", nama: "BALON + Stik", satuan: "biji", stokMin: 10, stokAwal: 0, hargaBeli: 1200 },
  { kode: "PLAS01", nama: "PLASTIK SELER", satuan: "pcs", stokMin: 1, stokAwal: 0, hargaBeli: 66000 },
  { kode: "SH01", nama: "SAYUR HIJAU", satuan: "gr", stokMin: 100, stokAwal: 5000, hargaBeli: 50 },
  { kode: "SB01", nama: "SAYUR BROKOLI", satuan: "gr", stokMin: 100, stokAwal: 5000, hargaBeli: 50 },
  { kode: "SP01", nama: "SAYUR PUTIH", satuan: "gr", stokMin: 100, stokAwal: 5000, hargaBeli: 50 }
];

export const SEED_BAHAN: BahanBaku[] = RAW_BAHAN.map((b) => ({ ...b, id: `b-${slug(b.kode)}` }));

export const SEED_KARYAWAN: Karyawan[] = [
  {
    id: "k-produksi",
    nama: "Kepala Produksi",
    posisi: "Kepala Produksi",
    role: "produksi",
    outletId: undefined,
    gajiPokok: 25000,
    bonusOmset: 0,
    bonusUlasan: 0,
    bonusOH: 0,
    tunjanganHarian: 10000,
    overtimeRate: 15000,
    jamMasuk: "07:30",
    jamPulang: "15:00",
    username: "produksi",
    password: "produksi123"
  },
  ...SEED_OUTLETS.map((o) => {
    const uname = o.id.replace("o-", "");
    return {
      id: `k-${o.id}-1`,
      nama: `Staff ${o.nama} A`,
      posisi: "Kasir",
      role: "outlet",
      outletId: o.id,
      gajiPokok: 17500,
      bonusOmset: 0,
      bonusUlasan: 0,
      bonusOH: 0,
      tunjanganHarian: 5000,
      overtimeRate: 10000,
      jamMasuk: "07:00",
      jamPulang: "14:00",
      username: uname,
      password: "buba123"
    };
  })
];
