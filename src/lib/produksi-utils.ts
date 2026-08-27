import { nilaiBahan } from "./format";

// =============================================================================
// LOCK / DEADLINE — penguncian input sisa (OH) outlet
// =============================================================================
//
// Default batas waktu input sisa produksi harian. Dulu 11:00, sekarang 13:00.
// Nilai ini dipakai sebagai fallback bila setting belum disimpan di localStorage.
export const DEFAULT_LOCK_DEADLINE = "13:00";

// True jika tanggal yg dipilih = hari ini DAN waktu sekarang sudah lewat deadline.
// Dipakai outlet view supaya bisa diuji terpisah dari React.
export function isPastLockDeadline(
  lockDeadlineTime: string | undefined,
  tanggal: string,
  today: string,
  now: Date
): boolean {
  if (tanggal !== today) return false;
  const [h, m] = (lockDeadlineTime || DEFAULT_LOCK_DEADLINE).split(":").map(Number);
  const hour = now.getHours();
  const minute = now.getMinutes();
  return hour > h || (hour === h && minute >= m);
}

// Status penguncian final: terkunci hanya jika (sudah lewat deadline DAN
// penguncian diaktifkan admin) ATAU siklus sudah ditutup. Saat toggle
// penguncian NONAKTIF, outlet TETAP bisa input meski sudah lewat deadline.
export function computeIsLocked(opts: {
  lockEnabled: boolean;
  lockDeadlineTime: string | undefined;
  tanggal: string;
  today: string;
  now: Date;
  isCycleClosed: boolean;
}): boolean {
  return (isPastLockDeadline(opts.lockDeadlineTime, opts.tanggal, opts.today, opts.now) && opts.lockEnabled) || opts.isCycleClosed;
}

// =============================================================================
// BASE RATIOS & HELPERS for Bubur & Nasi Tim calculations
// =============================================================================
//
// Base ratio: Beras:Daging:Air:S.Hijau:Buah:Protein = 100:5:700:8:5:1.5
// Rasio 100/6 menghasilkan sekitar 16.67 g per cup, jadi hasil dapat berisi desimal.

export const BUBUR_BASE = {
  beras: 100,
  daging: 5,
  air: 700,
  sayurHijau: 8,
  sayurBuah: 5,
  sayurProtein: 1.5, // = 3/2
};

export const formatDecimal = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/(?:\.0+|0+)$/, "");
};

export const buburCalc = (cups: number, baseAmount: number) => (cups * baseAmount) / 6;

// =============================================================================
// PEMOTONGAN BAHAN BAKU — Langkah 2 (hanya dari RENCANA, tidak pernah dari
// distribusi aktual). Kemasan TIDAK termasuk di sini (dipotong di Langkah 3
// sesuai hasil aktual — lihat calcKemasanKebutuhan).
// =============================================================================

export interface MaterialTotals {
  buburD: number; buburI: number; timD: number; timI: number;
  oatmeal: number; puding: number; abon: number;
}

export interface MaterialReq {
  bahanId: string; kode: string; nama: string;
  qty: number; rawQtyGrams: number; satuan: string;
}

// Hitung kebutuhan BAHAN BAKU dari RENCANA produksi (combinedTotals = planGrid,
// bukan distGrid). Dipanggil SEKALI di Langkah 2 (requestWarehouse) — luberan/
// menyusut di Langkah 3 TIDAK mengubah hasilnya; hanya kemasan yang menyesuaikan.
export function hitungMaterialReqs(
  t: MaterialTotals,
  settings: {
    berasTim: number; dagingTim: number; sayurHijauTim: number; sayurBuahTim: number;
    sayurProteinTim: number; pudingCup: number; oatmealCup: number; abonCup: number;
  },
  variants: { bubur1?: string; bubur2?: string; tim1?: string; tim2?: string },
  bahan: { id: string; kode: string; nama: string; satuan: string; konversiGram?: number }[]
): MaterialReq[] {
  const reqs: MaterialReq[] = [];

  // 1. Beras — qty dalam gram (internal stok movement), satuan dari DB (Pack) untuk display konversi
  const berasGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.beras) + (t.timD * settings.berasTim) + (t.timI * settings.berasTim));
  const berasBahan = bahan.find((x) => x.id === "b-brs01");
  if (berasGr > 0) {
    reqs.push({
      bahanId: "b-brs01", kode: "BRS01", nama: "BERAS",
      qty: berasGr, rawQtyGrams: berasGr, satuan: berasBahan?.satuan || "g"
    });
  }

  // 1b. Sayur
  const shGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurHijau) + (t.timD + t.timI) * settings.sayurHijauTim);
  if (shGr > 0) reqs.push({ bahanId: "b-sh01", kode: "SH01", nama: "SAYUR HIJAU", qty: shGr, rawQtyGrams: shGr, satuan: "g" });
  const sbGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurBuah) + (t.timD + t.timI) * settings.sayurBuahTim);
  if (sbGr > 0) reqs.push({ bahanId: "b-sb01", kode: "SB01", nama: "SAYUR BUAH", qty: sbGr, rawQtyGrams: sbGr, satuan: "g" });
  const spGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurProtein) + (t.timD + t.timI) * settings.sayurProteinTim);
  if (spGr > 0) reqs.push({ bahanId: "b-sp01", kode: "SP01", nama: "SAYUR PROTEIN", qty: spGr, rawQtyGrams: spGr, satuan: "g" });

  // Daging per varian — qty disimpan sebagai BILANGAN BULAT (kolom stok_movement.qty
  // bertipe integer): gram desimal dari rasio per cup dibulatkan agar insert tidak
  // gagal. rawQtyGrams tetap desimal utk display.
  const addVariant = (variantId: string, grams: number) => {
    const b = bahan.find((x) => x.id === variantId);
    if (b && grams > 0) {
      const existing = reqs.find((r) => r.bahanId === variantId);
      if (existing) {
        existing.rawQtyGrams += grams;
        existing.qty = Math.round(existing.rawQtyGrams);
      } else {
        reqs.push({
          bahanId: variantId, kode: b.kode, nama: b.nama,
          qty: Math.round(grams), rawQtyGrams: grams, satuan: b.satuan
        });
      }
    }
  };
  if (t.buburD > 0 && variants.bubur1) addVariant(variants.bubur1, buburCalc(t.buburD, BUBUR_BASE.daging));
  if (t.buburI > 0 && variants.bubur2) addVariant(variants.bubur2, buburCalc(t.buburI, BUBUR_BASE.daging));
  if (t.timD > 0 && variants.tim1) addVariant(variants.tim1, t.timD * settings.dagingTim);
  if (t.timI > 0 && variants.tim2) addVariant(variants.tim2, t.timI * settings.dagingTim);

  // Puding — dalam pcs (produksi selalu habis per pcs, tidak ada sisa gram)
  const pudingGr = Math.ceil(t.puding * settings.pudingCup);
  const pudingBahan = bahan.find((x) => x.id === "b-pud01");
  const pudingKonv = pudingBahan?.konversiGram || 130; // konversi dari master data (default 130 gr/pcs)
  const pudingPcs = Math.ceil(pudingGr / pudingKonv);
  if (pudingPcs > 0) reqs.push({ bahanId: "b-pud01", kode: "PUD01", nama: "PUDING", qty: pudingPcs, rawQtyGrams: pudingGr, satuan: "pcs" });

  // Oat — dalam pcs (produksi selalu habis per pcs, tidak ada sisa gram)
  const oatGr = Math.ceil(t.oatmeal * settings.oatmealCup);
  const oatBahan = bahan.find((x) => x.id === "b-oat01");
  const oatKonv = oatBahan?.konversiGram || 180; // konversi dari master data (default 180 gr/pcs)
  const oatPcs = Math.ceil(oatGr / oatKonv);
  if (oatPcs > 0) reqs.push({ bahanId: "b-oat01", kode: "OAT01", nama: "OAT", qty: oatPcs, rawQtyGrams: oatGr, satuan: "pcs" });

  // Abon — stock dalam gram (konversi 1 pcs = 10 g), display satuan pcs
  const abonGr = Math.ceil(t.abon * settings.abonCup);
  if (t.abon > 0) reqs.push({ bahanId: "b-ab01", kode: "AB01", nama: "ABON", qty: abonGr, rawQtyGrams: t.abon, satuan: "pcs" });

  // KEMASAN (CUP & TUTUP) TIDAK dipotong di sini — dihitung di Langkah 3 sesuai
  // HASIL PRODUKSI AKTUAL (lihat calcKemasanKebutuhan).
  return reqs;
}

// Parse [D:X, I:Y] split from catatan
export const parseSplit = (catatan: string) => {
  const match = catatan?.match(/D:(\d+),I:(\d+)/);
  if (match) {
    return { d: Number(match[1]), i: Number(match[2]) };
  }
  return { d: 0, i: 0 };
};

// Serialize split + variant names into catatan
// Format: [D:X,I:Y] [V:v1Name,v2Name] rest
export const serializeSplit = (d: number, i: number, originalCatatan = "", variant1 = "", variant2 = "") => {
  const cleanCat = originalCatatan.replace(/\[D:\d+,I:\d+\]\s*/, "").replace(/\[V:[^\]]*\]\s*/, "");
  const variantPart = (variant1 || variant2) ? `[V:${variant1},${variant2}] ` : "";
  return `[D:${d},I:${i}] ${variantPart}${cleanCat}`.trim();
};

// Parse variant names from catatan
export const parseVariants = (catatan: string) => {
  const match = catatan?.match(/\[V:([^,\]]+),([^,\]]+)\]/);
  if (match) {
    return { v1: match[1], v2: match[2] };
  }
  return { v1: "", v2: "" };
};

// Helper to get variant names from a date's permohonanStok records
export function getVariantNamesForDate(
  permohonanStok: any[],
  tanggal: string,
  buburFallback1 = "Daging",
  buburFallback2 = "Ikan",
  timFallback1 = "Daging",
  timFallback2 = "Ikan"
): { bubur1: string; bubur2: string; tim1: string; tim2: string } {
  const reqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
  const buburReq = reqs.find((r: any) => r.produkId === "p-bubur");
  const timReq = reqs.find((r: any) => r.produkId === "p-nasitim");

  const buburVariants = buburReq ? parseVariants(buburReq.catatan || "") : { v1: "", v2: "" };
  const timVariants = timReq ? parseVariants(timReq.catatan || "") : { v1: "", v2: "" };

  return {
    bubur1: buburVariants.v1 || buburFallback1,
    bubur2: buburVariants.v2 || buburFallback2,
    tim1: timVariants.v1 || timFallback1,
    tim2: timVariants.v2 || timFallback2,
  };
}

// Create an empty grid for all outlets
export type OutletGrid = Record<string, {
  bubur_d: number; bubur_i: number;
  tim_d: number; tim_i: number;
  oatmeal: number; puding: number; abon: number;
}>;

export function createEmptyGrid(outlets: { id: string }[]): OutletGrid {
  const grid: OutletGrid = {};
  outlets.forEach(o => {
    grid[o.id] = {
      bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
      oatmeal: 0, puding: 0, abon: 0
    };
  });
  return grid;
}

// Load grid from permohonanStok records for a given date.
// `statuses` memungkinkan caller memuat record dengan status tertentu.
// Default: [null, "Disetujui"] (untuk distGrid). loadRencanaGrid memakai
// [null, "Pending", "Disetujui"] agar rencana Langkah 1 tetap tampil setelah save.
export function loadGridFromReqs(
  outlets: { id: string }[],
  permohonanStok: any[],
  tanggal: string,
  statuses: (string | null)[] = [null, "Pending", "Disetujui"]
): OutletGrid {
  const grid = createEmptyGrid(outlets);
  const dayReqs = permohonanStok.filter((r: any) =>
    r.tanggalKirim === tanggal && statuses.includes(r.status)
  );
  dayReqs.forEach((r: any) => {
    if (!grid[r.outletId]) return;
    const split = parseSplit(r.catatan || "");
    // Split [D:X,I:Y] yang ada di catatan (termasuk D=0 atau I=0) harus dihormati;
    // fallback ke r.qty hanya untuk data lama tanpa format split.
    const hasSplit = /D:\d+,I:\d+/.test(r.catatan || "");
    if (r.produkId === "p-bubur") {
      grid[r.outletId].bubur_d = hasSplit ? split.d : r.qty;
      grid[r.outletId].bubur_i = hasSplit ? split.i : 0;
    } else if (r.produkId === "p-nasitim") {
      grid[r.outletId].tim_d = hasSplit ? split.d : r.qty;
      grid[r.outletId].tim_i = hasSplit ? split.i : 0;
    } else if (r.produkId === "p-oatmeal") {
      grid[r.outletId].oatmeal = r.qty;
    } else if (r.produkId === "p-puding") {
      grid[r.outletId].puding = r.qty;
    } else if (r.produkId === "p-abon") {
      grid[r.outletId].abon = r.qty;
    }
  });
  return grid;
}

// Load grid RENCANA (Langkah 1 / pemotongan bahan) — memakai qty_rencana &
// catatan_rencana yang disimpan saat saveStep1 dan TIDAK ditimpa oleh distribusi
// aktual (Langkah 3). Data lama (kolom null) di-fallback ke qty & catatan.
// ⚠️ Memuat record "Pending" (belum disetujui distribusi) karena rencana
// Langkah 1 selalu disimpan sebagai Pending. Tanpa ini, data hilang saat refresh
// karena loadGridFromReqs default hanya memuat null / "Disetujui".
export function loadRencanaGrid(
  outlets: { id: string }[],
  permohonanStok: any[],
  tanggal: string
): OutletGrid {
  const rencanaReqs = (permohonanStok || []).map((r: any) => ({
    ...r,
    qty: r.qtyRencana != null ? r.qtyRencana : r.qty,
    catatan: r.catatanRencana || r.catatan
  }));
  return loadGridFromReqs(outlets, rencanaReqs, tanggal);
}

// Calculate totals from a grid
export function sumGrid(grid: OutletGrid) {
  let buburD = 0, buburI = 0, timD = 0, timI = 0;
  let oatmeal = 0, puding = 0, abon = 0;
  Object.values(grid).forEach((v: any) => {
    buburD += v.bubur_d || 0;
    buburI += v.bubur_i || 0;
    timD += v.tim_d || 0;
    timI += v.tim_i || 0;
    oatmeal += v.oatmeal || 0;
    puding += v.puding || 0;
    abon += v.abon || 0;
  });
  return { buburD, buburI, timD, timI, oatmeal, puding, abon };
}

// =============================================================================
// ATURAN OH BUBUR & NASI TIM — konversi sisa gram → cup (SOP hitung terjual)
// =============================================================================
//
// DUA konversi gram → cup yang BERBEDA:
//
// 1) HITUNG TERJUAL (SOP terbaru) — pembulatan dilakukan SETELAH membagi
//    selisih gram dengan gram per cup:
//      Terjual = (Stok Awal gr − OH gr) ÷ Gram Pembulatan, dibulatkan biasa.
//    Gram Pembulatan: Bubur 118 gr, Nasi Tim 108 gr.
//    Contoh: stok 12 cup × 118 = 1.416g − OH 149g = 1.267g; 1.267 ÷ 118 =
//    10,737 → terjual 11. (Stok 12 × 108 = 1.296g − OH 213g = 1.083g;
//    1.083 ÷ 108 = 10,028 → terjual 10.)
//
// 2) PEMOTONGAN STOK / RUSAK — tetap memakai gram aktual 118 (Bubur) / 108
//    (Nasi Tim). Sisa gram dibagi gram per cup; hanya jika lebihannya > 0,5 cup
//    dibulatkan naik 1 cup (fungsi sisaGramToCups di bawah). Dipakai untuk
//    menulis RUSAK bahan baku dari OH, BUKAN untuk menghitung terjual.

// Gram per cup yang dipakai SAAT PEMBULATAN hitung terjual (aturan terbaru):
// Bubur 118 gr, Nasi Tim 108 gr — sama dengan gram aktual pemotongan stok.
export const BUBUR_GRAM_PEMBULATAN = 118;
export const TIM_GRAM_PEMBULATAN = 108;

// Terjual (cup) Bubur/Nasi Tim dari sisa OH (gram) — pembulatan SETELAH
// gramasi: Terjual = (Stok Awal gr − OH gr) ÷ gramPerCup, dibulatkan biasa
// (Math.round). gramPerCup = gram PEMBULATAN (118 Bubur / 108 Nasi Tim).
export function hitungTerjualOh(distCups: number, ohGram: number, gramPerCup: number): number {
  const dist = Math.max(0, Number(distCups) || 0);
  const oh = Math.max(0, Number(ohGram) || 0);
  if (dist <= 0) return 0;
  const sold = Math.round((dist * gramPerCup - oh) / gramPerCup);
  return Math.max(0, Math.min(sold, dist));
}

// === Konversi PEMOTONGAN STOK (RUSAK) — gram aktual 118/108, aturan 50g ===
export const OH_MIN_GRAM = 50;

// Konversi sisa gram (OH) → cup untuk RUSAK bahan baku Bubur & Nasi Tim.
// Aturan: sisa gram dibagi gram per cup, lalu lihat angka desimalnya — baru
// dibulatkan naik 1 cup jika lebihannya > 0,5 cup, selain itu dihitung cup
// penuhnya saja. Contoh: 541 gr ÷ 108 = 5,009 → 5 cup (bukan 6);
// 85 gr ÷ 118 = 0,72 → 1 cup; 130 gr ÷ 118 = 1,10 → 1 cup.
// TIDAK dipakai untuk hitung terjual — lihat hitungTerjualOh.
export function sisaGramToCups(sisaGram: number, gramPerCup: number): number {
  const grams = Math.max(0, Number(sisaGram) || 0);
  // Sisa ≤ 50 gr dianggap 0 cup (tidak memotong stok).
  if (grams <= OH_MIN_GRAM) return 0;
  const cups = Math.floor(grams / gramPerCup);
  const frac = grams / gramPerCup - cups;
  return cups + (frac > 0.5 ? 1 : 0);
}

// =============================================================================
// KEMASAN (CUP & TUTUP) — dihitung dari HASIL PRODUKSI AKTUAL (Langkah 3)
// =============================================================================
//
// Bahan utama dipotong di Langkah 2 langsung dari rencana dan TIDAK terpengaruh
// hasil produksi. Kemasan (cup & tutup Oatmeal/Puding) justru dihitung dari
// hasil produksi AKTUAL karena hasil bisa MENYUSUT (cup lebih sedikit) atau
// MELUBER (cup lebih banyak) dari rencana.

// Daftar bahan kemasan yang mengikuti hasil aktual: 1 cup/1 tutup per porsi.
// `produk` = sumber jumlah:
//   - puding   → CUP PUDING & PLASTIK SELER
//   - oatmeal  → CUP OAT & TUTUP OAT
// Kemasan BUBUR & NASI TIM tidak ada di daftar ini — cup & tutup Bubur/Tim
// (stok sama: CUP BUBUR CB01 & TUTUP TTP01) dipenuhi lewat permohonan/retur
// perlengkapan outlet (Stok Gudang): stok berkurang saat request outlet disetujui,
// BUKAN dipotong saat produksi. Hanya Puding & Oatmeal yang dipotong di
// pasca produksi (Langkah 3) sesuai hasil aktual.
export const KEMASAN_BAHAN = [
  { bahanId: "b-cuppud01", kode: "CUPPUD01", nama: "CUP PUDING", produk: "puding" },
  { bahanId: "b-plas01", kode: "PLAS01", nama: "PLASTIK SELER", produk: "puding" },
  { bahanId: "b-cupoat1", kode: "CUPOAT1", nama: "CUP OAT", produk: "oatmeal" },
  { bahanId: "b-ttoat01", kode: "TTOAT01", nama: "TUTUP OAT", produk: "oatmeal" }
] as const;

// Hitung kebutuhan kemasan dari jumlah cup aktual (hasil produksi pasca masak).
// Menyusut → kebutuhan < rencana; meluber → kebutuhan > rencana.
export function calcKemasanKebutuhan(actualCups: { puding: number; oatmeal: number }) {
  return KEMASAN_BAHAN.map((k) => ({
    bahanId: k.bahanId,
    kode: k.kode,
    nama: k.nama,
    qty: Math.max(0, actualCups[k.produk] || 0),
    satuan: "pcs"
  })).filter((k) => k.qty > 0);
}

// =============================================================================
// RETUR GRID LANGKAH 5 (Buka/Tutup Siklus) — hormati edit manual admin
// =============================================================================
//
// Saat admin membuka siklus (Buka Siklus), data penjualan dari outlet tetap bisa
// diubah dan Langkah 5 bisa dikoreksi manual oleh admin. Saat menutup siklus
// (saveStep5), nilai retur yang dipakai untuk perhitungan OH adalah:
//   - Bila admin MENGEDIT returGrid manual → pakai nilai state admin apa adanya
//     (koreksi manual dihormati, TIDAK dihitung ulang dari penjualan).
//   - Bila TIDAK ada edit manual → hitung ulang dari penjualan terbaru outlet
//     (sisa gram per menu), agar stok retur tidak memakai data basi.

// Hitung grid retur final untuk saveStep5 — mengembalikan salinan baru (tidak
// memutasi input). Dipakai oleh saveStep5 di Produksi.tsx & Distribusi.tsx.
// Tipe input memakai bentuk longgar (Record<string, Record<string, number>>)
// agar kompatibel dengan state komponen; baris per outlet dinormalisasi di
// dalam fungsi.
export function resolveFreshReturGrid(opts: {
  outlets: { id: string }[];
  returGrid: Record<string, Record<string, number>>;
  distGrid: Record<string, Record<string, number>>;
  existingPenjualan: any[];
  hasManualReturEdits: boolean;
}): Record<string, Record<string, number>> {
  const { outlets, returGrid, distGrid, existingPenjualan, hasManualReturEdits } = opts;
  const fresh = createEmptyGrid(outlets) as Record<string, Record<string, number>>;
  if (hasManualReturEdits) {
    // Edit manual admin (Langkah 5, siklus dibuka) — pakai nilai returGrid
    // state apa adanya (koreksi admin TIDAK dihitung ulang dari penjualan).
    outlets.forEach((o) => {
      fresh[o.id] = { ...fresh[o.id], ...(returGrid[o.id] || {}) };
    });
  }

  if (!hasManualReturEdits && existingPenjualan.length > 0) {
    outlets.forEach((o) => {
      const sent = distGrid[o.id] || ({} as OutletGrid[string]);
      const row = fresh[o.id];
      if (!row) return;

      const calcRetur = (
        baseId: string,
        dField: keyof OutletGrid[string],
        iField: keyof OutletGrid[string],
        dSent: number,
        iSent: number
      ) => {
        const gramPerCup = baseId === "p-bubur" ? 118 : 108;
        const dRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
        const iRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
        if (dRec) row[dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
        if (iRec) row[iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
        if (!dRec && !iRec) {
          // Only use fallback if outlet has penjualan records for this product
          // (auto-created without variant/sisaGram). If no records at all,
          // keep retur at 0 — outlet hasn't entered data yet.
          const outletProdRecords = existingPenjualan
            .filter((p: any) => p.outletId === o.id && p.produkId === baseId);
          if (outletProdRecords.length > 0) {
            const totalSent = dSent + iSent;
            const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              const dReturCups = Math.round(totalRetur * (dSent / totalSent));
              const iReturCups = totalRetur - dReturCups;
              row[dField] = dReturCups * gramPerCup;
              row[iField] = iReturCups * gramPerCup;
            }
          }
        }
      };

      calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
      calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);

      const getCupRetur = (produkId: string, sentQty: number) => {
        const records = existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === produkId);
        const recordWithSisa = records.find((p: any) => p.sisaGram != null && p.variant != null);
        return recordWithSisa
          ? Math.min(Number(recordWithSisa.sisaGram) || 0, sentQty)
          : Math.max(0, sentQty - records.reduce((s: number, p: any) => s + p.qty, 0));
      };
      row.oatmeal = getCupRetur("p-oatmeal", sent.oatmeal || 0);
      row.puding = getCupRetur("p-puding", sent.puding || 0);
      row.abon = getCupRetur("p-abon", sent.abon || 0);
    });
  }
  return fresh;
}

// =============================================================================
// VARIANT MAPPING & DISTRIBUTION SCALING (referensi pasca produksi)
// =============================================================================
//
// Masalah lama: tabel `produksi` menyimpan Bubur 1 & Bubur 2 (dan Tim 1 & Tim 2)
// sebagai 2 baris identik dengan produk_id sama (p-bubur / p-nasitim), dibedakan
// hanya oleh qty_rencana (rencana D vs rencana I). Saat load ulang, kode lama
// mengandalkan urutan array [0]/[1] yang TIDAK dijamin (fetch tanpa ORDER BY,
// id string acak) sehingga realisasi D/I bisa tertukar → error palsu
// "Distribusi melebihi hasil masak aktual!" dan outlet terkunci (status Pending).
//
// Solusi: petakan record ke varian D/I berdasarkan qty_rencana, bukan posisi array.

// Petakan record produksi (bubur/tim) ke varian 1 (D) dan varian 2 (I)
// berdasarkan qty_rencana yang disimpan saat saveStep3 (= rencana D vs rencana I).
// Fallback ke urutan array jika rencana tidak bisa membedakan (mis. D == I).
export function matchVariantRecords(
  records: any[],
  plan1: number, // rencana D (bubur_1 / tim_1)
  plan2: number  // rencana I (bubur_2 / tim_2)
): { rec1?: any; rec2?: any } {
  const recs = [...(records || [])];
  if (recs.length === 0) return {};
  const getRencana = (r: any) => Number(r?.qtyRencana ?? r?.qty_rencana ?? 0);
  if (plan1 !== plan2) {
    const rec1 = recs.find((r) => getRencana(r) === plan1);
    const rec2 = recs.find((r) => getRencana(r) === plan2);
    if (rec1 && rec2) return { rec1, rec2 };
    // Hanya satu yang cocok — varian satunya pakai urutan array sebagai fallback
    if (rec1) return { rec1, rec2: recs.find((r) => r !== rec1) };
    if (rec2) return { rec1: recs.find((r) => r !== rec2), rec2 };
  }
  // Fallback: urutan array (record di-insert berurutan D, I saat saveStep3)
  return { rec1: recs[0], rec2: recs[1] };
}

// Alokasikan `total` ke item-item secara proporsional (largest remainder)
// sehingga jumlah persis sama dengan `total`.
export function allocateProportionally(
  items: { key: string; weight: number }[],
  total: number
): Record<string, number> {
  const weighted = items.filter((it) => it.weight > 0);
  const result: Record<string, number> = {};
  const sumWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (sumWeight <= 0 || total <= 0) return result;
  const floors = weighted.map((it) => {
    const share = (it.weight * total) / sumWeight;
    return { key: it.key, value: Math.floor(share), frac: share - Math.floor(share) };
  });
  const allocated = floors.reduce((s, f) => s + f.value, 0);
  // Clamp ke 0 jika error float membuat sisa negatif — total tidak boleh terlampaui
  let remaining = Math.max(0, total - allocated);
  floors.sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (remaining > 0 && floors.length > 0) {
    floors[i % floors.length].value += 1;
    remaining -= 1;
    i += 1;
  }
  floors.forEach((f) => { result[f.key] = f.value; });
  return result;
}

// Skala grid distribusi agar total per produk mengikuti hasil masak aktual
// (pasca produksi), proporsional per outlet. Outlet dengan alokasi 0 tetap 0.
// Hasilnya total == target (tidak akan memicu validasi "melebihi hasil masak").
export function scaleGridToActual<T extends Record<string, any>>(
  grid: T,
  actualCups: { bubur_1: number; bubur_2: number; tim_1: number; tim_2: number; oatmeal: number; puding: number; abon: number }
): T {
  const out: Record<string, any> = {};
  Object.keys(grid).forEach((k) => { out[k] = { ...grid[k] }; });
  const fieldPairs: [string, keyof typeof actualCups][] = [
    ["bubur_d", "bubur_1"],
    ["bubur_i", "bubur_2"],
    ["tim_d", "tim_1"],
    ["tim_i", "tim_2"],
    ["oatmeal", "oatmeal"],
    ["puding", "puding"],
    ["abon", "abon"]
  ];
  fieldPairs.forEach(([gridField, actualField]) => {
    const target = actualCups[actualField] ?? 0;
    const currentTotal = Object.values(grid).reduce((s: number, v: any) => s + (v?.[gridField] || 0), 0);
    if (currentTotal <= 0) return;
    const items = Object.keys(grid)
      .filter((k) => (grid[k]?.[gridField] || 0) > 0)
      .map((k) => ({ key: k, weight: grid[k]?.[gridField] || 0 }));
    const alloc = allocateProportionally(items, target);
    Object.keys(grid).forEach((k) => {
      out[k][gridField] = alloc[k] ?? 0;
    });
  });
  return out as T;
}

// =============================================================================
// JURNAL SIKLUS (ALUR KEUANGAN) — omset, OH, HPP
// =============================================================================
//
// Setiap kali siklus ditutup (saveStep4), aplikasi membukukan otomatis:
//   Omset  → Dr Kas Rupiah (110000) / Cr Pendapatan Utama (410000)  [ref OUT-SALES]
//   OH     → Dr OH (543000) / Cr Persediaan (140000)                 [ref OUT-OH]
//   HPP    → Dr HPP (541000) / Cr Persediaan (140000)                [ref OUT-HPP]
//
// Semua ref ini harus dihapus bersama saat "Buka Siklus" agar tidak ada
// entri jurnal basi yang tertinggal.
export const CYCLE_JURNAL_REFS = new Set(["OUT-SALES", "OUT-OH", "OUT-HPP"]);

// Nilai rupiah dari qty stok (gram atau satuan utuh) — identik dengan nilai
// yang dipakai tab Mutasi Stok di Keuangan (nilaiBahan + GRAM_EXCLUDED_BAHAN).
// bahanId yg termasuk gramExcluded (puding/oat) dihitung per satuan utuh (pcs),
// lainnya per gram (konversiGram).
export function nilaiStokBahan(
  bahanId: string,
  qty: number,
  bahan: { id: string; hargaBeli: number; konversiGram?: number }[],
  gramExcluded: Set<string>
): number {
  const item = bahan.find((b) => b.id === bahanId);
  if (!item || !(qty > 0)) return 0;
  const konv = item.konversiGram && item.konversiGram > 0 && !gramExcluded.has(item.id) ? item.konversiGram : null;
  return nilaiBahan(qty, item.hargaBeli, konv);
}

// =============================================================================
// PEMBAYARAN OMZET — Kas Rupiah (110000) vs Bank (120000)
// =============================================================================
//
// Omset outlet bisa diterima tunai (Kas Rupiah) atau transfer (Bank). Admin
// memasukkan porsi Kas di Langkah 4; sisanya otomatis Bank. Nilai tersimpan:
//   - Setelah siklus ditutup → jurnal OUT-SALES (baris Debit 110000 = kas,
//     120000 = bank) adalah sumber kebenaran.
//   - Sebelum ditutup (sedang diinput / siklus dibuka) → cache localStorage
//     per tanggal agar tidak hilang saat pindah halaman atau reload.

const OMSET_SPLIT_KEY = "buba-omzet-split";

// Muat cache porsi kas (rupiah) untuk tanggal tertentu; null bila belum ada.
export function loadOmzetSplitCache(tanggal: string): number | null {
  try {
    const raw = localStorage.getItem(OMSET_SPLIT_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    const kas = Number(map?.[tanggal]);
    return Number.isFinite(kas) && kas >= 0 ? kas : null;
  } catch {
    return null;
  }
}

// Simpan cache porsi kas (rupiah) untuk tanggal tertentu.
export function saveOmzetSplitCache(tanggal: string, kas: number): void {
  try {
    const raw = localStorage.getItem(OMSET_SPLIT_KEY) || "{}";
    const map = JSON.parse(raw);
    map[tanggal] = kas;
    localStorage.setItem(OMSET_SPLIT_KEY, JSON.stringify(map));
  } catch {
    /* localStorage tidak tersedia — abaikan */
  }
}

// Total omzet harian — IDENTIK dgn logika saveStep4: bila sudah ada penjualan
// outlet, total = Σ qty × harga; bila belum ada, total disimulasikan dari
// distribusi − retur (auto-create penjualan). Dipakai UI Langkah 4 (live) &
// saveStep4 (revenue final) agar angka tidak pernah berbeda.
export function hitungOmzetHarian(opts: {
  penjualan: any[];
  tanggal: string;
  outlets: { id: string }[];
  distGrid: Record<string, Record<string, number>>;
  returGrid: Record<string, Record<string, number>>;
  produk: { id: string; harga: number }[];
}): number {
  const { penjualan, tanggal, outlets, distGrid, returGrid, produk } = opts;
  const existing = (penjualan || []).filter((p: any) => p.tanggal === tanggal);
  if (existing.length > 0) {
    return existing.reduce((s: number, p: any) => s + p.qty * p.harga, 0);
  }
  const harga = (id: string) => produk.find((p: any) => p.id === id)?.harga || 0;
  let total = 0;
  outlets.forEach((o) => {
    const sent = distGrid[o.id] || {};
    const def: Record<string, number> = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
    const ret = { ...def, ...(returGrid[o.id] || {}) };
    const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
    if (buburSent > 0) {
      const buburRetCups = sisaGramToCups((ret.bubur_d || 0) + (ret.bubur_i || 0), BUBUR_GRAM_PEMBULATAN);
      total += Math.max(0, buburSent - Math.min(buburRetCups, buburSent)) * harga("p-bubur");
    }
    const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
    if (timSent > 0) {
      const timRetCups = sisaGramToCups((ret.tim_d || 0) + (ret.tim_i || 0), TIM_GRAM_PEMBULATAN);
      total += Math.max(0, timSent - Math.min(timRetCups, timSent)) * harga("p-nasitim");
    }
    const addSold = (baseId: string, subSent: number, subRetur: number) => {
      if (subSent <= 0) return;
      total += Math.max(0, subSent - Math.min(subRetur, subSent)) * harga(baseId);
    };
    addSold("p-oatmeal", sent.oatmeal || 0, ret.oatmeal || 0);
    addSold("p-puding", sent.puding || 0, ret.puding || 0);
    addSold("p-abon", sent.abon || 0, ret.abon || 0);
  });
  return total;
}

// Nilai OH (bahan baku + kemasan yang dinyatakan RUSAK karena sisa tidak terjual).
// Meniru persis qty movement RUSAK:OH yang dibuat saveStep4 (gram dibulatkan
// ke atas; puding/oat dikonversi ke pcs via konversiGram, fallback 130/180).
export function hitungOHValue(
  ohRusak: { beras: number; puding: number; oat: number; sayurHijau: number; sayurBuah: number; sayurProtein: number },
  kemasanRusak: { puding: number; oatmeal: number },
  bahan: { id: string; hargaBeli: number; konversiGram?: number }[],
  gramExcluded: Set<string>
): number {
  const konvPuding = bahan.find((b) => b.id === "b-pud01")?.konversiGram || 130;
  const konvOat = bahan.find((b) => b.id === "b-oat01")?.konversiGram || 180;
  let total = 0;
  if (ohRusak.beras > 1) total += nilaiStokBahan("b-brs01", Math.ceil(ohRusak.beras), bahan, gramExcluded);
  if (ohRusak.puding > 1) total += nilaiStokBahan("b-pud01", Math.ceil(ohRusak.puding / konvPuding), bahan, gramExcluded);
  if (ohRusak.oat > 1) total += nilaiStokBahan("b-oat01", Math.ceil(ohRusak.oat / konvOat), bahan, gramExcluded);
  if (ohRusak.sayurHijau > 1) total += nilaiStokBahan("b-sh01", Math.ceil(ohRusak.sayurHijau), bahan, gramExcluded);
  if (ohRusak.sayurBuah > 1) total += nilaiStokBahan("b-sb01", Math.ceil(ohRusak.sayurBuah), bahan, gramExcluded);
  if (ohRusak.sayurProtein > 1) total += nilaiStokBahan("b-sp01", Math.ceil(ohRusak.sayurProtein), bahan, gramExcluded);
  if (kemasanRusak.puding > 0) {
    total += nilaiStokBahan("b-cuppud01", kemasanRusak.puding, bahan, gramExcluded);
    total += nilaiStokBahan("b-plas01", kemasanRusak.puding, bahan, gramExcluded);
  }
  if (kemasanRusak.oatmeal > 0) {
    total += nilaiStokBahan("b-cupoat1", kemasanRusak.oatmeal, bahan, gramExcluded);
    total += nilaiStokBahan("b-ttoat01", kemasanRusak.oatmeal, bahan, gramExcluded);
  }
  return Math.round(total);
}

// Nilai pemotongan bahan baku (Pemakaian Produksi) & kemasan (Pemakaian Kemasan)
// untuk tanggal produksi tertentu. Movement dicocokkan lewat label keterangan
// (tanggal movement = hari saat potong, bukan tanggal produksi). Label 2 hari
// ("T1 + T2") diatribusikan penuh ke tanggal pertama agar tidak dobel hitung.
export function nilaiPemotonganTanggal(
  stokMov: { bahanId: string; tipe: string; qty: number; keterangan?: string }[],
  tanggal: string,
  bahan: { id: string; hargaBeli: number; konversiGram?: number }[],
  gramExcluded: Set<string>
): number {
  return (stokMov || [])
    .filter((m) => {
      if (m.tipe !== "OUT") return false;
      const ket = m.keterangan || "";
      if (ket.startsWith("Pemakaian Produksi [")) {
        const label = ket.slice("Pemakaian Produksi [".length, ket.lastIndexOf("]"));
        return label === tanggal || label.startsWith(tanggal + " + ");
      }
      if (ket.startsWith("Pemakaian Kemasan [")) {
        return ket === `Pemakaian Kemasan [${tanggal}]`;
      }
      return false;
    })
    .reduce((s, m) => s + nilaiStokBahan(m.bahanId, m.qty, bahan, gramExcluded), 0);
}

// HPP = nilai pemotongan bahan baku − nilai OH rusak (biaya bahan utk barang yang laku).
export function hitungHPPValue(pemotonganValue: number, ohValue: number): number {
  return Math.max(0, Math.round(pemotonganValue - ohValue));
}

// Kembalikan salinan grid yang sudah diklamp ke hasil masak aktual: hanya
// menurunkan field yang totalnya MELEBIHI aktual (skala proporsional per outlet).
// Field yang sudah ≤ aktual dibiarkan apa adanya (tidak menaikkan distribusi).
// Dipakai di saveStep4 agar distribusi tidak hard-block saat realisasi < rencana
// (produk tidak sesuai rencana) — stok awal tetap bisa terkirim ke outlet.
export function clampGridToActual<T extends Record<string, any>>(
  grid: T,
  actualCups: { bubur_1: number; bubur_2: number; tim_1: number; tim_2: number; oatmeal: number; puding: number; abon: number }
): T {
  const out: Record<string, any> = {};
  Object.keys(grid).forEach((k) => { out[k] = { ...grid[k] }; });
  const fieldPairs: [string, keyof typeof actualCups][] = [
    ["bubur_d", "bubur_1"],
    ["bubur_i", "bubur_2"],
    ["tim_d", "tim_1"],
    ["tim_i", "tim_2"],
    ["oatmeal", "oatmeal"],
    ["puding", "puding"],
    ["abon", "abon"]
  ];
  fieldPairs.forEach(([gridField, actualField]) => {
    const target = actualCups[actualField] ?? 0;
    const currentTotal = Object.values(grid).reduce((s: number, v: any) => s + (v?.[gridField] || 0), 0);
    if (currentTotal <= target) return; // sudah aman — jangan ubah
    const items = Object.keys(grid)
      .filter((k) => (grid[k]?.[gridField] || 0) > 0)
      .map((k) => ({ key: k, weight: grid[k]?.[gridField] || 0 }));
    const alloc = allocateProportionally(items, target);
    Object.keys(grid).forEach((k) => {
      out[k][gridField] = alloc[k] ?? 0;
    });
  });
  return out as T;
}
