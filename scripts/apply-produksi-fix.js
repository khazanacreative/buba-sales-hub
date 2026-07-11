import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.resolve(__dirname, "../src/pages/Produksi.tsx");
let content = fs.readFileSync(filePath, "utf-8");
// Normalize line endings to LF for consistent matching
content = content.replace(/\r\n/g, "\n");
let changes = 0;

function replace(oldStr, newStr, label) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    console.log("✅ " + label);
    changes++;
  } else {
    console.log("❌ " + label + " — NOT FOUND");
  }
}

// ===== CHANGE 1: serializeSplit with variant IDs =====
// Old: no [I:...] section, 4 params
replace(
  `  // Serialize split + variant names into catatan
  // Format: [D:X,I:Y] [V:v1Name,v2Name] rest
  // v1Name/v2Name = nama varian untuk bubur/tim 1 dan 2
  const serializeSplit = (d: number, i: number, originalCatatan = "", variant1 = "", variant2 = "") => {
    const cleanCat = originalCatatan.replace(/\\[D:\\d+,I:\\d+\\]\\s*/, "").replace(/\\[V:[^\\]]*\\]\\s*/, "");
    const variantPart = (variant1 || variant2) ? \`[V:\${variant1},\${variant2}] \` : "";
    return \`[D:\${d},I:\${i}] \${variantPart}\${cleanCat}\`.trim();
  };`,
  `  // Serialize split + variant names into catatan
  // Format: [D:X,I:Y] [V:v1Name,v2Name] [I:v1Id,v2Id] rest
  // v1Name/v2Name = nama varian untuk bubur/tim 1 dan 2
  // v1Id/v2Id = ID bahan untuk varian (disimpan agar bisa di-restore saat load)
  const serializeSplit = (d: number, i: number, originalCatatan = "", variant1 = "", variant2 = "", variantId1 = "", variantId2 = "") => {
    const cleanCat = originalCatatan.replace(/\\[D:\\d+,I:\\d+\\]\\s*/, "").replace(/\\[V:[^\\]]*\\]\\s*/, "").replace(/\\[I:[^\\]]*\\]\\s*/, "");
    const variantPart = (variant1 || variant2) ? \`[V:\${variant1},\${variant2}] \` : "";
    const idPart = (variantId1 || variantId2) ? \`[I:\${variantId1},\${variantId2}] \` : "";
    return \`[D:\${d},I:\${i}] \${variantPart}\${idPart}\${cleanCat}\`.trim();
  };`,
  "CHANGE 1: serializeSplit updated with variant IDs"
);

// ===== CHANGE 2: Add parseVariantIds function =====
replace(
  `  // Parse variant names from catatan
  const parseVariants = (catatan: string) => {
    const match = catatan?.match(/\\[V:([^,\\]]+),([^,\\]]+)\\]/);
    if (match) {
      return { v1: match[1], v2: match[2] };
    }
    return { v1: "", v2: "" };
  };

  // Load plan for date`,
  `  // Parse variant names from catatan
  const parseVariants = (catatan: string) => {
    const match = catatan?.match(/\\[V:([^,\\]]+),([^,\\]]+)\\]/);
    if (match) {
      return { v1: match[1], v2: match[2] };
    }
    return { v1: "", v2: "" };
  };

  // Parse variant IDs from catatan
  const parseVariantIds = (catatan: string) => {
    const match = catatan?.match(/\\[I:([^,\\]]+),([^,\\]]+)\\]/);
    if (match) {
      return { v1: match[1], v2: match[2] };
    }
    return { v1: "", v2: "" };
  };

  // Load plan for date`,
  "CHANGE 2: parseVariantIds function added"
);

// ===== CHANGE 3: Add variant loading in useEffect =====
replace(
  `      // Load Step 3
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);`,
  `      // Load variant selections from database
      const dayReqsForVariant = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
      const buburReq = dayReqsForVariant.find((r: any) => r.produkId === "p-bubur");
      if (buburReq) {
        // First try to get variant IDs from [I:...] section
        const ids = parseVariantIds(buburReq.catatan || "");
        if (ids.v1 && bahan.some((b: any) => b.id === ids.v1)) setBubur1Variant(ids.v1);
        if (ids.v2 && bahan.some((b: any) => b.id === ids.v2)) setBubur2Variant(ids.v2);
        
        // Fallback: parse names from [V:...] and look up by name (for backward compatibility)
        if (!ids.v1 || !bahan.some((b: any) => b.id === ids.v1)) {
          const names = parseVariants(buburReq.catatan || "");
          if (names.v1) {
            const found = bahan.find((b: any) => b.nama.toLowerCase() === names.v1.toLowerCase());
            if (found) setBubur1Variant(found.id);
          }
          if (names.v2) {
            const found = bahan.find((b: any) => b.nama.toLowerCase() === names.v2.toLowerCase());
            if (found) setBubur2Variant(found.id);
          }
        }
      }

      const timReq = dayReqsForVariant.find((r: any) => r.produkId === "p-nasitim");
      if (timReq) {
        const ids = parseVariantIds(timReq.catatan || "");
        if (ids.v1 && bahan.some((b: any) => b.id === ids.v1)) setTim1Variant(ids.v1);
        if (ids.v2 && bahan.some((b: any) => b.id === ids.v2)) setTim2Variant(ids.v2);
        
        if (!ids.v1 || !bahan.some((b: any) => b.id === ids.v1)) {
          const names = parseVariants(timReq.catatan || "");
          if (names.v1) {
            const found = bahan.find((b: any) => b.nama.toLowerCase() === names.v1.toLowerCase());
            if (found) setTim1Variant(found.id);
          }
          if (names.v2) {
            const found = bahan.find((b: any) => b.nama.toLowerCase() === names.v2.toLowerCase());
            if (found) setTim2Variant(found.id);
          }
        }
      }

      // Load Step 3
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);`,
  "CHANGE 3: Variant loading logic added in useEffect"
);

// ===== CHANGE 4: saveStep1 bubur =====
replace(
  `          catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0, "", bubur1Name, bubur2Name)`,
  `          catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0, "", bubur1Name, bubur2Name, bubur1Variant, bubur2Variant)`,
  "CHANGE 4: saveStep1 bubur serializeSplit updated"
);

// ===== CHANGE 5: saveStep1 tim =====
replace(
  `          catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0, "", tim1Name, tim2Name)`,
  `          catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0, "", tim1Name, tim2Name, tim1Variant, tim2Variant)`,
  "CHANGE 5: saveStep1 tim serializeSplit updated"
);

// ===== CHANGE 6: saveStep4 bubur =====
replace(
  `        notes = serializeSplit(outletAlloc.bubur_d || 0, outletAlloc.bubur_i || 0, r.catatan, buburV1, buburV2);`,
  `        notes = serializeSplit(outletAlloc.bubur_d || 0, outletAlloc.bubur_i || 0, r.catatan, buburV1, buburV2, bubur1Variant, bubur2Variant);`,
  "CHANGE 6: saveStep4 bubur serializeSplit updated"
);

// ===== CHANGE 7: saveStep4 tim =====
replace(
  `        notes = serializeSplit(outletAlloc.tim_d || 0, outletAlloc.tim_i || 0, r.catatan, timV1, timV2);`,
  `        notes = serializeSplit(outletAlloc.tim_d || 0, outletAlloc.tim_i || 0, r.catatan, timV1, timV2, tim1Variant, tim2Variant);`,
  "CHANGE 7: saveStep4 tim serializeSplit updated"
);

// ===== CHANGE 8: requestWarehouse delete old + recreate =====
replace(
  `  const requestWarehouse = async () => {
    if (isWarehouseRequested) return toast.error("Bahan baku untuk tanggal ini sudah dipotong dari gudang!");

    await Promise.all(materialReqs.map(r => {
      return db.addStokMov({
        tanggal,
        bahanId: r.bahanId,
        tipe: "OUT",
        qty: r.qty,
        keterangan: \`Pemakaian Produksi [\${tanggal}]\`
      });
    }));

    toast.success("Bahan baku berhasil dipotong dari stok gudang!");
    setStep(3);
  };`,
  `  const requestWarehouse = async () => {
    // Hapus pemotongan stok lama untuk tanggal ini, lalu buat ulang dengan data terbaru
    const existingMov = (stokMov || []).filter(
      (m: any) => m.tanggal === tanggal && m.tipe === "OUT" && m.keterangan?.includes("Pemakaian Produksi")
    );
    for (const m of existingMov) {
      await db.deleteStokMov(m.id);
    }

    await Promise.all(materialReqs.map(r => {
      return db.addStokMov({
        tanggal,
        bahanId: r.bahanId,
        tipe: "OUT",
        qty: r.qty,
        keterangan: \`Pemakaian Produksi [\${tanggal}]\`
      });
    }));

    toast.success("Bahan baku berhasil dipotong dari stok gudang!");
    setStep(3);
  };`,
  "CHANGE 8: requestWarehouse updated (delete old + recreate)"
);

// Write back
fs.writeFileSync(filePath, content, "utf-8");
console.log(`\n✅ ${changes}/8 changes applied successfully!`);
