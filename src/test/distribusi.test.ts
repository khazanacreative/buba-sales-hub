import { describe, it, expect } from "vitest";
import { BUBUR_BASE, buburCalc, formatDecimal, sumGrid } from "@/lib/produksi-utils";

// =============================================================================
// Pure logic extracted from Distribusi.tsx
// These functions replicate the inline logic from the Distribusi page so we can
// test them without needing to render React components.
// =============================================================================

// ---------- calcRetur ----------
// Basic retur = max(0, sent - sold)
function calcRetur(sent: number, sold: number): number {
  return Math.max(0, sent - sold);
}

// Retur with D/I split proportionally
function calcReturSplit(
  dSent: number,
  iSent: number,
  soldTotal: number
): { dRet: number; iRet: number } {
  const totalSent = dSent + iSent;
  const totalRetur = Math.max(0, totalSent - soldTotal);
  if (totalSent > 0) {
    const dRet = Math.round(totalRetur * (dSent / totalSent));
    return { dRet, iRet: totalRetur - dRet };
  }
  return { dRet: 0, iRet: 0 };
}

// ---------- Recovered ingredients ----------
interface BubaSettings {
  berasTim: number;
  sayurHijauTim: number;
  sayurBrokoliTim: number;
  sayurPutihTim: number;
  oatmealCup: number;
  pudingCup: number;
  abonCup: number;
}

interface OutletRow {
  bubur_d: number;
  bubur_i: number;
  tim_d: number;
  tim_i: number;
  oatmeal: number;
  puding: number;
  abon: number;
}

interface Recovered {
  beras: number;
  puding: number;
  oat: number;
  abon: number;
  sayurHijau: number;
  sayurBrokoli: number;
  sayurPutih: number;
}

function calcRecoveredIngredients(
  distGrid: Record<string, OutletRow>,
  returGrid: Record<string, OutletRow>,
  outlets: { id: string }[],
  settings: BubaSettings
): Recovered {
  const recovered: Recovered = { beras: 0, puding: 0, oat: 0, abon: 0, sayurHijau: 0, sayurBrokoli: 0, sayurPutih: 0 };

  outlets.forEach((o) => {
    const sent = distGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
    const r = returGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

    // Process Bubur variants
    const processBubur = (dSent: number, iSent: number) => {
      [dSent, iSent].forEach((s, idx) => {
        const retField = idx === 0 ? r.bubur_d ?? 0 : r.bubur_i ?? 0;
        if (s > 0) {
          const actualRet = Math.min(retField, s);
          if (actualRet > 0) {
            recovered.beras += buburCalc(actualRet, BUBUR_BASE.beras);
            recovered.sayurHijau += buburCalc(actualRet, BUBUR_BASE.sayurHijau);
            recovered.sayurBrokoli += buburCalc(actualRet, BUBUR_BASE.sayurBrokoli);
            recovered.sayurPutih += buburCalc(actualRet, BUBUR_BASE.sayurPutih);
          }
        }
      });
    };

    // Process Tim variants
    const processTim = (dSent: number, iSent: number) => {
      [dSent, iSent].forEach((s, idx) => {
        const retField = idx === 0 ? r.tim_d ?? 0 : r.tim_i ?? 0;
        if (s > 0) {
          const actualRet = Math.min(retField, s);
          if (actualRet > 0) {
            recovered.beras += actualRet * settings.berasTim;
            recovered.sayurHijau += actualRet * settings.sayurHijauTim;
            recovered.sayurBrokoli += actualRet * settings.sayurBrokoliTim;
            recovered.sayurPutih += actualRet * settings.sayurPutihTim;
          }
        }
      });
    };

    processBubur(sent.bubur_d || 0, sent.bubur_i || 0);
    processTim(sent.tim_d || 0, sent.tim_i || 0);

    // Oatmeal, Puding, Abon
    if (sent.oatmeal > 0) {
      const ar = Math.min(r.oatmeal || 0, sent.oatmeal);
      if (ar > 0) recovered.oat += ar * settings.oatmealCup;
    }
    if (sent.puding > 0) {
      const ar = Math.min(r.puding || 0, sent.puding);
      if (ar > 0) recovered.puding += ar * settings.pudingCup;
    }
    if (sent.abon > 0) {
      const ar = Math.min(r.abon || 0, sent.abon);
      if (ar > 0) recovered.abon += ar * settings.abonCup;
    }
  });

  return recovered;
}

// ---------- Sold calculation (penjualan auto-create logic) ----------
function calcSold(sent: number, returCups: number): number {
  return Math.max(0, sent - Math.min(returCups, sent));
}

// ---------- saveStep4 validation ----------
interface DistTotals {
  buburD: number;
  buburI: number;
  timD: number;
  timI: number;
  oatmeal: number;
  puding: number;
  abon: number;
}

interface ActualCups {
  bubur_1: number;
  bubur_2: number;
  tim_1: number;
  tim_2: number;
  oatmeal: number;
  puding: number;
  abon: number;
}

function validateDistribusi(
  distTotals: DistTotals,
  actualCups: ActualCups,
  names: { bubur1: string; bubur2: string; tim1: string; tim2: string }
): string[] {
  const errors: string[] = [];

  if (distTotals.buburD > actualCups.bubur_1) {
    errors.push(`Distribusi Bubur 1 (${names.bubur1}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburD} cup, Masak: ${actualCups.bubur_1} cup)`);
  }
  if (distTotals.buburI > actualCups.bubur_2) {
    errors.push(`Distribusi Bubur 2 (${names.bubur2}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburI} cup, Masak: ${actualCups.bubur_2} cup)`);
  }
  if (distTotals.timD > actualCups.tim_1) {
    errors.push(`Distribusi Nasi Tim 1 (${names.tim1}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timD} cup, Masak: ${actualCups.tim_1} cup)`);
  }
  if (distTotals.timI > actualCups.tim_2) {
    errors.push(`Distribusi Nasi Tim 2 (${names.tim2}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timI} cup, Masak: ${actualCups.tim_2} cup)`);
  }
  if (distTotals.oatmeal > actualCups.oatmeal) {
    errors.push(`Distribusi Oatmeal melebihi hasil masak aktual! (Terdistribusi: ${distTotals.oatmeal} cup, Masak: ${actualCups.oatmeal} cup)`);
  }
  if (distTotals.puding > actualCups.puding) {
    errors.push(`Distribusi Puding melebihi hasil masak aktual! (Terdistribusi: ${distTotals.puding} cup, Masak: ${actualCups.puding} cup)`);
  }
  if (distTotals.abon > actualCups.abon) {
    errors.push(`Distribusi Abon melebihi hasil masak aktual! (Terdistribusi: ${distTotals.abon} cup, Masak: ${actualCups.abon} cup)`);
  }

  return errors;
}

// ---------- Penjualan auto-creation logic ----------
interface PenjualanItem {
  tanggal: string;
  outletId: string;
  produkId: string;
  qty: number;
  harga: number;
}

function autoCreatePenjualan(
  distGrid: Record<string, OutletRow>,
  returGrid: Record<string, OutletRow>,
  outlets: { id: string }[],
  produk: { id: string; harga: number }[],
  tanggal: string
): PenjualanItem[] {
  const items: PenjualanItem[] = [];

  outlets.forEach((o) => {
    const sent = distGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
    const ret = returGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

    // Bubur
    const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
    const buburRet = (ret.bubur_d || 0) + (ret.bubur_i || 0);
    if (buburSent > 0) {
      const buburSold = calcSold(buburSent, buburRet);
      if (buburSold > 0) {
        const prod = produk.find((p) => p.id === "p-bubur");
        items.push({ tanggal, outletId: o.id, produkId: "p-bubur", qty: buburSold, harga: prod?.harga || 0 });
      }
    }

    // Nasi Tim
    const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
    const timRet = (ret.tim_d || 0) + (ret.tim_i || 0);
    if (timSent > 0) {
      const timSold = calcSold(timSent, timRet);
      if (timSold > 0) {
        const prod = produk.find((p) => p.id === "p-nasitim");
        items.push({ tanggal, outletId: o.id, produkId: "p-nasitim", qty: timSold, harga: prod?.harga || 0 });
      }
    }

    // Helper for other products
    const addSold = (baseId: string, subSent: number, subRetur: number) => {
      if (subSent <= 0) return;
      const sold = calcSold(subSent, subRetur);
      if (sold <= 0) return;
      const prod = produk.find((p) => p.id === baseId);
      items.push({ tanggal, outletId: o.id, produkId: baseId, qty: sold, harga: prod?.harga || 0 });
    };

    addSold("p-oatmeal", sent.oatmeal || 0, ret.oatmeal || 0);
    addSold("p-puding", sent.puding || 0, ret.puding || 0);
    addSold("p-abon", sent.abon || 0, ret.abon || 0);
  });

  return items;
}


// =============================================================================
// TESTS
// =============================================================================

describe("calcRetur", () => {
  it("should return 0 when sold equals sent", () => {
    expect(calcRetur(50, 50)).toBe(0);
  });

  it("should return 0 when sold exceeds sent", () => {
    expect(calcRetur(30, 50)).toBe(0);
  });

  it("should return positive retur when sent exceeds sold", () => {
    expect(calcRetur(50, 30)).toBe(20);
  });

  it("should return sent when nothing is sold", () => {
    expect(calcRetur(100, 0)).toBe(100);
  });

  it("should return 0 when both sent and sold are 0", () => {
    expect(calcRetur(0, 0)).toBe(0);
  });
});

describe("calcReturSplit", () => {
  it("should split retur proportionally between D and I variants", () => {
    // 50 D + 30 I = 80 sent, 60 sold → 20 retur
    // D proportion: 50/80 = 0.625 → 20 * 0.625 = 12.5 → 13 (Math.round)
    // I proportion: 30/80 = 0.375 → 20 * 0.375 = 7.5 → 7
    const result = calcReturSplit(50, 30, 60);
    expect(result.dRet).toBe(13);  // Math.round(20 * 50/80) = Math.round(12.5) = 13
    expect(result.iRet).toBe(7);   // 20 - 13 = 7
  });

  it("should return 0 retur when sold equals sent", () => {
    const result = calcReturSplit(40, 20, 60);
    expect(result.dRet).toBe(0);
    expect(result.iRet).toBe(0);
  });

  it("should return 0 retur when sold exceeds sent", () => {
    const result = calcReturSplit(30, 20, 60);
    expect(result.dRet).toBe(0);
    expect(result.iRet).toBe(0);
  });

  it("should return full sent as retur when nothing is sold", () => {
    const result = calcReturSplit(40, 20, 0);
    // totalSent = 40+20 = 60, totalRetur = max(0, 60-0) = 60
    // dRet = Math.round(60 * 40/60) = Math.round(40) = 40
    // iRet = 60 - 40 = 20
    expect(result.dRet).toBe(40);
    expect(result.iRet).toBe(20);
  });

  it("should return 0 for both when sent is 0", () => {
    const result = calcReturSplit(0, 0, 10);
    expect(result.dRet).toBe(0);
    expect(result.iRet).toBe(0);
  });

  it("should handle single variant (only D)", () => {
    const result = calcReturSplit(60, 0, 40);
    expect(result.dRet).toBe(20);  // totalSent=60, totalRetur=20, dRet=Math.round(20*60/60)=20
    expect(result.iRet).toBe(0);
  });

  it("should handle single variant (only I)", () => {
    const result = calcReturSplit(0, 60, 40);
    expect(result.dRet).toBe(0);
    expect(result.iRet).toBe(20);  // totalSent=60, totalRetur=20, iRet=Math.round(20*60/60)=20
  });
});

describe("calcSold", () => {
  it("should return sent when retur is 0", () => {
    expect(calcSold(50, 0)).toBe(50);
  });

  it("should subtract retur from sent", () => {
    expect(calcSold(50, 10)).toBe(40);
  });

  it("should return 0 when retur equals sent", () => {
    expect(calcSold(50, 50)).toBe(0);
  });

  it("should return 0 when retur exceeds sent", () => {
    expect(calcSold(30, 50)).toBe(0);
  });

  it("should return 0 when both are 0", () => {
    expect(calcSold(0, 0)).toBe(0);
  });
});

describe("validateDistribusi", () => {
  const names = { bubur1: "Daging", bubur2: "Ikan", tim1: "Daging", tim2: "Ikan" };

  it("should return empty errors when all distributions are within limits", () => {
    const distTotals: DistTotals = { buburD: 40, buburI: 30, timD: 20, timI: 10, oatmeal: 15, puding: 10, abon: 5 };
    const actualCups: ActualCups = { bubur_1: 50, bubur_2: 40, tim_1: 30, tim_2: 20, oatmeal: 20, puding: 15, abon: 10 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(0);
  });

  it("should error when buburD exceeds bubur_1", () => {
    const distTotals: DistTotals = { buburD: 60, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 50, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Bubur 1");
    expect(errors[0]).toContain("Daging");
    expect(errors[0]).toContain("60");
    expect(errors[0]).toContain("50");
  });

  it("should error when buburI exceeds bubur_2", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 50, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 40, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Bubur 2");
    expect(errors[0]).toContain("Ikan");
  });

  it("should error when timD exceeds tim_1", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 0, timD: 30, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 20, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Nasi Tim 1");
  });

  it("should error when timI exceeds tim_2", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 0, timD: 0, timI: 25, oatmeal: 0, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 15, oatmeal: 0, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Nasi Tim 2");
  });

  it("should error when oatmeal exceeds actual", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 0, timD: 0, timI: 0, oatmeal: 25, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 20, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Oatmeal");
  });

  it("should error when puding exceeds actual", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 20, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 15, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Puding");
  });

  it("should error when abon exceeds actual", () => {
    const distTotals: DistTotals = { buburD: 0, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 15 };
    const actualCups: ActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 10 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Abon");
  });

  it("should collect multiple errors at once", () => {
    const distTotals: DistTotals = { buburD: 60, buburI: 50, timD: 0, timI: 0, oatmeal: 30, puding: 25, abon: 20 };
    const actualCups: ActualCups = { bubur_1: 50, bubur_2: 40, tim_1: 0, tim_2: 0, oatmeal: 20, puding: 15, abon: 10 };

    const errors = validateDistribusi(distTotals, actualCups, names);
    expect(errors).toHaveLength(5);
  });

  it("should use custom variant names in error messages", () => {
    const customNames = { bubur1: "Ayam", bubur2: "Salmon", tim1: "Ayam", tim2: "Salmon" };
    const distTotals: DistTotals = { buburD: 60, buburI: 0, timD: 0, timI: 0, oatmeal: 0, puding: 0, abon: 0 };
    const actualCups: ActualCups = { bubur_1: 50, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

    const errors = validateDistribusi(distTotals, actualCups, customNames);
    expect(errors[0]).toContain("Ayam");
  });
});

describe("calcRecoveredIngredients", () => {
  const defaultSettings: BubaSettings = {
    berasTim: 20,
    sayurHijauTim: 1.6,
    sayurBrokoliTim: 1.0,
    sayurPutihTim: 0.3,
    oatmealCup: 25.71,
    pudingCup: 13,
    abonCup: 10,
  };

  it("should return zeros when no distribution and no retur", () => {
    const distGrid = {};
    const returGrid = {};
    const outlets = [{ id: "o1" }];

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);
    expect(result.beras).toBe(0);
    expect(result.puding).toBe(0);
    expect(result.oat).toBe(0);
    expect(result.abon).toBe(0);
    expect(result.sayurHijau).toBe(0);
    expect(result.sayurBrokoli).toBe(0);
    expect(result.sayurPutih).toBe(0);
  });

  it("should calculate recovered ingredients from bubur retur correctly", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 60, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 10, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);

    // 10 cups retur of bubur_d
    // Beras: 10 * 100/6 = 166.67
    // SayurHijau: 10 * 8/6 = 13.33
    // SayurBrokoli: 10 * 5/6 = 8.33
    // SayurPutih: 10 * 1.5/6 = 2.5
    expect(result.beras).toBeCloseTo(166.67, 1);
    expect(result.sayurHijau).toBeCloseTo(13.33, 1);
    expect(result.sayurBrokoli).toBeCloseTo(8.33, 1);
    expect(result.sayurPutih).toBeCloseTo(2.50, 1);
    expect(result.puding).toBe(0);
    expect(result.oat).toBe(0);
    expect(result.abon).toBe(0);
  });

  it("should calculate recovered ingredients from nasi tim retur correctly", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 40, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 8, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);

    // 8 cups retur of tim_d
    // Beras: 8 * 20 = 160
    // SayurHijau: 8 * 1.6 = 12.8
    // SayurBrokoli: 8 * 1.0 = 8
    // SayurPutih: 8 * 0.3 = 2.4
    expect(result.beras).toBeCloseTo(160, 1);
    expect(result.sayurHijau).toBeCloseTo(12.8, 1);
    expect(result.sayurBrokoli).toBe(8);
    expect(result.sayurPutih).toBeCloseTo(2.4, 1);
  });

  it("should calculate recovered ingredients from oatmeal, puding, abon retur", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 30, puding: 20, abon: 50 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 5, puding: 3, abon: 10 }
    };

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);

    // Oatmeal: 5 * 25.71 = 128.55
    // Puding: 3 * 13 = 39
    // Abon: 10 * 10 = 100
    expect(result.oat).toBeCloseTo(128.55, 1);
    expect(result.puding).toBe(39);
    expect(result.abon).toBe(100);
    expect(result.beras).toBe(0);
  });

  it("should handle mixed bubur and tim retur for multiple outlets", () => {
    const outlets = [{ id: "o1" }, { id: "o2" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 10, puding: 5, abon: 8 },
      o2: { bubur_d: 40, bubur_i: 20, tim_d: 15, tim_i: 5, oatmeal: 8, puding: 3, abon: 5 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 5, bubur_i: 3, tim_d: 2, tim_i: 1, oatmeal: 2, puding: 1, abon: 2 },
      o2: { bubur_d: 4, bubur_i: 2, tim_d: 1, tim_i: 0, oatmeal: 1, puding: 0, abon: 1 }
    };

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);

    // o1 bubur: 5+3=8 cups bubur retur → 8*100/6=133.33 beras, 8*8/6=10.67 SH, 8*5/6=6.67 SB, 8*1.5/6=2 SP
    // o1 tim: 2+1=3 cups tim retur → 3*20=60 beras, 3*1.6=4.8 SH, 3*1=3 SB, 3*0.3=0.9 SP
    // o1 lainnya: oat 2*25.71=51.42, pud 1*13=13, abon 2*10=20
    //
    // o2 bubur: 4+2=6 cups bubur retur → 6*100/6=100 beras, 6*8/6=8 SH, 6*5/6=5 SB, 6*1.5/6=1.5 SP
    // o2 tim: 1+0=1 cup tim retur → 1*20=20 beras, 1*1.6=1.6 SH, 1*1=1 SB, 1*0.3=0.3 SP
    // o2 lainnya: oat 1*25.71=25.71, pud 0, abon 1*10=10
    //
    // Total beras: 133.33+60+100+20 = 313.33
    // Total SH: 10.67+4.8+8+1.6 = 25.07
    // Total SB: 6.67+3+5+1 = 15.67
    // Total SP: 2+0.9+1.5+0.3 = 4.7
    // Total oat: 51.42+25.71 = 77.13
    // Total puding: 13
    // Total abon: 30

    expect(result.beras).toBeCloseTo(313.33, 0);
    expect(result.sayurHijau).toBeCloseTo(25.07, 0);
    expect(result.sayurBrokoli).toBeCloseTo(15.67, 0);
    expect(result.sayurPutih).toBeCloseTo(4.7, 0);
    expect(result.oat).toBeCloseTo(77.13, 0);
    expect(result.puding).toBe(13);
    expect(result.abon).toBe(30);
  });

  it("should cap retur at sent amount (retur cannot exceed sent)", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 10, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 5, puding: 3, abon: 2 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 999, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 999, puding: 999, abon: 999 }
    };

    const result = calcRecoveredIngredients(distGrid, returGrid, outlets, defaultSettings);

    // Should be capped at sent amount (10 bubur, 5 oatmeal, 3 puding, 2 abon)
    expect(result.beras).toBeCloseTo(10 * 100 / 6, 1); // 166.67
    expect(result.oat).toBeCloseTo(5 * 25.71, 1); // 128.55
    expect(result.puding).toBe(3 * 13); // 39
    expect(result.abon).toBe(2 * 10); // 20
  });
});

describe("autoCreatePenjualan", () => {
  const tanggal = "2026-07-11";
  const produk = [
    { id: "p-bubur", harga: 15000 },
    { id: "p-nasitim", harga: 18000 },
    { id: "p-oatmeal", harga: 12000 },
    { id: "p-puding", harga: 10000 },
    { id: "p-abon", harga: 5000 },
  ];

  it("should create penjualan items for sold products", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 15, puding: 10, abon: 8 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);

    expect(items).toHaveLength(5);
    // Bubur: 80 sent - 0 ret = 80 sold
    expect(items.find(i => i.produkId === "p-bubur")?.qty).toBe(80);
    // Tim: 30 sent - 0 ret = 30 sold
    expect(items.find(i => i.produkId === "p-nasitim")?.qty).toBe(30);
    // Oatmeal: 15 sent - 0 ret = 15 sold
    expect(items.find(i => i.produkId === "p-oatmeal")?.qty).toBe(15);
    // Puding: 10 sold
    expect(items.find(i => i.produkId === "p-puding")?.qty).toBe(10);
    // Abon: 8 sold
    expect(items.find(i => i.produkId === "p-abon")?.qty).toBe(8);
  });

  it("should reduce sold qty by retur", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 15, puding: 10, abon: 8 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 3, puding: 2, abon: 1 }
    };

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);

    // Bubur: 80 sent - 0 ret = 80 sold (retur in grams not cups for bubur)
    const buburItem = items.find(i => i.produkId === "p-bubur");
    expect(buburItem?.qty).toBe(80);

    // Oatmeal: 15 sent - 3 ret = 12 sold
    expect(items.find(i => i.produkId === "p-oatmeal")?.qty).toBe(12);
    // Puding: 10 - 2 = 8 sold
    expect(items.find(i => i.produkId === "p-puding")?.qty).toBe(8);
    // Abon: 8 - 1 = 7 sold
    expect(items.find(i => i.produkId === "p-abon")?.qty).toBe(7);
  });

  it("should not create items when all products are fully returned", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 15, puding: 10, abon: 8 }
    };
    // Retur equals or exceeds sent
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 80, bubur_i: 0, tim_d: 30, tim_i: 0, oatmeal: 15, puding: 10, abon: 8 }
    };

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);
    expect(items).toHaveLength(0);
  });

  it("should handle multiple outlets", () => {
    const outlets = [{ id: "o1" }, { id: "o2" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 15, puding: 10, abon: 8 },
      o2: { bubur_d: 40, bubur_i: 20, tim_d: 15, tim_i: 5, oatmeal: 10, puding: 5, abon: 3 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 },
      o2: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);

    expect(items).toHaveLength(10); // 5 products × 2 outlets
    const o1Items = items.filter(i => i.outletId === "o1");
    const o2Items = items.filter(i => i.outletId === "o2");
    expect(o1Items).toHaveLength(5);
    expect(o2Items).toHaveLength(5);
  });

  it("should use correct harga from produk", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };
    const returGrid: Record<string, OutletRow> = {
      o1: { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }
    };

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);

    const buburItem = items.find(i => i.produkId === "p-bubur");
    expect(buburItem?.harga).toBe(15000);
  });

  it("should return empty array when no distribution", () => {
    const outlets = [{ id: "o1" }];
    const distGrid: Record<string, OutletRow> = {};
    const returGrid: Record<string, OutletRow> = {};

    const items = autoCreatePenjualan(distGrid, returGrid, outlets, produk, tanggal);
    expect(items).toHaveLength(0);
  });
});

describe("sumGrid integration", () => {
  it("should sum grid correctly from produksi-utils", () => {
    const grid = {
      o1: { bubur_d: 50, bubur_i: 30, tim_d: 20, tim_i: 10, oatmeal: 15, puding: 10, abon: 8 },
      o2: { bubur_d: 40, bubur_i: 20, tim_d: 15, tim_i: 5, oatmeal: 10, puding: 5, abon: 3 }
    };

    const totals = sumGrid(grid);

    expect(totals.buburD).toBe(90);
    expect(totals.buburI).toBe(50);
    expect(totals.timD).toBe(35);
    expect(totals.timI).toBe(15);
    expect(totals.oatmeal).toBe(25);
    expect(totals.puding).toBe(15);
    expect(totals.abon).toBe(11);
  });

  it("should handle empty grid", () => {
    const totals = sumGrid({});
    expect(totals.buburD).toBe(0);
    expect(totals.buburI).toBe(0);
    expect(totals.timD).toBe(0);
    expect(totals.timI).toBe(0);
    expect(totals.oatmeal).toBe(0);
    expect(totals.puding).toBe(0);
    expect(totals.abon).toBe(0);
  });
});
