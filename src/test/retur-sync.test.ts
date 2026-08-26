import { describe, it, expect } from "vitest";
import { resolveFreshReturGrid } from "@/lib/produksi-utils";

// =============================================================================
// resolveFreshReturGrid — dipakai renderStep4 (Produksi) untuk menampilkan grid
// retur yang ditampilkan di UI:
// - hasManualReturEdits=true  → nilai state returGrid dipakai APA ADANYA
//   (edit manual admin tidak boleh dihitung ulang dari penjualan)
// - hasManualReturEdits=false → recompute dari penjualan outlet (sisaGram /
//   fallback sent - sold)
// =============================================================================

const outlets = [{ id: "o-gg" }, { id: "o-lain" }];

const emptyRow = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

const makeEmptyGrid = () =>
  Object.fromEntries(outlets.map((o) => [o.id, { ...emptyRow }])) as Record<string, Record<string, number>>;

describe("resolveFreshReturGrid", () => {
  it("mode edit manual: memakai nilai returGrid apa adanya meski penjualan bilang lain", () => {
    // Admin mengedit retur oatmeal gunung-gangsir dari 3 → 1,
    // padahal penjualan outlet masih punya sisaGram=300 (→ hitungan DB = 3).
    const returGrid = makeEmptyGrid();
    returGrid["o-gg"].oatmeal = 1;

    const result = resolveFreshReturGrid({
      outlets,
      returGrid,
      distGrid: { ...makeEmptyGrid(), "o-gg": { ...emptyRow, oatmeal: 3 } },
      existingPenjualan: [
        {
          tanggal: "2026-08-24",
          outletId: "o-gg",
          produkId: "p-oatmeal",
          qty: 0,
          sisaGram: 300,
          variant: "oatmeal",
        },
      ],
      hasManualReturEdits: true,
    });

    expect(result["o-gg"].oatmeal).toBe(1);
  });

  it("tanpa edit manual: recompute oatmeal dari sisaGram penjualan (min dengan dikirim)", () => {
    const result = resolveFreshReturGrid({
      outlets,
      returGrid: makeEmptyGrid(),
      distGrid: { ...makeEmptyGrid(), "o-gg": { ...emptyRow, oatmeal: 3 } },
      existingPenjualan: [
        {
          tanggal: "2026-08-24",
          outletId: "o-gg",
          produkId: "p-oatmeal",
          qty: 0,
          sisaGram: 300,
          variant: "oatmeal",
        },
      ],
      hasManualReturEdits: false,
    });

    // sisaGram 300 < 3 cup dikirim → retur = min(300, 3)... nilai dalam gram/cup
    // sesuai konvensi getCupRetur: record punya sisaGram → min(sisaGram, sentQty)
    expect(result["o-gg"].oatmeal).toBe(3);
  });

  it("tanpa edit manual & tanpa sisaGram: fallback retur = dikirim - terjual", () => {
    const result = resolveFreshReturGrid({
      outlets,
      returGrid: makeEmptyGrid(),
      distGrid: { ...makeEmptyGrid(), "o-gg": { ...emptyRow, oatmeal: 5 } },
      existingPenjualan: [
        {
          tanggal: "2026-08-24",
          outletId: "o-gg",
          produkId: "p-oatmeal",
          qty: 2,
        },
      ],
      hasManualReturEdits: false,
    });

    expect(result["o-gg"].oatmeal).toBe(3); // 5 dikirim - 2 terjual
  });

  it("outlet tanpa record penjualan sama sekali → fallback retur = dikirim (sold dianggap 0)", () => {
    // Perilaku getCupRetur utk oatmeal/puding/abon: tanpa record apa pun,
    // fallback Math.max(0, sentQty - 0). Berbeda dari calcRetur bubur/tim yang
    // punya guard "belum input". Ini perilaku lama yang dipertahankan.
    const result = resolveFreshReturGrid({
      outlets,
      returGrid: makeEmptyGrid(),
      distGrid: { ...makeEmptyGrid(), "o-lain": { ...emptyRow, oatmeal: 4 } },
      existingPenjualan: [
        // hanya outlet lain yang punya record
        {
          tanggal: "2026-08-24",
          outletId: "o-gg",
          produkId: "p-oatmeal",
          qty: 0,
          sisaGram: 100,
          variant: "oatmeal",
        },
      ],
      hasManualReturEdits: false,
    });

    expect(result["o-lain"].oatmeal).toBe(4);
  });

  it("tidak ada penjualan sama sekali & tidak ada edit manual → grid kosong", () => {
    const result = resolveFreshReturGrid({
      outlets,
      returGrid: makeEmptyGrid(),
      distGrid: makeEmptyGrid(),
      existingPenjualan: [],
      hasManualReturEdits: false,
    });

    expect(result["o-gg"].oatmeal).toBe(0);
    expect(result["o-lain"].abon).toBe(0);
  });
});
