import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { db, useDB, fetchFromSupabase, saldoBahan, getBubaSettings, GRAM_EXCLUDED_BAHAN } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Check, X, Clock, ArrowRight, ArrowLeft, ClipboardList, Send, RotateCcw, ShoppingBag, Calculator, ChevronDown, ChevronUp, Copy, Package, LockOpen } from "lucide-react";
import { ArrowNav } from "@/components/ArrowNav";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { DateInput } from "@/components/DateInput";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import OutletFilter from "@/components/OutletFilter";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { AkunKategori } from "@/lib/types";
import { calcKemasanKebutuhan, KEMASAN_BAHAN, sisaGramToCups, resolveFreshReturGrid } from "@/lib/produksi-utils";

// Base ratios for Bubur (per 100gr beras = 6 cup)
// Base ratio: Beras:Daging:Air:S.Hijau:S.Brokoli:S.Putih = 100:5:700:8:5:1.5
// Rasio 100/6 menghasilkan sekitar 16.67 gr per cup, jadi hasil dapat berisi desimal.
const BUBUR_BASE = {
  beras: 100,
  daging: 5,
  air: 700,
  sayurHijau: 8,
  sayurBuah: 5,
  sayurProtein: 1.5, // = 3/2
};

const formatDecimal = (value: number) => {
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/(?:\.0+|0+)$/, "");
};

const buburCalc = (cups: number, baseAmount: number) => (cups * baseAmount) / 6;

// Batas toleransi deviasi realisasi vs rencana — di atas ini muncul konfirmasi saat menyimpan Step 3 (20%)
const DEVIASI_THRESHOLD = 0.2;

// Sentinel id untuk opsi "Semua Outlet" di Langkah 4 — menampilkan total retur OH seluruh outlet
const ALL_OUTLETS_ID = "__all__";

// Bentuk baris retur/distribusi default (semua nol)
const ZERO_RETUR_ROW = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

// Jumlahkan grid per-outlet (returGrid / distGrid) menjadi satu baris total "Semua Outlet"
const sumGridRows = (grid: Record<string, Record<string, number>>) => {
  const out = { ...ZERO_RETUR_ROW };
  Object.values(grid).forEach((r) => {
    out.bubur_d += r.bubur_d || 0;
    out.bubur_i += r.bubur_i || 0;
    out.tim_d += r.tim_d || 0;
    out.tim_i += r.tim_i || 0;
    out.oatmeal += r.oatmeal || 0;
    out.puding += r.puding || 0;
    out.abon += r.abon || 0;
  });
  return out;
};

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
  // Tandai saat admin mengedit input retur Langkah 4 secara manual — nilai itu
  // WAJIB dihormati saat tutup siklus (tidak boleh dihitung ulang dari penjualan).
  const hasManualReturEdits = useRef(false);

  // Reset modification flag when date changes — prevents background Supabase
  // polling/real-time updates from resetting user input mid-edit.
  useEffect(() => {
    hasUserModifiedGrids.current = false;
    hasManualReturEdits.current = false;
    // Reset status auto-konfirmasi OH abon saat ganti tanggal siklus
    setOhAbonApplied(false);
    setOhAbonAutoConfirmed(false);
  }, [tanggal]);

  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("siklus"); // siklus, riwayat
  const [range, setRange] = useState<DateRange>({});
  const [requestingWarehouse, setRequestingWarehouse] = useState(false);
  const [warehouseConfirmOpen, setWarehouseConfirmOpen] = useState(false);
  // Buka siklus (khusus admin) — dialog konfirmasi + status proses
  const [bukaSiklusOpen, setBukaSiklusOpen] = useState(false);
  const [bukaSiklusLoading, setBukaSiklusLoading] = useState(false);
  // OH abon yang disalin ke rencana (Langkah 1) → auto-konfirmasi ke distribusi saat stok dipotong (Langkah 2)
  const [ohAbonApplied, setOhAbonApplied] = useState(false);
  const [ohAbonAutoConfirmed, setOhAbonAutoConfirmed] = useState(false);

  const [step1OutletId, setStep1OutletId] = useState("");
  const [expandedOutlets, setExpandedOutlets] = useState<Record<string, boolean>>({});
  // Daftar produk yang realisasinya menyimpang jauh dari rencana — memicu dialog konfirmasi saat simpan Step 3
  const [deviasiConfirmList, setDeviasiConfirmList] = useState<{ label: string; target: number; cups: number }[] | null>(null);
  const [recipeExpanded, setRecipeExpanded] = useState(false);
  const [settings, setSettings] = useState(getBubaSettings());
  useEffect(() => {
    const handler = () => setSettings(getBubaSettings());
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);
  const [distOutletId, setDistOutletId] = useState("");
  const [returOutletId, setReturOutletId] = useState(ALL_OUTLETS_ID); // default "Semua Outlet"

  useEffect(() => {
    if (outlets.length > 0) {
      if (!step1OutletId) setStep1OutletId(outlets[0].id);
      if (!distOutletId) setDistOutletId(outlets[0].id);
      // Langkah 4 (Retur) sengaja default ke "Semua Outlet" (total retur OH seluruh outlet)
    }
  }, [outlets, step1OutletId, distOutletId]);

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
  const [outletFilterId, setOutletFilterId] = useState("");
  const [tanggal2, setTanggal2] = useState("");
  const [isTwoDayPlan, setIsTwoDayPlan] = useState(false);
  const [activePlanDate, setActivePlanDate] = useState<"date1" | "date2">("date1");
  const [planGrid2, setPlanGrid2] = useState<Record<string, Record<string, number>>>({});

  // STEP 3 STATES (Distribusi ke outlet)
  // Aktual masak (actualCups) TIDAK diinput manual lagi — diturunkan otomatis dari
  // total distribusi (distTotals): kapro langsung memasukkan angka aktual per outlet
  // di kolom distribusi; luberan/penyusutan terlihat dari selisih vs rencana di bawah.
  const [distGrid, setDistGrid] = useState<Record<string, Record<string, number>>>({});

  // STEP 4 STATES (Retur & Penjualan)
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

  // Serialize split + variant names into catatan
  // Format: [D:X,I:Y] [V:v1Name,v2Name] [I:v1Id,v2Id] rest
  // v1Name/v2Name = nama varian untuk bubur/tim 1 dan 2
  // v1Id/v2Id = ID bahan untuk varian (disimpan agar bisa di-restore saat load)
  const serializeSplit = (d: number, i: number, originalCatatan = "", variant1 = "", variant2 = "", variantId1 = "", variantId2 = "") => {
    const cleanCat = originalCatatan.replace(/\[D:\d+,I:\d+\]\s*/, "").replace(/\[V:[^\]]*\]\s*/, "").replace(/\[I:[^\]]*\]\s*/, "");
    const variantPart = (variant1 || variant2) ? `[V:${variant1},${variant2}] ` : "";
    const idPart = (variantId1 || variantId2) ? `[I:${variantId1},${variantId2}] ` : "";
    return `[D:${d},I:${i}] ${variantPart}${idPart}${cleanCat}`.trim();
  };

  // Parse variant names from catatan
  const parseVariants = (catatan: string) => {
    const match = catatan?.match(/\[V:([^,\]]+),([^,\]]+)\]/);
    if (match) {
      return { v1: match[1], v2: match[2] };
    }
    return { v1: "", v2: "" };
  };

  // Parse variant IDs from catatan
  const parseVariantIds = (catatan: string) => {
    const match = catatan?.match(/\[I:([^,\]]+),([^,\]]+)\]/);
    if (match) {
      return { v1: match[1], v2: match[2] };
    }
    return { v1: "", v2: "" };
  };

  // Load plan for a given date into the specified grid setter
  const loadPlanForDate = (dateStr: string, setter?: (grid: Record<string, Record<string, number>>) => void) => {
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
    
    if (setter) {
      setter(grid);
    } else {
      setPlanGrid(grid);
    }
  };

  // Load plan for tanggal2 into planGrid2
  const loadPlanForDate2 = () => {
    if (!tanggal2) {
      // Reset planGrid2
      const empty: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        empty[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });
      setPlanGrid2(empty);
      return;
    }
    loadPlanForDate(tanggal2, (grid) => setPlanGrid2(grid));
  };

  // Load grids from DB on date change or initial outlet load.
  // ⚠️ Depends on [tanggal, outlets, penjualan, permohonanStok, produksi, bahan] — penjualan included so
  // that when outlet saves sisa penjualan via Laporan page, the returGrid
  // in Step 5 auto-updates with the latest sales data. permohonanStok, produksi, bahan
  // included so that grids load correctly after Supabase fetch completes on page refresh.
  // hasUserModifiedGrids ref prevents re-init if user has manually edited
  // any grid input — safe against background-polling reset.
  useEffect(() => {
    if (hasUserModifiedGrids.current) return;
    if (tanggal && outlets.length > 0) {
      loadPlanForDate(tanggal);

      // Load variant selections from database
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

      // Load Step 3 — aktual masak diturunkan dari TOTAL DISTRIBUSI (distGrid).
      // Tidak ada lagi input manual berat matang. Distribusi di-load dari
      // permohonan_stok (angka rencana) agar kapro tinggal menyesuaikan per outlet.
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
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
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
  }, [tanggal, outlets, penjualan, permohonanStok, produksi, bahan]); // penjualan included so Step 5 returGrid auto-syncs when outlet saves sisa

  const handlePlanChange = (outletId: string, field: string, val: number) => {
    if (isReadOnlyGudang) return;
    hasUserModifiedGrids.current = true;
    const setter = activePlanDate === "date1" ? setPlanGrid : setPlanGrid2;
    setter(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleDistChange = (outletId: string, field: string, val: number) => {
    if (isReadOnlyGudang) return;
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
    if (isReadOnlyGudang) return;
    hasUserModifiedGrids.current = true;
    hasManualReturEdits.current = true;
    setReturGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  // Pindah ke outlet sebelumnya/berikutnya (Langkah 3 & 4).
  // includeAll=true menyertakan "Semua Outlet" sebagai item pertama (Langkah 4).
  const cycleOutlet = (
    dir: 1 | -1,
    currentId: string,
    setCurrent: (id: string) => void,
    includeAll = false
  ) => {
    const ids = includeAll
      ? [ALL_OUTLETS_ID, ...outlets.map((o) => o.id)]
      : outlets.map((o) => o.id);
    if (ids.length === 0) return;
    const cur = ids.includes(currentId) ? currentId : ids[0];
    const next = (ids.indexOf(cur) + dir + ids.length) % ids.length;
    setCurrent(ids[next]);
  };

  // STEP 1 Action: Save pre-production target plans
  const isReadOnlyGudang = user?.role === "gudang";

  // Siklus dianggap TERTUTUP bila ada jurnal OUT-SALES untuk tanggal ini
  const isCycleClosed = useMemo(() => {
    return (dbState.jurnal || []).some((j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES");
  }, [dbState.jurnal, tanggal]);

  // Buka siklus (KHUSUS ADMIN): hapus jurnal OUT-SALES & stok IN retur/OH abon untuk tanggal ini.
  // Data penjualan TIDAK dihapus — tetap bisa diedit ulang; tutup siklus lagi setelah selesai.
  const handleBukaSiklus = async () => {
    if (user?.role !== "admin") {
      toast.error("Hanya akun admin yang dapat membuka siklus");
      return;
    }
    if (closingCycle || bukaSiklusLoading) return; // cegah proses ganda
    setBukaSiklusOpen(false);
    setBukaSiklusLoading(true);
    try {
      // 1. Hapus jurnal OUT-SALES tanggal ini
      const outSales = (dbState.jurnal || []).filter(
        (j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES"
      );
      for (const j of outSales) {
        await supabase.from("jurnal").delete().eq("id", j.id);
      }
      // 2. Hapus stok IN retur/OH abon tanggal ini (dibuat saat tutup siklus)
      const returMovs = (dbState.stokMov || []).filter(
        (m: any) =>
          m.tanggal === tanggal &&
          m.tipe === "IN" &&
          (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon"))
      );
      for (const m of returMovs) {
        await supabase.from("stok_movement").delete().eq("id", m.id);
      }
      const deletedCount = outSales.length + returMovs.length;
      // Lepas guard edit manual SEBELUM fetch agar grid di-reload dari data
      // terbaru DB & auto-sync penjualan dari outlet kembali aktif.
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      await fetchFromSupabase();
      if (deletedCount > 0) {
        toast.success(`Siklus ${tanggal} dibuka (${deletedCount} record jurnal/stok dihapus) — penjualan bisa diedit ulang`);
      } else {
        toast.info(`Tidak ada jurnal/retur siklus untuk ${tanggal} — siklus sudah terbuka`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Buka siklus error:", err);
      toast.error(`Gagal membuka siklus: ${errMsg}`);
    } finally {
      setBukaSiklusLoading(false);
    }
  };

  const saveStep1 = async () => {
    if (isReadOnlyGudang) return toast.error("Anda tidak memiliki izin untuk menyimpan data produksi");
    try {
      // Upsert rencana: update record yang sudah ada (PERTAHANKAN status Disetujui),
      // insert record baru sebagai Pending, dan hapus record lama yang tidak lagi
      // direncanakan SELAMA belum ber-status Disetujui.
      // Mencegah re-save rencana menghapus status "Disetujui" — tanpa status itu
      // outlet tidak bisa menginput OH (form OH outlet hanya membaca Disetujui).
      const upsertPlan = async (kirimTanggal: string, items: any[]) => {
        const existingRecs = permohonanStok.filter((r: any) => r.tanggalKirim === kirimTanggal);
        const existingByKey = new Map(existingRecs.map((r: any) => [`${r.outletId}|${r.produkId}`, r]));
        const toUpdate: { id: string; qty: number; catatan: string }[] = [];
        const toInsert: any[] = [];
        const plannedKeys = new Set<string>();
        items.forEach((item) => {
          const key = `${item.outletId}|${item.produkId}`;
          plannedKeys.add(key);
          const old = existingByKey.get(key);
          if (old) {
            toUpdate.push({ id: old.id, qty: item.qty, catatan: item.catatan });
          } else {
            toInsert.push(item);
          }
        });
        await Promise.all(toUpdate.map(u => db.updatePermohonanStok(u.id, { qty: u.qty, catatan: u.catatan })));
        if (toInsert.length > 0) await db.addPermohonanStokBulk(toInsert);
        const stale = existingRecs.filter(r => !plannedKeys.has(`${r.outletId}|${r.produkId}`) && r.status !== "Disetujui");
        await Promise.all(stale.map(r => db.deletePermohonanStok(r.id)));
      };

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
            catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0, "", bubur1Name, bubur2Name, bubur1Variant, bubur2Variant)
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
            catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0, "", tim1Name, tim2Name, tim1Variant, tim2Variant)
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

      // Save main batch for tanggal
      await upsertPlan(tanggal, batch);

      // If 2-day plan is active, build tanggal2 batch too
      if (isTwoDayPlan && tanggal2) {
        const batch2: any[] = [];
        Object.entries(planGrid2).forEach(([outletId, vals]) => {
          const totalBubur = (vals.bubur_d || 0) + (vals.bubur_i || 0);
          if (totalBubur > 0) {
            batch2.push({
              tanggal: todayISO(),
              tanggalKirim: tanggal2,
              outletId,
              produkId: "p-bubur",
              qty: totalBubur,
              catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0, "", bubur1Name, bubur2Name, bubur1Variant, bubur2Variant)
            });
          }

          const totalTim = (vals.tim_d || 0) + (vals.tim_i || 0);
          if (totalTim > 0) {
            batch2.push({
              tanggal: todayISO(),
              tanggalKirim: tanggal2,
              outletId,
              produkId: "p-nasitim",
              qty: totalTim,
              catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0, "", tim1Name, tim2Name, tim1Variant, tim2Variant)
            });
          }

          if (vals.oatmeal > 0) {
            batch2.push({ tanggal: todayISO(), tanggalKirim: tanggal2, outletId, produkId: "p-oatmeal", qty: vals.oatmeal, catatan: "" });
          }
          if (vals.puding > 0) {
            batch2.push({ tanggal: todayISO(), tanggalKirim: tanggal2, outletId, produkId: "p-puding", qty: vals.puding, catatan: "" });
          }
          if (vals.abon > 0) {
            batch2.push({ tanggal: todayISO(), tanggalKirim: tanggal2, outletId, produkId: "p-abon", qty: vals.abon, catatan: "" });
          }
        });

        await upsertPlan(tanggal2, batch2);
      }

      toast.success("Rencana Pra-Produksi berhasil disimpan!");
      setStep(2);
    } catch (err: any) {
      console.error("saveStep1 error:", err);
      toast.error(`Gagal menyimpan rencana: ${err?.message || err || "Unknown error"}`);
    }
  };

  // Single-date totals (only planGrid for tanggal) — used in Steps 3, 4, 5
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

  // Ada produk selain abon yang direncanakan? (penentu lewati Langkah 3 bila hanya abon OH)
  const hasOtherProducts = totals.buburD + totals.buburI + totals.timD + totals.timI + totals.oatmeal + totals.puding > 0;

  // Grid distribusi khusus hanya-abon OH (dipakai saat melewati Langkah 3)
  const buildAbonDistGrid = (): Record<string, Record<string, number>> => {
    const grid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      const plan = planGrid[o.id] || {};
      grid[o.id] = {
        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0,
        abon: plan.abon || 0
      };
    });
    return grid;
  };

  // Combined totals (planGrid + planGrid2) — used in Step 2 for material calculation
  const combinedTotals = useMemo(() => {
    let buburD = 0, buburI = 0, timD = 0, timI = 0;
    let oatmeal = 0, puding = 0, abon = 0;

    const sumGrid = (grid: Record<string, Record<string, number>>) => {
      Object.values(grid).forEach(v => {
        buburD += v.bubur_d || 0;
        buburI += v.bubur_i || 0;
        timD += v.tim_d || 0;
        timI += v.tim_i || 0;
        oatmeal += v.oatmeal || 0;
        puding += v.puding || 0;
        abon += v.abon || 0;
      });
    };

    sumGrid(planGrid);
    if (isTwoDayPlan) {
      sumGrid(planGrid2);
    }

    const totalBubur = buburD + buburI;
    const totalTim = timD + timI;

    return {
      buburD, buburI, totalBubur,
      timD, timI, totalTim,
      oatmeal, puding, abon
    };
  }, [planGrid, planGrid2, isTwoDayPlan]);

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

  // Aktual masak = TOTAL DISTRIBUSI ke semua outlet (kapro memasukkan angka aktual
  // langsung di kolom distribusi per outlet; luberan/penyusutan terlihat dari
  // selisih vs rencana di bagian bawah). Tidak ada lagi input manual berat matang.
  const actualCups = useMemo(() => ({
    bubur_1: distTotals.buburD,
    bubur_2: distTotals.buburI,
    tim_1: distTotals.timD,
    tim_2: distTotals.timI,
    oatmeal: distTotals.oatmeal,
    puding: distTotals.puding,
    abon: distTotals.abon,
  }), [distTotals]);

  const materialReqs = useMemo(() => {
    const t = combinedTotals; // use combined totals for material calculation
    const reqs: { bahanId: string; kode: string; nama: string; qty: number; rawQtyGrams: number; satuan: string }[] = [];

    // 1. Beras — qty dalam gram (internal stok movement), satuan dari DB (Pack) untuk display konversi
    const berasGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.beras) + (t.timD * settings.berasTim) + (t.timI * settings.berasTim));
    const berasBahan = bahan.find((x: any) => x.id === "b-brs01");
    if (berasGr > 0) {
      reqs.push({
        bahanId: "b-brs01",
        kode: "BRS01",
        nama: "BERAS",
        qty: berasGr, // gram
        rawQtyGrams: berasGr,
        satuan: berasBahan?.satuan || "g"
      });
    }

    // 1b. Sayur
    const shGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurHijau) + (t.timD + t.timI) * settings.sayurHijauTim);
    if (shGr > 0) {
      reqs.push({
        bahanId: "b-sh01",
        kode: "SH01",
        nama: "SAYUR HIJAU",
        qty: shGr,
        rawQtyGrams: shGr,
        satuan: "g"
      });
    }

    const sbGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurBuah) + (t.timD + t.timI) * settings.sayurBuahTim);
    if (sbGr > 0) {
      reqs.push({
        bahanId: "b-sb01",
        kode: "SB01",
        nama: "SAYUR BUAH",
        qty: sbGr,
        rawQtyGrams: sbGr,
        satuan: "g"
      });
    }

    const spGr = Math.ceil(buburCalc(t.buburD + t.buburI, BUBUR_BASE.sayurProtein) + (t.timD + t.timI) * settings.sayurProteinTim);
    if (spGr > 0) {
      reqs.push({
        bahanId: "b-sp01",
        kode: "SP01",
        nama: "SAYUR PROTEIN",
        qty: spGr,
        rawQtyGrams: spGr,
        satuan: "g"
      });
    }

    // Helper to add meat variant
    // qty disimpan sebagai BILANGAN BULAT (kolom stok_movement.qty bertipe integer) —
    // gram desimal dari rasio per cup dibulatkan agar insert tidak gagal (bug lama:
    // potongan daging selalu gagal & hilang). rawQtyGrams tetap desimal utk display.
    const addVariant = (variantId: string, grams: number) => {
      const b = bahan.find(x => x.id === variantId);
      if (b && grams > 0) {
        const existing = reqs.find(r => r.bahanId === variantId);
        if (existing) {
          existing.rawQtyGrams += grams;
          existing.qty = Math.round(existing.rawQtyGrams);
        } else {
          reqs.push({
            bahanId: variantId,
            kode: b.kode,
            nama: b.nama,
            qty: Math.round(grams),
            rawQtyGrams: grams,
            satuan: b.satuan
          });
        }
      }
    };

    // Meats
    if (t.buburD > 0 && bubur1Variant) addVariant(bubur1Variant, buburCalc(t.buburD, BUBUR_BASE.daging));
    if (t.buburI > 0 && bubur2Variant) addVariant(bubur2Variant, buburCalc(t.buburI, BUBUR_BASE.daging));
    if (t.timD > 0 && tim1Variant) addVariant(tim1Variant, t.timD * settings.dagingTim);
    if (t.timI > 0 && tim2Variant) addVariant(tim2Variant, t.timI * settings.dagingTim);

    // Puding — dalam pcs (produksi selalu habis per pcs, tidak ada sisa gram)
    const pudingGr = Math.ceil(t.puding * settings.pudingCup);
    const pudingBahan = bahan.find((x: any) => x.id === "b-pud01");
    const pudingKonv = pudingBahan?.konversiGram || 130; // konversi dari master data (default 130 gr/pcs)
    const pudingPcs = Math.ceil(pudingGr / pudingKonv);
    if (pudingPcs > 0) {
      reqs.push({
        bahanId: "b-pud01",
        kode: "PUD01",
        nama: "PUDING",
        qty: pudingPcs,
        rawQtyGrams: pudingGr,
        satuan: "pcs"
      });
    }

    // Oat — dalam pcs (produksi selalu habis per pcs, tidak ada sisa gram)
    const oatGr = Math.ceil(t.oatmeal * settings.oatmealCup);
    const oatBahan = bahan.find((x: any) => x.id === "b-oat01");
    const oatKonv = oatBahan?.konversiGram || 180; // konversi dari master data (default 180 gr/pcs)
    const oatPcs = Math.ceil(oatGr / oatKonv);
    if (oatPcs > 0) {
      reqs.push({
        bahanId: "b-oat01",
        kode: "OAT01",
        nama: "OAT",
        qty: oatPcs,
        rawQtyGrams: oatGr,
        satuan: "pcs"
      });
    }

    // Abon — stock dalam gram (konversi 1 pcs = 10 g), display satuan pcs
    const abonGr = Math.ceil(t.abon * settings.abonCup);
    if (t.abon > 0) {
      reqs.push({
        bahanId: "b-ab01",
        kode: "AB01",
        nama: "ABON",
        qty: abonGr, // gram (untuk stok movement)
        rawQtyGrams: t.abon, // pcs (untuk display)
        satuan: "pcs"
      });
    }

    // KEMASAN (CUP & TUTUP) TIDAK dipotong di sini — dihitung di Langkah 3
    // sesuai HASIL PRODUKSI AKTUAL (hasil bisa menyusut/meluber). Bahan utama
    // di atas dipotong dari rencana dan TIDAK terpengaruh hasil produksi.

    return reqs;
  }, [combinedTotals, bubur1Variant, bubur2Variant, tim1Variant, tim2Variant, bahan, settings]);

  // Kebutuhan kemasan (cup & tutup Puding/Oatmeal) dihitung dari HASIL PRODUKSI
  // AKTUAL (Langkah 3) — karena hasil bisa menyusut atau meluber, jumlah cup & tutup
  // yang dipotong mengikuti realisasi, bukan rencana.
  // Kemasan BUBUR & NASI TIM (CUP BUBUR & TUTUP, stok sama) TIDAK dipotong di sini —
  // stoknya berkurang lewat permohonan/retur perlengkapan outlet (Stok Gudang).
  const packagingReqs = useMemo(() => {
    return calcKemasanKebutuhan({ puding: actualCups.puding, oatmeal: actualCups.oatmeal });
  }, [actualCups]);

  const isWarehouseRequested = useMemo(() => {
    // Check by keterangan label — this works regardless of the tanggal used
    const label = isTwoDayPlan && tanggal2 ? `${tanggal} + ${tanggal2}` : tanggal;
    return stokMov.some((m: any) => 
      m.tipe === "OUT" && m.keterangan === `Pemakaian Produksi [${label}]`
    );
  }, [stokMov, tanggal, tanggal2, isTwoDayPlan]);

  const requestWarehouse = async () => {
    if (isReadOnlyGudang) return toast.error("Anda tidak memiliki izin untuk memotong stok");
    // Cegah double-click: hanya cek requestingWarehouse (bukan isWarehouseRequested)
    // agar user bisa melakukan validasi ulang jika perlu (dengan menghapus & membuat ulang)
    if (requestingWarehouse) return;
    setRequestingWarehouse(true);

    try {
      const stockDate = todayISO();
      const datesLabel = isTwoDayPlan && tanggal2 ? `${tanggal} + ${tanggal2}` : tanggal;

      // Hapus pemotongan stok LAMA yang menggunakan tanggal hari ini untuk label yang sama
      const existingMov = (stokMov || []).filter(
        (m: any) => m.tanggal === stockDate && m.tipe === "OUT" && m.keterangan === `Pemakaian Produksi [${datesLabel}]`
      );
      for (const m of existingMov) {
        await db.deleteStokMov(m.id);
      }

      // Buat pemotongan stok baru — satu tombol, satu eksekusi
      await Promise.all(materialReqs.map(r => {
        return db.addStokMov({
          tanggal: stockDate,
          bahanId: r.bahanId,
          tipe: "OUT",
          qty: r.qty,
          keterangan: `Pemakaian Produksi [${datesLabel}]`
        });
      }));

      toast.success(`Bahan baku untuk ${datesLabel} berhasil dipotong dari stok gudang!`);
      setWarehouseConfirmOpen(false);

      // === AUTO-KONFIRMASI OH ABON KE DISTRIBUSI ===
      // Abon OH (sisa kemarin) sudah matang — realisasi = rencana & permohonan langsung
      // Disetujui, sehingga melewati input distribusi di Langkah 3.
      let autoConfirmed = false;
      if (ohAbonApplied && totals.abon > 0) {
        try {
          const abonReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal && r.produkId === "p-abon");
          await Promise.all(abonReqs.map((r: any) => db.updatePermohonanStok(r.id, { qty: r.qty, status: "Disetujui", catatan: r.catatan || "" })));
          const existingAbonProd = produksi.filter((p: any) => p.tanggal === tanggal && p.produkId === "p-abon");
          if (existingAbonProd.length > 0) {
            await Promise.all(existingAbonProd.map((p: any) => db.deleteProduksi(p.id)));
          }
          await db.addProduksiBulk([{ tanggal, produkId: "p-abon", qtyRencana: totals.abon, qtyRealisasi: totals.abon }]);
          setOhAbonAutoConfirmed(true);
          autoConfirmed = true;
        } catch (abonErr) {
          console.error("Auto-konfirmasi OH abon gagal:", abonErr);
          toast.error("Stok sudah dipotong, tetapi auto-konfirmasi OH abon gagal. Klik 'Validasi Ulang' untuk mencoba lagi.");
        }
      }

      // Langkah 3 sekarang = Distribusi (realisasi masak + alokasi outlet digabung).
      // Jika HANYA abon OH yang direncanakan → realisasi abon sudah auto-konfirmasi,
      // langsung ke distribusi.
      if (autoConfirmed && !hasOtherProducts) {
        setDistGrid(buildAbonDistGrid());
      }
      setStep(3);
    } catch (err) {
      toast.error("Gagal memotong stok gudang!");
      console.error(err);
    } finally {
      setRequestingWarehouse(false);
    }
  };

  // Navigasi setelah stok dipotong: bila hanya abon OH yang direncanakan (sudah auto-konfirmasi),
  // realisasi abon diset = rencana dan langsung ke Langkah 3 (Distribusi).
  const nextStepAfterWarehouse = () => {
    if (ohAbonAutoConfirmed && !hasOtherProducts) {
      setDistGrid(buildAbonDistGrid());
    }
    setStep(3);
  };

  // STEP 3 Action
  // Produk yang realisasinya menyimpang jauh dari rencana (> DEVIASI_THRESHOLD) → perlu konfirmasi saat simpan
  const getDeviasiList = () => {
    const items = [
      { label: `Bubur 1 (${bubur1Name})`, target: totals.buburD, cups: actualCups.bubur_1 },
      { label: `Bubur 2 (${bubur2Name})`, target: totals.buburI, cups: actualCups.bubur_2 },
      { label: `Nasi Tim 1 (${tim1Name})`, target: totals.timD, cups: actualCups.tim_1 },
      { label: `Nasi Tim 2 (${tim2Name})`, target: totals.timI, cups: actualCups.tim_2 },
      { label: "Oatmeal", target: totals.oatmeal, cups: actualCups.oatmeal },
      { label: "Puding", target: totals.puding, cups: actualCups.puding },
      { label: "Abon", target: totals.abon, cups: actualCups.abon }
    ];
    return items.filter((it) => {
      if (it.target <= 0) return it.cups > 0; // produksi di luar rencana
      return Math.abs(it.cups - it.target) / it.target > DEVIASI_THRESHOLD;
    });
  };

  const performSaveStep3 = async () => {
    if (isReadOnlyGudang) return toast.error("Anda tidak memiliki izin untuk menyimpan data produksi");
    try {
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

      // === PEMOTONGAN KEMASAN (CUP & TUTUP) SESUAI HASIL AKTUAL ===
      // Bahan utama sudah dipotong di Langkah 2 langsung dari rencana dan TIDAK
      // terpengaruh hasil produksi. Kemasan dihitung ulang dari cup aktual — karena
      // hasil bisa menyusut (kebutuhan berkurang) atau meluber (kebutuhan bertambah).
      const kemasanLabel = `Pemakaian Kemasan [${tanggal}]`;
      const existingKemasan = (stokMov || []).filter(
        (m: any) => m.tipe === "OUT" && m.keterangan === kemasanLabel
      );
      for (const m of existingKemasan) {
        await db.deleteStokMov(m.id);
      }
      // Bersihkan potongan kemasan FORMAT LAMA (Langkah 2 versi sebelumnya mencampur
      // cup & tutup ke label "Pemakaian Produksi [...]") agar tanggal lama yang
      // diproses ulang tidak terpotong dobel (rencana lama + aktual baru).
      const kemasanIds = new Set(KEMASAN_BAHAN.map((k) => k.bahanId));
      const staleKemasan = (stokMov || []).filter(
        (m: any) =>
          m.tipe === "OUT" &&
          kemasanIds.has(m.bahanId) &&
          m.keterangan?.startsWith("Pemakaian Produksi [") &&
          m.keterangan.includes(tanggal)
      );
      for (const m of staleKemasan) {
        await db.deleteStokMov(m.id);
      }
      const shortItems: string[] = [];
      for (const k of packagingReqs) {
        const saldo = saldoBahan(k.bahanId, dbState);
        if (saldo < k.qty) {
          shortItems.push(`${k.nama}: butuh ${k.qty} pcs, stok ${Math.max(0, Math.round(saldo))} pcs`);
        }
        await db.addStokMov({
          tanggal: todayISO(),
          bahanId: k.bahanId,
          tipe: "OUT",
          qty: k.qty,
          keterangan: kemasanLabel
        });
      }

      if (packagingReqs.length > 0 && shortItems.length > 0) {
        toast.warning(
          `Kemasan dipotong sesuai hasil aktual, namun stok gudang kurang untuk: ${shortItems.join("; ")}. ` +
          `Pemotongan tetap dicatat (stok dapat minus).`
        );
      }

      // === SIMPAN DISTRIBUSI (Langkah 3 = realisasi + alokasi outlet) ===
      // Aktual masak = total distribusi yang diinput kapro per outlet (tidak ada
      // lagi input manual berat matang) — jadi tidak ada clamp: distribusi yang
      // diinput itulah realisasi & langsung disimpan apa adanya.
      const grid = distGrid;

      const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
      await Promise.all(dayReqs.map(async (r: any) => {
        const outletAlloc = grid[r.outletId] || {};
        let sentQty = 0;
        let notes = r.catatan || "";

        if (r.produkId === "p-bubur") {
          sentQty = (outletAlloc.bubur_d || 0) + (outletAlloc.bubur_i || 0);
          // Extract existing variant names before re-serializing; fallback to current production
          const existingVariants = parseVariants(r.catatan || "");
          const buburV1 = existingVariants.v1 || bubur1Name;
          const buburV2 = existingVariants.v2 || bubur2Name;
          notes = serializeSplit(outletAlloc.bubur_d || 0, outletAlloc.bubur_i || 0, r.catatan, buburV1, buburV2, bubur1Variant, bubur2Variant);
        } else if (r.produkId === "p-nasitim") {
          sentQty = (outletAlloc.tim_d || 0) + (outletAlloc.tim_i || 0);
          const existingVariants = parseVariants(r.catatan || "");
          const timV1 = existingVariants.v1 || tim1Name;
          const timV2 = existingVariants.v2 || tim2Name;
          notes = serializeSplit(outletAlloc.tim_d || 0, outletAlloc.tim_i || 0, r.catatan, timV1, timV2, tim1Variant, tim2Variant);
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

      toast.success("Hasil produksi & distribusi berhasil disimpan — barang terkirim ke outlet!");

      // Load existing penjualan records to pre-populate returGrid (Langkah 4)
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        // Default all to 0
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });

      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = grid[o.id] || {};
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
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
      // Reset modification flag so returGrid auto-refreshes with latest penjualan data from outlet
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      setStep(4);
    } catch (err: any) {
      console.error("saveStep3 error:", err);
      toast.error(`Gagal menyimpan hasil produksi & distribusi: ${err?.message || err || "Unknown error"}`);
    }
  };

  // Simpan — jika ada produk yang menyimpang jauh dari rencana, minta konfirmasi terlebih dahulu
  const saveStep3 = () => {
    const deviasi = getDeviasiList();
    if (deviasi.length > 0) {
      setDeviasiConfirmList(deviasi);
    } else {
      performSaveStep3();
    }
  };

  // STEP 4 Action — only VALIDATES & CLOSES the cycle.
  // Data penjualan sudah di-entry oleh outlet via Laporan -> SisaProduksiOH.
  // saveStep4 TIDAK menghapus/merecreate penjualan, hanya:
  // 1. Membaca penjualan dari outlet untuk revenue jurnal
  // 2. Menggunakan returGrid untuk OH (sisa) — dicatat RUSAK, kecuali OH abon
  //    yang kembali ke stok gudang
  // 3. Posting jurnal & stok movement
  // 4. Kembali ke Langkah 1 (siklus selesai)
  const saveStep4 = async () => {
    if (isReadOnlyGudang) return toast.error("Anda tidak memiliki izin untuk menutup siklus");
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

      // 3. Retur grid yang dipakai untuk perhitungan OH (bahan rusak / abon kembali).
      //    - Jika admin MENGEDIT input retur Langkah 4 secara manual → hormati edit
      //      admin (nilai returGrid state dipakai; handleReturChange sudah membatasi
      //      maksimum sesuai qty kirim outlet).
      //    - Jika TIDAK ada edit manual → hitung ulang dari penjualan terbaru outlet,
      //      agar stok retur tidak memakai data basi (mis. saat guard edit manual
      //      memblokir auto-refresh returGrid).
      const freshReturGrid = resolveFreshReturGrid({
        outlets,
        returGrid,
        distGrid,
        existingPenjualan,
        hasManualReturEdits: hasManualReturEdits.current
      });

      // Use freshReturGrid to update returGrid state and for recovered ingredients calculation
      setReturGrid(freshReturGrid);
      lastSyncedSalesRef.current = penjualan
        .filter((p: any) => p.tanggal === tanggal)
        .reduce((s: number, p: any) => s + p.qty, 0)
        .toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;

      // AUTO-CREATE penjualan jika belum ada data dari outlet
      // Jika outlet belum menginput sisa, anggap semua terdistribusi = terjual
      if (existingPenjualan.length === 0) {
        const penjualanBatch: any[] = [];
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;

          const r = freshReturGrid[o.id] || {};
          const def: Record<string, number> = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
          const ret = { ...def, ...r };

          // Merge D/I variants under same baseId for sold calculation
          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = sisaGramToCups((ret.bubur_d || 0) + (ret.bubur_i || 0), 118);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));
            if (buburSold > 0) {
              const prod = produk.find((p: any) => p.id === "p-bubur");
              penjualanBatch.push({ tanggal, outletId: o.id, produkId: "p-bubur", qty: buburSold, harga: prod?.harga || 0 });
            }
          }

          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = sisaGramToCups((ret.tim_d || 0) + (ret.tim_i || 0), 108);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));
            if (timSold > 0) {
              const prod = produk.find((p: any) => p.id === "p-nasitim");
              penjualanBatch.push({ tanggal, outletId: o.id, produkId: "p-nasitim", qty: timSold, harga: prod?.harga || 0 });
            }
          }

          const addSold = (baseId: string, subSent: number, subRetur: number) => {
            if (subSent <= 0) return;
            const sold = Math.max(0, subSent - Math.min(subRetur, subSent));
            if (sold <= 0) return;
            const prod = produk.find((p: any) => p.id === baseId);
            penjualanBatch.push({ tanggal, outletId: o.id, produkId: baseId, qty: sold, harga: prod?.harga || 0 });
          };

          addSold("p-oatmeal", sent.oatmeal || 0, ret.oatmeal || 0);
          addSold("p-puding", sent.puding || 0, ret.puding || 0);
          addSold("p-abon", sent.abon || 0, ret.abon || 0);
        });

        for (const p of penjualanBatch) {
          await db.addPenjualan(p);
        }
        if (penjualanBatch.length > 0) {
          // Recalculate revenue after auto-create so journal posts correctly
          totalSalesRevenue = penjualanBatch.reduce((sum, p) => sum + p.qty * p.harga, 0);
        }
      }

      // 4. Hitung OH (sisa tidak terjual di outlet) per bahan baku.
      //    Aturan baru:
      //    - OH Bubur / Nasi Tim / Puding / Oatmeal → otomatis RUSAK (bahan baku
      //      sudah terpotong saat Langkah 2 sesuai rencana & TIDAK dikembalikan).
      //    - OH Abon → KEMBALI ke stok gudang (bisa dijual lagi besok).
      const ohRusak = {
        beras: 0,
        puding: 0,
        oat: 0,
        sayurHijau: 0,
        sayurBuah: 0,
        sayurProtein: 0
      };
      let abonKembali = 0;
      // Kemasan OH (sisa tidak terjual) — cup & tutup Puding/Oatmeal ikut RUSAK:
      // Puding → CUP PUDING & PLASTIK SELER; Oatmeal → CUP OAT & TUTUP OAT.
      // (Cup & tutup BUBUR & NASI TIM tidak ikut — via retur perlengkapan outlet.)
      const kemasanRusak = { puding: 0, oatmeal: 0 };

      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        const retur = freshReturGrid[o.id] || {};

        // Always recalculate — previous retur stok will be deleted and re-created below
          // Bubur D & I: retur * beras per cup
          if (sent.bubur_d > 0) {
            const actualReturCups = Math.min(sisaGramToCups(retur.bubur_d || 0, 118), sent.bubur_d);
            if (actualReturCups > 0) {
              ohRusak.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              ohRusak.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              ohRusak.sayurBuah += buburCalc(actualReturCups, BUBUR_BASE.sayurBuah);
              ohRusak.sayurProtein += buburCalc(actualReturCups, BUBUR_BASE.sayurProtein);
            }
          }
          if (sent.bubur_i > 0) {
            const actualReturCups = Math.min(sisaGramToCups(retur.bubur_i || 0, 118), sent.bubur_i);
            if (actualReturCups > 0) {
              ohRusak.beras += buburCalc(actualReturCups, BUBUR_BASE.beras);
              ohRusak.sayurHijau += buburCalc(actualReturCups, BUBUR_BASE.sayurHijau);
              ohRusak.sayurBuah += buburCalc(actualReturCups, BUBUR_BASE.sayurBuah);
              ohRusak.sayurProtein += buburCalc(actualReturCups, BUBUR_BASE.sayurProtein);
            }
          }

          // Tim D & I — bahan baku ikut RUSAK sesuai cup OH. Kemasan TIDAK ikut
          // (cup & tutup Nasi Tim via request outlet, bukan potongan produksi).
          if (sent.tim_d > 0) {
            const actualReturCups = Math.min(sisaGramToCups(retur.tim_d || 0, 108), sent.tim_d);
            if (actualReturCups > 0) {
              ohRusak.beras += actualReturCups * settings.berasTim;
              ohRusak.sayurHijau += actualReturCups * settings.sayurHijauTim;
              ohRusak.sayurBuah += actualReturCups * settings.sayurBuahTim;
              ohRusak.sayurProtein += actualReturCups * settings.sayurProteinTim;
            }
          }
          if (sent.tim_i > 0) {
            const actualReturCups = Math.min(sisaGramToCups(retur.tim_i || 0, 108), sent.tim_i);
            if (actualReturCups > 0) {
              ohRusak.beras += actualReturCups * settings.berasTim;
              ohRusak.sayurHijau += actualReturCups * settings.sayurHijauTim;
              ohRusak.sayurBuah += actualReturCups * settings.sayurBuahTim;
              ohRusak.sayurProtein += actualReturCups * settings.sayurProteinTim;
            }
          }

          // Oatmeal — kemasan CUP OAT & TUTUP OAT ikut RUSAK sesuai cup OH
          if (sent.oatmeal > 0) {
            const actualRetur = Math.min(retur.oatmeal || 0, sent.oatmeal);
            if (actualRetur > 0) {
              ohRusak.oat += actualRetur * settings.oatmealCup;
              kemasanRusak.oatmeal += actualRetur;
            }
          }

          // Puding — kemasan CUP PUDING & PLASTIK SELER ikut RUSAK sesuai cup OH
          if (sent.puding > 0) {
            const actualRetur = Math.min(retur.puding || 0, sent.puding);
            if (actualRetur > 0) {
              ohRusak.puding += actualRetur * settings.pudingCup;
              kemasanRusak.puding += actualRetur;
            }
          }

          // Abon
          if (sent.abon > 0) {
            const actualRetur = Math.min(retur.abon || 0, sent.abon);
            if (actualRetur > 0) abonKembali += actualRetur * settings.abonCup;
          }
      });

      // 4. Jurnal posting — berdasarkan penjualan outlet (TIDAK dihapus/direcreate)
      if (totalSalesRevenue > 0) {
        // Hapus jurnal lama, lalu buat ulang (update revenue)
        const existingJurnal = (dbState.jurnal || []).filter(
          (j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES"
        );
        for (const j of existingJurnal) {
          await supabase.from("jurnal").delete().eq("id", j.id);
        }
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

      // 5. Bersihkan movement lama agar re-save tidak dobel:
      //    - OUT "RUSAK:OH" (pencatatan OH rusak versi sekarang)
      //    - IN "Retur Bahan" / "OH abon" (retur bahan lama & OH abon dari outlet)
      const existingOhRusakMov = (dbState.stokMov || []).filter(
        (m: any) => m.tanggal === tanggal && m.tipe === "OUT" && m.keterangan?.startsWith("RUSAK:OH")
      );
      for (const m of existingOhRusakMov) {
        await supabase.from("stok_movement").delete().eq("id", m.id);
      }
      const existingReturMov = (dbState.stokMov || []).filter(
        (m: any) => m.tanggal === tanggal && m.tipe === "IN" && (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon"))
      );
      for (const m of existingReturMov) {
        await supabase.from("stok_movement").delete().eq("id", m.id);
      }
      // 6. Stok movements hasil OH (sisa tidak terjual di outlet):
      //    - OH Bubur/Nasi Tim/Puding/Oatmeal → RUSAK (OUT). Bahan baku sudah
      //      terpotong saat Langkah 2 (sesuai rencana) dan TIDAK dikembalikan.
      //    - OH Abon → KEMBALI ke stok gudang (IN) — bisa dijual lagi besok.
      const movPromises: Promise<any>[] = [];
      if (ohRusak.beras > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-brs01", tipe: "OUT",
          qty: Math.ceil(ohRusak.beras), // gram
          keterangan: `RUSAK:OH Beras (sisa Bubur/Tim) (${Math.ceil(ohRusak.beras)} gr) [${tanggal}]`
        }));
      }
      if (ohRusak.puding > 1) {
        const pudingBahanRetur = bahan.find((x: any) => x.id === "b-pud01");
        const pudingKonvRetur = pudingBahanRetur?.konversiGram || 130; // konversi master data
        const qtyPuding = Math.ceil(ohRusak.puding / pudingKonvRetur);
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-pud01", tipe: "OUT",
          qty: qtyPuding, // pcs
          keterangan: `RUSAK:OH Puding (sisa) (${qtyPuding} pcs) [${tanggal}]`
        }));
      }
      if (ohRusak.oat > 1) {
        const oatBahanRetur = bahan.find((x: any) => x.id === "b-oat01");
        const oatKonvRetur = oatBahanRetur?.konversiGram || 180; // konversi master data
        const qtyOat = Math.ceil(ohRusak.oat / oatKonvRetur);
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-oat01", tipe: "OUT",
          qty: qtyOat, // pcs
          keterangan: `RUSAK:OH Oatmeal (sisa) (${qtyOat} pcs) [${tanggal}]`
        }));
      }
      if (abonKembali > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-ab01", tipe: "IN",
          qty: Math.ceil(abonKembali), // gram
          keterangan: `Retur Bahan Baku (g) [${tanggal}]`
        }));
      }
      if (ohRusak.sayurHijau > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sh01", tipe: "OUT",
          qty: Math.ceil(ohRusak.sayurHijau),
          keterangan: `RUSAK:OH Sayur Hijau (sisa) (${Math.ceil(ohRusak.sayurHijau)} gr) [${tanggal}]`
        }));
      }
      if (ohRusak.sayurBuah > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sb01", tipe: "OUT",
          qty: Math.ceil(ohRusak.sayurBuah),
          keterangan: `RUSAK:OH Sayur Buah (sisa) (${Math.ceil(ohRusak.sayurBuah)} gr) [${tanggal}]`
        }));
      }
      if (ohRusak.sayurProtein > 1) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-sp01", tipe: "OUT",
          qty: Math.ceil(ohRusak.sayurProtein),
          keterangan: `RUSAK:OH Sayur Protein (sisa) (${Math.ceil(ohRusak.sayurProtein)} gr) [${tanggal}]`
        }));
      }

      // 7. Kemasan OH → RUSAK (OUT) — cup & tutup produk yang tidak laku:
      //    Puding (CUP PUDING & PLASTIK SELER) & Oatmeal (CUP OAT & TUTUP OAT).
      //    Cup & tutup BUBUR & NASI TIM tidak ikut (via retur perlengkapan outlet).
      if (kemasanRusak.puding > 0) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-cuppud01", tipe: "OUT",
          qty: kemasanRusak.puding,
          keterangan: `RUSAK:OH Cup Puding (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]`
        }));
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-plas01", tipe: "OUT",
          qty: kemasanRusak.puding,
          keterangan: `RUSAK:OH Plastik Seler (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]`
        }));
      }
      if (kemasanRusak.oatmeal > 0) {
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-cupoat1", tipe: "OUT",
          qty: kemasanRusak.oatmeal,
          keterangan: `RUSAK:OH Cup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]`
        }));
        movPromises.push(db.addStokMov({
          tanggal, bahanId: "b-ttoat01", tipe: "OUT",
          qty: kemasanRusak.oatmeal,
          keterangan: `RUSAK:OH Tutup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]`
        }));
      }

      if (movPromises.length > 0) {
        await Promise.all(movPromises);
      }

      toast.success("Siklus produksi harian ditutup! Penjualan outlet tercatat — OH (sisa) otomatis rusak & OH abon kembali ke stok.");
      // Siklus sudah ditutup — lepas guard edit manual agar sesi berikutnya
      // (Buka Siklus lagi / ganti tanggal) grid di-reload dari data terbaru DB.
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      setStep(1);
    } catch (err) {
      toast.error("Gagal menutup siklus produksi");
      console.error(err);
    } finally {
      setClosingCycle(false);
    }
  };

  // Wrap handleRefreshStep4 so it doesn't trigger the toast on auto-refresh
  const handleAutoRefresh = useCallback(async () => {
    if (refreshing || !tanggal || outlets.length === 0) return;
    // Hormati edit manual admin (Langkah 4 saat siklus dibuka, atau grid lain
    // yang sedang dikerjakan) — jangan timpa nilai yang sedang dikoreksi admin
    // dengan hitung ulang otomatis dari penjualan outlet. saveStep4 yang akan
    // memakai nilai manual tsb saat menutup siklus.
    if (hasUserModifiedGrids.current || hasManualReturEdits.current) return;
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
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
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
  const handleRefreshStep4 = async () => {
    setRefreshing(true);
    try {
      // Reset the modification guard so returGrid can recalculate
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;

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
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingSales
                .filter((p: any) => p.outletId === o.id && p.produkId === baseId)
                .reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
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
    if (!outletFilterId) return outlets;
    return outlets.filter(o => o.id === outletFilterId);
  }, [outlets, outletFilterId]);

  // ===== INDIKATOR STOK ABON OH KEMARIN =====
  // OH abon (sisa tidak terjual) sudah otomatis kembali ke stok gudang saat outlet
  // menyimpan sisa di Laporan (stok_movement IN b-ab01 + sisaGram di penjualan).
  // Di sini kita tampilkan jumlah abon yang tersedia dari OH KEMARIN (relatif thd
  // tanggal produksi yang dipilih) per outlet, agar bisa direncanakan ulang hari ini.
  // sisaGram untuk abon disimpan dalam PCS (bukan gram), jadi langsung dijumlahkan.
  const kemarin = useMemo(() => {
    if (!tanggal) return "";
    const d = new Date(tanggal);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [tanggal]);

  const ohAbonKemarin = useMemo(() => {
    const perOutlet: Record<string, number> = {};
    (penjualan || []).forEach((p: any) => {
      if (p.produkId === "p-abon" && p.tanggal === kemarin && p.sisaGram && p.sisaGram > 0) {
        perOutlet[p.outletId] = (perOutlet[p.outletId] || 0) + p.sisaGram;
      }
    });
    const total = Object.values(perOutlet).reduce((s, v) => s + v, 0);
    return { perOutlet, total };
  }, [penjualan, kemarin]);

  // Salin stok abon OH kemarin ke kolom Abon di rencana (grid tanggal aktif).
  // Bersifat ADITIF — nilai rencana yang sudah diisi tetap dipertahankan.
  const applyOhAbonToPlan = () => {
    if (isReadOnlyGudang) return toast.error("Anda tidak memiliki izin untuk menyimpan data produksi");
    if (ohAbonKemarin.total <= 0) return toast.info("Tidak ada stok abon OH dari kemarin");
    hasUserModifiedGrids.current = true;
    // Tandai bila abon OH disalin ke rencana TANGGAL 1 — hanya itu yang memicu
    // auto-konfirmasi ke distribusi saat stok dipotong (alur siklus harian).
    if (activePlanDate === "date1") setOhAbonApplied(true);
    const setter = activePlanDate === "date1" ? setPlanGrid : setPlanGrid2;
    setter(prev => {
      const next: Record<string, Record<string, number>> = {};
      Object.keys(prev).forEach(k => { next[k] = { ...prev[k] }; });
      Object.entries(ohAbonKemarin.perOutlet).forEach(([outletId, pcs]) => {
        if (!next[outletId]) {
          next[outletId] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
        }
        next[outletId].abon = (next[outletId].abon || 0) + pcs;
      });
      return next;
    });
    toast.success(`${ohAbonKemarin.total} pcs abon OH ${kemarin} ditambahkan ke rencana`);
  };

  function renderStep1() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Langkah 1: Rencana Pra-Produksi</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Gunakan tabel/form di bawah untuk mengisi rencana target produksi tiap outlet secara langsung.</p>
            </div>
            {/* 2-Day Plan Toggle */}
            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-xs font-medium text-muted-foreground">Rencana 2 Hari</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isTwoDayPlan}
                  onClick={() => {
                    const newVal = !isTwoDayPlan;
                    setIsTwoDayPlan(newVal);
                    if (newVal && !tanggal2) {
                      // Default tanggal2 to next day
                      const d = new Date(tanggal);
                      d.setDate(d.getDate() + 1);
                      setTanggal2(d.toISOString().slice(0, 10));
                    }
                    if (!newVal) {
                      setActivePlanDate("date1");
                    }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    isTwoDayPlan ? "bg-primary" : "bg-input"
                  }`}
                >
                  <span className={`inline-block h-5 w-5 rounded-full bg-background shadow-sm ring-0 transition-transform ${
                    isTwoDayPlan ? "translate-x-[22px]" : "translate-x-[2px]"
                  }`} />
                </button>
              </label>
            </div>
          </div>

          {/* Date Pickers Row — show 2 date pickers when 2-day mode is on */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-bold text-muted-foreground">Tanggal 1:</Label>
              <DateInput
                value={tanggal}
                onChange={(v) => {
                  setTanggal(v);
                  hasUserModifiedGrids.current = false;
                }}
                className="text-xs"
              />
            </div>
            {isTwoDayPlan && (
              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold text-muted-foreground">Tanggal 2:</Label>
                <DateInput
                  value={tanggal2}
                  onChange={(v) => {
                    setTanggal2(v);
                    if (v) {
                      loadPlanForDate(v, (grid) => setPlanGrid2(grid));
                    }
                  }}
                  className="text-xs"
                />
              </div>
            )}
            {isTwoDayPlan && tanggal2 && (
              <span className="text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950/30 px-3 py-1.5 rounded-full border border-green-200 dark:border-green-800">
                ⚡ Pemotongan stok untuk {tanggal} + {tanggal2} (gabungan)
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Indikator Stok Abon OH Kemarin — tersedia utk direncanakan ulang hari ini */}
          {ohAbonKemarin.total > 0 && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800/30 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center shrink-0">
                    <ShoppingBag className="h-5 w-5 text-green-600 dark:text-green-300" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <p className="font-bold text-green-700 dark:text-green-300 text-sm mb-1">📦 Stok Abon OH {kemarin}</p>
                    <p>
                      <strong className="text-green-700 dark:text-green-300">{ohAbonKemarin.total} pcs</strong> abon tidak terjual kemarin sudah kembali ke stok gudang dan bisa direncanakan ulang hari ini.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(ohAbonKemarin.perOutlet).map(([outletId, pcs]) => {
                        const o = outlets.find((x: any) => x.id === outletId);
                        return (
                          <span
                            key={outletId}
                            className="text-[10px] font-semibold bg-green-100/70 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800/40"
                          >
                            {o?.nama ?? outletId}: {pcs} pcs
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={applyOhAbonToPlan}
                  disabled={isReadOnlyGudang}
                  size="sm"
                  className="h-9 shrink-0"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Salin ke Rencana
                </Button>
              </div>
            </div>
          )}

          {/* Read-only Total Summary Dashboard */}
          <div className="bg-muted/35 p-5 rounded-2xl border space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {isTwoDayPlan && tanggal2 ? (
                <>Total Rencana {tanggal} + {tanggal2} (Gabungan Seluruh Outlet)</>
              ) : (
                <>Total Rencana Produksi {tanggal} (Seluruh Outlet)</>
              )}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
              <div className="space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-300/30 text-center">
                <div className="text-[10px] font-bold text-amber-600 truncate" title={`Bubur ${bubur1Name}`}>B. {bubur1Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.buburD : totals.buburD} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.buburD : totals.buburD) * 118).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-blue-500/5 p-3 rounded-xl border border-blue-300/30 text-center">
                <div className="text-[10px] font-bold text-blue-600 truncate" title={`Bubur ${bubur2Name}`}>B. {bubur2Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.buburI : totals.buburI} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.buburI : totals.buburI) * 118).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-amber-500/5 p-3 rounded-xl border border-amber-300/30 text-center">
                <div className="text-[10px] font-bold text-amber-600 truncate" title={`Tim ${tim1Name}`}>T. {tim1Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.timD : totals.timD} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.timD : totals.timD) * 108).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-blue-500/5 p-3 rounded-xl border border-blue-300/30 text-center">
                <div className="text-[10px] font-bold text-blue-600 truncate" title={`Tim ${tim2Name}`}>T. {tim2Name}</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.timI : totals.timI} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.timI : totals.timI) * 108).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Oatmeal</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.oatmeal : totals.oatmeal} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.oatmeal : totals.oatmeal) * 100).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Puding</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.puding : totals.puding} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({(totals.puding * 80).toLocaleString()} g)</span>
              </div>
              <div className="space-y-1 bg-card p-3 rounded-xl border text-center">
                <div className="text-[10px] font-bold text-muted-foreground truncate">Abon</div>
                <div className="text-lg font-bold text-foreground mt-1">{isTwoDayPlan ? combinedTotals.abon : totals.abon} <span className="text-xs font-normal text-muted-foreground">pcs</span></div>
                <span className="text-[10px] text-muted-foreground font-medium block">({((isTwoDayPlan ? combinedTotals.abon : totals.abon) * 10).toLocaleString()} g)</span>
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
              <div className="flex items-center gap-2">
                {/* Date Tabs for 2-day plan */}
                {isTwoDayPlan && (
                  <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-0.5 border">
                    <button
                      type="button"
                      onClick={() => setActivePlanDate("date1")}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        activePlanDate === "date1" 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tgl 1: {tanggal}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePlanDate("date2")}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        activePlanDate === "date2" 
                          ? "bg-primary text-primary-foreground shadow-sm" 
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Tgl 2: {tanggal2}
                    </button>
                  </div>
                )}
                {/* Copy from Date 1 button */}
                {isTwoDayPlan && activePlanDate === "date2" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Copy planGrid to planGrid2
                      const copy: Record<string, Record<string, number>> = {};
                      Object.entries(planGrid).forEach(([outletId, vals]) => {
                        copy[outletId] = { ...vals };
                      });
                      setPlanGrid2(copy);
                      toast.success("Rencana Tgl 1 disalin ke Tgl 2");
                      hasUserModifiedGrids.current = true;
                    }}
                    className="h-7 text-[10px] gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    <span className="hidden sm:inline">Salin dari Tgl 1</span>
                  </Button>
                )}
                <div className="w-full sm:w-[200px]">
                  <OutletFilter
                    outlets={outlets}
                    selectedId={outletFilterId}
                    onSelect={setOutletFilterId}
                    label=""
                  />
                </div>
              </div>
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
                      const activeGrid = activePlanDate === "date1" ? planGrid : planGrid2;
                      const row = activeGrid[o.id] || {
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                              disabled={isReadOnlyGudang}
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
                const activeGrid = activePlanDate === "date1" ? planGrid : planGrid2;
                const row = activeGrid[o.id] || {
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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
                            disabled={isReadOnlyGudang}
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



          <div className="flex justify-end">
            <Button onClick={saveStep1} className="gradient-primary text-primary-foreground hover-lift" disabled={isReadOnlyGudang}>
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
          
          {ohAbonApplied && totals.abon > 0 && (
            <div className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs font-medium ${
              ohAbonAutoConfirmed
                ? "bg-green-600/10 border-green-600/20 text-green-700 dark:text-green-400"
                : "bg-sky-500/10 border-sky-500/25 text-sky-700 dark:text-sky-400"
            }`}>
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">
                  {ohAbonAutoConfirmed
                    ? "Abon OH sudah terkonfirmasi ke distribusi"
                    : `Abon OH (${totals.abon} pcs) akan otomatis terkonfirmasi ke distribusi`}
                </p>
                <p className="text-[11px] opacity-90">
                  {ohAbonAutoConfirmed
                    ? hasOtherProducts
                      ? "Realisasi abon disamakan dengan rencana (abon OH sudah matang) — lanjut isi realisasi menu lain di Langkah 3."
                      : "Semua menu hanya abon — lanjut langsung ke Langkah 3 (Distribusi)."
                    : isWarehouseRequested
                      ? "Stok sudah divalidasi sebelum abon OH disalin — klik 'Validasi Ulang' agar auto-konfirmasi OH abon aktif."
                      : "Saat stok dipotong, realisasi abon diset = rencana dan permohonan langsung Disetujui — realisasi & distribusi digabung di Langkah 3."}
                </p>
              </div>
            </div>
          )}
          
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
                      <div>• {bubur1Name}: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.daging))} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.air))} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurHijau))} gr</span></div>
                      <div>• Sayur Buah (SB): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurBuah))} gr</span></div>
                      <div>• Sayur Protein (SP): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburD, BUBUR_BASE.sayurProtein))} gr</span></div>
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
                      <div>• {bubur2Name}: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.daging))} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.air))} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurHijau))} gr</span></div>
                      <div>• Sayur Buah (SB): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurBuah))} gr</span></div>
                      <div>• Sayur Protein (SP): <span className="font-semibold text-foreground">{formatDecimal(buburCalc(totals.buburI, BUBUR_BASE.sayurProtein))} gr</span></div>
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
                      <div>• {tim1Name}: <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.dagingTim)} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.airTim)} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurHijauTim)} gr</span></div>
                      <div>• Sayur Buah (SB): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurBuahTim)} gr</span></div>
                      <div>• Sayur Protein (SP): <span className="font-semibold text-foreground">{Math.ceil(totals.timD * settings.sayurProteinTim)} gr</span></div>
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
                      <div>• {tim2Name}: <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.dagingTim)} gr</span></div>
                      <div>• Air: <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.airTim)} ml</span></div>
                      <div>• Sayur Hijau (SH): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurHijauTim)} gr</span></div>
                      <div>• Sayur Buah (SB): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurBuahTim)} gr</span></div>
                      <div>• Sayur Protein (SP): <span className="font-semibold text-foreground">{Math.ceil(totals.timI * settings.sayurProteinTim)} gr</span></div>
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
                      {totals.abon > 0 && <div>• Abon: <span className="font-semibold text-foreground">{Math.ceil(totals.abon * settings.abonCup)} g</span> ({totals.abon} pcs)</div>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ringkasan Pemotongan Stok Gudang (Pcs/Sachet/Pack)</h3>
            <p className="text-[11px] text-muted-foreground">
              Pemotongan bahan baku utama mengikuti <strong>rencana</strong> (Langkah 1). Kemasan (cup &amp; tutup <strong>Puding/Oatmeal</strong>)
              dipotong di <strong>Langkah 3</strong> sesuai <strong>hasil produksi aktual</strong> — bisa berbeda dari rencana karena hasil bisa menyusut atau meluber.
              Kemasan <strong>Bubur &amp; Nasi Tim</strong> (CUP BUBUR &amp; TUTUP, stok sama) <strong>tidak</strong> dipotong dari stok produksi — stoknya berkurang saat <strong>request outlet disetujui</strong> di Stok Gudang, dan sisa kembali lewat <strong>retur perlengkapan</strong>.
            </p>
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
                    // Tampilkan gramasi kebutuhan bila satuan bukan pcs ATAU bahan yang
                    // dikecualikan dari gram (OAT/PUDING) — agar gramasi tetap terlihat meski satuan 'pcs'.
                    const hasGram = r.satuan !== "pcs" || GRAM_EXCLUDED_BAHAN.has(r.bahanId);
                    const b = bahan.find((x: any) => x.id === r.bahanId);
                    // Oat & Puding (GRAM_EXCLUDED_BAHAN): qty & saldo sudah dalam satuan sachet,
                    // jangan dikonversi ulang — nilai gram mengikuti gramasi kebutuhan (rawQtyGrams).
                    const isGramExcluded = GRAM_EXCLUDED_BAHAN.has(r.bahanId);
                    const hasKonversi = !isGramExcluded && b?.konversiGram && b.konversiGram > 0;
                    // Daging/lauk: qty dalam gram (internal stok movement), tapi tampilkan dalam sachet
                    const displayQty = hasKonversi ? Math.ceil(r.qty / b.konversiGram) : r.qty;
                    const displaySaldo = hasKonversi ? Math.round(saldo / b.konversiGram) : saldo;
                    const displayGrams = isGramExcluded ? r.rawQtyGrams : r.qty;
                    return (
                      <TableRow key={r.bahanId}>
                        <TableCell className="font-semibold">{r.nama}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.kode}</TableCell>
                        <TableCell className="text-right font-medium">
                          {hasGram ? `${Number(r.rawQtyGrams).toFixed(2).replace(/\.?0+$/, '')} g` : "-"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {hasKonversi || isGramExcluded ? `${displayQty} ${r.satuan} (${Number(displayGrams).toFixed(2).replace(/\.?0+$/, '')} g)` : `${r.qty} ${r.satuan}`}
                        </TableCell>
                        <TableCell className="text-right">{displaySaldo} {r.satuan}</TableCell>
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
            
            {/* Single toggleable validation button — can be opened/closed anytime */}
            <div className="flex items-center gap-2">
              {warehouseConfirmOpen ? (
                <div className="flex items-center gap-2 p-2 rounded-xl" style={{
                  backgroundColor: isWarehouseRequested ? 'hsl(142 76% 36% / 0.08)' : 'hsl(0 84% 60% / 0.08)',
                  borderColor: isWarehouseRequested ? 'hsl(142 76% 36% / 0.2)' : 'hsl(0 84% 60% / 0.2)',
                  borderWidth: 1
                }}>
                  <span className={`text-xs font-semibold px-2 whitespace-nowrap ${
                    isWarehouseRequested ? 'text-green-700 dark:text-green-400' : 'text-destructive'
                  }`}>
                    {isWarehouseRequested ? 'Validasi ulang stok?' : 'Yakin potong stok?'}
                  </span>
                  <Button
                    onClick={requestWarehouse}
                    disabled={materialReqs.length === 0 || requestingWarehouse || isReadOnlyGudang}
                    size="sm"
                    className={`h-8 ${
                      isWarehouseRequested 
                        ? 'bg-amber-600 text-white hover:bg-amber-700' 
                        : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    }`}
                  >
                    {requestingWarehouse ? (
                      <><Clock className="h-3.5 w-3.5 mr-1 animate-spin" />Memproses...</>
                    ) : (
                      <><Check className="h-3.5 w-3.5 mr-1" />{isWarehouseRequested ? 'Validasi Ulang' : 'Validasi Stok'}</>
                    )}
                  </Button>
                  <Button
                    onClick={() => setWarehouseConfirmOpen(false)}
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted-foreground hover:text-foreground"
                    disabled={requestingWarehouse}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {isWarehouseRequested && (
                    <Badge className="bg-green-600/10 text-green-700 dark:text-green-400 border-green-600/20 h-10 px-4 text-xs font-semibold gap-1.5 shrink-0">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="hidden md:inline">Stok Sudah Divalidasi</span>
                    </Badge>
                  )}
                  <Button
                    onClick={() => setWarehouseConfirmOpen(true)}
                    disabled={materialReqs.length === 0}
                    variant={isWarehouseRequested ? "outline" : "outline"}
                    className={`h-10 gap-1.5 ${
                      isWarehouseRequested 
                        ? 'border-green-600/30 text-green-700 dark:text-green-400 hover:bg-green-600/5' 
                        : 'border-destructive/30 text-destructive hover:bg-destructive/5'
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{isWarehouseRequested ? 'Buka Validasi' : 'Validasi Pemotongan Stok'}</span>
                  </Button>
                  {isWarehouseRequested && (
                    <Button onClick={nextStepAfterWarehouse} className="h-10 gradient-primary text-primary-foreground shrink-0">
                      <span className="hidden md:inline">{ohAbonAutoConfirmed && !hasOtherProducts ? "Lanjut ke Distribusi" : "Lanjutkan"}</span>
                      <ArrowRight className="h-4 w-4 md:ml-2" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep3() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 3: Distribusi & Alokasi Outlet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>Aktual masak</strong> diinput langsung di kolom distribusi tiap outlet sesuai kondisi lapangan.
              Bila ada <strong>luberan/penyusutan</strong>, bandingkan dengan rencana lalu sesuaikan jumlah per outlet —
              <strong>selisih vs rencana</strong> terhitung otomatis di bagian bawah. Kemasan (cup &amp; tutup
              <strong>Puding/Oatmeal</strong>) dipotong otomatis sesuai total distribusi saat menyimpan.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border text-xs shrink-0">
            <span className="font-bold text-muted-foreground">Aktual Distribusi (Total/Rencana):</span>
            <span className="font-semibold text-primary">
              B: {actualCups.bubur_1 + actualCups.bubur_2}/{totals.totalBubur} · T: {actualCups.tim_1 + actualCups.tim_2}/{totals.totalTim}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {ohAbonAutoConfirmed && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-green-600/10 border border-green-600/20 text-green-700 dark:text-green-400 text-xs font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Abon OH terkonfirmasi otomatis ke distribusi</p>
                <p className="text-[11px] opacity-90">
                  Abon dari sisa kemarin sudah matang — realisasi disamakan dengan rencana ({totals.abon} pcs) saat stok dipotong.
                  {hasOtherProducts ? " Isi distribusi menu lain lalu lanjutkan." : " Semua menu hanya abon — alokasi abon sudah terisi otomatis, lanjutkan."}
                </p>
              </div>
            </div>
          )}

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calculator className="h-3.5 w-3.5 text-primary" />
                <span>
                  Input <strong>jumlah aktual</strong> per outlet sesuai kondisi lapangan. Total semua outlet = <strong>aktual masak</strong>
                  — luberan/penyusutan terlihat otomatis di tabel <strong>selisih vs rencana</strong> bagian bawah.
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <ArrowNav
                  size="md"
                  className="items-start"
                  onPrev={() => cycleOutlet(-1, distOutletId, setDistOutletId)}
                  onNext={() => cycleOutlet(1, distOutletId, setDistOutletId)}
                  prevLabel="Outlet sebelumnya"
                  nextLabel="Outlet berikutnya"
                >

                  <div className="flex-1">
                    <OutletFilter
                      outlets={outlets}
                      selectedId={distOutletId}
                      onSelect={setDistOutletId}
                      label=""
                    />
                  </div>
                </ArrowNav>
              </div>
            </div>

            {/* Input fields laid out as a row */}
            {(() => {
              const row = distGrid[distOutletId] || {
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
                      onChange={(e) => handleDistChange(distOutletId, "bubur_d", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "bubur_i", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "tim_d", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "tim_i", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "oatmeal", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "puding", parseInt(e.target.value))}
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
                      onChange={(e) => handleDistChange(distOutletId, "abon", parseInt(e.target.value))}
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
                      const isSelected = o.id === distOutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setDistOutletId(o.id)}
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

          {/* Kemasan sesuai hasil aktual — dipotong otomatis saat simpan */}
          <div className="bg-muted/15 p-4 rounded-2xl border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Package className="h-4 w-4 text-primary" /> Kemasan Sesuai Hasil Aktual (Cup &amp; Tutup)
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Bahan utama sudah dipotong di Langkah 2 sesuai rencana dan <strong>tidak berubah</strong> oleh hasil produksi.
              Kemasan dihitung dari <strong>total distribusi</strong> (aktual masak) — bisa berbeda dari rencana karena hasil bisa <strong>menyusut</strong> atau <strong>meluber</strong>. Dipotong otomatis saat menyimpan Langkah 3.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Kemasan <strong>Bubur &amp; Nasi Tim</strong> (CUP BUBUR &amp; TUTUP) <strong>tidak</strong> ikut dipotong di sini — stoknya berkurang saat <strong>request outlet disetujui</strong> di Stok Gudang, dan sisa kembali lewat <strong>retur perlengkapan</strong>.
            </p>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Kemasan</TableHead>
                    <TableHead>Kode</TableHead>
                    <TableHead className="text-right">Kebutuhan (Aktual)</TableHead>
                    <TableHead className="text-right">Stok Gudang</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packagingReqs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                        Tidak ada kebutuhan kemasan — hasil aktual Oatmeal &amp; Puding 0 cup.
                      </TableCell>
                    </TableRow>
                  )}
                  {packagingReqs.map((r) => {
                    const saldo = saldoBahan(r.bahanId, dbState);
                    const isSufficient = saldo >= r.qty;
                    return (
                      <TableRow key={r.bahanId}>
                        <TableCell className="font-semibold">{r.nama}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.kode}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{r.qty} pcs</TableCell>
                        <TableCell className="text-right">{Math.round(saldo)} pcs</TableCell>
                        <TableCell className="text-center">
                          {isSufficient ? (
                            <Badge className="bg-success text-success-foreground">Aman</Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1 justify-center">
                              <AlertTriangle className="h-3 w-3" /> Kurang {r.qty - Math.round(saldo)}
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

          {/* Selisih Rencana vs Produk Jadi Pasca Matang */}
          <div className="bg-muted/15 p-4 rounded-2xl border space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-primary" /> Selisih Rencana vs Produk Jadi Pasca Matang
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Terhitung otomatis dari <strong>total distribusi</strong> (aktual masak) dibanding <strong>rencana</strong> (Langkah 1).
              Hasil bisa <strong>menyusut/meluber</strong> — kapro menyesuaikan jumlah per outlet saat menginput distribusi.
            </p>
            <div className="rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Rencana</TableHead>
                    <TableHead className="text-right">Aktual (Total Distribusi)</TableHead>
                    <TableHead className="text-center">Selisih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: `Bubur 1 (${bubur1Name})`, rencana: totals.buburD, aktual: actualCups.bubur_1, satuan: "cup" },
                    { label: `Bubur 2 (${bubur2Name})`, rencana: totals.buburI, aktual: actualCups.bubur_2, satuan: "cup" },
                    { label: `Nasi Tim 1 (${tim1Name})`, rencana: totals.timD, aktual: actualCups.tim_1, satuan: "cup" },
                    { label: `Nasi Tim 2 (${tim2Name})`, rencana: totals.timI, aktual: actualCups.tim_2, satuan: "cup" },
                    { label: "Oatmeal", rencana: totals.oatmeal, aktual: actualCups.oatmeal, satuan: "cup" },
                    { label: "Puding", rencana: totals.puding, aktual: actualCups.puding, satuan: "cup" },
                    { label: "Abon", rencana: totals.abon, aktual: actualCups.abon, satuan: "pcs" }
                  ].map((it) => {
                    const selisih = it.aktual - it.rencana;
                    return (
                      <TableRow key={it.label}>
                        <TableCell className="font-semibold">{it.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{it.rencana} {it.satuan}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold text-primary">{it.aktual} {it.satuan}</TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] border ${
                              selisih === 0
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : selisih < 0
                                ? "bg-destructive/10 text-destructive border-destructive/30"
                                : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                            }`}
                          >
                            {selisih === 0 ? "✓ Sesuai" : `${selisih > 0 ? "+" : ""}${selisih} ${it.satuan}`}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(2)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Kembali ke Bahan Baku</span>
            </Button>
            <Button onClick={saveStep3} className="gradient-primary text-primary-foreground hover-lift h-10" disabled={isReadOnlyGudang}>
              <Check className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Simpan Distribusi & Lanjutkan</span>
            </Button>
          </div>
        </CardContent>

        {/* Konfirmasi jika total distribusi menyimpang jauh dari rencana */}
        <AlertDialog
          open={deviasiConfirmList !== null}
          onOpenChange={(open) => { if (!open) setDeviasiConfirmList(null); }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Hasil masak (total distribusi) menyimpang dari rencana
              </AlertDialogTitle>
              <AlertDialogDescription>
                Beberapa produk berbeda jauh dari target rencana ({Math.round(DEVIASI_THRESHOLD * 100)}%+).
                Periksa kembali angka distribusinya sebelum menyimpan:
                <ul className="mt-3 space-y-1.5">
                  {deviasiConfirmList?.map((it) => (
                    <li key={it.label} className="flex justify-between gap-3 text-sm">
                      <span className="font-medium">{it.label}</span>
                      <span className="tabular-nums text-destructive font-semibold">
                        {it.cups} cup (rencana {it.target} cup)
                      </span>
                    </li>
                  ))}
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Periksa Ulang</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setDeviasiConfirmList(null);
                  performSaveStep3();
                }}
              >
                Simpan Tetap
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    );
  }

  function renderStep4() {
    // "Semua Outlet" terpilih (default) → tampilkan total retur OH seluruh outlet sebagai ringkasan
    const isAllView = returOutletId === ALL_OUTLETS_ID || !outlets.some((o) => o.id === returOutletId);
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Langkah 4: Retur & Penjualan Akhir Hari</CardTitle>
            <p className="text-xs text-muted-foreground">Default <strong>Semua Outlet</strong> menampilkan <strong>total retur OH seluruh outlet</strong>; pilih satu outlet pada daftar untuk mengedit returnya. Bubur &amp; Nasi Tim isi <strong>gram</strong> retur (otomatis konversi ke cup), Oatmeal &amp; Puding isi <strong>cup</strong>, Abon isi <strong>pcs</strong>. Penjualan dihitung otomatis.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasNewSalesData && !refreshing && step === 4 && (
              <div className="flex items-center gap-1.5 text-xs bg-destructive/10 border border-destructive/20 rounded-lg px-2.5 py-1.5 text-destructive font-medium whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-destructive shrink-0" />
                Data baru
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshStep4}
              disabled={refreshing}
              className="h-8 gap-1.5"
              title={hasNewSalesData ? "Ada data penjualan baru! Klik untuk memuat ulang" : "Muat ulang data penjualan dari outlet"}
            >
              <RotateCcw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs">{refreshing ? "Memuat..." : "Refresh"}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Aturan OH (sisa tidak terjual) — info ringkas */}
          <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Aturan OH (Sisa Tidak Terjual)
            </h4>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                OH <strong>Bubur / Nasi Tim / Puding / Oatmeal</strong> otomatis dicatat{" "}
                <Badge variant="destructive">RUSAK</Badge> — bahan baku sudah terpotong di Langkah 2 dan <strong>tidak dikembalikan</strong> ke stok.
              </li>
              <li>
                Kemasan <strong>Puding / Oatmeal</strong> (cup &amp; tutup) ikut dicatat{" "}
                <Badge variant="destructive">RUSAK</Badge> otomatis sesuai cup yang tidak laku (dipotong di Langkah 3).
              </li>
              <li>
                OH <strong>Abon</strong> <Badge className="bg-success text-success-foreground">kembali ke stok</Badge> gudang — bisa dijual lagi.
              </li>
              <li>
                Kemasan <strong>Bubur &amp; Nasi Tim</strong> (cup &amp; tutup) kembali ke gudang lewat <strong>retur perlengkapan</strong> outlet (bukan otomatis).
              </li>
            </ul>
          </div>

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <ArrowNav
                  size="md"
                  className="items-start"
                  onPrev={() => cycleOutlet(-1, returOutletId, setReturOutletId, true)}
                  onNext={() => cycleOutlet(1, returOutletId, setReturOutletId, true)}
                  prevLabel="Outlet sebelumnya"
                  nextLabel="Outlet berikutnya"
                >
                  <div className="flex-1">
                    <OutletFilter
                      outlets={outlets}
                      selectedId={returOutletId}
                      onSelect={setReturOutletId}
                      label=""
                      showAll
                      allLabel="Semua Outlet"
                      allValue={ALL_OUTLETS_ID}
                    />
                  </div>
                </ArrowNav>
              </div>
            </div>
            {isAllView && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-xl px-3 py-2.5">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] shrink-0" variant="outline">Semua Outlet</Badge>
                <span>Mode ringkasan — menampilkan <strong>total retur OH seluruh outlet</strong>. Pilih satu outlet pada daftar untuk mengedit nilai per-outlet.</span>
              </div>
            )}

            {/* Input fields laid out as a row with maximum constraints based on sent qty */}
            {(() => {
              // "Semua Outlet" → jumlahkan retur & kiriman seluruh outlet; selain itu nilai outlet terpilih
              const row = isAllView
                ? sumGridRows(returGrid)
                : (returGrid[returOutletId] || { ...ZERO_RETUR_ROW });
              const sent = isAllView
                ? sumGridRows(distGrid)
                : (distGrid[returOutletId] || { ...ZERO_RETUR_ROW });
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur1Name} Retur`}>B. {bubur1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.bubur_d * 118}
                      disabled={isAllView}
                      value={row.bubur_d || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(returOutletId, "bubur_d", Math.min(grams, sent.bubur_d * 118));
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {sisaGramToCups(row.bubur_d || 0, 118)} cup retur</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.bubur_d || 0) - sisaGramToCups(row.bubur_d || 0, 118))} cup ({(Math.max(0, (sent.bubur_d || 0) - sisaGramToCups(row.bubur_d || 0, 118)) * 118).toLocaleString()} g)</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur2Name} Retur`}>B. {bubur2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.bubur_i * 118}
                      disabled={isAllView}
                      value={row.bubur_i || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(returOutletId, "bubur_i", Math.min(grams, sent.bubur_i * 118));
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {sisaGramToCups(row.bubur_i || 0, 118)} cup retur</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.bubur_i || 0) - sisaGramToCups(row.bubur_i || 0, 118))} cup ({(Math.max(0, (sent.bubur_i || 0) - sisaGramToCups(row.bubur_i || 0, 118)) * 118).toLocaleString()} g)</span>
                  </div>
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Tim ${tim1Name} Retur`}>T. {tim1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.tim_d * 108}
                      disabled={isAllView}
                      value={row.tim_d || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(returOutletId, "tim_d", Math.min(grams, sent.tim_d * 108));
                      }}
                      className="h-9 text-xs text-center border-amber-300 focus-visible:ring-amber-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {sisaGramToCups(row.tim_d || 0, 108)} cup retur</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.tim_d || 0) - sisaGramToCups(row.tim_d || 0, 108))} cup ({(Math.max(0, (sent.tim_d || 0) - sisaGramToCups(row.tim_d || 0, 108)) * 108).toLocaleString()} g)</span>
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Tim ${tim2Name} Retur`}>T. {tim2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.tim_i * 108}
                      disabled={isAllView}
                      value={row.tim_i || ""}
                      onChange={(e) => {
                        const grams = parseInt(e.target.value) || 0;
                        handleReturChange(returOutletId, "tim_i", Math.min(grams, sent.tim_i * 108));
                      }}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="Gram"
                    />
                    <span className="text-[11px] font-semibold text-emerald-600 block text-center mt-0.5">≈ {sisaGramToCups(row.tim_i || 0, 108)} cup retur</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.tim_i || 0) - sisaGramToCups(row.tim_i || 0, 108))} cup ({(Math.max(0, (sent.tim_i || 0) - sisaGramToCups(row.tim_i || 0, 108)) * 108).toLocaleString()} g)</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.oatmeal}
                      disabled={isAllView}
                      value={row.oatmeal || ""}
                      onChange={(e) => handleReturChange(returOutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-destructive block text-center mt-0.5">Retur: {row.oatmeal} cup ({(row.oatmeal || 0) * 100}g)</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.oatmeal || 0) - (row.oatmeal || 0))} cup</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.puding}
                      disabled={isAllView}
                      value={row.puding || ""}
                      onChange={(e) => handleReturChange(returOutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-destructive block text-center mt-0.5">Retur: {row.puding} cup ({(row.puding || 0) * 80}g)</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.puding || 0) - (row.puding || 0))} cup</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.abon}
                      disabled={isAllView}
                      value={row.abon || ""}
                      onChange={(e) => handleReturChange(returOutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[9px] text-destructive block text-center mt-0.5">Retur: {row.abon} pcs ({(row.abon || 0) * 10}g)</span>
                    <span className="text-[9px] text-success block text-center">Terjual: {Math.max(0, (sent.abon || 0) - (row.abon || 0))} pcs</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Retur & Produk Terjual (Klik baris untuk pilih/edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur1Name} Retur/Terjual</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name} Retur/Terjual</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Tim {tim1Name} Retur/Terjual</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5 font-semibold">Tim {tim2Name} Retur/Terjual</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal Retur/Terjual</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding Retur/Terjual</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon Retur/Terjual</TableHead>
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
                      const isSelected = o.id === returOutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setReturOutletId(o.id)}
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
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.bubur_d || 0) - sisaGramToCups(row.bubur_d || 0, 118))} cup</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.bubur_i || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.bubur_i || 0) - sisaGramToCups(row.bubur_i || 0, 118))} cup</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.tim_d || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.tim_d || 0) - sisaGramToCups(row.tim_d || 0, 108))} cup</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs">
                              <span className="text-destructive">{row.tim_i || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.tim_i || 0) - sisaGramToCups(row.tim_i || 0, 108))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.oatmeal || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.oatmeal || 0) - (row.oatmeal || 0))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.puding || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.puding || 0) - (row.puding || 0))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs">
                              <span className="text-destructive">{row.abon || 0}</span>
                              <span className="text-muted-foreground/60"> retur</span>
                            </div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (sent.abon || 0) - (row.abon || 0))} pcs</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Baris Total (Semua Outlet) — klik untuk kembali ke ringkasan total */}
                    {(() => {
                      const tRow = sumGridRows(returGrid);
                      const tSent = sumGridRows(distGrid);
                      return (
                        <TableRow
                          onClick={() => setReturOutletId(ALL_OUTLETS_ID)}
                          className={`cursor-pointer transition-colors font-semibold ${
                            isAllView
                              ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary"
                              : "hover:bg-muted/30 border-l-4 border-l-transparent"
                          }`}
                        >
                          <TableCell className="py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="text-primary">Total (Semua Outlet)</span>
                              {isAllView && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Lihat</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <div className="font-semibold text-xs"><span className="text-destructive">{tRow.bubur_d || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.bubur_d || 0) - sisaGramToCups(tRow.bubur_d || 0, 118))} cup</div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2">
                            <div className="font-semibold text-xs"><span className="text-destructive">{tRow.bubur_i || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.bubur_i || 0) - sisaGramToCups(tRow.bubur_i || 0, 118))} cup</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs"><span className="text-destructive">{tRow.tim_d || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.tim_d || 0) - sisaGramToCups(tRow.tim_d || 0, 108))} cup</div>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2">
                            <div className="font-semibold text-xs"><span className="text-destructive">{tRow.tim_i || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.tim_i || 0) - sisaGramToCups(tRow.tim_i || 0, 108))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs"><span className="text-destructive">{tRow.oatmeal || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.oatmeal || 0) - (tRow.oatmeal || 0))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs"><span className="text-destructive">{tRow.puding || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.puding || 0) - (tRow.puding || 0))} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2">
                            <div className="font-medium text-xs"><span className="text-destructive">{tRow.abon || 0}</span><span className="text-muted-foreground/60"> retur</span></div>
                            <div className="text-[9px] text-success">Terjual: {Math.max(0, (tSent.abon || 0) - (tRow.abon || 0))} pcs</div>
                          </TableCell>
                        </TableRow>
                      );
                    })()}
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

            <div className="flex items-center gap-2">
              {user?.role === "admin" && isCycleClosed && (
                <Button
                  variant="outline"
                  onClick={() => setBukaSiklusOpen(true)}
                  disabled={closingCycle || bukaSiklusLoading}
                  className="h-10 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                >
                  <LockOpen className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">{bukaSiklusLoading ? "Membuka..." : "Buka Siklus"}</span>
                </Button>
              )}
              <Button onClick={saveStep4} className="gradient-success text-white hover-lift h-10 font-bold" disabled={closingCycle || bukaSiklusLoading || isReadOnlyGudang}>
                <ShoppingBag className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">{closingCycle ? "Menutup siklus..." : "Selesaikan & Tutup Siklus"}</span>
              </Button>
            </div>
          </div>

          {/* Konfirmasi Buka Siklus — khusus admin */}
          <AlertDialog open={bukaSiklusOpen} onOpenChange={setBukaSiklusOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <LockOpen className="h-5 w-5 text-amber-500" />
                  Buka Siklus {tanggal}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Ini akan menghapus <strong>jurnal OUT-SALES</strong> dan <strong>stok retur/OH abon</strong> untuk tanggal {tanggal}.
                  Data penjualan <strong>tetap aman</strong> dan bisa diedit ulang. Setelah selesai memperbaiki data, tutup siklus lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleBukaSiklus}>Ya, Buka Siklus</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                  <DateInput
                    value={tanggal}
                    onChange={setTanggal}
                    className="font-medium border-primary/20 text-sm"
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
          <div className="hidden md:grid grid-cols-4 gap-2 mt-4 pt-4 border-t">
            {[
              { num: 1, label: "Pra-Produksi" },
              { num: 2, label: "Pemotongan Bahan" },
              { num: 3, label: "Distribusi" },
              { num: 4, label: "Retur & Penjualan" }
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
              { num: 2, label: "Pemotongan Bahan" },
              { num: 3, label: "Distribusi" },
              { num: 4, label: "Retur & Penjualan" }
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
      </div>
    );
  }

  const isKapro = user?.role === "produksi" || user?.role === "gudang";

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
          <TabsList className="grid w-full grid-cols-2 gap-0">
            <TabsTrigger value="siklus" className="rounded-t-lg font-semibold">Siklus Produksi Harian</TabsTrigger>
            <TabsTrigger value="riwayat" className="rounded-t-lg font-semibold">Riwayat Produksi</TabsTrigger>
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
