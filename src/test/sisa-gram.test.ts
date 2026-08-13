import { describe, it, expect } from "vitest";
import { sisaGramToCups, OH_MIN_GRAM, hitungTerjualOh, BUBUR_GRAM_PEMBULATAN, TIM_GRAM_PEMBULATAN } from "@/lib/produksi-utils";

/**
 * SOP Menghitung Produk Bubur & Nasi Tim Terjual (aturan terbaru):
 *   Terjual = (Stok Awal gr − OH gr) ÷ Gram Pembulatan, dibulatkan biasa (Math.round)
 *   Gram Pembulatan: Bubur 118 gr, Nasi Tim 108 gr.
 *   Contoh: stok 12 cup × 118 = 1.416g − OH 149g = 1.267g; 1.267 ÷ 118 = 10,737 → terjual 11.
 *           stok 12 cup × 108 = 1.296g − OH 213g = 1.083g; 1.083 ÷ 108 = 10,028 → terjual 10.
 *
 * Konversi PEMOTONGAN STOK (RUSAK bahan baku) memakai gram aktual 118/108
 * dengan aturan OH 50g (sisaGramToCups): sisa gram ÷ gram/cup, lalu baru
 * dibulatkan naik 1 cup jika angka desimalnya > 0,5 (mis. 541g ÷ 108 = 5,009
 * → 5 cup; 85g ÷ 118 = 0,72 → 1 cup).
 */

describe("sisaGramToCups — konversi RUSAK bahan baku (gram aktual 118/108, aturan 50g)", () => {
  it("batas minimal sisa adalah 50 gram", () => {
    expect(OH_MIN_GRAM).toBe(50);
  });

  it("sisa 0 gr → 0 cup", () => {
    expect(sisaGramToCups(0, 118)).toBe(0);
    expect(sisaGramToCups(0, 108)).toBe(0);
  });

  it("sisa ≤ 50 gr → 0 cup", () => {
    expect(sisaGramToCups(50, 118)).toBe(0);
    expect(sisaGramToCups(49, 118)).toBe(0);
    expect(sisaGramToCups(30, 118)).toBe(0);
  });

  it("sisa > 50 gr tapi kurang dari setengah cup → 0 cup sisa", () => {
    // 51/118 = 0,43 (< 0,5) → 0 cup; 85/118 = 0,72 (> 0,5) → 1 cup
    expect(sisaGramToCups(51, 118)).toBe(0);
    expect(sisaGramToCups(85, 118)).toBe(1); // contoh SOP
    expect(sisaGramToCups(90, 108)).toBe(1);
  });

  it("sisa pas 1 cup → 1 cup", () => {
    expect(sisaGramToCups(118, 118)).toBe(1);
    expect(sisaGramToCups(108, 108)).toBe(1);
  });

  it("sisa lebih dari 1 cup → hanya bulat naik jika lebiihannya > 0,5 cup", () => {
    expect(sisaGramToCups(130, 118)).toBe(1); // 130/118 = 1,10 → lebiihan 0,10 → 1 cup
    expect(sisaGramToCups(590, 118)).toBe(5); // 590/118 = 5 cup
    expect(sisaGramToCups(540, 108)).toBe(5);
    expect(sisaGramToCups(541, 108)).toBe(5); // 541/108 = 5,009 → tetap 5 cup
  });

  it("nilai negatif / NaN diperlakukan sebagai 0", () => {
    expect(sisaGramToCups(-10, 118)).toBe(0);
    expect(sisaGramToCups(Number.NaN, 118)).toBe(0);
  });
});

describe("hitungTerjualOh — pembulatan SETELAH gramasi (gram pembulatan 118/108)", () => {
  it("gram pembulatan: Bubur 118, Nasi Tim 108", () => {
    expect(BUBUR_GRAM_PEMBULATAN).toBe(118);
    expect(TIM_GRAM_PEMBULATAN).toBe(108);
  });

  it("contoh user Kenongo (12-8): bubur 12 cup, OH 149g → terjual 11", () => {
    // Stok awal 12 × 118 = 1.416; 1.416 − 149 = 1.267; 1.267 ÷ 118 = 10,737 → 11
    expect(hitungTerjualOh(12, 149, BUBUR_GRAM_PEMBULATAN)).toBe(11);
  });

  it("contoh user Kesambi (12-8): nasi tim 12 cup, OH 213g → terjual 10", () => {
    // Stok awal 12 × 108 = 1.296; 1.296 − 213 = 1.083; 1.083 ÷ 108 = 10,028 → 10
    expect(hitungTerjualOh(12, 213, TIM_GRAM_PEMBULATAN)).toBe(10);
  });

  it("contoh SOP 1: stok awal 5 cup, OH 85g → terjual 4", () => {
    expect(hitungTerjualOh(5, 85, BUBUR_GRAM_PEMBULATAN)).toBe(4);
  });

  it("contoh SOP 2: stok awal 26 cup (3.068g), OH 90g → terjual 25 BUKAN 26", () => {
    // (26 × 118 − 90) ÷ 118 = 2.978 ÷ 118 = 25,237 → 25
    const sold = hitungTerjualOh(26, 90, BUBUR_GRAM_PEMBULATAN);
    expect(sold).toBe(25);
    expect(sold).not.toBe(26);
  });

  it("OH 0 gr → semua terjual", () => {
    expect(hitungTerjualOh(12, 0, BUBUR_GRAM_PEMBULATAN)).toBe(12);
    expect(hitungTerjualOh(5, 40, BUBUR_GRAM_PEMBULATAN)).toBe(5);
  });

  it("OH tidak boleh melebihi distribusi (clamp ke 0)", () => {
    expect(hitungTerjualOh(5, 9999, BUBUR_GRAM_PEMBULATAN)).toBe(0);
  });

  it("tanpa distribusi → 0", () => {
    expect(hitungTerjualOh(0, 50, BUBUR_GRAM_PEMBULATAN)).toBe(0);
  });

  it("nilai negatif / NaN OH diperlakukan sebagai 0", () => {
    expect(hitungTerjualOh(12, -10, BUBUR_GRAM_PEMBULATAN)).toBe(12);
    expect(hitungTerjualOh(12, Number.NaN, BUBUR_GRAM_PEMBULATAN)).toBe(12);
  });
});
