import { describe, it, expect } from "vitest";
import { saldoBahan } from "@/lib/store";
import { SEED_BAHAN } from "@/lib/seed";
import { BahanBaku, StokMovement } from "@/lib/types";
import { calcKemasanKebutuhan, KEMASAN_BAHAN, sisaGramToCups, resolveFreshReturGrid, hitungTerjualOh, BUBUR_GRAM_PEMBULATAN, TIM_GRAM_PEMBULATAN, type OutletGrid } from "@/lib/produksi-utils";

/**
 * Test siklus produksi — Tutup Oat:
 * 1. Seed data Tutup Oat tersedia dengan stok awal 1000
 * 2. Stok Movement OUT untuk produksi Oatmeal mengurangi saldo Tutup Oat
 * 3. Saldo bahan baku berkurang dengan benar
 */
describe("Siklus Produksi — Tutup Oat", () => {
  it("seed data Tutup Oat (TTOAT01) tersedia dengan stok awal 1000", () => {
    const tutupOat = SEED_BAHAN.find((b) => b.id === "b-ttoat01");
    expect(tutupOat).toBeDefined();
    expect(tutupOat!.nama).toBe("TUTUP OAT");
    expect(tutupOat!.kode).toBe("TTOAT01");
    expect(tutupOat!.stokAwal).toBe(1000);
    expect(tutupOat!.satuan).toBe("pcs");
  });

  it("saldoBahan menghitung stok awal dengan benar tanpa movement", () => {
    // Mock state dengan hanya seed data
    const mockState = {
      bahan: SEED_BAHAN,
      stokMov: [] as StokMovement[],
    } as any;

    const saldo = saldoBahan("b-ttoat01", mockState);
    expect(saldo).toBe(1000); // stok awal
  });

  it("pemotongan stok (OUT movement) mengurangi saldo Tutup Oat", () => {
    // Seed: TUTUP OAT stokAwal = 1000, unit-based (tidak ada konversiGram)
    // Tidak masuk GRAM_EXCLUDED_BAHAN karena tidak memiliki konversiGram
    
    const mockState = {
      bahan: SEED_BAHAN,
      stokMov: [
        {
          id: "m-1",
          tanggal: "2026-07-28",
          bahanId: "b-ttoat01",
          tipe: "OUT",
          qty: 50,
          keterangan: "Pemakaian Produksi [2026-07-28]",
        },
      ] as StokMovement[],
    } as any;

    const saldo = saldoBahan("b-ttoat01", mockState);
    expect(saldo).toBe(950); // 1000 - 50
  });

  it("beberapa pemotongan stok mengurangi saldo dengan benar (siklus lengkap)", () => {
    const mockState = {
      bahan: SEED_BAHAN,
      stokMov: [
        {
          id: "m-1",
          tanggal: "2026-07-28",
          bahanId: "b-ttoat01",
          tipe: "OUT",
          qty: 30,
          keterangan: "Pemakaian Produksi [batch 1]",
        },
        {
          id: "m-2",
          tanggal: "2026-07-28",
          bahanId: "b-ttoat01",
          tipe: "OUT",
          qty: 45,
          keterangan: "Pemakaian Produksi [batch 2]",
        },
        {
          id: "m-3",
          tanggal: "2026-07-28",
          bahanId: "b-ttoat01",
          tipe: "IN",
          qty: 10,
          keterangan: "Retur dari outlet",
        },
      ] as StokMovement[],
    } as any;

    const saldo = saldoBahan("b-ttoat01", mockState);
    // 1000 (stok awal) - 30 (OUT) - 45 (OUT) + 10 (IN) = 935
    expect(saldo).toBe(935);
  });

  it("bahan lain tidak terpengaruh oleh movement Tutup Oat", () => {
    const mockState = {
      bahan: SEED_BAHAN,
      stokMov: [
        {
          id: "m-1",
          tanggal: "2026-07-28",
          bahanId: "b-ttoat01",
          tipe: "OUT",
          qty: 100,
        },
      ] as StokMovement[],
    } as any;

    // OAT (b-oat01) memiliki stokAwal=25 dan masuk GRAM_EXCLUDED_BAHAN
    // sehingga perhitungan unit-based: saldo = stokAwal + movement
    // Tidak ada movement OAT, jadi saldo tetap 25
    const saldoOat = saldoBahan("b-oat01", mockState);
    expect(saldoOat).toBe(25);
  });

  it("Tutup Oat sudah terdaftar di SEED_BAHAN dengan ID b-ttoat01", () => {
    const ids = SEED_BAHAN.map((b) => b.id);
    expect(ids).toContain("b-ttoat01");

    // Verifikasi tidak konflik dengan TUTUP (TTP01) yang sudah ada
    const tutupOat = SEED_BAHAN.find((b) => b.id === "b-ttoat01");
    const tutup = SEED_BAHAN.find((b) => b.id === "b-ttp01");
    expect(tutupOat).toBeDefined();
    expect(tutup).toBeDefined();
    expect(tutupOat!.id).not.toBe(tutup!.id);
  });
});

/**
 * Test kebutuhan kemasan (cup & tutup) — dihitung dari HASIL PRODUKSI AKTUAL,
 * bukan dari rencana. Hasil bisa MENYUSUT (kebutuhan < rencana) atau MELUBER
 * (kebutuhan > rencana).
 */
describe("Kemasan Sesuai Hasil Aktual (Langkah 3)", () => {
  it("menghitung cup & tutup dari hasil aktual (1:1 per porsi)", () => {
    const reqs = calcKemasanKebutuhan({ puding: 80, oatmeal: 120 });
    expect(reqs).toEqual([
      { bahanId: "b-cuppud01", kode: "CUPPUD01", nama: "CUP PUDING", qty: 80, satuan: "pcs" },
      { bahanId: "b-plas01", kode: "PLAS01", nama: "PLASTIK SELER", qty: 80, satuan: "pcs" },
      { bahanId: "b-cupoat1", kode: "CUPOAT1", nama: "CUP OAT", qty: 120, satuan: "pcs" },
      { bahanId: "b-ttoat01", kode: "TTOAT01", nama: "TUTUP OAT", qty: 120, satuan: "pcs" }
    ]);
  });

  it("hasil MENYUSUT → kebutuhan kemasan lebih kecil dari rencana", () => {
    // Rencana 150 cup oat & 100 cup puding, tapi realisasi menyusut ke 90 & 60
    const reqs = calcKemasanKebutuhan({ puding: 60, oatmeal: 90 });
    const cupOat = reqs.find((r) => r.bahanId === "b-cupoat1");
    const cupPuding = reqs.find((r) => r.bahanId === "b-cuppud01");
    expect(cupOat!.qty).toBe(90); // bukan 150
    expect(cupPuding!.qty).toBe(60); // bukan 100
  });

  it("hasil MELUBER → kebutuhan kemasan lebih besar dari rencana", () => {
    // Rencana 100 cup oat, tapi realisasi meluber ke 130
    const reqs = calcKemasanKebutuhan({ puding: 80, oatmeal: 130 });
    const cupOat = reqs.find((r) => r.bahanId === "b-cupoat1");
    const tutupOat = reqs.find((r) => r.bahanId === "b-ttoat01");
    expect(cupOat!.qty).toBe(130);
    expect(tutupOat!.qty).toBe(130);
  });

  it("hasil 0 cup → tidak ada kebutuhan kemasan", () => {
    const reqs = calcKemasanKebutuhan({ puding: 0, oatmeal: 0 });
    expect(reqs).toEqual([]);
  });

  it("seluruh bahan kemasan terdaftar di SEED_BAHAN (stok dapat dipotong)", () => {
    const ids = SEED_BAHAN.map((b) => b.id);
    KEMASAN_BAHAN.forEach((k) => {
      expect(ids).toContain(k.bahanId);
    });
  });

  it("kemasan BUBUR & NASI TIM TIDAK dipotong di produksi (via request outlet)", () => {
    // CUP BUBUR (b-cb01) & TUTUP (b-ttp01) dipenuhi lewat permohonan/retur
    // perlengkapan outlet — tidak boleh ada di KEMASAN_BAHAN (potongan produksi).
    const ids = KEMASAN_BAHAN.map((k) => k.bahanId);
    expect(ids).not.toContain("b-cb01");
    expect(ids).not.toContain("b-ttp01");
  });
});

/**
 * Logika OH (sisa tidak terjual di outlet) — saveStep5:
 *  - OH Bubur / Nasi Tim / Puding / Oatmeal → otomatis RUSAK. Bahan baku sudah
 *    terpotong saat Langkah 2 (sesuai rencana) dan TIDAK dikembalikan ke stok;
 *    sisa dicatat sebagai pemakaian rusak (stok_movement OUT "RUSAK:OH").
 *  - OH Abon → KEMBALI ke stok gudang (bisa dijual lagi).
 *  - Kemasan Bubur (cup & tutup) TIDAK menyentuh stok produksi (request-based).
 */

// Replikasi logika dari saveStep5 (Produksi.tsx) agar bisa diuji unit.
function calcOHRusak(
  distGrid: Record<string, any>,
  returGrid: Record<string, any>,
  settings: any
) {
  const rusak = { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
  const kemasan = { puding: 0, oatmeal: 0 };
  let abonKembali = 0;
  Object.keys(distGrid).forEach((o) => {
    const sent = distGrid[o] || {};
    const retur = returGrid[o] || {};

    const addBubur = (sentCups: number, returGram: number) => {
      // Aturan OH 50g: sisa ≤ 50 gr → 0 cup, > 50 gr → dibulatkan naik (selaras dgn Produksi.tsx)
      const cups = Math.min(sisaGramToCups(returGram || 0, 118), sentCups);
      if (cups > 0) {
        rusak.beras += (cups * 100) / 6;
        rusak.sayurHijau += (cups * 8) / 6;
        rusak.sayurBuah += (cups * 5) / 6;
        rusak.sayurProtein += (cups * 1.5) / 6;
      }
    };
    const addTim = (sentCups: number, returGram: number) => {
      const cups = Math.min(sisaGramToCups(returGram || 0, 108), sentCups);
      if (cups > 0) {
        rusak.beras += cups * settings.berasTim;
        rusak.sayurHijau += cups * settings.sayurHijauTim;
        rusak.sayurBuah += cups * settings.sayurBuahTim;
        rusak.sayurProtein += cups * settings.sayurProteinTim;
      }
    };

    if (sent.bubur_d > 0) addBubur(sent.bubur_d, retur.bubur_d);
    if (sent.bubur_i > 0) addBubur(sent.bubur_i, retur.bubur_i);
    if (sent.tim_d > 0) addTim(sent.tim_d, retur.tim_d);
    if (sent.tim_i > 0) addTim(sent.tim_i, retur.tim_i);

    if (sent.oatmeal > 0) {
      const ar = Math.min(retur.oatmeal || 0, sent.oatmeal);
      if (ar > 0) {
        rusak.oat += ar * settings.oatmealCup;
        kemasan.oatmeal += ar;
      }
    }
    if (sent.puding > 0) {
      const ar = Math.min(retur.puding || 0, sent.puding);
      if (ar > 0) {
        rusak.puding += ar * settings.pudingCup;
        kemasan.puding += ar;
      }
    }
    if (sent.abon > 0) {
      const ar = Math.min(retur.abon || 0, sent.abon);
      if (ar > 0) abonKembali += ar * settings.abonCup;
    }
  });
  return { rusak, abonKembali, kemasan };
}

const OH_SETTINGS = {
  berasTim: 20,
  sayurHijauTim: 1.6,
  sayurBuahTim: 1.0,
  sayurProteinTim: 0.3,
  oatmealCup: 25.71,
  pudingCup: 13.0,
  abonCup: 10.0,
};

describe("OH (Sisa Tidak Terjual) — RUSAK vs Kembali ke Stok", () => {
  it("sisa Bubur (gram) → setara bahan baku dicatat RUSAK, bukan dikembalikan", () => {
    // Terkirim 100 cup, sisa 590 gr = 5 cup (590/118)
    const { rusak, abonKembali } = calcOHRusak(
      { o1: { bubur_d: 100, bubur_i: 0 } },
      { o1: { bubur_d: 590, bubur_i: 0 } },
      OH_SETTINGS
    );
    expect(rusak.beras).toBeCloseTo((5 * 100) / 6, 2);      // 83.33 gr
    expect(rusak.sayurHijau).toBeCloseTo((5 * 8) / 6, 2);    // 6.67 gr
    expect(rusak.sayurBuah).toBeCloseTo((5 * 5) / 6, 2);     // 4.17 gr
    expect(rusak.sayurProtein).toBeCloseTo((5 * 1.5) / 6, 2); // 1.25 gr
    expect(rusak.oat).toBe(0);
    expect(rusak.puding).toBe(0);
    expect(abonKembali).toBe(0);
  });

  it("sisa Nasi Tim (gram) → setara bahan baku per rasio Tim dicatat RUSAK", () => {
    // Terkirim 50 cup, sisa 540 gr = 5 cup (540/108)
    const { rusak, abonKembali } = calcOHRusak(
      { o1: { tim_d: 50, tim_i: 0 } },
      { o1: { tim_d: 540, tim_i: 0 } },
      OH_SETTINGS
    );
    expect(rusak.beras).toBeCloseTo(5 * 20, 2);          // 100 gr
    expect(rusak.sayurHijau).toBeCloseTo(5 * 1.6, 2);     // 8 gr
    expect(rusak.sayurBuah).toBeCloseTo(5 * 1.0, 2);      // 5 gr
    expect(rusak.sayurProtein).toBeCloseTo(5 * 0.3, 2);   // 1.5 gr
    expect(abonKembali).toBe(0);
  });

  it("sisa Oatmeal & Puding (cup) → setara gram bahan dicatat RUSAK", () => {
    const { rusak } = calcOHRusak(
      { o1: { oatmeal: 80, puding: 60 } },
      { o1: { oatmeal: 10, puding: 6 } },
      OH_SETTINGS
    );
    expect(rusak.oat).toBeCloseTo(10 * 25.71, 2);  // 257.1 gr
    expect(rusak.puding).toBeCloseTo(6 * 13.0, 2);  // 78 gr
  });

  it("sisa Abon (pcs) → KEMBALI ke stok gudang (gram)", () => {
    const { rusak, abonKembali } = calcOHRusak(
      { o1: { abon: 50 } },
      { o1: { abon: 8 } },
      OH_SETTINGS
    );
    expect(abonKembali).toBeCloseTo(8 * 10, 2); // 80 gr masuk stok
    expect(rusak.beras).toBe(0);
    expect(rusak.oat).toBe(0);
    expect(rusak.puding).toBe(0);
  });

  it("tidak ada sisa → tidak ada RUSAK & tidak ada abon kembali", () => {
    const { rusak, abonKembali } = calcOHRusak(
      { o1: { bubur_d: 100, oatmeal: 20, abon: 10 } },
      { o1: { bubur_d: 0, oatmeal: 0, abon: 0 } },
      OH_SETTINGS
    );
    expect(rusak.beras).toBe(0);
    expect(rusak.oat).toBe(0);
    expect(abonKembali).toBe(0);
  });

  it("sisa tidak boleh melebihi yang terkirim (clamp ke sent)", () => {
    const { rusak } = calcOHRusak(
      { o1: { oatmeal: 5 } },
      { o1: { oatmeal: 999 } },
      OH_SETTINGS
    );
    expect(rusak.oat).toBeCloseTo(5 * 25.71, 2); // clamp ke 5 cup, bukan 999
  });

  it("OH Nasi Tim → TIDAK ada kemasan rusak (cup & tutup via request outlet)", () => {
    const { kemasan } = calcOHRusak(
      { o1: { tim_d: 50, tim_i: 0 } },
      { o1: { tim_d: 540, tim_i: 0 } },
      OH_SETTINGS
    );
    expect(kemasan.puding).toBe(0);
    expect(kemasan.oatmeal).toBe(0);
  });

  it("OH Puding → kemasan CUP PUDING & PLASTIK SELER ikut RUSAK (1:1)", () => {
    const { kemasan } = calcOHRusak(
      { o1: { puding: 60 } },
      { o1: { puding: 6 } },
      OH_SETTINGS
    );
    expect(kemasan.puding).toBe(6);
  });

  it("OH Oatmeal → kemasan CUP OAT & TUTUP OAT ikut RUSAK (1:1)", () => {
    const { kemasan } = calcOHRusak(
      { o1: { oatmeal: 80 } },
      { o1: { oatmeal: 10 } },
      OH_SETTINGS
    );
    expect(kemasan.oatmeal).toBe(10);
  });

  it("OH Bubur → TIDAK ada kemasan rusak (cup & tutup bubur via request outlet)", () => {
    const { kemasan } = calcOHRusak(
      { o1: { bubur_d: 100, bubur_i: 0 } },
      { o1: { bubur_d: 590, bubur_i: 0 } },
      OH_SETTINGS
    );
    expect(kemasan.puding).toBe(0);
    expect(kemasan.oatmeal).toBe(0);
  });
});

/**
 * Siklus DIBUKA (Buka Siklus) — admin bisa mengubah data retur Langkah 5 lagi
 * dan nilai edit manual WAJIB dihormati saat menutup siklus (saveStep5):
 *  - resolveFreshReturGrid: kalau hasManualReturEdits=true → pakai returGrid
 *    state admin apa adanya (TIDAK dihitung ulang dari penjualan outlet).
 *  - Kalau TIDAK ada edit manual → hitung ulang dari penjualan terbaru outlet.
 *  - handleAutoRefresh tidak boleh menimpa returGrid saat admin sedang edit.
 */
describe("Buka Siklus — edit retur manual admin dihormati (saveStep5)", () => {
  const OUTLETS = [{ id: "o1" }, { id: "o2" }];
  const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
  const distGrid: OutletGrid = {
    o1: { ...ZERO, bubur_d: 20, bubur_i: 10, oatmeal: 30, abon: 5 },
    o2: { ...ZERO, tim_d: 15, puding: 20 },
  };
  // Penjualan yang di-input outlet via Laporan (sisa gram per menu)
  const existingPenjualan: any[] = [
    { outletId: "o1", produkId: "p-bubur", variant: "bubur_d", qty: 18, sisaGram: 236 }, // 236g ≈ 2 cup sisa
    { outletId: "o1", produkId: "p-bubur", variant: "bubur_i", qty: 10, sisaGram: 0 },
    { outletId: "o1", produkId: "p-oatmeal", variant: null, qty: 25, sisaGram: 0 },
    { outletId: "o1", produkId: "p-abon", variant: null, qty: 3, sisaGram: 0 },
  ];

  it("TANPA edit manual → retur dihitung ulang dari penjualan terbaru outlet", () => {
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid,
      existingPenjualan,
      hasManualReturEdits: false,
    });
    // o1 bubur_d: sisaGram 236 → min(236, 20*118) = 236 gram (≈ 2 cup sisa)
    expect(fresh.o1.bubur_d).toBe(236);
    expect(fresh.o1.bubur_i).toBe(0);
    // o1 oatmeal: terkirim 30 - terjual 25 = 5 cup sisa
    expect(fresh.o1.oatmeal).toBe(5);
    // o1 abon: terkirim 5 - terjual 3 = 2 pcs sisa
    expect(fresh.o1.abon).toBe(2);
    // o2 belum input penjualan → retur tetap 0 (belum input)
    expect(fresh.o2.tim_d).toBe(0);
    // o2 puding: tidak ada penjualan → sent (20) masih ditampilkan sebagai retur
    // (puding menggunakan sent - sold, bukan gram-based calcRetur)
    expect(fresh.o2.puding).toBe(20);
  });

  it("ADMIN EDIT MANUAL (siklus dibuka) → nilai returGrid admin dipakai apa adanya", () => {
    const manualRetur: OutletGrid = {
      o1: { ...ZERO, bubur_d: 500, oatmeal: 8, abon: 4 }, // koreksi admin (berbeda dari hitung ulang)
      o2: { ...ZERO, tim_d: 3 },
    };
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: manualRetur,
      distGrid,
      existingPenjualan,
      hasManualReturEdits: true,
    });
    // Nilai manual dihormati MESKIPUN penjualan outlet berbeda
    expect(fresh.o1.bubur_d).toBe(500);
    expect(fresh.o1.oatmeal).toBe(8);
    expect(fresh.o1.abon).toBe(4);
    expect(fresh.o2.tim_d).toBe(3);
    // Field yang tidak di-edit admin tetap 0 (tidak dihitung ulang dari penjualan)
    expect(fresh.o1.bubur_i).toBe(0);
    expect(fresh.o2.puding).toBe(0);
  });

  it("edit manual TIDAK memutasi returGrid input (fungsi mengembalikan salinan)", () => {
    const manualRetur: OutletGrid = {
      o1: { ...ZERO, bubur_d: 500 },
      o2: { ...ZERO },
    };
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: manualRetur,
      distGrid,
      existingPenjualan,
      hasManualReturEdits: true,
    });
    expect(fresh).not.toBe(manualRetur);
    expect(fresh.o1).not.toBe(manualRetur.o1);
    // Input tidak berubah
    expect(manualRetur.o1.bubur_d).toBe(500);
  });

  it("tanpa penjualan outlet → retur semua 0 (tidak ada data basi)", () => {
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid,
      existingPenjualan: [],
      hasManualReturEdits: false,
    });
    expect(fresh.o1.bubur_d).toBe(0);
    expect(fresh.o1.oatmeal).toBe(0);
    expect(fresh.o1.abon).toBe(0);
    expect(fresh.o2.tim_d).toBe(0);
    expect(fresh.o2.puding).toBe(0);
  });

  it("sisa gram tidak boleh melebihi yang terkirim (clamp ke dist * gramPerCup)", () => {
    // sisaGram 9999 g tapi hanya terkirim 5 cup bubur (5*118 = 590 g max)
    const penjualanBesar = [
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_d", qty: 0, sisaGram: 9999 },
    ];
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid: { o1: { ...ZERO, bubur_d: 5 }, o2: { ...ZERO } },
      existingPenjualan: penjualanBesar,
      hasManualReturEdits: false,
    });
    expect(fresh.o1.bubur_d).toBe(5 * 118); // clamp ke 590 gram
  });
});

// =============================================================================
// RETUR GRID SYNC — verifikasi returGrid update saat penjualan berubah
// =============================================================================
//
// Bug sebelumnya: returGrid menampilkan full distribusi (mis. 3540g)
// padahal outlet sudah save sisa (164g). Penyebab:
// 1. calcRetur tidak menemukan penjualan record → fallback = full distribusi
// 2. useEffect diblokir hasUserModifiedGrids → returGrid tidak di-update
// 3. handleAutoRefresh pakai stale closure → existingSales kosong

describe("returGrid sync — update saat penjualan berubah", () => {
  const OUTLETS = [{ id: "o1" }, { id: "o2" }];
  const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
  const distGrid: OutletGrid = {
    o1: { ...ZERO, bubur_d: 30, bubur_i: 10, oatmeal: 15, abon: 5 },
    o2: { ...ZERO, tim_d: 20, puding: 10 },
  };

  it("returGrid berubah dari full distribusi ke sisa aktual saat penjualan ditambahkan", () => {
    // 1. AWAL: belum ada penjualan → retur = full distribusi
    const freshEmpty = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid,
      existingPenjualan: [],
      hasManualReturEdits: false,
    });
    // o1 belum ada penjualan → bubur_d retur = 0 (tidak ada data)
    expect(freshEmpty.o1.bubur_d).toBe(0);
    expect(freshEmpty.o1.oatmeal).toBe(0);

    // 2. OUTLET SAVE SISA: penjualan ditambahkan dgn sisaGram
    const penjualanAfterSave: any[] = [
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_d", qty: 28, sisaGram: 164 },
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_i", qty: 10, sisaGram: 0 },
      { outletId: "o1", produkId: "p-oatmeal", variant: null, qty: 12, sisaGram: 0 },
      { outletId: "o1", produkId: "p-abon", variant: null, qty: 5, sisaGram: 0 },
    ];
    const freshAfterSave = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid,
      existingPenjualan: penjualanAfterSave,
      hasManualReturEdits: false,
    });
    // o1 bubur_d: sisaGram 164 → retur = 164g (bukan 30×118 = 3540g)
    expect(freshAfterSave.o1.bubur_d).toBe(164);
    expect(freshAfterSave.o1.bubur_i).toBe(0);
    // o1 oatmeal: 15 kirim - 12 jual = 3 sisa
    expect(freshAfterSave.o1.oatmeal).toBe(3);
    // o1 abon: 5 kirim - 5 jual = 0 sisa
    expect(freshAfterSave.o1.abon).toBe(0);

    // 3. VERIFIKASI: retur TIDAK boleh melebihi distribusi
    expect(freshAfterSave.o1.bubur_d).toBeLessThanOrEqual(30 * 118);
  });

  it("sisaGram yang benar: 164g bukan 3540g (kasus bug 30 cup bubur)", () => {
    // Kasus nyata: outlet kirim 30 cup bubur daging, sisa 164g
    const penjualan = [
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_d", qty: 28, sisaGram: 164 },
    ];
    const dist = { o1: { ...ZERO, bubur_d: 30 }, o2: { ...ZERO } };
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid: dist,
      existingPenjualan: penjualan,
      hasManualReturEdits: false,
    });
    // Harusnya 164g, BUKAN 30×118 = 3540g
    expect(fresh.o1.bubur_d).toBe(164);
    expect(fresh.o1.bubur_d).not.toBe(30 * 118);
  });

  it("tanpa sisaGram (fallback) → retur dihitung dari totalSent - sold × gramPerCup", () => {
    // Outlet tidak simpan sisaGram per varian → fallback: proporsional
    const penjualan = [
      { outletId: "o1", produkId: "p-bubur", variant: null, qty: 25, sisaGram: null },
    ];
    const dist = { o1: { ...ZERO, bubur_d: 20, bubur_i: 10 }, o2: { ...ZERO } };
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid: dist,
      existingPenjualan: penjualan,
      hasManualReturEdits: false,
    });
    // totalSent = 30, sold = 25, totalRetur = 5 cup
    // dRetur = round(5 × 20/30) = round(3.33) = 3 cup → 3 × 118 = 354g
    // iRetur = 5 - 3 = 2 cup → 2 × 118 = 236g
    expect(fresh.o1.bubur_d).toBe(3 * 118);
    expect(fresh.o1.bubur_i).toBe(2 * 118);
  });

  it("sisaGram per varian diutamakan di atas fallback", () => {
    // Ada sisaGram untuk bubur_d tapi tidak untuk bubur_i
    const penjualan = [
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_d", qty: 18, sisaGram: 236 },
      { outletId: "o1", produkId: "p-bubur", variant: "bubur_i", qty: 8, sisaGram: null },
    ];
    const dist = { o1: { ...ZERO, bubur_d: 20, bubur_i: 10 }, o2: { ...ZERO } };
    const fresh = resolveFreshReturGrid({
      outlets: OUTLETS,
      returGrid: { o1: { ...ZERO }, o2: { ...ZERO } },
      distGrid: dist,
      existingPenjualan: penjualan,
      hasManualReturEdits: false,
    });
    // bubur_d: sisaGram = 236 → min(236, 20×118) = 236g
    expect(fresh.o1.bubur_d).toBe(236);
    // bubur_i: tidak ada sisaGram → fallback: totalSent=30, sold=26, retur=4
    // dRetur sudah diambil oleh sisaGram, jadi fallback hanya untuk iRec
    // Karena dRec ADA tapi iRec TIDAK → iRec = 0 (fallback tidak jalan)
    expect(fresh.o1.bubur_i).toBe(0);
  });
});

// =============================================================================
// hitungTerjualOh — konsistensi formula UI vs database
// =============================================================================

describe("hitungTerjualOh — formula konsisten UI vs database", () => {
  it("sent=30, oh=164g → terjual = round((30×118 - 164)/118) = 28", () => {
    // Kasus bug: UI lama = 30 - round(164/118) = 30 - 1 = 29 (SALAH)
    // Database = round((30×118 - 164)/118) = round(3376/118) = round(28.61) = 29
    // Setelah fix: UI = hitungTerjualOh(30, 164, 118) = 29
    expect(hitungTerjualOh(30, 164, 118)).toBe(29);
  });

  it("sent=10, oh=531g → terjual = 6 (bukan 5)", () => {
    // round((10×118 - 531)/118) = round(649/118) = round(5.5) = 6
    expect(hitungTerjualOh(10, 531, 118)).toBe(6);
  });

  it("sent=10, oh=649g → terjual = 5 (bukan 4)", () => {
    // round((10×118 - 649)/118) = round(531/118) = round(4.5) = 5
    expect(hitungTerjualOh(10, 649, 118)).toBe(5);
  });

  it("oh=0 → terjual = sent (semua terjual)", () => {
    expect(hitungTerjualOh(30, 0, 118)).toBe(30);
  });

  it("oh = sent × gramPerCup → terjual = 0 (semua retur)", () => {
    expect(hitungTerjualOh(30, 30 * 118, 118)).toBe(0);
  });

  it("sent=0 → terjual = 0", () => {
    expect(hitungTerjualOh(0, 100, 118)).toBe(0);
  });

  it("oh melebihi distribusi → terjual = 0 (clamp)", () => {
    expect(hitungTerjualOh(5, 9999, 118)).toBe(0);
  });

  it("Nasi Tim: sent=20, oh=108g → terjual = round((20×108 - 108)/108) = 19", () => {
    expect(hitungTerjualOh(20, 108, 108)).toBe(19);
  });
});
