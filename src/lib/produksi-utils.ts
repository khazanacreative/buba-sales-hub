// =============================================================================
// BASE RATIOS & HELPERS for Bubur & Nasi Tim calculations
// =============================================================================
//
// Base ratio: Beras:Daging:Air:S.Hijau:S.Brokoli:S.Putih = 100:5:700:8:5:1.5
// Rasio 100/6 menghasilkan sekitar 16.67 gr per cup, jadi hasil dapat berisi desimal.

export const BUBUR_BASE = {
  beras: 100,
  daging: 5,
  air: 700,
  sayurHijau: 8,
  sayurBrokoli: 5,
  sayurPutih: 1.5, // = 3/2
};

export const formatDecimal = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/(?:\.0+|0+)$/, "");
};

export const buburCalc = (cups: number, baseAmount: number) => (cups * baseAmount) / 6;

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

// Load grid from permohonanStok records for a given date
export function loadGridFromReqs(
  outlets: { id: string }[],
  permohonanStok: any[],
  tanggal: string
): OutletGrid {
  const grid = createEmptyGrid(outlets);
  const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
  dayReqs.forEach((r: any) => {
    if (!grid[r.outletId]) return;
    const split = parseSplit(r.catatan || "");
    if (r.produkId === "p-bubur") {
      grid[r.outletId].bubur_d = split.d || r.qty;
      grid[r.outletId].bubur_i = split.i || 0;
    } else if (r.produkId === "p-nasitim") {
      grid[r.outletId].tim_d = split.d || r.qty;
      grid[r.outletId].tim_i = split.i || 0;
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
