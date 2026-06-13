import seedJson from "./seedData.json";
import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, AkunKategori, UserAccount, BahanBaku, Karyawan } from "./types";

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const SEED_OUTLETS: Outlet[] = (seedJson.outlets as { nama: string; lokasi: string }[]).map((o) => ({
  id: `o-${slug(o.nama)}`,
  nama: o.nama,
  lokasi: o.lokasi,
}));

export const SEED_PRODUK: Produk[] = (seedJson.produks as { nama: string; harga: number }[]).map((p) => ({
  id: `p-${slug(p.nama)}`,
  nama: p.nama,
  harga: p.harga,
  satuan: "cup",
}));

const outletByName = new Map(SEED_OUTLETS.map((o) => [o.nama, o.id]));
const produkByName = new Map(SEED_PRODUK.map((p) => [p.nama, p]));

export const SEED_PENJUALAN: Penjualan[] = (seedJson.penjualan as any[])
  .map((p, i) => {
    const prod = produkByName.get(p.produk);
    const outletId = outletByName.get(p.outlet);
    if (!prod || !outletId) return null;
    return {
      id: `s-${i}`,
      tanggal: p.tgl,
      outletId,
      produkId: prod.id,
      qty: p.qty,
      harga: p.harga ?? prod.harga,
      total: (p.harga ?? prod.harga) * p.qty,
    } as Penjualan;
  })
  .filter(Boolean) as Penjualan[];

export const SEED_PRODUKSI: Produksi[] = (seedJson.produksi as any[])
  .map((p, i) => {
    const prod = produkByName.get(p.produk);
    if (!prod) return null;
    return {
      id: `pr-${i}`,
      tanggal: p.tgl,
      produkId: prod.id,
      qtyRencana: p.plan,
      qtyRealisasi: Math.max(0, p.plan - Math.floor(Math.random() * 15)),
    } as Produksi;
  })
  .filter(Boolean) as Produksi[];

const KATEGORI_MAP: Record<string, AkunKategori> = {
  Kas: "Aset", Bank: "Aset", "Akun Piutang": "Aset", Persediaan: "Aset",
  "Aktiva Lancar Lainnya": "Aset", "Aktiva Tetap": "Aset",
  "Akun Akumulasi Penyusutan": "Aset", "Aktiva Lainnya": "Aset",
  "Akun Hutang": "Kewajiban", "Kewajiban Lancar Lainnya": "Kewajiban",
  "Hutang Jangka Panjang": "Kewajiban",
  Modal: "Ekuitas", Ekuitas: "Ekuitas",
  Pendapatan: "Pendapatan", "Pendapatan Lainnya": "Pendapatan",
  HPP: "Beban", Beban: "Beban", "Biaya Operasional": "Beban",
};
const guessKategori = (tipe: string): AkunKategori => {
  if (KATEGORI_MAP[tipe]) return KATEGORI_MAP[tipe];
  const t = tipe.toLowerCase();
  if (t.includes("hutang") || t.includes("kewajiban")) return "Kewajiban";
  if (t.includes("modal") || t.includes("ekuitas") || t.includes("laba")) return "Ekuitas";
  if (t.includes("pendapatan")) return "Pendapatan";
  if (t.includes("hpp") || t.includes("beban") || t.includes("biaya") || t === "oh") return "Beban";
  return "Aset";
};

export const SEED_COA: AkunCOA[] = (seedJson.coa as any[]).map((a) => ({
  kode: a.kode,
  nama: a.nama,
  tipe: a.tipe,
  kategori: guessKategori(a.tipe),
}));

const coaByKode = new Map(SEED_COA.map((a) => [a.kode, a]));

export const SEED_JURNAL: Jurnal[] = (seedJson.jurnal as any[]).map((j, i) => {
  const akun = coaByKode.get(String(j.kode));
  const kategori: AkunKategori = akun?.kategori ?? guessKategori(j.nama_akun ?? "");
  const isDebit = (j.debet ?? 0) > 0;
  return {
    id: `j-${i}`,
    tanggal: j.tanggal,
    ref: j.ref,
    keterangan: j.keterangan,
    kodeAkun: String(j.kode),
    akun: j.nama_akun,
    tipe: isDebit ? "Debit" : "Kredit",
    jumlah: isDebit ? j.debet : j.kredit,
    kategori,
  };
});

// === Mock Users ===
export const SEED_USERS: UserAccount[] = [
  { username: "admin", password: "admin123", nama: "Administrator", role: "admin" },
  ...SEED_OUTLETS.map((o) => ({
    username: slug(o.nama),
    password: "buba123",
    nama: o.nama,
    role: "outlet" as const,
    outletId: o.id,
  })),
];

// === Bahan Baku (Stok Gudang) ===
const RAW_BAHAN: { kode: string; nama: string; satuan: string; stokMin: number; stokAwal: number; hargaBeli: number }[] = [
  { kode: "BRS01", nama: "BERAS", satuan: "Pack", stokMin: 15, stokAwal: 150, hargaBeli: 15500 },
  { kode: "DG01", nama: "DAGING", satuan: "sachet", stokMin: 3, stokAwal: 3, hargaBeli: 12000 },
  { kode: "AY01", nama: "AYAM", satuan: "sachet", stokMin: 3, stokAwal: 24, hargaBeli: 9000 },
  { kode: "TN01", nama: "TUNA", satuan: "sachet", stokMin: 2, stokAwal: 22, hargaBeli: 9000 },
  { kode: "TG01", nama: "TENGIRI", satuan: "sachet", stokMin: 2, stokAwal: 1, hargaBeli: 9000 },
  { kode: "SL01", nama: "SALMON", satuan: "sachet", stokMin: 2, stokAwal: 6, hargaBeli: 13000 },
  { kode: "GR01", nama: "GURAMI", satuan: "sachet", stokMin: 2, stokAwal: 0, hargaBeli: 12000 },
  { kode: "CK01", nama: "CEKER", satuan: "sachet", stokMin: 2, stokAwal: 16, hargaBeli: 9000 },
  { kode: "KK01", nama: "KAKAP", satuan: "sachet", stokMin: 2, stokAwal: 0, hargaBeli: 12000 },
  { kode: "DR01", nama: "DORI", satuan: "sachet", stokMin: 2, stokAwal: 17, hargaBeli: 9000 },
  { kode: "PUD01", nama: "PUDING", satuan: "sachet", stokMin: 5, stokAwal: 34, hargaBeli: 10000 },
  { kode: "OAT01", nama: "OAT", satuan: "sachet", stokMin: 5, stokAwal: 25, hargaBeli: 10000 },
  { kode: "CB01", nama: "CUP BUBUR", satuan: "biji", stokMin: 200, stokAwal: 1865, hargaBeli: 530 },
  { kode: "TTP01", nama: "TUTUP", satuan: "biji", stokMin: 200, stokAwal: 0, hargaBeli: 200 },
  { kode: "AB01", nama: "ABON", satuan: "cup", stokMin: 5, stokAwal: 31, hargaBeli: 3000 },
  { kode: "CUPOAT1", nama: "CUP OAT", satuan: "biji", stokMin: 50, stokAwal: 110, hargaBeli: 530 },
  { kode: "CUPPUD01", nama: "CUP PUDING", satuan: "biji", stokMin: 50, stokAwal: 10, hargaBeli: 160 },
  { kode: "SEN01", nama: "SENDOK", satuan: "Pack", stokMin: 5, stokAwal: 20, hargaBeli: 7000 },
  { kode: "TS01", nama: "TISU", satuan: "pcs", stokMin: 5, stokAwal: 7, hargaBeli: 6500 },
  { kode: "KRS01", nama: "KRESEK", satuan: "PACK", stokMin: 5, stokAwal: 37, hargaBeli: 4000 },
  { kode: "BL01", nama: "BALON + Stik", satuan: "biji", stokMin: 10, stokAwal: 0, hargaBeli: 1200 },
  { kode: "PLAS01", nama: "PLASTIK SELER", satuan: "pcs", stokMin: 1, stokAwal: 0, hargaBeli: 66000 },
];
export const SEED_BAHAN: BahanBaku[] = RAW_BAHAN.map((b) => ({ ...b, id: `b-${slug(b.kode)}` }));

// === Karyawan (1-2 per outlet sebagai contoh) ===
const POSISI = ["Kasir", "Produksi", "Helper"];
export const SEED_KARYAWAN: Karyawan[] = SEED_OUTLETS.flatMap((o, i) => ([
  {
    id: `k-${o.id}-1`,
    nama: `Staff ${o.nama} A`,
    posisi: POSISI[i % POSISI.length],
    outletId: o.id,
    gajiPokok: 17500,
    bonusOmset: 100000,
    bonusUlasan: 30000,
  },
]));
