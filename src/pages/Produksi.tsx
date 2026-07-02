import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, saldoBahan, getBubaSettings } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Check, X, Clock, ArrowRight, ArrowLeft, ClipboardList, Send, RotateCcw, ShoppingBag, Calculator, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { AkunKategori } from "@/lib/types";

// Base ratios for Bubur (per 100gr beras = 6 cup)
// Base ratio: Beras:Daging:Air:S.Hijau:S.Brokoli:S.Putih = 100:5:700:8:5:1.5
// Rasio 100/6 menghasilkan sekitar 16.67 gr per cup, jadi hasil dapat berisi desimal.
const BUBUR_BASE = {
  beras: 100,
  daging: 5,
  air: 700,
  sayurHijau: 8,
  sayurBrokoli: 5,
  sayurPutih: 1.5, // = 3/2
};

const formatDecimal = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/(?:\.0+|0+)$/, "");
};

const buburCalc = (cups: number, baseAmount: number) => (cups * baseAmount) / 6;

// === MAIN COMPONENT ===
export default function Produksi() {
  const dbState = useDB();
  const { user } = useAuth();
  const { produk = [], produksi = [], penjualan = [], bahan = [], permohonanStok = [], outlets = [], stokMov = [] } = dbState;

  const [tanggal, setTanggal] = useState(todayISO());
  const [bubur1Variant, setBubur1Variant] = useState("b-ay01"); // default AYAM
  const [bubur2Variant, setBubur2Variant] = useState("b-sl01"); // default SALMON
  const [tim1Variant, setTim1Variant] = useState("b-ay01"); // default AYAM
  const [tim2Variant, setTim2Variant] = useState("b-sl01"); // default SALMON
  
  const hasUserModifiedGrids = useRef(false);

  // Reset modification flag when date changes — prevents background Supabase
  // polling/real-time updates from resetting user input mid-edit.
  useEffect(() => {
    hasUserModifiedGrids.current = false;
  }, [tanggal]);

  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("siklus"); // siklus, riwayat
  const [range, setRange] = useState<DateRange>({});

  const [step1OutletId, setStep1OutletId] = useState("");
  const [expandedOutlets, setExpandedOutlets] = useState<Record<string, boolean>>({});
  const [recipeExpanded, setRecipeExpanded] = useState(false);
  const [estimasiExpanded, setEstimasiExpanded] = useState(false);
  const [settings, setSettings] = useState(getBubaSettings());
  useEffect(() => {
    const handler = () => setSettings(getBubaSettings());
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);
  const [step4OutletId, setStep4OutletId] = useState("");
  const [step5OutletId, setStep5OutletId] = useState("");

  useEffect(() => {
    if (outlets.length > 0) {
      if (!step1OutletId) setStep1OutletId(outlets[0].id);
      if (!step4OutletId) setStep4OutletId(outlets[0].id);
      if (!step5OutletId) setStep5OutletId(outlets[0].id);
    }
  }, [outlets, step1OutletId, step4OutletId, step5OutletId]);

  const filtered = useMemo(() => {
    return (produksi || []).filter((p: any) => {
      return inRange(p.tanggal, range);
    });
  }, [produksi, range]);

  const onImport = (rows: any[]) => {
    const items = rows
      .map((r) => {
        const p = produk.find((x) => x.nama.toLowerCase() === String(r.Produk ?? r.produk ?? "").toLowerCase());
        const tgl = String(r.Tanggal ?? r.tanggal ?? "").slice(0, 10);
        const qtyRencana = Number(r.Rencana ?? r.rencana ?? r.QtyRencana ?? r.qty_rencana ?? 0);
        const qtyRealisasi = Number(r.Realisasi ?? r.realisasi ?? r.QtyRealisasi ?? r.qty_realisasi ?? 0);
        if (!p || !tgl || (qtyRencana <= 0 && qtyRealisasi <= 0)) return null;
        return {
          tanggal: tgl,
          produkId: p.id,
          qtyRencana,
          qtyRealisasi
        };
      })
      .filter(Boolean) as any[];
    if (!items.length) {
      return toast.error("Tidak ada data valid (kolom: Tanggal, Produk, Rencana, Realisasi)");
    }
    db.addProduksiBulk(items);
    toast.success(`${items.length} riwayat produksi berhasil di-import`);
  };
  
  const menuOptions = useMemo(() => {
    return (bahan || []).filter(b => [
      "b-ay01", "b-dg01", "b-ck01", // meats
      "b-sl01", "b-tn01", "b-tg01", "b-gr01", "b-kk01", "b-dr01" // fish
    ].includes(b.id));
  }, [bahan]);

  const bubur1Name = useMemo(() => {
    return (bahan || []).find(x => x.id === bubur1Variant)?.nama ?? "Daging";
  }, [bubur1Variant, bahan]);

  const bubur2Name = useMemo(() => {
    return (bahan || []).find(x => x.id === bubur2Variant)?.nama ?? "Ikan";
  }, [bubur2Variant, bahan]);

  const tim1Name = useMemo(() => {
    return (bahan || []).find(x => x.id === tim1Variant)?.nama ?? "Daging";
  }, [tim1Variant, bahan]);

  const tim2Name = useMemo(() => {
    return (bahan || []).find(x => x.id === tim2Variant)?.nama ?? "Ikan";
  }, [tim2Variant, bahan]);

  // STEP 1 STATES
  const [planGrid, setPlanGrid] = useState<Record<string, Record<string, number>>>({});
  const [searchOutlet, setSearchOutlet] = useState("");

  // STEP 3 STATES
  const [actualGrams, setActualGrams] = useState({
    bubur_1: 0,
    bubur_2: 0,
    tim_1: 0,
    tim_2: 0,
    oatmeal: 0,
    puding: 0,
    abon: 0
  });
  const [actualCups, setActualCups] = useState({
    bubur_1: 0,
    bubur_2: 0,
    tim_1: 0,
    tim_2: 0,
    oatmeal: 0,
    puding: 0,
    abon: 0
  });

  // STEP 4 STATES
  const [distGrid, setDistGrid] = useState<Record<string, Record<string, number>>>({});

  // STEP 5 STATES
  const [returGrid, setReturGrid] = useState<Record<string, Record<string, number>>>({});
  const [closingCycle, setClosingCycle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Track last synced penjualan signature for the new-data indicator
  const lastSyncedSalesRef = useRef<string>("");

  // Parse [D:X, I:Y] split from catatan
  const parseSplit = (catatan: string) => {
    const match = catatan?.match(/D:(\d+),I:(\d+)/);
    if (match) {
      return { d: Number(match[1]), i: Number(match[2]) };
    }
    return { d: 0, i: 0 };
  };

  const serializeSplit = (d: number, i: number, originalCatatan = "") => {
    const cleanCat = originalCatatan.replace(/\[D:\d+,I:\d+\]\s*/, "");
    return `[D:${d},I:${i}] ${cleanCat}`.trim();
  };

  // Load plan for date
  const loadPlanForDate = (dateStr: string) => {
    const grid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      grid[o.id] = {
        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
        oatmeal: 0, puding: 0, abon: 0
      };
    });

    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === dateStr);
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
    setPlanGrid(grid);
  };

  // Load grids from DB on date change or initial outlet load.
  // ⚠️ Depends on [tanggal, outlets, penjualan] — penjualan included so
  // that when outlet saves sisa penjualan via Laporan page, the returGrid
  // in Step 5 auto-updates with the latest sales data.
  // hasUserModifiedGrids ref prevents re-init if user has manually edited
  // any grid input — safe against background-polling reset.
  useEffect(() => {
    if (hasUserModifiedGrids.current) return;
    if (tanggal && outlets.length > 0) {
      loadPlanForDate(tanggal);

      // Load Step 3
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);
      const newActualGrams = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };
      const newActualCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };
      
      const buburProds = dayProds.filter((p: any) => p.produkId === "p-bubur");
      const timProds = dayProds.filter((p: any) => p.produkId === "p-nasitim");
      
      if (buburProds.length > 0) {
        newActualCups.bubur_1 = buburProds[0].qtyRealisasi;
        newActualGrams.bubur_1 = buburProds[0].qtyRealisasi * 118;
        if (buburProds.length > 1) {
          newActualCups.bubur_2 = buburProds[1].qtyRealisasi;
          newActualGrams.bubur_2 = buburProds[1].qtyRealisasi * 118;
        }
      }
      if (timProds.length > 0) {
        newActualCups.tim_1 = timProds[0].qtyRealisasi;
        newActualGrams.tim_1 = timProds[0].qtyRealisasi * 108;
        if (timProds.length > 1) {
          newActualCups.tim_2 = timProds[1].qtyRealisasi;
          newActualGrams.tim_2 = timProds[1].qtyRealisasi * 108;
        }
      }
      
      const oatmealProd = dayProds.find((p: any) => p.produkId === "p-oatmeal");
      if (oatmealProd) {
        newActualCups.oatmeal = oatmealProd.qtyRealisasi;
        newActualGrams.oatmeal = oatmealProd.qtyRealisasi * 100;
      }
      const pudingProd = dayProds.find((p: any) => p.produkId === "p-puding");
      if (pudingProd) {
        newActualCups.puding = pudingProd.qtyRealisasi;
        newActualGrams.puding = pudingProd.qtyRealisasi * 80;
      }
      const abonProd = dayProds.find((p: any) => p.produkId === "p-abon");
      if (abonProd) {
        newActualCups.abon = abonProd.qtyRealisasi;
        newActualGrams.abon = abonProd.qtyRealisasi * 10;
      }
      
      setActualGrams(newActualGrams);
      setActualCups(newActualCups);

      // Load Step 4
      const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
      const dGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        dGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });
      dayReqs.forEach((r: any) => {
        if (!dGrid[r.outletId]) return;
        const split = parseSplit(r.catatan || "");
        if (r.produkId === "p-bubur") {
          dGrid[r.outletId].bubur_d = split.d || r.qty;
          dGrid[r.outletId].bubur_i = split.i || 0;
        } else if (r.produkId === "p-nasitim") {
          dGrid[r.outletId].tim_d = split.d || r.qty;
          dGrid[r.outletId].tim_i = split.i || 0;
        } else if (r.produkId === "p-oatmeal") {
          dGrid[r.outletId].oatmeal = r.qty;
        } else if (r.produkId === "p-puding") {
          dGrid[r.outletId].puding = r.qty;
        } else if (r.produkId === "p-abon") {
          dGrid[r.outletId].abon = r.qty;
        }
      });
      setDistGrid(dGrid);

      // Load Step 5 — returGrid from penjualan data (sent - sold)
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });
      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = dGrid[o.id] || {};
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales
              .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
              .reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
            }
          };

          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);

          const oatSold = existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal")
            .reduce((s: number, p: any) => s + p.qty, 0);
          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - oatSold);

          const pudSold = existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-puding")
            .reduce((s: number, p: any) => s + p.qty, 0);
          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - pudSold);

          const abonSold = existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-abon")
            .reduce((s: number, p: any) => s + p.qty, 0);
          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - abonSold);
        });
      }
      setReturGrid(rGrid);
      // Update sync signature for new-data indicator
      lastSyncedSalesRef.current = penjualan
        .filter((p: any) => p.tanggal === tanggal)
        .reduce((s: number, p: any) => s + p.qty, 0)
        .toString() + "-" + penjualan.length;
    }
  }, [tanggal, outlets, penjualan]); // penjualan included so Step 5 returGrid auto-syncs when outlet saves sisa

  const handlePlanChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setPlanGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleDistChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setDistGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleReturChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setReturGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleGramsChange = (prod: string, grams: number) => {
    hasUserModifiedGrids.current = true;
    setActualGrams(prev => ({ ...prev, [prod]: grams }));
    let factor = 1;
    if (prod === "bubur_1" || prod === "bubur_2") factor = 118;
    else if (prod === "tim_1" || prod === "tim_2") factor = 108;
    else if (prod === "puding") factor = 80;
    else if (prod === "oatmeal") factor = 100;
    else if (prod === "abon") factor = 10;

    const cups = Math.floor(grams / factor);
    setActualCups(prev => ({ ...prev, [prod]: cups }));
  };

  const handleCupsChange = (prod: string, cups: number) => {
    hasUserModifiedGrids.current = true;
    setActualCups(prev => ({ ...prev, [prod]: cups }));
  };

  // STEP 1 Action: Save pre-production target plans
  const saveStep1 = async () => {
    const existing = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
    if (existing.length > 0) {
      await Promise.all(existing.map((r: any) => db.deletePermohonanStok(r.id)));
    }

    const batch: any[] = [];
    Object.entries(planGrid).forEach(([outletId, vals]) => {
      const totalBubur = (vals.bubur_d || 0) + (vals.bubur_i || 0);
      if (totalBubur > 0) {
        batch.push({
          tanggal: todayISO(),
          tanggalKirim: tanggal,
          outletId,
          produkId: "p-bubur",
          qty: totalBubur,
          catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0)
        });
      }

      const totalTim = (vals.tim_d || 0) + (vals.tim_i || 0);
      if (totalTim > 0) {
        batch.push({
          tanggal: todayISO(),
          tanggalKirim: tanggal,
          outletId,
          produkId: "p-nasitim",
          qty: totalTim,
          catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0)
        });
      }

      if (vals.oatmeal > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-oatmeal", qty: vals.oatmeal, catatan: "" });
      }
      if (vals.puding > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-puding", qty: vals.puding, catatan: "" });
      }
      if (vals.abon > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-abon", qty: vals.abon, catatan: "" });
      }
    });

    if (batch.length === 0) {
      return toast.error("Masukkan minimal 1 porsi rencana produksi");
    }

    await db.addPermohonanStokBulk(batch);
    toast.success("Rencana Pra-Produksi berhasil disimpan!");
    setStep(2);
  };

  // STEP 2 CALCULATIONS & ACTION
  const totals = useMemo(() => {
    let buburD = 0, buburI = 0, timD = 0, timI = 0;
    let oatmeal = 0, puding = 0, abon = 0;

    Object.values(planGrid).forEach(v => {
      buburD += v.bubur_d || 0;
      buburI += v.bubur_i || 0;
      timD += v.tim_d || 0;
      timI += v.tim_i || 0;
      oatmeal += v.oatmeal || 0;
      puding += v.puding || 0;
      abon += v.abon || 0;
    });

    const totalBubur = buburD + buburI;
    const totalTim = timD + timI;

    return {
      buburD, buburI, totalBubur,
      timD, timI, totalTim,
      oatmeal, puding, abon
    };
  }, [planGrid]);

  const distTotals = useMemo(() => {
    let buburD = 0, buburI = 0, timD = 0, timI = 0;
    let oatmeal = 0, puding = 0, abon = 0;

    Object.values(distGrid).forEach((v: any) => {
      buburD += v.bubur_d || 0;
      buburI += v.bubur_i || 0;
      timD += v.tim_d || 0;
      timI += v.tim_i || 0;
      oatmeal += v.oatmeal || 0;
      puding += v.puding || 0;
      abon += v.abon || 0;
    });

    return {
      buburD, buburI, timD, timI,
      oatmeal, puding, abon
    };
  }, [distGrid]);

  const materialReqs = useMemo(() => {
    const reqs: { bahanId: string; kode: string; nama: string; qty: number; rawQtyGrams: number; satuan: string }[] = [];

    // 1. Beras
    const berasGr = Math.ceil(buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.beras) + (totals.timD * settings.berasTim) + (totals.timI * settings.berasTim));
    if (berasGr > 0) {
      reqs.push({
        bahanId: "b-brs01",
        kode: "BRS01",
        nama: "BERAS",
        qty: Math.ceil(berasGr / (bahan.find(x => x.id === "b-brs01")?.konversiGram ?? 1000)), // Pack
        rawQtyGrams: berasGr,
        satuan: "Pack"
      });
    }

    // 1b. Sayur
    const shGr = Math.ceil(buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurHijau) + (totals.timD + totals.timI) * settings.sayurHijauTim);
    if (shGr > 0) {
      reqs.push({
        bahanId: "b-sh01",
        kode: "SH01",
        nama: "SAYUR HIJAU",
        qty: shGr,
        rawQtyGrams: shGr,
        satuan: "gr"
      });
    }

    const sbGr = Math.ceil(buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurBrokoli) + (totals.timD + totals.timI) * settings.sayurBrokoliTim);
    if (sbGr > 0) {
      reqs.push({
        bahanId: "b-sb01",
        kode: "SB01",
        nama: "SAYUR BROKOLI",
        qty: sbGr,
        rawQtyGrams: sbGr,
        satuan: "gr"
      });
    }

    const spGr = Math.ceil(buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurPutih) + (totals.timD + totals.timI) * settings.sayurPutihTim);
    if (spGr > 0) {
      reqs.push({
        bahanId: "b-sp01",
        kode: "SP01",
        nama: "SAYUR PUTIH",
        qty: spGr,
        rawQtyGrams: spGr,
        satuan: "gr"
      });
    }

    // Helper to add meat variant
    const addVariant = (variantId: string, grams: number) => {
      const b = bahan.find(x => x.id === variantId);
      if (b && grams > 0) {
        const existing = reqs.find(r => r.bahanId === variantId);
        const qtyPcs = Math.ceil(grams / (b?.konversiGram ?? 100)); // konversi dari data bahan
        if (existing) {
          existing.rawQtyGrams += grams;
          existing.qty = Math.ceil(existing.rawQtyGrams / (b?.konversiGram ?? 100));
        } else {
          reqs.push({
            bahanId: variantId,
            kode: b.kode,
            nama: b.nama,
            qty: qtyPcs,
            rawQtyGrams: grams,
            satuan: b.satuan
          });
        }
      }
    };

    // Meats
    if (totals.buburD > 0 && bubur1Variant) addVariant(bubur1Variant, buburCalc(totals.buburD, BUBUR_BASE.daging));
    if (totals.buburI > 0 && bubur2Variant) addVariant(bubur2Variant, buburCalc(totals.buburI, BUBUR_BASE.daging));
    if (totals.timD > 0 && tim1Variant) addVariant(tim1Variant, totals.timD * settings.dagingTim);
    if (totals.timI > 0 && tim2Variant) addVariant(tim2Variant, totals.timI * settings.dagingTim);

    // Puding
    const pudingGr = Math.ceil(totals.puding * settings.pudingCup);
    if (pudingGr > 0) {
      reqs.push({
        bahanId: "b-pud01",
        kode: "PUD01",
        nama: "PUDING",
        qty: Math.ceil(pudingGr / (bahan.find(x => x.id === "b-pud01")?.konversiGram ?? 100)), // sachet
        rawQtyGrams: pudingGr,
        satuan: "sachet"
      });
    }

    // Oat
    const oatGr = Math.ceil(totals.oatmeal * settings.oatmealCup);
    if (oatGr > 0) {
      reqs.push({
        bahanId: "b-oat01",
        kode: "OAT01",
        nama: "OAT",
        qty: Math.ceil(oatGr / (bahan.find(x => x.id === "b-oat01")?.konversiGram ?? 100)), // sachet
        rawQtyGrams: oatGr,
        satuan: "sachet"
      });
    }

    // Abon
    const abonGr = Math.ceil(totals.abon * settings.abonCup);
    if (abonGr > 0) {
      reqs.push({
        bahanId: "b-ab01",
        kode: "AB01",
        nama: "ABON",
        qty: Math.ceil(abonGr / (bahan.find(x => x.id === "b-ab01")?.konversiGram ?? 100)), // cup
        rawQtyGrams: abonGr,
        satuan: "cup"
      });
    }

    // Cup Puding
    if (totals.puding > 0) {
      reqs.push({
        bahanId: "b-cuppud01",
        kode: "CUPPUD01",
        nama: "CUP PUDING",
        qty: totals.puding,
        rawQtyGrams: totals.puding, // 1:1
        satuan: "biji"
      });
    }

    // Cup Oat
    if (totals.oatmeal > 0) {
      reqs.push({
        bahanId: "b-cupoat1",
        kode: "CUPOAT1",
        nama: "CUP OAT",
        qty: totals.oatmeal,
        rawQtyGrams: totals.oatmeal, // 1:1
        satuan: "biji"
      });
    }

    return reqs;
  }, [totals, bubur1Variant, bubur2Variant, tim1Variant, tim2Variant, bahan, settings]);

  const isWarehouseRequested = useMemo(() => {
    return stokMov.some((m: any) => m.tanggal === tanggal && m.tipe === "OUT" && m.keterangan?.includes("Pemakaian Produksi"));
  }, [stokMov, tanggal]);

  const requestWarehouse = async () => {
    if (isWarehouseRequested) return toast.error("Bahan baku untuk tanggal ini sudah dipotong dari gudang!");

    await Promise.all(materialReqs.map(r => {
      return db.addStokMov({
        tanggal,
        bahanId: r.bahanId,
        tipe: "OUT",
        qty: r.qty,
        keterangan: `Pemakaian Produksi [${tanggal}]`
      });
    }));

    toast.success("Bahan baku berhasil dipotong dari stok gudang!");
    setStep(3);
  };

  // STEP 3 Action
  const saveStep3 = async () => {
    const existing = produksi.filter((p: any) => p.tanggal === tanggal);
    if (existing.length > 0) {
      await Promise.all(existing.map((p: any) => db.deleteProduksi(p.id)));
    }

    const batch = [
      { tanggal, produkId: "p-bubur", qtyRencana: totals.buburD, qtyRealisasi: actualCups.bubur_1 },
      { tanggal, produkId: "p-bubur", qtyRencana: totals.buburI, qtyRealisasi: actualCups.bubur_2 },
      { tanggal, produkId: "p-nasitim", qtyRencana: totals.timD, qtyRealisasi: actualCups.tim_1 },
      { tanggal, produkId: "p-nasitim", qtyRencana: totals.timI, qtyRealisasi: actualCups.tim_2 },
      { tanggal, produkId: "p-oatmeal", qtyRencana: totals.oatmeal, qtyRealisasi: actualCups.oatmeal },
      { tanggal, produkId: "p-puding", qtyRencana: totals.puding, qtyRealisasi: actualCups.puding },
      { tanggal, produkId: "p-abon", qtyRencana: totals.abon, qtyRealisasi: actualCups.abon }
    ];

    await db.addProduksiBulk(batch);
    toast.success("Hasil Produksi Aktual berhasil disimpan!");
    initDistribution();
    setStep(4);
  };

  const initDistribution = () => {
    const grid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      const plan = planGrid[o.id] || {};
      grid[o.id] = {
        bubur_d: plan.bubur_d || 0,
        bubur_i: plan.bubur_i || 0,
        tim_d: plan.tim_d || 0,
        tim_i: plan.tim_i || 0,
        oatmeal: plan.oatmeal || 0,
        puding: plan.puding || 0,
        abon: plan.abon || 0
      };
    });
    setDistGrid(grid);
  };

  // STEP 4 Action
  const saveStep4 = async () => {
    // Validation: check if distributed exceeds actual cooked
    if (distTotals.buburD > actualCups.bubur_1) {
      return toast.error(`Distribusi Bubur 1 (${bubur1Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburD} cup, Masak: ${actualCups.bubur_1} cup)`);
    }
    if (distTotals.buburI > actualCups.bubur_2) {
      return toast.error(`Distribusi Bubur 2 (${bubur2Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburI} cup, Masak: ${actualCups.bubur_2} cup)`);
    }
    if (distTotals.timD > actualCups.tim_1) {
      return toast.error(`Distribusi Nasi Tim 1 (${tim1Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timD} cup, Masak: ${actualCups.tim_1} cup)`);
    }
    if (distTotals.timI > actualCups.tim_2) {
      return toast.error(`Distribusi Nasi Tim 2 (${tim2Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timI} cup, Masak: ${actualCups.tim_2} cup)`);
    }
    if (distTotals.oatmeal > actualCups.oatmeal) {
      return toast.error(`Distribusi Oatmeal melebihi hasil masak aktual! (Terdistribusi: ${distTotals.oatmeal} cup, Masak: ${actualCups.oatmeal} cup)`);
    }
    if (distTotals.puding > actualCups.puding) {
      return toast.error(`Distribusi Puding melebihi hasil masak aktual! (Terdistribusi: ${distTotals.puding} cup, Masak: ${actualCups.puding} cup)`);
    }
    if (distTotals.abon > actualCups.abon) {
      return toast.error(`Distribusi Abon melebihi hasil masak aktual! (Terdistribusi: ${distTotals.abon} cup, Masak: ${actualCups.abon} cup)`);
    }

    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
    await Promise.all(dayReqs.map(async (r: any) => {
      const outletAlloc = distGrid[r.outletId] || {};
      let sentQty = 0;
      let notes = r.catatan || "";

      if (r.produkId === "p-bubur") {
        sentQty = (outletAlloc.bubur_d || 0) + (outletAlloc.bubur_i || 0);
        notes = serializeSplit(outletAlloc.bubur_d || 0, outletAlloc.bubur_i || 0, r.catatan);
      } else if (r.produkId === "p-nasitim") {
        sentQty = (outletAlloc.tim_d || 0) + (outletAlloc.tim_i || 0);
        notes = serializeSplit(outletAlloc.tim_d || 0, outletAlloc.tim_i || 0, r.catatan);
      } else if (r.produkId === "p-oatmeal") {
        sentQty = outletAlloc.oatmeal || 0;
      } else if (r.produkId === "p-puding") {
        sentQty = outletAlloc.puding || 0;
      } else if (r.produkId === "p-abon") {
        sentQty = outletAlloc.abon || 0;
      }

      await db.updatePermohonanStok(r.id, {
        qty: sentQty,
        status: "Disetujui",
        catatan: notes
      });
    }));

    toast.success("Barang keluar (distribusi) berhasil dikirim ke outlet!");
    
    // Load existing penjualan records to pre-populate returGrid
    const rGrid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      // Default all to 0
      rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
    });

    // Check if penjualan records exist for this date
    const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
    if (existingSales.length > 0) {
      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        if (!sent) return;

        // Helper: distribute total retur proportionally across D and I variants
        const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
          const totalSent = dSent + iSent;
          const sold = existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
            .reduce((s: number, p: any) => s + p.qty, 0);
          const totalRetur = Math.max(0, totalSent - sold);
          if (totalSent > 0) {
            rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
            rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
          }
        };

        calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
        calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);

        // Oatmeal
        const oatSold = existingSales
          .filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal")
          .reduce((s: number, p: any) => s + p.qty, 0);
        rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - oatSold);

        // Puding
        const pudSold = existingSales
          .filter((p: any) => p.outletId === o.id && p.produkId === "p-puding")
          .reduce((s: number, p: any) => s + p.qty, 0);
        rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - pudSold);

        // Abon
        const abonSold = existingSales
          .filter((p: any) => p.outletId === o.id && p.produkId === "p-abon")
          .reduce((s: number, p: any) => s + p.qty, 0);
        rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - abonSold);
      });
    }

    setReturGrid(rGrid);
    setStep(5);
  };

  // STEP 5 Action — only VALIDATES & CLOSES the cycle.
  // Data penjualan sudah di-entry oleh outlet via Laporan -> SisaProduksiOH.
  // saveStep5 TIDAK menghapus/merecreate penjualan, hanya:
  // 1. Membaca penjualan dari outlet untuk revenue jurnal
  // 2. Menggunakan returGrid (bisa diedit admin) untuk stok retur
  // 3. Posting jurnal & stok movement
  // 4. Kembali ke Langkah 1 (siklus selesai)
  const saveStep5 = async () => {
    if (closingCycle) return; // Cegah double-click
    setClosingCycle(true);

    try {
      // 1. Baca penjualan yang sudah di-entry outlet dari database
      const existingPenjualan = (penjualan || []).filter((p: any) => p.tanggal === tanggal);

      // 2. Hitung total revenue dari penjualan outlet
      let totalSalesRevenue = 0;
      existingPenjualan.forEach((p: any) => {
        totalSalesRevenue += p.qty * p.harga;
      });

      // 3. Hitung recovered ingredients dari returGrid (admin bisa edit)
      const recoveredIngredients = {
        beras: 0,
        puding: 0,
        oat: 0,
        abon: 0,
        sayurHijau: 0,
        sayurBrokoli: 0,
        sayurPutih: 0
      };

      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        const retur = returGrid[o.id] || {};

        // Cek apakah stok retur sudah pernah diposting untuk tanggal ini
        const existingReturStok = (dbState.stokMov || []).filter(
          (m: any) => m.tanggal === tanggal && m.tipe === "IN" && m.keterangan?.includes("Retur Bahan")
        );
        if (existingReturStok.length > 0) {
          // Stok retur sudah diposting, skip perhitungan ulang agar tidak duplikasi
          // Tapi jurnal tetap diposting jika belum ada
        } else {
          // Bubur D & I: retur * beras per cup
          if (sent.bubur_d > 0) {
            const actualRetur = Math.min(retur.bubur_d || 0, sent.bubur_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }
          if (sent.bubur_i > 0) {
            const actualRetur = Math.min(retur.bubur_i || 0, sent.bubur_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += buburCalc(actualRetur, BUBUR_BASE.beras);
              recoveredIngredients.sayurHijau += buburCalc(actualRetur, BUBUR_BASE.sayurHijau);
              recoveredIngredients.sayurBrokoli += buburCalc(actualRetur, BUBUR_BASE.sayurBrokoli);
              recoveredIngredients.sayurPutih += buburCalc(actualRetur, BUBUR_BASE.sayurPutih);
            }
          }

          // Tim D & I
          if (sent.tim_d > 0) {
            const actualRetur = Math.min(retur.tim_d || 0, sent.tim_d);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }
          if (sent.tim_i > 0) {
            const actualRetur = Math.min(retur.tim_i || 0, sent.tim_i);
            if (actualRetur > 0) {
              recoveredIngredients.beras += actualRetur * settings.berasTim;
              recoveredIngredients.sayurHijau += actualRetur * settings.sayurHijauTim;
              recoveredIngredients.sayurBrokoli += actualRetur * settings.sayurBrokoliTim;
              recoveredIngredients.sayurPutih += actualRetur * settings.sayurPutihTim;
            }
          }

          // Oatmeal
          if (sent.oatmeal > 0) {
            const actualRetur = Math.min(retur.oatmeal || 0, sent.oatmeal);
            if (actualRetur > 0) recoveredIngredients.oat += actualRetur * settings.oatmealCup;
          }

          // Puding
          if (sent.puding > 0) {
            const actualRetur = Math.min(retur.puding || 0, sent.puding);
            if (actualRetur > 0) recoveredIngredients.puding += actualRetur * settings.pudingCup;
          }

          // Abon
          if (sent.abon > 0) {
            const actualRetur = Math.min(retur.abon || 0, sent.abon);
            if (actualRetur > 0) recoveredIngredients.abon += actualRetur * settings.abonCup;
          }
        }
      });

      // 4. Jurnal posting — berdasarkan penjualan outlet (TIDAK dihapus/direcreate)
      if (totalSalesRevenue > 0) {
        // Cek apakah jurnal sudah pernah diposting untuk tanggal ini (cegah duplikasi)
        const existingJurnal = (dbState.jurnal || []).filter(
          (j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES"
        );
        if (existingJurnal.length === 0) {
          await db.addJurnalBulk([
            {
              tanggal,
              ref: "OUT-SALES",
              keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`,
              kodeAkun: "131000",
              akun: "Piutang usaha",
              tipe: "Debit",
              jumlah: totalSalesRevenue,
              kategori: "Aset"
            },
            {
              tanggal,
              ref: "OUT-SALES",
              keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`,
              kodeAkun: "410000",
              akun: "Pendapatan Utama",
              tipe: "Kredit",
              jumlah: totalSalesRevenue,
              kategori: "Pendapatan"
            }
          ]);
        }
      }

      // 5. Stok retur movements — berdasarkan returGrid (bisa diedit admin)
      const movPromises: Promise<any>[] = [];
      if (recoveredIngredients.beras > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-brs01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.beras / (bahan.find(x => x.id === "b-brs01")?.konversiGram ?? 1000)),
          keterangan: `Retur Bahan Baku (Pack) [${tanggal}]`
        }));
      }
      if (recoveredIngredients.puding > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-pud01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.puding / (bahan.find(x => x.id === "b-pud01")?.konversiGram ?? 100)),
          keterangan: `Retur Bahan Baku (sachet) [${tanggal}]`
        }));
      }
      if (recoveredIngredients.oat > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-oat01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.oat / (bahan.find(x => x.id === "b-oat01")?.konversiGram ?? 100)),
          keterangan: `Retur Bahan Baku (sachet) [${tanggal}]`
        }));
      }
      if (recoveredIngredients.abon > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-ab01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.abon / (bahan.find(x => x.id === "b-ab01")?.konversiGram ?? 100)),
          keterangan: `Retur Bahan Baku (cup) [${tanggal}]`
        }));
      }

      if (recoveredIngredients.sayurHijau > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sh01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.sayurHijau),
          keterangan: `Retur Bahan Baku (gr) [${tanggal}]`
        }));
      }
      if (recoveredIngredients.sayurBrokoli > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sb01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.sayurBrokoli),
          keterangan: `Retur Bahan Baku (gr) [${tanggal}]`
        }));
      }
      if (recoveredIngredients.sayurPutih > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sp01", tipe: "IN",
          qty: Math.ceil(recoveredIngredients.sayurPutih),
          keterangan: `Retur Bahan Baku (gr) [${tanggal}]`
        }));
      }

      if (movPromises.length > 0) {
        await Promise.all(movPromises);
      }

      toast.success("Siklus produksi harian berhasil ditutup! Penjualan dari outlet & retur tercatat.");
      setStep(1);
    } catch (err) {
      toast.error("Gagal menutup siklus produksi");
      console.error(err);
    } finally {
      setClosingCycle(false);
    }
  };

  // Wrap handleRefreshStep5 so it doesn't trigger the toast on auto-refresh
  const handleAutoRefresh = useCallback(async () => {
    if (refreshing || !tanggal || outlets.length === 0) return;
    setRefreshing(true);

    try {
      hasUserModifiedGrids.current = false;
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });

      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales
              .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
              .reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
            }
          };

          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);

          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal")
            .reduce((s: number, p: any) => s + p.qty, 0));

          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-puding")
            .reduce((s: number, p: any) => s + p.qty, 0));

          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-abon")
            .reduce((s: number, p: any) => s + p.qty, 0));
        });
      }

      setReturGrid(rGrid);

      lastSyncedSalesRef.current = penjualan
        .filter((p: any) => p.tanggal === tanggal)
        .reduce((s: number, p: any) => s + p.qty, 0)
        .toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;
    } catch (err) {
      console.error("Auto-refresh returGrid failed:", err);
    } finally {
      setRefreshing(false);
    }
  }, [tanggal, outlets, penjualan, distGrid, refreshing]);

  // Auto-refresh returGrid when penjualan saved from Laporan page
  // (triggered by custom event dispatched from outlet/admin)
  useEffect(() => {
    window.addEventListener("buba_penjualan_saved", handleAutoRefresh);
    return () => window.removeEventListener("buba_penjualan_saved", handleAutoRefresh);
  }, [handleAutoRefresh]);


  // Refresh Step 5 — recalculate returGrid from latest penjualan data.
  // Useful when outlet has just saved sisa penjualan via Laporan page.
  const handleRefreshStep5 = async () => {
    setRefreshing(true);
    try {
      // Reset the modification guard so returGrid can recalculate
      hasUserModifiedGrids.current = false;

      // Recalculate returGrid from latest penjualan data
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });

      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales
              .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
              .reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
              rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
            }
          };

          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);

          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal")
            .reduce((s: number, p: any) => s + p.qty, 0));

          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-puding")
            .reduce((s: number, p: any) => s + p.qty, 0));

          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales
            .filter((p: any) => p.outletId === o.id && p.produkId === "p-abon")
            .reduce((s: number, p: any) => s + p.qty, 0));
        });
      }

      setReturGrid(rGrid);
      toast.success("Data penjualan dari outlet berhasil dimuat ulang!");
    } catch (err) {
      toast.error("Gagal memuat ulang data penjualan");
      console.error(err);
    } finally {
      // Update sync signature
      lastSyncedSalesRef.current = penjualan
        .filter((p: any) => p.tanggal === tanggal)
        .reduce((s: number, p: any) => s + p.qty, 0)
        .toString() + "-" + penjualan.length;
      setRefreshing(false);
    }
  };

  // Check if there's new penjualan data that hasn't been synced to returGrid yet
  const hasNewSalesData = useMemo(() => {
    const currentSig = penjualan
      .filter((p: any) => p.tanggal === tanggal)
      .reduce((s: number, p: any) => s + p.qty, 0)
      .toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;
    return currentSig !== lastSyncedSalesRef.current && lastSyncedSalesRef.current !== "";
  }, [penjualan, tanggal]);

  const filteredOutlets = useMemo(() => {
    return outlets.filter(o => o.nama.toLowerCase().includes(searchOutlet.toLowerCase()));
  }, [outlets, searchOutlet]);

  function renderStep1() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 1: Rencana Pra-Produksi</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Gunakan tabel/form di bawah untuk mengisi rencana target produksi tiap outlet secara langsung.</p>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Read-only Total Summary Dashboard */}
          <div className="bg-muted/35 p-5 rounded-2xl border space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total Rencana Produksi Hari Ini (Seluruh Outlet)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
              <div className="space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-300/30 text-center">
                <div className="text-[10px] font-bold text-amber-600 truncate" title={`Bubur ${bubur1Name}`}>B. {bubur1Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.buburD} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.buburD * 118).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-blue-500/5 p-3 rounded-xl border border-blue-300/30 text-center">
                <div className="text-[10px] font-bold text-blue-600 truncate" title={`Bubur ${bubur2Name}`}>B. {bubur2Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.buburI} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.buburI * 118).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-300/30 text-center">
                <div className="text-[10px] font-bold text-amber-600 truncate" title={`Tim ${tim1Name}`}>T. {tim1Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.timD} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.timD * 108).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-blue-500/5 p-3 rounded-xl border border-blue-300/30 text-center">
                <div className="text-[10px] font-bold text-blue-600 truncate" title={`Tim ${tim2Name}`}>T. {tim2Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.timI} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.timI * 108).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Oatmeal</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.oatmeal} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.oatmeal * 100).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Puding</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.puding} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.puding * 80).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Abon</div>
                <div className="text-lg font-bold text-foreground mt-1">{totals.abon} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.abon * 10).toLocaleString()} g)</span>
              </div>
            </div>
          </div>

          {/* Consolidated Table/Cards at the Bottom */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Target Rencana Produksi Per Outlet (Edit Langsung)</Label>
                <div className="flex items-center gap-1.5 md:hidden">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      const expanded: Record<string, boolean> = {};
                      outlets.forEach(o => expanded[o.id] = true);
                      setExpandedOutlets(expanded);
                    }}
                    className="h-7 text-[10px] px-2"
                  >
                    Buka Semua
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setExpandedOutlets({})}
                    className="h-7 text-[10px] px-2 text-destructive hover:text-destructive"
                  >
                    Tutup Semua
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Cari outlet..."
                value={searchOutlet}
                onChange={(e) => setSearchOutlet(e.target.value)}
                className="w-full sm:w-[220px] h-9 text-xs"
              />
            </div>

            {/* DESKTOP VIEW: TABLE WITH INPUT CELLS */}
            <div className="hidden md:block rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="min-w-[150px] font-bold">Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Bubur {bubur1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5 font-semibold">Tim {tim1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5 font-semibold">Tim {tim2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs">Oatmeal</TableHead>
                      <TableHead className="text-center font-bold text-xs">Puding</TableHead>
                      <TableHead className="text-center font-bold text-xs">Abon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOutlets.map((o) => {
                      const row = planGrid[o.id] || {
                        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                        oatmeal: 0, puding: 0, abon: 0
                      };
                      return (
                        <TableRow key={o.id} className="hover:bg-muted/20">
                          <TableCell className="font-semibold py-3 whitespace-nowrap">
                            {o.nama}
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <Input
                              type="number"
                              min={0}
                              value={row.bubur_d || ""}
                              onChange={(e) => handlePlanChange(o.id, "bubur_d", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-semibold border-amber-300/80 focus-visible:ring-amber-500 bg-amber-500/5"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.bubur_d || 0) * 118} g</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <Input
                              type="number"
                              min={0}
                              value={row.bubur_i || ""}
                              onChange={(e) => handlePlanChange(o.id, "bubur_i", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-semibold border-blue-300/80 focus-visible:ring-blue-500 bg-blue-500/5"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.bubur_i || 0) * 118} g</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <Input
                              type="number"
                              min={0}
                              value={row.tim_d || ""}
                              onChange={(e) => handlePlanChange(o.id, "tim_d", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-semibold border-amber-300/80 focus-visible:ring-amber-500 bg-amber-500/5"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.tim_d || 0) * 108} g</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <Input
                              type="number"
                              min={0}
                              value={row.tim_i || ""}
                              onChange={(e) => handlePlanChange(o.id, "tim_i", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-semibold border-blue-300/80 focus-visible:ring-blue-500 bg-blue-500/5"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.tim_i || 0) * 108} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2 font-medium">
                            <Input
                              type="number"
                              min={0}
                              value={row.oatmeal || ""}
                              onChange={(e) => handlePlanChange(o.id, "oatmeal", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-medium"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.oatmeal || 0) * 100} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2 font-medium">
                            <Input
                              type="number"
                              min={0}
                              value={row.puding || ""}
                              onChange={(e) => handlePlanChange(o.id, "puding", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-medium"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.puding || 0) * 80} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2 font-medium">
                            <Input
                              type="number"
                              min={0}
                              value={row.abon || ""}
                              onChange={(e) => handlePlanChange(o.id, "abon", parseInt(e.target.value) || 0)}
                              className="w-16 h-8 text-center text-xs p-1 mx-auto font-medium"
                              placeholder="0"
                            />
                            <div className="text-[9px] text-muted-foreground mt-1">{(row.abon || 0) * 10} g</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* MOBILE VIEW: RESPONSIVE CARDS CONTAINER */}
            <div className="block md:hidden space-y-4">
              {filteredOutlets.map((o) => {
                const row = planGrid[o.id] || {
                  bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                  oatmeal: 0, puding: 0, abon: 0
                };
                const totalOutletCups = (row.bubur_d || 0) + (row.bubur_i || 0) + (row.tim_d || 0) + (row.tim_i || 0) + (row.oatmeal || 0) + (row.puding || 0) + (row.abon || 0);
                const isExpanded = !!expandedOutlets[o.id];

                return (
                  <div key={o.id} className="p-4 bg-card rounded-2xl border shadow-sm space-y-3">
                    <div 
                      onClick={() => setExpandedOutlets(prev => ({ ...prev, [o.id]: !prev[o.id] }))}
                      className="flex items-center justify-between cursor-pointer select-none"
                    >
                      <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        {o.nama}
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">{totalOutletCups} cup</Badge>
                    </div>
                    
                    {isExpanded && (
                      <div className="grid grid-cols-2 gap-2.5 pt-2 border-t">
                        <div className="space-y-1 bg-amber-500/5 p-2 rounded-xl border border-amber-300/30">
                          <Label className="text-[9px] font-bold text-amber-600 block truncate">B. {bubur1Name}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.bubur_d || ""}
                            onChange={(e) => handlePlanChange(o.id, "bubur_d", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.bubur_d || 0) * 118} g)</span>
                        </div>
                        <div className="space-y-1 bg-blue-500/5 p-2 rounded-xl border border-blue-300/30">
                          <Label className="text-[9px] font-bold text-blue-600 block truncate">B. {bubur2Name}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.bubur_i || ""}
                            onChange={(e) => handlePlanChange(o.id, "bubur_i", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.bubur_i || 0) * 118} g)</span>
                        </div>
                        <div className="space-y-1 bg-amber-500/5 p-2 rounded-xl border border-amber-300/30">
                          <Label className="text-[9px] font-bold text-amber-600 block truncate">T. {tim1Name}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.tim_d || ""}
                            onChange={(e) => handlePlanChange(o.id, "tim_d", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.tim_d || 0) * 108} g)</span>
                        </div>
                        <div className="space-y-1 bg-blue-500/5 p-2 rounded-xl border border-blue-300/30">
                          <Label className="text-[9px] font-bold text-blue-600 block truncate">T. {tim2Name}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.tim_i || ""}
                            onChange={(e) => handlePlanChange(o.id, "tim_i", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.tim_i || 0) * 108} g)</span>
                        </div>
                        <div className="space-y-1 bg-muted/20 p-2 rounded-xl border">
                          <Label className="text-[9px] font-bold text-muted-foreground block truncate">Oatmeal</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.oatmeal || ""}
                            onChange={(e) => handlePlanChange(o.id, "oatmeal", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.oatmeal || 0) * 100} g)</span>
                        </div>
                        <div className="space-y-1 bg-muted/20 p-2 rounded-xl border">
                          <Label className="text-[9px] font-bold text-muted-foreground block truncate">Puding</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.puding || ""}
                            onChange={(e) => handlePlanChange(o.id, "puding", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.puding || 0) * 80} g)</span>
                        </div>
                        <div className="space-y-1 bg-muted/20 p-2 rounded-xl border col-span-2">
                          <Label className="text-[9px] font-bold text-muted-foreground block truncate">Abon</Label>
                          <Input
                            type="number"
                            min={0}
                            value={row.abon || ""}
                            onChange={(e) => handlePlanChange(o.id, "abon", parseInt(e.target.value) || 0)}
                            className="h-8 text-xs text-center"
                            placeholder="0"
                          />
                          <span className="text-[8px] text-muted-foreground/80 block text-center mt-0.5">({(row.abon || 0) * 10} g)</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Keterangan Gramasi & Kebutuhan Bahan Baku Total (Collapsible) */}
          <div className="bg-muted/10 p-4 rounded-2xl border space-y-3 shadow-inner">
            <div 
              onClick={() => setEstimasiExpanded(prev => !prev)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-primary" /> Kebutuhan Bahan Baku Total (Seluruh Outlet)
              </h3>
              <div className="flex items-center gap-1 text-[11px] text-primary font-semibold">
                {estimasiExpanded ? "Sembunyikan" : "Lihat Detail"}
                {estimasiExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>

            {estimasiExpanded && (
              <div className="border-t border-dashed pt-3">
              {(() => {
              // Calculate ingredients for all outlets combined
              const totalBeras = buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.beras) + (totals.timD * settings.berasTim) + (totals.timI * settings.berasTim);
              const totalAyamBubur = buburCalc(totals.buburD, BUBUR_BASE.daging);
              const totalSalmonBubur = buburCalc(totals.buburI, BUBUR_BASE.daging);
              const totalAyamTim = totals.timD * settings.dagingTim;
              const totalSalmonTim = totals.timI * settings.dagingTim;
              const totalOatmeal = totals.oatmeal * settings.oatmealCup;
              const totalPuding = totals.puding * settings.pudingCup;
              const totalAbon = totals.abon * settings.abonCup;
              
              // Sayur
              const totalShBubur = buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurHijau);
              const totalSbBubur = buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurBrokoli);
              const totalSpBubur = buburCalc(totals.buburD + totals.buburI, BUBUR_BASE.sayurPutih);
              
              const totalShTim = (totals.timD + totals.timI) * settings.sayurHijauTim;
              const totalSbTim = (totals.timD + totals.timI) * settings.sayurBrokoliTim;
              const totalSpTim = (totals.timD + totals.timI) * settings.sayurPutihTim;

              const hasPlan = totalBeras > 0 || totalOatmeal > 0 || totalPuding > 0 || totalAbon > 0;
              if (!hasPlan) {
                return (
                  <p className="text-xs text-muted-foreground italic">
                    Belum ada target porsi yang dimasukkan untuk hari ini. Kebutuhan bahan akan terhitung otomatis.
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-primary">
                    Detail Kebutuhan Bahan Baku untuk Rencana Produksi Hari Ini:
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-xs">
                    {totalBeras > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Beras:</strong> {formatDecimal(totalBeras)} gr</div>}
                    {totalAyamBubur > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Daging/Ayam Bubur ({bubur1Name}):</strong> {formatDecimal(totalAyamBubur)} gr</div>}
                    {totalSalmonBubur > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Ikan/Salmon Bubur ({bubur2Name}):</strong> {formatDecimal(totalSalmonBubur)} gr</div>}
                    {totalAyamTim > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Daging/Ayam Tim ({tim1Name}):</strong> {Math.ceil(totalAyamTim)} gr</div>}
                    {totalSalmonTim > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Ikan/Salmon Tim ({tim2Name}):</strong> {Math.ceil(totalSalmonTim)} gr</div>}
                    {totalOatmeal > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Oatmeal:</strong> {Math.ceil(totalOatmeal).toLocaleString()} gr</div>}
                    {totalPuding > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Puding:</strong> {Math.ceil(totalPuding).toLocaleString()} gr</div>}
                    {totalAbon > 0 && <div className="p-3 bg-card rounded-xl border shadow-sm">• <strong>Abon:</strong> {Math.ceil(totalAbon).toLocaleString()} gr</div>}
                    {(totalShBubur > 0 || totalSbBubur > 0 || totalSpBubur > 0) && (
                      <div className="p-3 bg-card rounded-xl border shadow-sm sm:col-span-2">
                        • <strong>Sayur Bubur (SH/SB/SP):</strong> {formatDecimal(totalShBubur)}g / {formatDecimal(totalSbBubur)}g / {formatDecimal(totalSpBubur)}g
                      </div>
                    )}
                    {(totalShTim > 0 || totalSbTim > 0 || totalSpTim > 0) && (
                      <div className="p-3 bg-card rounded-xl border shadow-sm sm:col-span-2">
                        • <strong>Sayur Tim (SH/SB/SP):</strong> {Math.ceil(totalShTim)}g / {Math.ceil(totalSbTim)}g / {Math.ceil(totalSpTim)}g
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={saveStep1} className="gradient-primary text-primary-foreground hover-lift">
              <span className="hidden md:inline">Simpan & Lanjutkan ke Bahan Baku</span>
              <ArrowRight className="h-4 w-4 md:ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep2() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 2: Request & Potong Bahan Baku</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Review kebutuhan gramasi bahan baku dan potong otomatis dari gudang utama</p>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Detailed Recipe Breakdown for Cooking */}
          <div className="bg-muted/15 p-4 rounded-2xl border space-y-3">
            <div 
              onClick={() => setRecipeExpanded(prev => !prev)}
              className="flex items-center justify-between cursor-pointer select-none"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Calculator className="h-4 w-4 text-primary" /> Detail Komposisi Bahan Masak (Resep / Batch)
              </h3>
              <div className="flex items-center gap-1 text-[11px] text-primary font-semibold">
                {recipeExpanded ? "Sembunyikan" : "Tampilkan"}
                {recipeExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </div>
            </div>

            {recipeExpanded && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 pt-2 border-t border-dashed">
                {/* Bubur 1 */}
                {totals.buburD > 0 && (
                  <div className="p-4 rounded-2xl border bg-card/60 space-y-2">
                    <div className="font-bold text-xs text-amber-600">Bubur 1 ({bubur1Name})</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• Target: <span className="font-semibold text-foreground">{totals.buburD} cup</span></div>
                      <div>• Beras: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.beras))} gr</span></div>
                      <div>• Ikan/Daging: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.daging))} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.air))} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurHijau))} gr</span></div>
                      <div>• Sayur Brokoli (SB): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurBrokoli))} gr</span></div>
                      <div>• Sayur Putih (SP): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurPutih))} gr</span></div>
                    </div>
                  </div>
                )}
                {/* Bubur 2 */}
                {totals.buburI > 0 && (
                  <div className="p-4 rounded-2xl border bg-card/60 space-y-2">
                    <div className="font-bold text-xs text-blue-600">Bubur 2 ({bubur2Name})</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• Target: <span className="font-semibold text-foreground">{totals.buburI} cup</span></div>
                      <div>• Beras: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.beras))} gr</span></div>
                      <div>• Ikan/Salmon: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.daging))} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.air))} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurHijau))} gr</span></div>
                      <div>• Sayur Brokoli (SB): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurBrokoli))} gr</span></div>
                      <div>• Sayur Putih (SP): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurPutih))} gr</span></div>
                    </div>
                  </div>
                )}
                {/* Tim 1 */}
                {totals.timD > 0 && (
                  <div className="p-4 rounded-2xl border bg-card/60 space-y-2">
                    <div className="font-bold text-xs text-amber-600">Nasi Tim 1 ({tim1Name})</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• Target: <span className="font-semibold text-foreground">{totals.timD} cup</span></div>
                      <div>• Beras: <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.berasTim)} gr</span></div>
                      <div>• Ikan/Daging: <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.dagingTim)} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.airTim)} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurHijauTim)} gr</span></div>
                      <div>• Sayur Brokoli (SB): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurBrokoliTim)} gr</span></div>
                      <div>• Sayur Putih (SP): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurPutihTim)} gr</span></div>
                    </div>
                  </div>
                )}
                {/* Tim 2 */}
                {totals.timI > 0 && (
                  <div className="p-4 rounded-2xl border bg-card/60 space-y-2">
                    <div className="font-bold text-xs text-blue-600">Nasi Tim 2 ({tim2Name})</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>• Target: <span className="font-semibold text-foreground">{totals.timI} cup</span></div>
                      <div>• Beras: <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.berasTim)} gr</span></div>
                      <div>• Ikan/Salmon: <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.dagingTim)} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.airTim)} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurHijauTim)} gr</span></div>
                      <div>• Sayur Brokoli (SB): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurBrokoliTim)} gr</span></div>
                      <div>• Sayur Putih (SP): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurPutihTim)} gr</span></div>
                    </div>
                  </div>
                )}
                {/* Others (Oat, Puding, Abon) */}
                {(totals.oatmeal > 0 || totals.puding > 0 || totals.abon > 0) && (
                  <div className="p-4 rounded-2xl border bg-card/60 space-y-2">
                    <div className="font-bold text-xs text-muted-foreground">Menu Lainnya</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {totals.oatmeal > 0 && <div>• Oatmeal: <span className="font-semibold text-foreground">{Math.ceil(totals.oatmeal * settings.oatmealCup)} gr</span> ({totals.oatmeal} cup)</div>}
                      {totals.puding > 0 && <div>• Puding: <span className="font-semibold text-foreground">{Math.ceil(totals.puding * settings.pudingCup)} gr</span> ({totals.puding} cup)</div>}
                      {totals.abon > 0 && <div>• Abon: <span className="font-semibold text-foreground">{Math.ceil(totals.abon * settings.abonCup)} gr</span> ({totals.abon} cup)</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ringkasan Pemotongan Stok Gudang (Pcs/Sachet/Pack)</h3>
            <div className="rounded-2xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Bahan Baku</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-right">Kebutuhan (Gram/ml)</TableHead>
                    <TableHead className="text-right">Konversi (Stok)</TableHead>
                    <TableHead className="text-right">Stok Gudang</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialReqs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Tidak ada bahan baku yang dibutuhkan. Silakan isi rencana pra-produksi di Langkah 1.
                      </TableCell>
                    </TableRow>
                  )}
                  {materialReqs.map((r) => {
                    const saldo = saldoBahan(r.bahanId, dbState);
                    const isSufficient = saldo >= r.qty;
                    const hasGram = r.satuan !== "biji" && r.satuan !== "pcs";
                    return (
                      <TableRow key={r.bahanId}>
                        <TableCell className="font-semibold">{r.nama}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.kode}</TableCell>
                        <TableCell className="text-right font-medium">
                          {hasGram ? `${Number(r.rawQtyGrams).toFixed(2).replace(/\.?0+$/, '')} g` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {r.qty} {r.satuan}
                        </TableCell>
                        <TableCell className="text-right">{saldo} {r.satuan}</TableCell>
                        <TableCell className="text-center">
                          {isSufficient ? (
                            <Badge className="bg-success text-success-foreground">Aman</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1 justify-center">
                              <AlertTriangle className="h-3 w-3" /> Kurang {Math.round((r.qty - saldo) * 100) / 100}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(1)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Kembali ke Langkah 1</span>
            </Button>
            {isWarehouseRequested ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-success text-success-foreground h-10 px-4 text-xs font-semibold gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden md:inline">Bahan Baku Sudah Dipotong Dari Gudang</span>
                </Badge>
                <Button onClick={() => setStep(3)} className="h-10 gradient-primary text-primary-foreground">
                  <span className="hidden md:inline">Lanjutkan</span>
                  <ArrowRight className="h-4 w-4 md:ml-2" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={requestWarehouse}
                disabled={materialReqs.length === 0}
                className="gradient-primary text-primary-foreground hover-lift h-10"
              >
                <span className="hidden md:inline">Potong Stok Gudang & Lanjutkan</span>
                <Send className="h-4 w-4 md:ml-2" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep3() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 3: Realisasi Masak / Pasca Produksi</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Input berat matang hasil masak (gram) untuk dikonversi otomatis ke jumlah cup stok awal</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { id: "bubur_1", label: `Bubur 1 (${bubur1Name})`, unitWeight: 118, targetCups: totals.buburD },
              { id: "bubur_2", label: `Bubur 2 (${bubur2Name})`, unitWeight: 118, targetCups: totals.buburI },
              { id: "tim_1", label: `Nasi Tim 1 (${tim1Name})`, unitWeight: 108, targetCups: totals.timD },
              { id: "tim_2", label: `Nasi Tim 2 (${tim2Name})`, unitWeight: 108, targetCups: totals.timI },
              { id: "oatmeal", label: "Oatmeal", unitWeight: 100, targetCups: totals.oatmeal },
              { id: "puding", label: "Puding", unitWeight: 80, targetCups: totals.puding },
              { id: "abon", label: "Abon", unitWeight: 10, targetCups: totals.abon }
            ].map((p) => {
              const grams = actualGrams[p.id as keyof typeof actualGrams] || 0;
              const cups = actualCups[p.id as keyof typeof actualCups] || 0;
              return (
                <div key={p.id} className="p-4 rounded-2xl border bg-card/40 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm">{p.label}</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Target: {p.targetCups} cup ({(p.targetCups * p.unitWeight).toLocaleString("id-ID")} g)
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Berat Matang (Gram)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={grams || ""}
                        onChange={(e) => handleGramsChange(p.id, parseInt(e.target.value))}
                        className="h-10"
                        placeholder="Contoh: 11800"
                      />
                      <span className="text-xs text-muted-foreground font-semibold">g</span>
                    </div>
                    {(p.id === "bubur_1" || p.id === "bubur_2" || p.id === "tim_1" || p.id === "tim_2") && (
                      <p className="text-[11px] text-emerald-600 font-medium mt-1">
                        ✨ Konversi: <span className="font-bold">{Math.floor(grams / p.unitWeight)} cup</span> (Standar {p.unitWeight}g per cup)
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Konversi Cup (Aktual)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={cups || ""}
                        onChange={(e) => handleCupsChange(p.id, parseInt(e.target.value))}
                        className="h-10 font-bold text-primary border-primary/40 focus-visible:ring-primary"
                      />
                      <span className="text-xs text-muted-foreground">cup</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground block italic">
                      Disarankan: {Math.floor(grams / p.unitWeight)} cup (@ {p.unitWeight}g)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(2)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Kembali</span>
            </Button>
            <Button onClick={saveStep3} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Simpan Hasil Aktual & Lanjutkan</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep4() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 4: Barang Keluar & Alokasi Outlet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah untuk mengisi kuantitas cup yang dikirim, ringkasan pengiriman akan muncul di tabel bawah.</p>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border text-xs">
            <span className="font-bold text-muted-foreground">Status Masak (Actual/Target):</span>
            <span className="font-semibold text-primary">
              B: {actualCups.bubur_1 + actualCups.bubur_2}/{totals.totalBubur} · T: {actualCups.tim_1 + actualCups.tim_2}/{totals.totalTim}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Sisa Hasil Masak (Undistributed Stock) */}
          <div className="bg-muted/15 p-4 rounded-2xl border border-dashed space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sisa Hasil Masak (Belum Didistribusikan)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-amber-600 block truncate" title={`Bubur ${bubur1Name}`}>B. {bubur1Name}</span>
                <span className={`text-sm font-bold block ${actualCups.bubur_1 - distTotals.buburD < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.bubur_1 - distTotals.buburD} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.bubur_1}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur2Name}`}>B. {bubur2Name}</span>
                <span className={`text-sm font-bold block ${actualCups.bubur_2 - distTotals.buburI < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.bubur_2 - distTotals.buburI} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.bubur_2}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-amber-600 block truncate" title={`Tim ${tim1Name}`}>T. {tim1Name}</span>
                <span className={`text-sm font-bold block ${actualCups.tim_1 - distTotals.timD < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.tim_1 - distTotals.timD} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.tim_1}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-blue-600 block truncate" title={`Tim ${tim2Name}`}>T. {tim2Name}</span>
                <span className={`text-sm font-bold block ${actualCups.tim_2 - distTotals.timI < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.tim_2 - distTotals.timI} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.tim_2}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal</span>
                <span className={`text-sm font-bold block ${actualCups.oatmeal - distTotals.oatmeal < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.oatmeal - distTotals.oatmeal} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.oatmeal}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-muted-foreground block truncate">Puding</span>
                <span className={`text-sm font-bold block ${actualCups.puding - distTotals.puding < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.puding - distTotals.puding} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.puding}</span>
                </span>
              </div>
              <div className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                <span className="text-[10px] font-bold text-muted-foreground block truncate">Abon</span>
                <span className={`text-sm font-bold block ${actualCups.abon - distTotals.abon < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                  {actualCups.abon - distTotals.abon} <span className="text-[10px] font-normal text-muted-foreground">/ {actualCups.abon}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step4OutletId);
                      if (idx > 0) setStep4OutletId(outlets[idx - 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step4OutletId) <= 0}
                    className="h-11 w-11"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step4OutletId} onValueChange={setStep4OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm">
                      <SelectValue placeholder="Pilih Outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => (
                        <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step4OutletId);
                      if (idx < outlets.length - 1) setStep4OutletId(outlets[idx + 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step4OutletId) >= outlets.length - 1}
                    className="h-11 w-11"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Input fields laid out as a row */}
            {(() => {
              const row = distGrid[step4OutletId] || {
                bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                oatmeal: 0, puding: 0, abon: 0
              };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Bubur ${bubur1Name}`}>B. {bubur1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.bubur_d || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "bubur_d", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.bubur_d || 0) * 118} g)</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur2Name}`}>B. {bubur2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.bubur_i || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "bubur_i", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.bubur_i || 0) * 118} g)</span>
                  </div>
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Tim ${tim1Name}`}>T. {tim1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.tim_d || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "tim_d", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.tim_d || 0) * 108} g)</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Tim ${tim2Name}`}>T. {tim2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.tim_i || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "tim_i", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.tim_i || 0) * 108} g)</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.oatmeal || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.oatmeal || 0) * 100} g)</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.puding || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.puding || 0) * 80} g)</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.abon || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({(row.abon || 0) * 10} g)</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Distribusi Pengiriman (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Bubur {bubur1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5 font-semibold">Tim {tim1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5 font-semibold">Tim {tim2Name}</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o) => {
                      const row = distGrid[o.id] || {
                        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                        oatmeal: 0, puding: 0, abon: 0
                      };
                      const isSelected = o.id === step4OutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setStep4OutletId(o.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" 
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold py-3 flex items-center gap-1.5 whitespace-nowrap">
                            {o.nama}
                            {isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2.5">
                            <div className="font-semibold text-xs">{row.bubur_d || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.bubur_d || 0) * 118} g</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2.5">
                            <div className="font-semibold text-xs">{row.bubur_i || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.bubur_i || 0) * 118} g</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2.5">
                            <div className="font-semibold text-xs">{row.tim_d || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.tim_d || 0) * 108} g</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2.5">
                            <div className="font-semibold text-xs">{row.tim_i || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.tim_i || 0) * 108} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 font-medium">
                            <div className="text-xs">{row.oatmeal || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.oatmeal || 0) * 100} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 font-medium">
                            <div className="text-xs">{row.puding || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.puding || 0) * 80} g</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 font-medium">
                            <div className="text-xs">{row.abon || 0} cup</div>
                            <div className="text-[9px] text-muted-foreground">{(row.abon || 0) * 10} g</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(3)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Kembali</span>
            </Button>
            <Button onClick={saveStep4} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Konfirmasi Pengiriman & Lanjutkan</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  function renderStep5() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 5: Retur & Penjualan Akhir Hari</CardTitle>
          {hasNewSalesData && !refreshing && step === 5 && (
            <div className="mt-2 flex items-center gap-2 text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 text-destructive font-medium animate-pulse">
              <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
              Data penjualan baru dari outlet tersedia. Klik <strong>Refresh</strong> untuk memuat.
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah. Bubur &amp; Nasi Tim isi <strong>gram</strong> retur (otomatis konversi ke cup), Oatmeal &amp; Puding isi <strong>cup</strong>, Abon isi <strong>pcs</strong>. Penjualan dihitung otomatis.</p>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step5OutletId);
                      if (idx > 0) setStep5OutletId(outlets[idx - 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step5OutletId) <= 0}
                    className="h-11 w-11"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step5OutletId} onValueChange={setStep5OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm">
                      <SelectValue placeholder="Pilih Outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => (
                        <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step5OutletId);
                      if (idx < outlets.length - 1) setStep5OutletId(outlets[idx + 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step5OutletId) >= outlets.length - 1}
                    className="h-11 w-11"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Input fields laid out as a row with maximum constraints based on sent qty */}
            {(() => {
              const row = returGrid[step5OutletId] || {
                bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                oatmeal: 0, puding: 0, abon: 0
              };
              const sent = distGrid[step5OutletId] || {
                bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                oatmeal: 0, puding: 0, abon: 0
              };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur1Name} Retur`}>B. {bubur1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.bubur_d * 118}
                      value={(row.bubur_d || 0) * 118 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_d);
                        handleReturChange(step5OutletId, "bubur_d", cups);
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {row.bubur_d || 0} cup / {sent.bubur_d} cup kirim</span>
                    <span className="text-[9px] text-muted-foreground block text-center">Kirim: {sent.bubur_d * 118}g | Retur: {(row.bubur_d || 0) * 118}g</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur2Name} Retur`}>B. {bubur2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.bubur_i * 118}
                      value={(row.bubur_i || 0) * 118 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 118), sent.bubur_i);
                        handleReturChange(step5OutletId, "bubur_i", cups);
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {row.bubur_i || 0} cup / {sent.bubur_i} cup kirim</span>
                    <span className="text-[9px] text-muted-foreground block text-center">Kirim: {sent.bubur_i * 118}g | Retur: {(row.bubur_i || 0) * 118}g</span>
                  </div>
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Tim ${tim1Name} Retur`}>T. {tim1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.tim_d * 108}
                      value={(row.tim_d || 0) * 108 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 108), sent.tim_d);
                        handleReturChange(step5OutletId, "tim_d", cups);
                      }}
                      className="h-9 text-xs text-center border-amber-300 focus-visible:ring-amber-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {row.tim_d || 0} cup / {sent.tim_d} cup kirim</span>
                    <span className="text-[9px] text-muted-foreground block text-center">Kirim: {sent.tim_d * 108}g | Retur: {(row.tim_d || 0) * 108}g</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Tim ${tim2Name} Retur`}>T. {tim2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.tim_i * 108}
                      value={(row.tim_i || 0) * 108 || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        const cups = Math.min(Math.floor(grams / 108), sent.tim_i);
                        handleReturChange(step5OutletId, "tim_i", cups);
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {row.tim_i || 0} cup / {sent.tim_i} cup kirim</span>
                    <span className="text-[9px] text-muted-foreground block text-center">Kirim: {sent.tim_i * 108}g | Retur: {(row.tim_i || 0) * 108}g</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.oatmeal}
                      value={row.oatmeal || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground block text-center mt-0.5">Kirim: {sent.oatmeal} ({sent.oatmeal * 100}g)</span>
                    <span className="text-[9px] text-destructive block text-center">Retur: {row.oatmeal * 100}g</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.puding}
                      value={row.puding || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground block text-center mt-0.5">Kirim: {sent.puding} ({sent.puding * 80}g)</span>
                    <span className="text-[9px] text-destructive block text-center">Retur: {row.puding * 80}g</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.abon}
                      value={row.abon || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-muted-foreground block text-center mt-0.5">Kirim: {sent.abon} ({sent.abon * 10}g)</span>
                    <span className="text-[9px] text-destructive block text-center">Retur: {row.abon * 10}g</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Retur & Produk Terjual (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur1Name} Retur/Kirim</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name} Retur/Kirim</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Tim {tim1Name} Retur/Kirim</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5 font-semibold">Tim {tim2Name} Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon Retur/Kirim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o) => {
                      const row = returGrid[o.id] || {
                        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                        oatmeal: 0, puding: 0, abon: 0
                      };
                      const sent = distGrid[o.id] || {
                        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                        oatmeal: 0, puding: 0, abon: 0
                      };
                      const isSelected = o.id === step5OutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setStep5OutletId(o.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" 
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{o.nama}</span>
                              {isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.bubur_d || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.bubur_d || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.bubur_d || 0) * 118}g / {(sent.bubur_d || 0) * 118}g</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.bubur_i || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.bubur_i || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.bubur_i || 0) * 118}g / {(sent.bubur_i || 0) * 118}g</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.tim_d || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.tim_d || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.tim_d || 0) * 108}g / {(sent.tim_d || 0) * 108}g</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.tim_i || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.tim_i || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.tim_i || 0) * 108}g / {(sent.tim_i || 0) * 108}g</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.oatmeal || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.oatmeal || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.oatmeal || 0) * 100}g / {(sent.oatmeal || 0) * 100}g</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.puding || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.puding || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.puding || 0) * 80}g / {(sent.puding || 0) * 80}g</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.abon || 0}</span>
                              <span className="text-muted-foreground/60">/{sent.abon || 0}</span>
                            </div>
                            <div className="text-[9px] text-muted-foreground">{(row.abon || 0) * 10}g / {(sent.abon || 0) * 10}g</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(4)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Kembali</span>
            </Button>
            <Button
              variant="outline"
              onClick={handleRefreshStep5}
              disabled={refreshing}
              className="h-10 relative"
              title={hasNewSalesData ? "Ada data penjualan baru! Klik untuk memuat ulang" : "Muat ulang data penjualan dari outlet"}
            >
              {hasNewSalesData && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center shadow-sm border border-background">
                  !
                </span>
              )}
              <RotateCcw className={refreshing ? "h-4 w-4 md:mr-2 animate-spin" : "h-4 w-4 md:mr-2"} />
              <span className="hidden md:inline">{refreshing ? "Memuat..." : "Refresh"}</span>
            </Button>
            <Button onClick={saveStep5} className="gradient-success text-white hover-lift h-10 font-bold" disabled={closingCycle}>
              <ShoppingBag className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{closingCycle ? "Menutup siklus..." : "Selesaikan & Tutup Siklus"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderSiklusView() {
    return (
      <div className="space-y-6">
        {/* Configuration Card */}
        <Card className="glass border-0 shadow-card bg-card/60 backdrop-blur-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="space-y-1 w-full md:w-1/3">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" /> Tanggal Produksi
                  </Label>
                  <Input
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="h-10 rounded-xl font-medium border-primary/20 focus-visible:ring-primary text-sm shadow-sm"
                  />
                </div>
                <div className="text-xs text-muted-foreground italic text-right hidden md:block">
                  Pilih varian menu harian secara independen untuk Bubur 1, Bubur 2, Tim 1, dan Tim 2
                </div>
              </div>

              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 pt-4 border-t border-muted/50">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">B1</Badge>
                    Bubur 1
                  </Label>
                  <Select value={bubur1Variant} onValueChange={setBubur1Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-amber-300/80 focus:ring-amber-500 bg-amber-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20">B2</Badge>
                    Bubur 2
                  </Label>
                  <Select value={bubur2Variant} onValueChange={setBubur2Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-blue-300/80 focus:ring-blue-500 bg-blue-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">T1</Badge>
                    Tim 1
                  </Label>
                  <Select value={tim1Variant} onValueChange={setTim1Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-amber-300/80 focus:ring-amber-500 bg-amber-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20">T2</Badge>
                    Tim 2
                  </Label>
                  <Select value={tim2Variant} onValueChange={setTim2Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-blue-300/80 focus:ring-blue-500 bg-blue-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stepper Wizard Header */}
        <div className="bg-card/45 backdrop-blur-md rounded-2xl border p-4 shadow-soft">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm">Siklus Harian</span>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs font-medium text-muted-foreground">Konversi resep otomatis, alokasi gudang, dan pencatatan retur/jurnal otomatis</span>
            </div>
          </div>
          
          {/* Desktop Stepper Wizard */}
          <div className="hidden md:grid grid-cols-5 gap-2 mt-4 pt-4 border-t">
            {[
              { num: 1, label: "Pra-Produksi" },
              { num: 2, label: "Request Bahan" },
              { num: 3, label: "Pasca-Produksi" },
              { num: 4, label: "Distribusi" },
              { num: 5, label: "Retur & Penjualan" }
            ].map((s) => {
              const isActive = step === s.num;
              const isPast = step > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setStep(s.num)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all text-center ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : isPast
                      ? "text-success hover:bg-success/5"
                      : "text-muted-foreground hover:bg-muted/10"
                  }`}
                >
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                    isActive 
                      ? "bg-white text-primary" 
                      : isPast 
                      ? "bg-success/15 text-success" 
                      : "bg-muted/50 text-muted-foreground"
                  }`}>
                    {isPast ? <Check className="h-3.5 w-3.5" /> : s.num}
                  </div>
                  <span className="text-xs font-bold leading-none">{s.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Stepper Wizard */}
          <div className="flex md:hidden flex-wrap items-center justify-center gap-1 mt-4 pt-4 border-t text-sm font-semibold w-full">
            {[
              { num: 1, label: "Pra-Produksi" },
              { num: 2, label: "Request Bahan" },
              { num: 3, label: "Pasca-Produksi" },
              { num: 4, label: "Distribusi" },
              { num: 5, label: "Retur & Penjualan" }
            ].map((s, index, arr) => {
              const isActive = step === s.num;
              return (
                <div key={s.num} className="flex items-center">
                  <button
                    onClick={() => setStep(s.num)}
                    className={`flex items-center gap-1.5 py-1 px-2.5 rounded-full transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className="text-xs">{s.num}</span>
                    {isActive && (
                      <span className="text-[11px] font-bold tracking-tight">{s.label}</span>
                    )}
                  </button>
                  {index < arr.length - 1 && (
                    <span className="text-muted-foreground/30 text-xs px-1">|</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP CONTENT */}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>
    );
  }

  const isKapro = user?.role === "produksi";

  if (isKapro) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Siklus Produksi Harian</h1>
          <p className="text-sm text-muted-foreground">Kelola siklus harian dari perencanaan pra-produksi hingga retur sore hari</p>
        </div>
        {renderSiklusView()}
      </div>
    );
  }

  // Admin View has tab options
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Produksi & Permohonan</h1>
        <p className="text-sm text-muted-foreground">Rencana produksi harian, permohonan outlet, dan riwayat produksi</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <TabsList className="grid w-full max-w-[400px] grid-cols-2 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="siklus" className="rounded-lg font-semibold">Siklus Produksi Harian</TabsTrigger>
            <TabsTrigger value="riwayat" className="rounded-lg font-semibold">Riwayat Produksi</TabsTrigger>
          </TabsList>
          {activeTab === "riwayat" && (
            <div className="flex items-center gap-2">
              <ImportExcelButton onData={onImport} />
            </div>
          )}
        </div>

        <TabsContent value="siklus" className="space-y-6 mt-0">
          {renderSiklusView()}
        </TabsContent>

        <TabsContent value="riwayat" className="space-y-6 mt-0">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Riwayat Produksi (Excel-aligned)</CardTitle>
              <div className="flex flex-wrap gap-2 pt-2 items-center">
                <DateRangeFilter value={range} onChange={setRange} />
                <div className="w-full sm:w-auto sm:ml-auto">
                  <ExportButtons
                    filename="produksi"
                    title="Riwayat Produksi"
                    headers={["Tanggal", "Produk", "Rencana", "Realisasi", "Gramasi (g)"]}
                    rows={filtered.map((p) => {
                      const pr = produk.find((x) => x.id === p.produkId);
                      let factor = 0;
                      if (p.produkId === "p-bubur") factor = 118;
                      else if (p.produkId === "p-nasitim") factor = 108;
                      else if (p.produkId === "p-oatmeal") factor = 100;
                      else if (p.produkId === "p-puding") factor = 80;
                      else if (p.produkId === "p-abon") factor = 10;
                      return [
                        p.tanggal,
                        pr?.nama ?? "-",
                        p.qtyRencana,
                        p.qtyRealisasi,
                        p.qtyRealisasi * factor
                      ];
                    })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProduksiTable filtered={filtered} produk={produk} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// === SUBCOMPONENT: TABLE FOR RENDER ===
function ProduksiTable({ filtered, produk }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Rencana (porsi)</TableHead>
              <TableHead className="text-right">Realisasi (porsi)</TableHead>
              <TableHead className="text-right">Gramasi (g)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada produksi</TableCell></TableRow>
            )}
            {paged.map((p: any) => {
              const pr = produk.find((x: any) => x.id === p.produkId);
              const ok = p.qtyRealisasi >= p.qtyRencana;
              let factor = 0;
              if (p.produkId === "p-bubur") factor = 118;
              else if (p.produkId === "p-nasitim") factor = 108;
              else if (p.produkId === "p-oatmeal") factor = 100;
              else if (p.produkId === "p-puding") factor = 80;
              else if (p.produkId === "p-abon") factor = 10;
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{pr?.nama ?? "-"}</TableCell>
                  <TableCell className="text-right">{p.qtyRencana}</TableCell>
                  <TableCell className="text-right font-semibold">{p.qtyRealisasi}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{p.qtyRealisasi * factor} g</TableCell>
                  <TableCell>
                    {ok
                      ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Tercapai</Badge>
                      : <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1"><AlertTriangle className="h-3 w-3" />Kurang</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => db.deleteProduksi(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
    </div>
  );
}
