import { describe, it, expect } from "vitest";

// Replicate the sayur calculation logic from Produksi.tsx materialReqs
function calcSayurReqs(
  totals: { buburD: number; buburI: number; timD: number; timI: number },
  settings: {
    sayurHijauBubur: number; sayurBrokoliBubur: number; sayurPutihBubur: number;
    sayurHijauTim: number; sayurBrokoliTim: number; sayurPutihTim: number;
  }
) {
  const shGr = Math.round(
    (totals.buburD + totals.buburI) * settings.sayurHijauBubur +
    (totals.timD + totals.timI) * settings.sayurHijauTim
  );
  const sbGr = Math.round(
    (totals.buburD + totals.buburI) * settings.sayurBrokoliBubur +
    (totals.timD + totals.timI) * settings.sayurBrokoliTim
  );
  const spGr = Math.round(
    (totals.buburD + totals.buburI) * settings.sayurPutihBubur +
    (totals.timD + totals.timI) * settings.sayurPutihTim
  );
  return { shGr, sbGr, spGr };
}

// Corrected DEFAULT_SETTINGS values (from store.ts after fix)
const DEFAULT_SAYUR = {
  sayurHijauBubur: 1.33,
  sayurBrokoliBubur: 0.83,
  sayurPutihBubur: 0.25,
  sayurHijauTim: 1.60,
  sayurBrokoliTim: 1.00,
  sayurPutihTim: 0.30,
};

describe("Sayur material requirements calculation", () => {
  it("should calculate sayur grams for mixed bubur + tim production", () => {
    const totals = { buburD: 50, buburI: 30, timD: 40, timI: 20 };
    const result = calcSayurReqs(totals, DEFAULT_SAYUR);

    // SH: (50+30)*1.33 + (40+20)*1.60 = 106.4 + 96 = 202.4 → 202
    // SB: (50+30)*0.83 + (40+20)*1.00 = 66.4 + 60 = 126.4 → 126
    // SP: (50+30)*0.25 + (40+20)*0.30 = 20 + 18 = 38
    expect(result.shGr).toBe(202);
    expect(result.sbGr).toBe(126);
    expect(result.spGr).toBe(38);
  });

  it("should return 0 when no production planned", () => {
    const totals = { buburD: 0, buburI: 0, timD: 0, timI: 0 };
    const result = calcSayurReqs(totals, DEFAULT_SAYUR);

    expect(result.shGr).toBe(0);
    expect(result.sbGr).toBe(0);
    expect(result.spGr).toBe(0);
  });

  it("should calculate sayur for bubur only", () => {
    const totals = { buburD: 100, buburI: 0, timD: 0, timI: 0 };
    const result = calcSayurReqs(totals, DEFAULT_SAYUR);

    // SH: 100*1.33 = 133
    // SB: 100*0.83 = 83
    // SP: 100*0.25 = 25
    expect(result.shGr).toBe(133);
    expect(result.sbGr).toBe(83);
    expect(result.spGr).toBe(25);
  });

  it("should calculate sayur for nasi tim only", () => {
    const totals = { buburD: 0, buburI: 0, timD: 75, timI: 25 };
    const result = calcSayurReqs(totals, DEFAULT_SAYUR);

    // SH: (75+25)*1.60 = 160
    // SB: (75+25)*1.00 = 100
    // SP: (75+25)*0.30 = 30
    expect(result.shGr).toBe(160);
    expect(result.sbGr).toBe(100);
    expect(result.spGr).toBe(30);
  });

  it("should calculate sayur for large scale production", () => {
    const totals = { buburD: 500, buburI: 300, timD: 200, timI: 100 };
    const result = calcSayurReqs(totals, DEFAULT_SAYUR);

    // SH: (500+300)*1.33 + (200+100)*1.60 = 1064 + 480 = 1544
    // SB: (500+300)*0.83 + (200+100)*1.00 = 664 + 300 = 964
    // SP: (500+300)*0.25 + (200+100)*0.30 = 200 + 90 = 290
    expect(result.shGr).toBe(1544);
    expect(result.sbGr).toBe(964);
    expect(result.spGr).toBe(290);
  });
});

describe("Sayur per-cup gramasi matches formula ratio", () => {
  // Bubur: per 100gr beras = 6 cup → beras per cup = 100/6 ≈ 16.67
  // Ratio: Beras:Ikan:Air:S.Hijau:S.Buah:S.P = 100:5:700:8:5:1.5
  // Sayur per cup = (100/6) × 8/100 = 8/6, (100/6) × 5/100 = 5/6, (100/6) × 1.5/100 = 1.5/6
  it("Bubur sayur values should match 100:5:700:8:5:1.5 ratio", () => {
    expect(DEFAULT_SAYUR.sayurHijauBubur).toBeCloseTo(8 / 6, 2);    // 1.333...
    expect(DEFAULT_SAYUR.sayurBrokoliBubur).toBeCloseTo(5 / 6, 2);  // 0.833...
    expect(DEFAULT_SAYUR.sayurPutihBubur).toBeCloseTo(1.5 / 6, 2);  // 0.25
  });

  // Nasi Tim: per 100gr beras = 5 cup → beras per cup = 20
  // Ratio: Beras:Ikan:Air:S.Hijau:S.Buah:S.P = 100:4:600:8:5:1.5
  // Sayur per cup = 20 × 8/100 = 1.6, 20 × 5/100 = 1.0, 20 × 1.5/100 = 0.3
  it("Nasi Tim sayur values should match 100:4:600:8:5:1.5 ratio", () => {
    expect(DEFAULT_SAYUR.sayurHijauTim).toBeCloseTo(20.00 * 8 / 100, 2);  // 1.6
    expect(DEFAULT_SAYUR.sayurBrokoliTim).toBeCloseTo(20.00 * 5 / 100, 2); // 1.0
    expect(DEFAULT_SAYUR.sayurPutihTim).toBeCloseTo(20.00 * 1.5 / 100, 2); // 0.3
  });
});

describe("Sayur retur calculation (saveStep5 logic)", () => {
  // Retur sayur per cup: actualReturCups * settings.sayur*Bubur/Tim
  it("should calculate sayur retur from bubur returns correctly", () => {
    const actualRetur = 10; // 10 cups returned
    const settings = DEFAULT_SAYUR;

    const returSH = actualRetur * settings.sayurHijauBubur;
    const returSB = actualRetur * settings.sayurBrokoliBubur;
    const returSP = actualRetur * settings.sayurPutihBubur;

    expect(returSH).toBeCloseTo(13.3, 1);
    expect(returSB).toBeCloseTo(8.3, 1);
    expect(returSP).toBeCloseTo(2.5, 1);
  });

  it("should calculate sayur retur from tim returns correctly", () => {
    const actualRetur = 10; // 10 cups returned
    const settings = DEFAULT_SAYUR;

    const returSH = actualRetur * settings.sayurHijauTim;
    const returSB = actualRetur * settings.sayurBrokoliTim;
    const returSP = actualRetur * settings.sayurPutihTim;

    expect(returSH).toBeCloseTo(16.0, 1);
    expect(returSB).toBeCloseTo(10.0, 1);
    expect(returSP).toBeCloseTo(3.0, 1);
  });

  it("should handle mixed bubur and tim retur", () => {
    const returBubur = 8; // cups
    const returTim = 5;   // cups
    const settings = DEFAULT_SAYUR;

    const totalSH = returBubur * settings.sayurHijauBubur + returTim * settings.sayurHijauTim;
    const totalSB = returBubur * settings.sayurBrokoliBubur + returTim * settings.sayurBrokoliTim;
    const totalSP = returBubur * settings.sayurPutihBubur + returTim * settings.sayurPutihTim;

    expect(totalSH).toBeCloseTo(8 * 1.33 + 5 * 1.60, 2); // 10.64 + 8 = 18.64
    expect(totalSB).toBeCloseTo(8 * 0.83 + 5 * 1.00, 2); // 6.64 + 5 = 11.64
    expect(totalSP).toBeCloseTo(8 * 0.25 + 5 * 0.30, 2); // 2.0 + 1.5 = 3.5
  });
});
