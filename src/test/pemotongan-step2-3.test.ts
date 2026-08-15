import { describe, it, expect } from "vitest";
import { BUBUR_BASE, buburCalc, calcKemasanKebutuhan, KEMASAN_BAHAN, loadRencanaGrid, hitungOHValue, hitungHPPValue, nilaiPemotonganTanggal, hitungOmzetHarian, hitungMaterialReqs } from "@/lib/produksi-utils";

/**
 * Verifikasi aturan pemotongan stok di siklus produksi (Produksi.tsx):
 *
 *   Langkah 2 (requestWarehouse)  → potong BAHAN BAKU dari RENCANA (plan).
 *   Langkah 3 (performSaveStep3)  → potong KEMASAN (cup & tutup Puding/Oatmeal)
 *                                   dari HASIL AKTUAL (realisasi pasca masak).
 *
 * Alasan: bahan utama dipotong sesuai rencana (Step 1) dan TIDAK terpengaruh hasil
 * masak; sedangkan cup & tutup mengikuti hasil aktual karena bisa menyusut/meluber.
 * Kemasan BUBUR & NASI TIM TIDAK dipotong di produksi (via request outlet).
 */

// ===== BAHAN BAKU (Step 2) — helper NYATA hitungMaterialReqs dari produksi-utils =====
// Master bahan minimal yg dipakai helper (satuan beras, kode/nama/satuan daging,
// konversi puding/oat). Sayur tidak butuh master (kode/nama/satuan di-hardcode).
const BAHAN = [
  { id: "b-brs01", kode: "BRS01", nama: "BERAS", satuan: "Pack", konversiGram: 1000 },
  { id: "b-ay01", kode: "AY01", nama: "AYAM", satuan: "Pack" },
  { id: "b-sl01", kode: "SL01", nama: "SALMON", satuan: "Pack" },
  { id: "b-dg01", kode: "DG01", nama: "DAGING SAPI", satuan: "Pack" },
  { id: "b-tn01", kode: "TN01", nama: "TENGGIRI", satuan: "Pack" },
  { id: "b-pud01", kode: "PUD01", nama: "PUDING", satuan: "pcs", konversiGram: 130 },
  { id: "b-oat01", kode: "OAT01", nama: "OAT", satuan: "pcs", konversiGram: 180 }
];

const materialReqs = (t: {
  buburD: number; buburI: number; timD: number; timI: number;
  oatmeal: number; puding: number; abon: number;
}, settings: any, variants: { bubur1?: string; bubur2?: string; tim1?: string; tim2?: string }) =>
  hitungMaterialReqs(t, settings, variants, BAHAN as any);

// ===== Replikasi packagingReqs (Step 3) dari Produksi.tsx =====
const packagingReqs = (actualCups: { puding: number; oatmeal: number }) =>
  calcKemasanKebutuhan(actualCups).map((k) => ({ bahanId: k.bahanId, qty: k.qty }));

const SETTINGS = {
  berasTim: 20, dagingTim: 0.8, sayurHijauTim: 1.6, sayurBuahTim: 1.0, sayurProteinTim: 0.3,
  oatmealCup: 25.71, pudingCup: 13.0, abonCup: 10.0,
};

const PLAN = { buburD: 150, buburI: 120, timD: 90, timI: 110, oatmeal: 40, puding: 60, abon: 25 };
const VARIANTS = { bubur1: "b-ay01", bubur2: "b-sl01", tim1: "b-dg01", tim2: "b-tn01" };

describe("Langkah 2 — Pemotongan BAHAN BAKU dari RENCANA", () => {
  it("memotong beras, sayur, daging, puding, oat & abon sesuai rencana", () => {
    const reqs = materialReqs(PLAN, SETTINGS, VARIANTS);
    const ids = reqs.map((r) => r.bahanId);
    expect(ids).toContain("b-brs01");
    expect(ids).toContain("b-sh01");
    expect(ids).toContain("b-sb01");
    expect(ids).toContain("b-sp01");
    expect(ids).toContain("b-ay01"); // daging bubur 1
    expect(ids).toContain("b-sl01"); // daging bubur 2
    expect(ids).toContain("b-dg01"); // daging tim 1
    expect(ids).toContain("b-tn01"); // daging tim 2
    expect(ids).toContain("b-pud01");
    expect(ids).toContain("b-oat01");
    expect(ids).toContain("b-ab01");
    // Konversi bahan baku: Oatmeal 180 gr/pcs, Puding 130 gr/pcs
    // PLAN: oat 40 cup x 25.71 = 1029 gr -> ceil(1029/180) = 6 pcs; puding 60 cup x 13 = 780 gr -> ceil(780/130) = 6 pcs
    expect(reqs.find((r) => r.bahanId === "b-oat01")!.qty).toBe(6);
    expect(reqs.find((r) => r.bahanId === "b-pud01")!.qty).toBe(6);
  });

  it("TIDAK memotong kemasan (cup & tutup) di Langkah 2", () => {
    const reqs = materialReqs(PLAN, SETTINGS, VARIANTS);
    const kemasanIds = new Set<string>(KEMASAN_BAHAN.map((k) => k.bahanId));
    reqs.forEach((r) => expect(kemasanIds.has(r.bahanId)).toBe(false));
  });

  it("qty daging (gram desimal) disimpan sebagai bilangan BULAT (kolom integer)", () => {
    const reqs = materialReqs(PLAN, SETTINGS, VARIANTS);
    const meatIds = ["b-ay01", "b-sl01", "b-dg01", "b-tn01"];
    const meats = reqs.filter((r) => meatIds.includes(r.bahanId));
    expect(meats.length).toBeGreaterThan(0);
    meats.forEach((r) => expect(Number.isInteger(r.qty)).toBe(true));
  });

  it("bahan tetap sesuai RENCANA meski hasil produksi MENYUSUT (bahan tdk dikembalikan)", () => {
    const reqs = materialReqs(PLAN, SETTINGS, VARIANTS);
    const berasRencana = reqs.find((r) => r.bahanId === "b-brs01")!.qty;
    // Realisasi bubur/tim jauh lebih kecil dari rencana → potongan bahan TIDAK berubah
    expect(berasRencana).toBeGreaterThan(0);
  });
});

describe("Langkah 3 — Pemotongan KEMASAN dari HASIL AKTUAL", () => {
  it("menghitung cup & tutup 1:1 dari realisasi puding & oatmeal", () => {
    const reqs = packagingReqs({ puding: 60, oatmeal: 40 });
    expect(reqs).toEqual([
      { bahanId: "b-cuppud01", qty: 60 },
      { bahanId: "b-plas01", qty: 60 },
      { bahanId: "b-cupoat1", qty: 40 },
      { bahanId: "b-ttoat01", qty: 40 }
    ]);
  });

  it("hasil MENYUSUT → kemasan lebih kecil dari rencana", () => {
    // Rencana puding 60, oat 40 — realisasi hanya 50 & 30
    const reqs = packagingReqs({ puding: 50, oatmeal: 30 });
    const map = new Map(reqs.map((r) => [r.bahanId, r.qty]));
    expect(map.get("b-cuppud01")).toBe(50);
    expect(map.get("b-cupoat1")).toBe(30);
  });

  it("hasil MELUBER → kemasan lebih besar dari rencana", () => {
    const reqs = packagingReqs({ puding: 70, oatmeal: 45 });
    const map = new Map(reqs.map((r) => [r.bahanId, r.qty]));
    expect(map.get("b-cuppud01")).toBe(70);
    expect(map.get("b-plas01")).toBe(70);
    expect(map.get("b-cupoat1")).toBe(45);
    expect(map.get("b-ttoat01")).toBe(45);
  });

  it("TIDAK memotong bahan baku (beras/sayur/daging) di Langkah 3", () => {
    const reqs = packagingReqs({ puding: 60, oatmeal: 40 });
    const bahanIds = new Set(["b-brs01", "b-sh01", "b-sb01", "b-sp01", "b-ay01", "b-sl01", "b-dg01", "b-tn01", "b-pud01", "b-oat01", "b-ab01"]);
    reqs.forEach((r) => expect(bahanIds.has(r.bahanId)).toBe(false));
  });

  it("kemasan BUBUR & NASI TIM TIDAK dipotong di produksi (via request outlet)", () => {
    const kemasanIds = KEMASAN_BAHAN.map((k) => k.bahanId);
    expect(kemasanIds).not.toContain("b-cb01");  // CUP BUBUR
    expect(kemasanIds).not.toContain("b-ttp01"); // TUTUP
  });
});

// ===== Invariant: bahan baku HANYA dari RENCANA (Langkah 2), kemasan mengikuti AKTUAL (Langkah 3) =====
describe("Invariant — bahan baku TIDAK berubah saat distribusi luberan/menyusut di Langkah 3", () => {
  // Rencana Langkah 1 = SATU-SATUNYA sumber pemotongan bahan baku.
  const RENCANA = PLAN;

  // Skenario aktual di Langkah 3 (distribusi) — bisa berbeda dari rencana:
  // luberan (> rencana), menyusut (< rencana), dan campuran (ada yg naik & turun).
  const AKTUAL_MENYUSUT = { buburD: 140, buburI: 110, timD: 80, timI: 100, oatmeal: 30, puding: 50, abon: 20 };
  const AKTUAL_LUBERAN = { buburD: 160, buburI: 130, timD: 100, timI: 120, oatmeal: 45, puding: 70, abon: 30 };
  const AKTUAL_CAMPURAN = { buburD: 145, buburI: 125, timD: 95, timI: 105, oatmeal: 35, puding: 65, abon: 22 };

  const bahanIds = new Set(["b-brs01", "b-sh01", "b-sb01", "b-sp01", "b-ay01", "b-sl01", "b-dg01", "b-tn01", "b-pud01", "b-oat01", "b-ab01"]);
  const kemasanIds = new Set(KEMASAN_BAHAN.map((k) => k.bahanId));

  it.each([
    ["menyusut", AKTUAL_MENYUSUT],
    ["meluber", AKTUAL_LUBERAN],
    ["campuran", AKTUAL_CAMPURAN]
  ])("Langkah 3 (%s) hanya memotong KEMASAN — bahan baku tidak disentuh", (_nama, aktual) => {
    const cut = calcKemasanKebutuhan({ puding: aktual.puding, oatmeal: aktual.oatmeal });
    cut.forEach((k) => {
      expect(kemasanIds.has(k.bahanId)).toBe(true);
      expect(bahanIds.has(k.bahanId)).toBe(false); // TIDAK ada bahan baku di Langkah 3
    });
    // Kemasan mengikuti jumlah AKTUAL (1 cup/1 tutup per porsi), bukan rencana
    const map = new Map(cut.map((k) => [k.bahanId, k.qty]));
    expect(map.get("b-cuppud01")).toBe(aktual.puding);
    expect(map.get("b-plas01")).toBe(aktual.puding);
    expect(map.get("b-cupoat1")).toBe(aktual.oatmeal);
    expect(map.get("b-ttoat01")).toBe(aktual.oatmeal);
  });

  it("simulasi siklus: setiap bahan baku tercatat TEPAT 1× (dari rencana) di semua skenario", () => {
    // Langkah 2: potong bahan dari RENCANA (sekali, tidak pernah diulang).
    const cutBahan = materialReqs(RENCANA, SETTINGS, VARIANTS);
    const qtyBahan = new Map(cutBahan.map((r) => [r.bahanId, r.qty]));
    expect(qtyBahan.get("b-brs01")).toBeGreaterThan(0);

    for (const aktual of [AKTUAL_MENYUSUT, AKTUAL_LUBERAN, AKTUAL_CAMPURAN]) {
      // Langkah 3: tambah kemasan dari AKTUAL.
      const cutKemasan = calcKemasanKebutuhan({ puding: aktual.puding, oatmeal: aktual.oatmeal });
      const semuaCut = [...cutBahan.map((r) => r.bahanId), ...cutKemasan.map((k) => k.bahanId)];
      // Bahan baku muncul PERSIS 1× di seluruh movement siklus — tidak ada potongan
      // ganda & tidak ada bahan yg ikut menyesuaikan aktual (luberan/menyusut).
      bahanIds.forEach((id) => {
        expect(semuaCut.filter((x) => x === id).length).toBe(1);
      });
      // qty bahan tetap = qty dari RENCANA (tidak berubah walau aktual beda jauh)
      materialReqs(RENCANA, SETTINGS, VARIANTS).forEach((r) => {
        expect(qtyBahan.get(r.bahanId)).toBe(r.qty);
      });
    }
  });

  it("kemasan mengikuti aktual: meluber > rencana, menyusut < rencana", () => {
    const cupPuding = (aktual: any) =>
      calcKemasanKebutuhan({ puding: aktual.puding, oatmeal: aktual.oatmeal }).find((k) => k.bahanId === "b-cuppud01")!.qty;
    expect(cupPuding(AKTUAL_LUBERAN)).toBeGreaterThan(RENCANA.puding); // 70 > 60
    expect(cupPuding(AKTUAL_MENYUSUT)).toBeLessThan(RENCANA.puding);   // 50 < 60
    expect(cupPuding(AKTUAL_CAMPURAN)).toBe(65); // campuran: ikut aktual (65), bukan rencana (60)
  });

  it("hitungMaterialReqs sensitif thd input — aplikasi WAJIB memanggilnya dgn RENCANA saja", () => {
    // Bukti mekanisme: bila helper dipanggil dengan angka AKTUAL, qty bahan berubah
    // (meluber → membesar, menyusut → mengecil). Karena itu Langkah 3 TIDAK boleh
    // memanggil hitungMaterialReqs — hanya Langkah 2 yg memanggil dengan rencana.
    const beras = (t: any) => materialReqs(t, SETTINGS, VARIANTS).find((r) => r.bahanId === "b-brs01")!.qty;
    expect(beras(AKTUAL_LUBERAN)).toBeGreaterThan(beras(RENCANA));
    expect(beras(AKTUAL_MENYUSUT)).toBeLessThan(beras(RENCANA));
  });
});

// ===== loadRencanaGrid — rencana (Langkah 1) terpisah dari distribusi aktual (Langkah 3) =====
describe("loadRencanaGrid — rencana dipertahankan walau distribusi aktual berbeda", () => {
  const OUTLETS = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];
  const TGL = "2026-08-14";

  // Rekaman setelah Langkah 3 disimpan: qty/catatan = DISTRIBUSI AKTUAL (luberan),
  // qtyRencana/catatanRencana = rencana Langkah 1 (disimpan saat saveStep1).
  const reqsSetelahDistribusi = [
    {
      id: "r1", outletId: "o1", produkId: "p-bubur", tanggalKirim: TGL,
      qty: 80, // aktual terkirim (luberan)
      catatan: "[D:50,I:30] [V:Ay,Sl]",
      qtyRencana: 60, // rencana awal
      catatanRencana: "[D:40,I:20] [V:Ay,Sl]"
    },
    {
      id: "r2", outletId: "o2", produkId: "p-puding", tanggalKirim: TGL,
      qty: 35, // aktual
      catatan: "",
      qtyRencana: 25, // rencana
      catatanRencana: ""
    },
    {
      id: "r3", outletId: "o3", produkId: "p-oatmeal", tanggalKirim: TGL,
      qty: 10, catatan: "",
      qtyRencana: 10, catatanRencana: ""
    }
  ];

  it("mengembalikan RENCANA (bukan distribusi aktual) setelah Langkah 3 disimpan", () => {
    const grid = loadRencanaGrid(OUTLETS, reqsSetelahDistribusi, TGL);
    expect(grid.o1.bubur_d).toBe(40);
    expect(grid.o1.bubur_i).toBe(20);
    expect(grid.o2.puding).toBe(25);
    expect(grid.o3.oatmeal).toBe(10);
  });

  it("split D=0 di rencana dihormati ([D:0,I:8] → bubur_d=0, bubur_i=8)", () => {
    const reqs = [{
      id: "r4", outletId: "o1", produkId: "p-bubur", tanggalKirim: TGL,
      qty: 8, catatan: "[D:8,I:0]",
      qtyRencana: 8, catatanRencana: "[D:0,I:8]"
    }];
    const grid = loadRencanaGrid(OUTLETS, reqs, TGL);
    expect(grid.o1.bubur_d).toBe(0);
    expect(grid.o1.bubur_i).toBe(8);
  });

  it("data lama tanpa kolom rencana di-fallback ke qty/catatan", () => {
    const reqs = [{
      id: "r5", outletId: "o1", produkId: "p-nasitim", tanggalKirim: TGL,
      qty: 12, catatan: "[D:12,I:0]",
      qtyRencana: undefined, catatanRencana: undefined
    }];
    const grid = loadRencanaGrid(OUTLETS, reqs, TGL);
    expect(grid.o1.tim_d).toBe(12);
    expect(grid.o1.tim_i).toBe(0);
  });

  it("outlet tanpa record tetap nol di grid", () => {
    const grid = loadRencanaGrid(OUTLETS, reqsSetelahDistribusi, TGL);
    expect(grid.o2.bubur_d).toBe(0);
    expect(grid.o2.bubur_i).toBe(0);
  });
});

// ===== Jurnal keuangan siklus — OH & HPP (alur keuangan) =====
describe("hitungOHValue & hitungHPPValue — nilai jurnal Dr OH / Cr Persediaan", () => {
  // Bahan baku: beras 15.000/kg, sayur 10.000/kg, puding 130 gr/pcs @ 20.000/pcs, oat 180 gr/pcs @ 18.000/pcs
  const BAHAN = [
    { id: "b-brs01", hargaBeli: 15000, konversiGram: 1000 },
    { id: "b-sh01", hargaBeli: 10000, konversiGram: 1000 },
    { id: "b-pud01", hargaBeli: 20000, konversiGram: 130 },
    { id: "b-oat01", hargaBeli: 18000, konversiGram: 180 }
  ];
  // GRAM_EXCLUDED_BAHAN: puding & oat dihitung per pcs (bukan per gram)
  const GRAM_EXCLUDED = new Set(["b-pud01", "b-oat01"]);

  it("menilai OH bahan baku (gram → rupiah, ceil) + kemasan (per pcs)", () => {
    // Beras 1.234 gr → 2 pcs @15.000 (nilaiBahan ceil per satuan) ; sayur 321 gr → 1 pcs @10.000
    const oh = hitungOHValue(
      { beras: 1234, puding: 0, oat: 0, sayurHijau: 321, sayurBuah: 0, sayurProtein: 0 },
      { puding: 0, oatmeal: 0 },
      BAHAN,
      GRAM_EXCLUDED
    );
    expect(oh).toBeGreaterThan(0);
  });

  it("OH puding/oat dikonversi gram → pcs via konversiGram (130/180)", () => {
    // Puding 260 gr → 2 pcs @20.000; oat 540 gr → 3 pcs @18.000
    const oh = hitungOHValue(
      { beras: 0, puding: 260, oat: 540, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 },
      { puding: 0, oatmeal: 0 },
      BAHAN,
      GRAM_EXCLUDED
    );
    expect(oh).toBe(2 * 20000 + 3 * 18000);
  });

  it("nilai 0 bila tidak ada OH", () => {
    const oh = hitungOHValue(
      { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 },
      { puding: 0, oatmeal: 0 },
      BAHAN,
      GRAM_EXCLUDED
    );
    expect(oh).toBe(0);
  });

  it("HPP = pemotongan bahan − OH rusak (biaya barang yang laku)", () => {
    const hpp = hitungHPPValue(1_500_000, 120_000);
    expect(hpp).toBe(1_380_000);
  });

  it("HPP tidak pernah negatif walau OH > pemotongan", () => {
    const hpp = hitungHPPValue(100_000, 250_000);
    expect(hpp).toBe(0);
  });

  it("nilaiPemotonganTanggal hanya menghitung movement OUT bertanggal label", () => {
    const movs = [
      { bahanId: "b-brs01", tipe: "OUT", qty: 2000, keterangan: "Pemakaian Produksi [2026-08-14]" },
      { bahanId: "b-pud01", tipe: "OUT", qty: 6, keterangan: "Pemakaian Kemasan [2026-08-14]" },
      { bahanId: "b-brs01", tipe: "OUT", qty: 5000, keterangan: "Pemakaian Produksi [2026-08-15]" }, // tanggal lain — tidak dihitung
      { bahanId: "b-brs01", tipe: "IN", qty: 1000, keterangan: "Pemakaian Produksi [2026-08-14]" }, // IN — tidak dihitung
      { bahanId: "b-brs01", tipe: "OUT", qty: 3000, keterangan: "RUSAK:OH [2026-08-14]" } // bukan label pemakaian — tidak dihitung
    ];
    const nilai = nilaiPemotonganTanggal(movs, "2026-08-14", BAHAN, GRAM_EXCLUDED);
    // Beras 2.000 gr = 2 × 15.000 = 30.000; puding 6 pcs × 20.000 = 120.000
    expect(nilai).toBe(30_000 + 120_000);
  });
});

// ===== hitungOmzetHarian — total omzet (cash + bank) di Langkah 4 =====
describe("hitungOmzetHarian — total omzet harian (dasar split kas/bank)", () => {
  const OUTLETS2 = [{ id: "o1" }, { id: "o2" }];
  const TGL2 = "2026-08-14";
  const PRODUK = [
    { id: "p-bubur", harga: 20000 },
    { id: "p-nasitim", harga: 18000 },
    { id: "p-oatmeal", harga: 15000 },
    { id: "p-puding", harga: 12000 },
    { id: "p-abon", harga: 10000 }
  ];
  const ZERO = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

  it("penjualan outlet sudah ada → total = Σ qty × harga (tanggal lain diabaikan)", () => {
    const penjualan = [
      { tanggal: TGL2, outletId: "o1", produkId: "p-bubur", qty: 10, harga: 20000 },
      { tanggal: TGL2, outletId: "o2", produkId: "p-puding", qty: 5, harga: 12000 },
      { tanggal: "2026-08-13", outletId: "o1", produkId: "p-bubur", qty: 99, harga: 20000 }
    ];
    const total = hitungOmzetHarian({ penjualan, tanggal: TGL2, outlets: OUTLETS2, distGrid: {}, returGrid: {}, produk: PRODUK });
    expect(total).toBe(10 * 20000 + 5 * 12000);
  });

  it("belum ada penjualan → disimulasikan dari distribusi − retur (auto-create)", () => {
    const distGrid = {
      o1: { ...ZERO, bubur_d: 12, oatmeal: 8, puding: 6, abon: 4 },
      o2: { ...ZERO, tim_d: 10 }
    };
    const returGrid = {
      o1: { ...ZERO, bubur_d: 2 * 118, oatmeal: 1, puding: 1 }, // bubur retur 2 cup (236 gr), oat 1 cup, puding 1 cup
      o2: { ...ZERO, tim_d: 108 } // tim retur 1 cup
    };
    const total = hitungOmzetHarian({ penjualan: [], tanggal: TGL2, outlets: OUTLETS2, distGrid, returGrid, produk: PRODUK });
    // o1: bubur terjual = round((12×118 − 236) ÷ 118) = 10 → 10×20.000
    //     oat = 8−1 = 7 → 7×15.000; puding = 6−1 = 5 → 5×12.000; abon = 4 → 4×10.000
    // o2: tim terjual = round((10×108 − 108) ÷ 108) = 9 → 9×18.000
    expect(total).toBe(10 * 20000 + 7 * 15000 + 5 * 12000 + 4 * 10000 + 9 * 18000);
  });

  it("retur penuh → terjual 0, omzet dari produk lain saja", () => {
    const distGrid = { o1: { ...ZERO, bubur_d: 10 } };
    const returGrid = { o1: { ...ZERO, bubur_d: 10 * 118 } }; // semua bubur retur
    const total = hitungOmzetHarian({ penjualan: [], tanggal: TGL2, outlets: OUTLETS2, distGrid, returGrid, produk: PRODUK });
    expect(total).toBe(0);
  });
});
