/**
 * Keuangan Utility Functions
 * Helper functions untuk perhitungan keuangan: saldo per akun, buku besar,
 * klasifikasi arus kas, dan aggregate laporan keuangan.
 *
 * Konvensi Normalisasi:
 * - Akun Aset & Beban: Debit = (+), Kredit = (-)
 * - Akun Kewajiban, Ekuitas, Pendapatan: Kredit = (+), Debit = (-)
 *   (Normal balance positif = Kredit untuk Kew/Eku/Pend, Debit untuk Aset/Beban)
 */

import { Jurnal, AkunCOA, AkunKategori } from "@/lib/types";

export const KATEGORI_ORDER: AkunKategori[] = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"];
export const KODE_AKUN_KAS = ["110000", "111000", "120000"];

/**
 * Hitung saldo normal (positive balance) untuk satu akun pada rentang tanggal tertentu.
 * Untuk Aset & Beban: Debit - Kredit (saldo positif = Debit)
 * Untuk Kewajiban, Ekuitas, Pendapatan: Kredit - Debit (saldo positif = Kredit)
 */
export function akunNormalBalance(
  jurnalList: Jurnal[],
  kodeAkun: string,
  fromDate?: string,
  toDate?: string
): { debit: number; kredit: number; saldo: number } {
  const entries = jurnalList.filter(
    (j) => j.kodeAkun === kodeAkun &&
      (!fromDate || j.tanggal >= fromDate) &&
      (!toDate || j.tanggal <= toDate)
  );
  const debit = entries.filter((j) => j.tipe === "Debit").reduce((s, j) => s + j.jumlah, 0);
  const kredit = entries.filter((j) => j.tipe === "Kredit").reduce((s, j) => s + j.jumlah, 0);
  return { debit, kredit, saldo: debit - kredit };
}

/**
 * Dapatkan saldo awal (hindged) — saldo kumulatif semua jurnal sebelum dari tanggal tertentu.
 * Menggunakan konvensi akun normal (positif = normal balance).
 */
export function saldoAwal(
  semuaJurnal: Jurnal[],
  kodeAkun: string,
  beforeDate: string
): number {
  const entries = semuaJurnal.filter(
    (j) => j.kodeAkun === kodeAkun && j.tanggal < beforeDate
  );
  const debit = entries.filter((j) => j.tipe === "Debit").reduce((s, j) => s + j.jumlah, 0);
  const kredit = entries.filter((j) => j.tipe === "Kredit").reduce((s, j) => s + j.jumlah, 0);
  return debit - kredit;
}

/**
 * Hitung saldo akhir (hindged) — saldo kumulatif semua jurnal sampai dan termasuk tanggal tertentu.
 */
export function saldoAkhir(
  semuaJurnal: Jurnal[],
  kodeAkun: string,
  upToDate: string
): number {
  const entries = semuaJurnal.filter(
    (j) => j.kodeAkun === kodeAkun && j.tanggal <= upToDate
  );
  const debit = entries.filter((j) => j.tipe === "Debit").reduce((s, j) => s + j.jumlah, 0);
  const kredit = entries.filter((j) => j.tipe === "Kredit").reduce((s, j) => s + j.jumlah, 0);
  return debit - kredit;
}

/**
 * Hitung total Debit & Kredit per kode akun dalam rentang tanggal.
 * `saldo` di sini adalah Debit - Kredit (bisa negatif untuk akun Kewajiban/Ekuitas/Pendapatan).
 */
export function perAkunTotals(
  filteredJurnal: Jurnal[],
  kodeAkun: string
): { debit: number; kredit: number; saldo: number } {
  const entries = filteredJurnal.filter((j) => j.kodeAkun === kodeAkun);
  const debit = entries.filter((j) => j.tipe === "Debit").reduce((s, j) => s + j.jumlah, 0);
  const kredit = entries.filter((j) => j.tipe === "Kredit").reduce((s, j) => s + j.jumlah, 0);
  return { debit, kredit, saldo: debit - kredit };
}

/**
 * Kelompokkan jurnal berdasarkan kode akun, kembalikan array objek:
 * { kode, nama, kategori, tipe, debit, kredit, saldo }
 */
export function aggregateByAkun(
  filteredJurnal: Jurnal[],
  coa: AkunCOA[]
): Array<{
  kode: string;
  nama: string;
  kategori: AkunKategori;
  tipe: string;
  debit: number;
  kredit: number;
  saldo: number;
}> {
  const map = new Map<string, {
    kode: string;
    nama: string;
    kategori: AkunKategori;
    tipe: string;
    debit: number;
    kredit: number;
    saldo: number;
  }>();

  // Inisialisasi semua akun dari COA
  for (const a of coa) {
    map.set(a.kode, { kode: a.kode, nama: a.nama, kategori: a.kategori, tipe: a.tipe, debit: 0, kredit: 0, saldo: 0 });
  }

  // Akumulasi dari jurnal
  for (const j of filteredJurnal) {
    const key = j.kodeAkun ?? "";
    if (!map.has(key)) {
      map.set(key, { kode: key, nama: j.akun, kategori: j.kategori, tipe: "", debit: 0, kredit: 0, saldo: 0 });
    }
    const rec = map.get(key)!;
    if (j.tipe === "Debit") {
      rec.debit += j.jumlah;
      rec.saldo += j.jumlah;
    } else {
      rec.kredit += j.jumlah;
      rec.saldo -= j.jumlah;
    }
  }

  // Urutkan berdasarkan kode akun (numeric-ish string sort)
  return Array.from(map.values()).sort((a, b) => a.kode.localeCompare(b.kode));
}

/**
 * Kelompokkan jurnal berdasarkan kategori, kembalikan total per kategori.
 */
export function aggregateByKategori(
  filteredJurnal: Jurnal[]
): Record<AkunKategori, { debit: number; kredit: number; saldo: number }> {
  const result: Record<AkunKategori, { debit: number; kredit: number; saldo: number }> = {
    Aset: { debit: 0, kredit: 0, saldo: 0 },
    Kewajiban: { debit: 0, kredit: 0, saldo: 0 },
    Ekuitas: { debit: 0, kredit: 0, saldo: 0 },
    Pendapatan: { debit: 0, kredit: 0, saldo: 0 },
    Beban: { debit: 0, kredit: 0, saldo: 0 },
  };

  for (const j of filteredJurnal) {
    if (!result[j.kategori]) continue;
    if (j.tipe === "Debit") {
      result[j.kategori].debit += j.jumlah;
      result[j.kategori].saldo += j.jumlah;
    } else {
      result[j.kategori].kredit += j.jumlah;
      result[j.kategori].saldo -= j.jumlah;
    }
  }
  return result;
}

/**
 * Klasifikasi akun ke sektor arus kas:
 * - "operasional": Pendapatan, Beban (HPP, OH, biaya operasional)
 * - "investing": Aset Tetap (160000), Akumulasi Penyusutan (170000)
 * - "pendanaan": Modal, Prive, Hutang, Ekuitas
 */
export function classifyAkunSector(kodeAkun: string, kategori: AkunKategori): "operasional" | "investing" | "pendanaan" | null {
  // Aset tetap & akumulasi penyusutan
  if (kodeAkun === "160000" || kodeAkun === "170000") return "investing";
  // Kas & bank (arus kas aktivitas operasional biasanya, tapi karena ini kas, termasuk operasional)
  if (KODE_AKUN_KAS.includes(kodeAkun)) return "operasional";

  // Klasifikasi berdasarkan kategori
  if (kategori === "Pendapatan" || kategori === "Beban") return "operasional";
  if (kategori === "Aset") {
    // Aktiva lancar lain, piutang, persediaan = operasional
    return "operasional";
  }
  // Kewajiban & Ekuitas = pendanaan
  if (kategori === "Kewajiban" || kategori === "Ekuitas") return "pendanaan";
  return null;
}

/**
 * Hitung arus kas per sektor dari jurnal dalam rentang tanggal.
 * Menggunakan metode tidak langsung: kas bersih = saldo kas akhir - saldo kas awal
 */
export function computeArusKas(
  semuaJurnal: Jurnal[],
  coa: AkunCOA[],
  range: { from?: string; to?: string }
): {
  operasional: { debit: number; kredit: number };
  investing: { debit: number; kredit: number };
  pendanaan: { debit: number; kredit: number };
  saldoKasAwal: number;
  saldoKasAkhir: number;
  netCashFlow: number;
} {
  // Saldo kas per akun (110000, 111000, 120000) — gunakan konvensi saldo normal
  const beforeDate = range.from ?? "";
  const upToDate = range.to ?? "9999-12-31";

  const saldoKasAwal = KODE_AKUN_KAS.reduce(
    (sum, kode) => sum + saldoAwal(semuaJurnal, kode, beforeDate),
    0
  );
  const saldoKasAkhir = KODE_AKUN_KAS.reduce(
    (sum, kode) => sum + saldoAkhir(semuaJurnal, kode, upToDate),
    0
  );

  // Filter jurnal dalam range untuk klasifikasi transaksi
  const filtered = semuaJurnal.filter(
    (j) => (!range.from || j.tanggal >= range.from) &&
      (!range.to || j.tanggal <= range.to)
  );

  const sectors = {
    operasional: { debit: 0, kredit: 0 },
    investing: { debit: 0, kredit: 0 },
    pendanaan: { debit: 0, kredit: 0 },
  };

  for (const j of filtered) {
    const coaItem = coa.find((a) => a.kode === j.kodeAkun);
    const sector = coaItem
      ? classifyAkunSector(j.kodeAkun, coaItem.kategori)
      : classifyAkunSector(j.kodeAkun, j.kategori);

    if (!sector || sector === "operasional") {
      // Untuk arus kas operasional, kita butuh cash-equivalent effect
      // Di sini kita akumulasi semua transaksi operasional
      // (bukan hanya kas — ini pendekatan tidak langsung/analytical)
      if (sector === "operasional") {
        if (j.tipe === "Debit") sectors.operasional.debit += j.jumlah;
        else sectors.operasional.kredit += j.jumlah;
      }
    } else if (sector === "investing") {
      if (j.tipe === "Debit") sectors.investing.debit += j.jumlah;
      else sectors.investing.kredit += j.jumlah;
    } else if (sector === "pendanaan") {
      if (j.tipe === "Debit") sectors.pendanaan.debit += j.jumlah;
      else sectors.pendanaan.kredit += j.jumlah;
    }
  }

  // Cash flow bersih = selisih kas (metode tidak langsung)
  // Net cash flow = saldo kas akhir - saldo kas awal
  const netCashFlow = saldoKasAkhir - saldoKasAwal;

  return {
    operasional: sectors.operasional,
    investing: sectors.investing,
    pendanaan: sectors.pendanaan,
    saldoKasAwal,
    saldoKasAkhir,
    netCashFlow,
  };
}

/**
 * Dapatkan transaksi per akun (untuk Buku Pembantu/Buku Besar detail)
 * yang sudah disortir berdasarkan tanggal ASCENDING.
 */
export function getTransaksiPerAkun(
  filteredJurnal: Jurnal[],
  kodeAkun: string
): Jurnal[] {
  return filteredJurnal
    .filter((j) => j.kodeAkun === kodeAkun)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

/**
 * Hitung saldo berjalan (running balance) untuk array transaksi per akun.
 * Karena kita menyimpan dalam format "normal balance" (Debit - Kredit),
 * saldo berjalan = akumulasi (Debit - Kredit) per baris.
 */
export function computeRunningBalance(
  transaksi: Jurnal[]
): Array<{ jurnal: Jurnal; saldo: number }> {
  let running = 0;
  return transaksi.map((j) => {
    const delta = j.tipe === "Debit" ? j.jumlah : -j.jumlah;
    running += delta;
    return { jurnal: j, saldo: running };
  });
}

/**
 * Hitung total Debit & Kredit dari seluruh jurnal.
 */
export function totalDebitKredit(filteredJurnal: Jurnal[]): { totalDebit: number; totalKredit: number } {
  const totalDebit = filteredJurnal.reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : 0), 0);
  const totalKredit = filteredJurnal.reduce((s, j) => s + (j.tipe === "Kredit" ? j.jumlah : 0), 0);
  return { totalDebit, totalKredit };
}
