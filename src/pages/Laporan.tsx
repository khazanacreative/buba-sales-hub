import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, useDB } from "@/lib/store";
import { rupiah, monthKey, DateRange, inRange, todayISO } from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, Package, Edit3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Periode = "harian" | "mingguan" | "bulanan";

// Gramasi per cup untuk konversi
const GRAM_PER_CUP: Record<string, number> = {
  "p-bubur": 118,
  "p-nasitim": 108,
  "p-oatmeal": 100,
  "p-puding": 80,
  "p-abon": 10,
};

const PRODUCTION_PRODUCTS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];

// Sub-ID for variant rows (Bubur/Tim dipecah jadi 2 baris)
const PRODUK_SUB: Record<string, { subId: string; label: string }[]> = {
  "p-bubur": [
    { subId: "p-bubur-d", label: "Bubur Daging" },
    { subId: "p-bubur-i", label: "Bubur Ikan" },
  ],
  "p-nasitim": [
    { subId: "p-nasitim-d", label: "Nasi Tim Daging" },
    { subId: "p-nasitim-i", label: "Nasi Tim Ikan" },
  ],
  "p-oatmeal": [{ subId: "p-oatmeal", label: "Oatmeal" }],
  "p-puding": [{ subId: "p-puding", label: "Puding" }],
  "p-abon": [{ subId: "p-abon", label: "Abon" }],
};

// Parse [D:X,I:Y] from catatan
const parseSplit = (catatan: string) => {
  const match = catatan?.match(/D:(\d+),I:(\d+)/);
  if (match) return { d: Number(match[1]), i: Number(match[2]) };
  return { d: 0, i: 0 };
};

// Parse [V:v1Name,v2Name] from catatan untuk nama varian
const parseVariants = (catatan: string) => {
  const match = catatan?.match(/\[V:([^,\]]+),([^,\]]+)\]/);
  if (match) {
    return { v1: match[1], v2: match[2] };
  }
  return { v1: "", v2: "" };
};

// Get dynamic variant labels from permohonanStok records
const getVariantLabels = (permohonanStok: any[]) => {
  let bubur1 = "Daging", bubur2 = "Ikan", tim1 = "Daging", tim2 = "Ikan";
  (permohonanStok || []).forEach((r: any) => {
    const v = parseVariants(r.catatan || "");
    if (v.v1 && v.v2) {
      if (r.produkId === "p-bubur") { bubur1 = v.v1; bubur2 = v.v2; }
      if (r.produkId === "p-nasitim") { tim1 = v.v1; tim2 = v.v2; }
    }
  });
  return { bubur1, bubur2, tim1, tim2 };
};

export default function Laporan() {
  const { penjualan, outlets, produk, permohonanStok } = useDB();
  const { user } = useAuth();
  const isOutlet = user?.role === "outlet";

  const [periode, setPeriode] = useState<Periode>("harian");
  const [outletId, setOutletId] = useState<string>(isOutlet ? user!.outletId! : "all");
  const [range, setRange] = useState<DateRange>({});

  // ===== REKAP DATA =====
  const baseFiltered = useMemo(
    () =>
      penjualan
        .filter((p) => (isOutlet ? p.outletId === user!.outletId : true))
        .filter((p) => (outletId === "all" ? true : p.outletId === outletId))
        .filter((p) => inRange(p.tanggal, range)),
    [penjualan, outletId, range, isOutlet, user]
  );

  const rekapRows = useMemo(() => {
    const groups = new Map<string, { periode: string; produkId: string; qty: number; omzet: number }>();
    baseFiltered.forEach((p) => {
      let keyPeriode = p.tanggal;
      if (periode === "bulanan") keyPeriode = monthKey(p.tanggal);
      else if (periode === "mingguan") {
        const d = new Date(p.tanggal);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
        keyPeriode = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
      }
      const groupKey = `${keyPeriode}-${p.produkId}`;
      const cur = groups.get(groupKey) ?? { periode: keyPeriode, produkId: p.produkId, qty: 0, omzet: 0 };
      cur.qty += p.qty;
      cur.omzet += p.total;
      groups.set(groupKey, cur);
    });
    return [...groups.values()].sort((a, b) => b.periode.localeCompare(a.periode));
  }, [baseFiltered, periode]);

  // Summary by produk for Rekap
  const rekapByProduk = useMemo(() => {
    const map = new Map<string, { produkId: string; qty: number; omzet: number }>();
    baseFiltered.forEach((p) => {
      const cur = map.get(p.produkId) ?? { produkId: p.produkId, qty: 0, omzet: 0 };
      cur.qty += p.qty;
      cur.omzet += p.total;
      map.set(p.produkId, cur);
    });
    return Array.from(map.values()).sort((a, b) => PRODUCTION_PRODUCTS.indexOf(a.produkId) - PRODUCTION_PRODUCTS.indexOf(b.produkId));
  }, [baseFiltered]);

  const totalAllQty = baseFiltered.reduce((s, p) => s + p.qty, 0);
  const totalAllOmzet = baseFiltered.reduce((s, p) => s + p.total, 0);

  const rekapPagination = usePagination(rekapRows, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Laporan Penjualan</h1>
          <p className="text-muted-foreground">Rekapitulasi dan riwayat transaksi penjualan terintegrasi</p>
        </div>
      </div>

      <Tabs defaultValue={isOutlet ? "sisa-produksi" : "riwayat"} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 gap-0">
          <TabsTrigger value="sisa-produksi" className="rounded-t-lg">Sisa (OH)</TabsTrigger>
          <TabsTrigger value="riwayat" className="rounded-t-lg">Riwayat</TabsTrigger>
          <TabsTrigger value="rekap" className="rounded-t-lg">Rekap</TabsTrigger>
        </TabsList>

        {/* ==================== TAB SISA PRODUKSI (OH) ==================== */}
        <TabsContent value="sisa-produksi" className="space-y-6">
          {isOutlet ? (
            <SisaProduksiOH
              user={user!}
              produk={produk}
              penjualan={penjualan}
              permohonanStok={permohonanStok}
            />
          ) : (
            <SisaProduksiAdminView
              outlets={outlets}
              produk={produk}
              penjualan={penjualan}
              permohonanStok={permohonanStok}
            />
          )}
        </TabsContent>

        {/* ==================== TAB 1: RIWAYAT TRANSAKSI ==================== */}
        <TabsContent value="riwayat" className="space-y-6">
          <RiwayatTransaksiTab
            user={user!}
            isOutlet={isOutlet}
            outlets={outlets}
            produk={produk}
            penjualan={penjualan}
            permohonanStok={permohonanStok}
            outletId={outletId}
            setOutletId={setOutletId}
            range={range}
            setRange={setRange}
          />
        </TabsContent>

        {/* ==================== TAB 2: REKAP PENJUALAN ==================== */}
        <TabsContent value="rekap" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
              <div>
                <CardTitle>Filter & Ekspor Rekap</CardTitle>
              </div>
              <ExportButtons
                filename={`rekap-penjualan-${periode}`}
                title={`Rekap Penjualan (${periode})`}
                headers={["Periode", "Produk", "Total Qty", "Total Omzet"]}
                rows={[
                  ...rekapRows.map((r) => [r.periode, r.produkId, r.qty, r.omzet]),
                  ["TOTAL", "-", totalAllQty, totalAllOmzet],
                ]}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 flex-wrap">
                <Select value={periode} onValueChange={(v) => setPeriode(v as Periode)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="harian">Harian</SelectItem>
                    <SelectItem value="mingguan">Mingguan</SelectItem>
                    <SelectItem value="bulanan">Bulanan</SelectItem>
                  </SelectContent>
                </Select>
                {!isOutlet && (
                  <Select value={outletId} onValueChange={setOutletId}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Outlet</SelectItem>
                      {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <DateRangeFilter value={range} onChange={setRange} />
              </div>

              {/* Summary Cards Per Produk */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {rekapByProduk.map((r) => (
                  <div key={r.produkId} className="bg-muted/30 p-3 rounded-xl border text-center">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">{r.produkId.replace("p-", "").replace("nasitim", "Nasi Tim")}</div>
                    <div className="text-lg font-bold mt-1">{r.qty} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
                    <div className="text-xs font-semibold text-primary">{rupiah(r.omzet)}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Periode</TableHead>
                        <TableHead>Produk</TableHead>
                        <TableHead className="text-right">Total Qty</TableHead>
                        <TableHead className="text-right">Total Omzet</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rekapRows.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Belum ada data sesuai filter</TableCell></TableRow>
                      )}
                      {rekapPagination.paged.map((r: any, i: number) => (
                        <TableRow key={`${r.periode}-${r.produkId}-${i}`}>
                          <TableCell className="font-medium">{r.periode}</TableCell>
                          <TableCell>{r.produkId.replace("p-", "").replace("nasitim", "Nasi Tim")}</TableCell>
                          <TableCell className="text-right">{r.qty}</TableCell>
                          <TableCell className="text-right">{rupiah(r.omzet)}</TableCell>
                        </TableRow>
                      ))}
                      {rekapRows.length > 0 && rekapPagination.page === rekapPagination.totalPages && (
                        <TableRow className="bg-muted/50 font-bold">
                          <TableCell colSpan={2}>TOTAL</TableCell>
                          <TableCell className="text-right">{totalAllQty}</TableCell>
                          <TableCell className="text-right text-primary">{rupiah(totalAllOmzet)}</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={rekapPagination.page}
                  totalPages={rekapPagination.totalPages}
                  total={rekapPagination.total}
                  pageSize={rekapPagination.pageSize}
                  onChange={rekapPagination.setPage}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ====================================================================
// SISA PRODUKSI TAB — OUTLET ONLY: Form input sisa produksi harian
// ====================================================================
function SisaProduksiOH({
  user,
  produk,
  penjualan,
  permohonanStok,
}: {
  user: any;
  produk: any[];
  penjualan: any[];
  permohonanStok: any[];
}) {
  const [tanggal, setTanggal] = useState(todayISO());
  const [sisaGrid, setSisaGrid] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftSisa, setDraftSisa] = useState<Record<string, number>>({});
  // Track whether user has manually modified sisa values.
  // Prevents auto-recalculation from overwriting user input.
  const [userModifiedSisa, setUserModifiedSisa] = useState(false);

  // Dynamic variant labels from production
  const variantLabels = useMemo(() => getVariantLabels(permohonanStok), [permohonanStok]);

  // 7 Menu items for daily input — labels sinkron dengan pilihan produksi
  const MENU_ITEMS = useMemo(() => [
    { subId: "bubur_d", baseId: "p-bubur", label: `Bubur ${variantLabels.bubur1}`, gramPerCup: 118 },
    { subId: "bubur_i", baseId: "p-bubur", label: `Bubur ${variantLabels.bubur2}`, gramPerCup: 118 },
    { subId: "tim_d", baseId: "p-nasitim", label: `Nasi Tim ${variantLabels.tim1}`, gramPerCup: 108 },
    { subId: "tim_i", baseId: "p-nasitim", label: `Nasi Tim ${variantLabels.tim2}`, gramPerCup: 108 },
    { subId: "oatmeal", baseId: "p-oatmeal", label: "Oatmeal", gramPerCup: 100 },
    { subId: "puding", baseId: "p-puding", label: "Puding", gramPerCup: 80 },
    { subId: "abon", baseId: "p-abon", label: "Abon", gramPerCup: 10 },
  ], [variantLabels]);

  // Look up distribution for selected date
  const distributions = useMemo(() => {
    return (permohonanStok || []).filter((r: any) =>
      r.outletId === user.outletId &&
      r.status === "Disetujui" &&
      PRODUCTION_PRODUCTS.includes(r.produkId) &&
      r.tanggalKirim === tanggal
    );
  }, [permohonanStok, user.outletId, tanggal]);

  // Build distribution map by subId for selected date
  const distMap = useMemo(() => {
    const map = new Map<string, number>();
    distributions.forEach((r: any) => {
      const split = parseSplit(r.catatan || "");
      if (r.produkId === "p-bubur") {
        map.set("bubur_d", (map.get("bubur_d") || 0) + (split.d || r.qty));
        map.set("bubur_i", (map.get("bubur_i") || 0) + (split.i || 0));
      } else if (r.produkId === "p-nasitim") {
        map.set("tim_d", (map.get("tim_d") || 0) + (split.d || r.qty));
        map.set("tim_i", (map.get("tim_i") || 0) + (split.i || 0));
      } else if (r.produkId === "p-oatmeal") {
        map.set("oatmeal", (map.get("oatmeal") || 0) + r.qty);
      } else if (r.produkId === "p-puding") {
        map.set("puding", (map.get("puding") || 0) + r.qty);
      } else if (r.produkId === "p-abon") {
        map.set("abon", (map.get("abon") || 0) + r.qty);
      }
    });
    return map;
  }, [distributions]);

  // Reset userModifiedSisa when date changes so auto-recalculation works for new date
  useEffect(() => {
    setUserModifiedSisa(false);
  }, [tanggal]);

  // Pre-fill sisa from existing penjualan (all stored in grams)
  // Reset sisaGrid when distribution data changes so outlet sees updated distribusi
  // Only runs when user has NOT manually modified sisa (prevents overwrite user input)
  useEffect(() => {
    if (userModifiedSisa) return;

    setSisaGrid((prev) => {
      const next = { ...prev };
      MENU_ITEMS.forEach((item) => {
        const key = `${tanggal}-${item.subId}`;
        const distQty = distMap.get(item.subId) || 0;

        // Only update items that have distribution or had a previous value
        if (distQty <= 0 && !(key in prev)) return;

        if (distQty <= 0) {
          // Distribution removed — clear stored sisa
          next[key] = 0;
          return;
        }

        const existingSales = (penjualan || []).filter(
          (p: any) => p.outletId === user.outletId && p.tanggal === tanggal && p.produkId === item.baseId
        );
        const totalSold = existingSales.reduce((sum: number, p: any) => sum + p.qty, 0);
        const sisaCups = Math.max(0, distQty - totalSold);
        next[key] = sisaCups * item.gramPerCup;
      });
      return next;
    });
  }, [distMap, tanggal, penjualan, user.outletId, userModifiedSisa]);



  const openDialog = () => {
    // Initialize draft with current sisaGrid values
    const initial: Record<string, number> = {};
    MENU_ITEMS.forEach((item) => {
      const key = `${tanggal}-${item.subId}`;
      initial[key] = sisaGrid[key] ?? 0;
    });
    setDraftSisa(initial);
    setDialogOpen(true);
  };

  const handleDraftChange = (key: string, val: number) => {
    setUserModifiedSisa(true);
    setDraftSisa((prev) => ({ ...prev, [key]: isNaN(val) ? 0 : Math.max(0, val) }));
  };

  const confirmDialog = () => {
    setSisaGrid({ ...draftSisa });
    setDialogOpen(false);
  };

  // Convert sisa grams to cups for a menu item
  const sisaGramToCup = (sisaGr: number, gramPerCup: number): number => {
    if (gramPerCup <= 0) return 0;
    return Math.floor(sisaGr / gramPerCup);
  };

  // Build all 7 rows — always visible
  const rows = useMemo(() => {
    return MENU_ITEMS.map((item) => {
      const distQty = distMap.get(item.subId) || 0;
      const key = `${tanggal}-${item.subId}`;
      const sisaGram = sisaGrid[key] ?? 0;
      const sisaCups = sisaGramToCup(sisaGram, item.gramPerCup);
      const terjual = distQty > 0 ? Math.max(0, distQty - Math.min(sisaCups, distQty)) : 0;
      const prod = produk.find((p: any) => p.id === item.baseId);
      const harga = prod?.harga || 0;
      const omset = terjual * harga;

      return {
        key,
        tanggal,
        subId: item.subId,
        baseId: item.baseId,
        label: item.label,
        gramPerCup: item.gramPerCup,
        distribusi: distQty,
        sisa: sisaGram, // in grams
        sisaCups,
        terjual,
        harga,
        omset,
      };
    });
  }, [distMap, tanggal, sisaGrid, produk]);

  // Summary
  const summary = useMemo(() => {
    let totalDistribusi = 0, totalSisa = 0, totalTerjual = 0, totalOmset = 0;
    rows.forEach((row) => {
      totalDistribusi += row.distribusi;
      totalSisa += Math.min(row.sisaCups, row.distribusi);
      totalTerjual += row.terjual;
      totalOmset += row.omset;
    });
    return { totalDistribusi, totalSisa, totalTerjual, totalOmset };
  }, [rows]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      // Aggregate by base produkId (merge D and I for same base)
      const groups = new Map<string, { baseId: string; distribusi: number; sisa: number; harga: number }>();

      rows.forEach((row) => {
        if (row.distribusi <= 0) return; // skip items with no distribution
        const existing = groups.get(row.baseId) || {
          baseId: row.baseId,
          distribusi: 0,
          sisa: 0,
          harga: row.harga,
        };
        existing.distribusi += row.distribusi;
        existing.sisa += Math.min(row.sisaCups, row.distribusi); // sisaCups already converted from grams
        groups.set(row.baseId, existing);
      });

      let savedCount = 0;
      for (const [baseId, group] of groups) {
        const terjual = Math.max(0, group.distribusi - group.sisa);

        // Delete existing penjualan for this outlet+tanggal+base
        const existingPenjualan = (penjualan || []).filter(
          (p: any) => p.outletId === user.outletId && p.tanggal === tanggal && p.produkId === baseId
        );
        for (const p of existingPenjualan) {
          await db.deletePenjualan(p.id);
        }

        // Create new penjualan record if anything was sold
        if (terjual > 0) {
          await db.addPenjualan({
            tanggal,
            outletId: user.outletId,
            produkId: baseId,
            qty: terjual,
            harga: group.harga,
          });
          savedCount++;
        }
      }

      // === JANGAN reset userModifiedSisa di sini! ===
      // Jika direset, useEffect auto-recalculation akan menimpa nilai
      // sisa yang sudah diinput user (mis: 1000gr → 944gr karena floor).
      // UserModifiedSisa hanya direset saat ganti tanggal (lihat useEffect tanggal).
      // setUserModifiedSisa(false); // ⛔ JANGAN DIUNCOMMENT

      if (savedCount > 0) {
        toast.success(`${savedCount} penjualan berhasil disimpan! Data terhubung ke admin.`);
      } else {
        toast.info("Tidak ada penjualan yang perlu dicatat");
      }
      // Dispatch custom event so Produksi Step 5 can auto-refresh returGrid
      window.dispatchEvent(new CustomEvent("buba_penjualan_saved", { detail: { tanggal } }));
    } catch (err) {
      toast.error("Gagal menyimpan data sisa produksi");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [rows, tanggal, user.outletId, penjualan]);

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-bold text-blue-700 dark:text-blue-300 text-sm mb-1">📋 Input Sisa Produksi Harian</p>
            <p>Masukkan <strong>sisa produksi</strong> yang <strong>tidak terjual</strong> hari ini. Bubur &amp; Nasi Tim dalam <strong>gram</strong>, Oatmeal &amp; Puding dalam <strong>cup</strong>, Abon dalam <strong>pcs</strong>. Sisa tidak boleh melebihi stok yang didistribusikan. Data sinkron ke <strong>Langkah 5 Produksi</strong>.</p>
          </div>
        </div>
      </div>

      <Card className="glass border-0 shadow-card">
        <CardContent className="p-4 md:p-6 space-y-4">
          {/* Toolbar: Date picker + Summary + Save */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Tanggal:</span>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="h-9 w-40 text-xs"
                />
              </div>
              {summary.totalDistribusi > 0 && (
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">Dist: <strong className="text-foreground">{summary.totalDistribusi}</strong> cup</span>
                  <span className="text-warning font-medium">Sisa: <strong>{summary.totalSisa}</strong> cup</span>
                  <span className="text-success font-medium">Terjual: <strong>{summary.totalTerjual}</strong> cup</span>
                  <span className="text-primary font-medium">Omset: <strong>{rupiah(summary.totalOmset)}</strong></span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={openDialog}
                size="sm"
                variant="outline"
                className="h-9 shrink-0"
              >
                <Edit3 className="h-4 w-4 mr-1.5" />
                Input Sisa
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || rows.every(r => r.sisa === 0)}
                size="sm"
                className="gradient-primary text-primary-foreground h-9 shrink-0"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? "Menyimpan..." : "Simpan Penjualan"}
              </Button>
            </div>
          </div>

          {/* Always-visible Form Table — 7 Menu Items */}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Menu</TableHead>
                    <TableHead className="text-right">Distribusi (Cup)</TableHead>
                    <TableHead className="text-right w-[120px]">Distribusi (Unit)</TableHead>
                    <TableHead className="text-right w-[160px]">Sisa (Unit)</TableHead>
                    <TableHead className="text-right">Sisa (Cup/Pcs)</TableHead>
                    <TableHead className="text-right">Terjual</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Omset</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const gramPerCup = row.gramPerCup || 118;
                    const distGram = row.distribusi * gramPerCup;
                    const sisaCups = Math.floor((row.sisa || 0) / gramPerCup);
                    const isCupItem = row.subId === "oatmeal" || row.subId === "puding" || row.subId === "abon";
                    const distUnit = row.subId === "abon" ? "pcs" : (isCupItem ? "cup" : "g");
                    return (
                    <TableRow key={row.key} className={row.distribusi > 0 ? "" : "opacity-60"}>
                      <TableCell className="whitespace-nowrap font-semibold">
                        {row.label}
                        {row.distribusi <= 0 && (
                          <span className="text-[10px] text-muted-foreground ml-2">(no dist)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.distribusi > 0 ? row.distribusi : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {row.distribusi > 0 ? (
                          isCupItem ? `${row.distribusi} ${distUnit}` : `${distGram.toLocaleString()} g`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.distribusi > 0 ? (
                          isCupItem ? (
                            <span className="font-medium tabular-nums">{sisaCups} {distUnit}</span>
                          ) : (
                            <span className="font-medium tabular-nums">{row.sisa.toLocaleString()} g</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-xs">
                        {row.distribusi > 0 ? (
                          row.subId === "abon"
                            ? `${sisaCups} pcs`
                            : `${sisaCups} cup`
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-bold text-success">
                        {row.distribusi > 0 ? row.terjual : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {rupiah(row.harga)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-primary">
                        {row.distribusi > 0 ? rupiah(row.omset) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Helper text */}
          {rows.every(r => r.distribusi <= 0) && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Belum ada distribusi untuk tanggal ini. Input sisa akan tersimpan saat ada distribusi.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog Input Sisa Produksi — 7 Menu Items */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-600" />
              Input Sisa Produksi — {tanggal}
            </DialogTitle>
            <DialogDescription>
              Bubur &amp; Nasi Tim (gram), Oatmeal &amp; Puding (cup), Abon (pcs).
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
            {MENU_ITEMS.map((item) => {
              const key = `${tanggal}-${item.subId}`;
              const distQty = distMap.get(item.subId) || 0;
              const maxGram = distQty * item.gramPerCup;
              const isCupUnit = item.subId === "oatmeal" || item.subId === "puding" || item.subId === "abon";
              const displayUnit = item.subId === "abon" ? "pcs" : (isCupUnit ? "cup" : "g");
              const displayMax = isCupUnit ? distQty : maxGram;
              // For cup/pcs items, convert stored grams back to cups/pcs for display
              const displayVal = isCupUnit ? Math.floor((draftSisa[key] ?? 0) / item.gramPerCup) : (draftSisa[key] ?? 0);
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-4 p-3 rounded-xl border ${distQty > 0 ? 'bg-background' : 'bg-muted/20 opacity-50'}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {distQty > 0
                        ? isCupUnit
                          ? `${distQty} ${displayUnit} ${item.subId === "abon" ? "" : `(@ ${item.gramPerCup}g/${displayUnit})`}`
                          : `${distQty} cup (${(maxGram).toLocaleString()} g) — ${item.gramPerCup} g/cup`
                        : 'Tidak ada distribusi'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={distQty > 0 ? displayMax : undefined}
                      value={displayVal || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        const clamped = distQty > 0 ? Math.min(Math.max(val, 0), displayMax) : val;
                        // Convert cup/pcs input to grams for storage
                        const storeVal = isCupUnit ? clamped * item.gramPerCup : clamped;
                        handleDraftChange(key, storeVal);
                      }}
                      disabled={distQty <= 0}
                      className="w-24 h-9 text-xs text-center"
                      placeholder="0"
                    />
                    <span className="text-[11px] text-muted-foreground w-6">{displayUnit}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={confirmDialog} className="gradient-primary">
              <Save className="h-4 w-4 mr-1.5" />
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ====================================================================
// SISA PRODUKSI (OH) — ADMIN VIEW: Editable sisa across all outlets
// ====================================================================
function SisaProduksiAdminView({
  outlets,
  produk,
  penjualan,
  permohonanStok,
}: {
  outlets: any[];
  produk: any[];
  penjualan: any[];
  permohonanStok: any[];
}) {
  const [tanggal, setTanggal] = useState(todayISO());
  const [sisaGrid, setSisaGrid] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  // Track whether admin has manually modified sisa values.
  // Prevents auto-recalculation from overwriting admin input.
  const [userModifiedSisa, setUserModifiedSisa] = useState(false);

  // Dynamic variant labels from production
  const variantLabels = useMemo(() => getVariantLabels(permohonanStok), [permohonanStok]);

  // 7 Menu items — labels sinkron dengan pilihan produksi
  const MENU_ITEMS = useMemo(() => [
    { subId: "bubur_d", baseId: "p-bubur", label: `Bubur ${variantLabels.bubur1}`, gramPerCup: 118 },
    { subId: "bubur_i", baseId: "p-bubur", label: `Bubur ${variantLabels.bubur2}`, gramPerCup: 118 },
    { subId: "tim_d", baseId: "p-nasitim", label: `Nasi Tim ${variantLabels.tim1}`, gramPerCup: 108 },
    { subId: "tim_i", baseId: "p-nasitim", label: `Nasi Tim ${variantLabels.tim2}`, gramPerCup: 108 },
    { subId: "oatmeal", baseId: "p-oatmeal", label: "Oatmeal", gramPerCup: 100 },
    { subId: "puding", baseId: "p-puding", label: "Puding", gramPerCup: 80 },
    { subId: "abon", baseId: "p-abon", label: "Abon", gramPerCup: 10 },
  ], [variantLabels]);

  // Build distribution map per outlet, and pre-fill sisa from penjualan
  const outletDataMap = useMemo(() => {
    const map = new Map<string, Map<string, { distQty: number; gramPerCup: number; baseId: string; harga: number }>>();

    outlets.forEach((outlet) => {
      const itemMap = new Map<string, { distQty: number; gramPerCup: number; baseId: string; harga: number }>();

      const distRecords = (permohonanStok || []).filter(
        (r: any) => r.outletId === outlet.id && r.status === "Disetujui" && r.tanggalKirim === tanggal && PRODUCTION_PRODUCTS.includes(r.produkId)
      );

      distRecords.forEach((r: any) => {
        const split = parseSplit(r.catatan || "");
        MENU_ITEMS.forEach((item) => {
          if (r.produkId === item.baseId) {
            let qty = 0;
            if (item.subId === "bubur_d" || item.subId === "tim_d") qty = split.d || r.qty;
            else if (item.subId === "bubur_i" || item.subId === "tim_i") qty = split.i || 0;
            else if (item.subId === "oatmeal" || item.subId === "puding" || item.subId === "abon") qty = r.qty;

            if (qty > 0) {
              const prod = produk.find((p: any) => p.id === item.baseId);
              itemMap.set(item.subId, {
                distQty: (itemMap.get(item.subId)?.distQty || 0) + qty,
                gramPerCup: item.gramPerCup,
                baseId: item.baseId,
                harga: prod?.harga || 0,
              });
            }
          }
        });
      });

      map.set(outlet.id, itemMap);
    });

    return map;
  }, [outlets, permohonanStok, tanggal, produk]);  // Reset userModifiedSisa when date changes so auto-recalculation works for new date
  useEffect(() => {
    setUserModifiedSisa(false);
  }, [tanggal]);

  // Pre-fill sisaGrid from penjualan data (dist - sold)
  // Only runs when admin has NOT manually modified sisa (prevents overwrite input)
  useEffect(() => {
    if (userModifiedSisa) return;

    setSisaGrid((prev) => {
      const next: Record<string, number> = {};
      outlets.forEach((outlet) => {
        const itemMap = outletDataMap.get(outlet.id);
        if (!itemMap) return;
        itemMap.forEach((info, subId) => {
          const key = `${outlet.id}-${tanggal}-${subId}`;
          const existingSales = (penjualan || []).filter(
            (p: any) => p.outletId === outlet.id && p.tanggal === tanggal && p.produkId === info.baseId
          );
          const totalSold = existingSales.reduce((s: number, p: any) => s + p.qty, 0);
          const sisaCups = Math.max(0, info.distQty - totalSold);
          // Store sisa in grams internally
          const storeVal = sisaCups * info.gramPerCup;
          next[key] = prev[key] !== undefined ? prev[key] : storeVal;
        });
      });
      return next;
    });
  }, [outletDataMap, tanggal, penjualan, outlets, userModifiedSisa]);

  const handleSisaChange = (key: string, val: number) => {
    setUserModifiedSisa(true);
    setSisaGrid((prev) => ({ ...prev, [key]: isNaN(val) ? 0 : Math.max(0, val) }));
  };

  const sisaGramToCup = (sisaGr: number, gramPerCup: number): number => {
    if (gramPerCup <= 0) return 0;
    return Math.floor(sisaGr / gramPerCup);
  };

  // Build editable rows per outlet (only outlets with distribution)
  const outletRows = useMemo(() => {
    return outlets
      .map((outlet) => {
        const itemMap = outletDataMap.get(outlet.id);
        if (!itemMap || itemMap.size === 0) return null;

        const items = MENU_ITEMS.map((item) => {
          const info = itemMap.get(item.subId);
          if (!info || info.distQty <= 0) return null;

          const key = `${outlet.id}-${tanggal}-${item.subId}`;
          const sisaGram = sisaGrid[key] ?? 0;
          const sisaCups = sisaGramToCup(sisaGram, item.gramPerCup);
          const terjual = Math.max(0, info.distQty - Math.min(sisaCups, info.distQty));
          const omset = terjual * info.harga;

          return {
            key,
            subId: item.subId,
            baseId: item.baseId,
            label: item.label,
            gramPerCup: item.gramPerCup,
            distQty: info.distQty,
            harga: info.harga,
            sisaGram,
            sisaCups,
            terjual,
            omset,
          };
        }).filter(Boolean) as typeof items;

        return { outlet, items };
      })
      .filter(Boolean) as { outlet: any; items: any[] }[];
  }, [outlets, outletDataMap, sisaGrid]);

  // Grand total across all outlets (auto-calculated)
  const grandTotal = useMemo(() => {
    let totalDist = 0, totalSisa = 0, totalTerjual = 0, totalOmset = 0;
    outletRows.forEach(o => o.items.forEach((i: any) => {
      totalDist += i.distQty;
      totalSisa += Math.min(i.sisaCups, i.distQty);
      totalTerjual += i.terjual;
      totalOmset += i.omset;
    }));
    return { totalDist, totalSisa, totalTerjual, totalOmset };
  }, [outletRows]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      let savedCount = 0;

      for (const { outlet, items } of outletRows) {
        // Group by baseId
        const groups = new Map<string, { baseId: string; distribusi: number; sisa: number; harga: number }>();
        items.forEach((row: any) => {
          const existing = groups.get(row.baseId) || {
            baseId: row.baseId,
            distribusi: 0,
            sisa: 0,
            harga: row.harga,
          };
          existing.distribusi += row.distQty;
          existing.sisa += Math.min(row.sisaCups, row.distQty);
          groups.set(row.baseId, existing);
        });

        for (const [baseId, group] of groups) {
          const terjual = Math.max(0, group.distribusi - group.sisa);

          // Delete existing penjualan for this outlet+tanggal+base
          const existingPenjualan = (penjualan || []).filter(
            (p: any) => p.outletId === outlet.id && p.tanggal === tanggal && p.produkId === baseId
          );
          for (const p of existingPenjualan) {
            await db.deletePenjualan(p.id);
          }

          // Create new penjualan record if anything was sold
          if (terjual > 0) {
            await db.addPenjualan({
              tanggal,
              outletId: outlet.id,
              produkId: baseId,
              qty: terjual,
              harga: group.harga,
            });
            savedCount++;
          }
        }
      }

      // === JANGAN reset userModifiedSisa di sini! ===
      // Jika direset, useEffect auto-recalculation akan menimpa nilai
      // sisa yang sudah diinput admin (sama seperti bug di outlet view).
      // UserModifiedSisa hanya direset saat ganti tanggal (lihat useEffect tanggal).
      // setUserModifiedSisa(false); // ⛔ JANGAN DIUNCOMMENT

      if (savedCount > 0) {
        toast.success(`${savedCount} penjualan berhasil disimpan untuk semua outlet! Data tersinkron ke Langkah 5.`);
      } else {
        toast.info("Tidak ada perubahan data penjualan yang perlu dicatat");
      }
      // Dispatch custom event so Produksi Step 5 can auto-refresh returGrid
      window.dispatchEvent(new CustomEvent("buba_penjualan_saved", { detail: { tanggal } }));
    } catch (err) {
      toast.error("Gagal menyimpan data sisa produksi");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [outletRows, tanggal, penjualan]);

  return (
    <div className="space-y-4">
      {/* Info Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800/30 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-bold text-purple-700 dark:text-purple-300 text-sm mb-1">📝 Edit Sisa Produksi (OH) — Semua Outlet</p>
            <p>Edit <strong>sisa produksi</strong> per menu per outlet. Bubur &amp; Nasi Tim dalam <strong>gram</strong>, Oatmeal &amp; Puding dalam <strong>cup</strong>, Abon dalam <strong>pcs</strong>. Total <strong>terjual</strong> dan <strong>omset</strong> terhitung otomatis. Data sinkron ke <strong>Langkah 5 Produksi</strong>.</p>
          </div>
        </div>
      </div>

      <Card className="glass border-0 shadow-card">
        <CardContent className="p-4 md:p-6 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Tanggal:</span>
                <Input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="h-9 w-40 text-xs"
                />
              </div>
              {grandTotal.totalDist > 0 && (
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-muted-foreground">Dist: <strong className="text-foreground">{grandTotal.totalDist}</strong> cup</span>
                  <span className="text-warning font-medium">Sisa: <strong>{grandTotal.totalSisa}</strong> cup</span>
                  <span className="text-success font-medium">Terjual: <strong>{grandTotal.totalTerjual}</strong> cup</span>
                  <span className="text-primary font-medium">Omset: <strong>{rupiah(grandTotal.totalOmset)}</strong></span>
                </div>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={saving || outletRows.length === 0}
              size="sm"
              className="gradient-primary text-primary-foreground h-9 shrink-0"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Menyimpan..." : "Simpan Semua Outlet"}
            </Button>
          </div>

          {outletRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Belum ada distribusi untuk tanggal ini.
            </p>
          ) : (
            /* Per-outlet editable cards */
            outletRows.map(({ outlet, items }) => {
              const outSum = items.reduce((s: any, i: any) => ({
                dist: s.dist + i.distQty,
                sisa: s.sisa + Math.min(i.sisaCups, i.distQty),
                terjual: s.terjual + i.terjual,
                omset: s.omset + i.omset
              }), { dist: 0, sisa: 0, terjual: 0, omset: 0 });

              return (
                <div key={outlet.id} className="rounded-xl border overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
                    <div className="font-bold text-sm">{outlet.nama}</div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>Dist: <strong>{outSum.dist}</strong></span>
                      <span className="text-warning">Sisa: <strong>{outSum.sisa}</strong></span>
                      <span className="text-success">Terjual: <strong>{outSum.terjual}</strong></span>
                      <span className="text-primary">Omset: <strong>{rupiah(outSum.omset)}</strong></span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/20">
                          <TableHead>Menu</TableHead>
                          <TableHead className="text-right">Distribusi</TableHead>
                          <TableHead className="text-right w-[140px]">Sisa (Unit)</TableHead>
                          <TableHead className="text-right">Sisa (Cup/Pcs)</TableHead>
                          <TableHead className="text-right">Terjual</TableHead>
                          <TableHead className="text-right">Harga</TableHead>
                          <TableHead className="text-right">Omset</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((row: any) => {
                          const isCupItem = row.subId === "oatmeal" || row.subId === "puding" || row.subId === "abon";
                          const displayUnit = row.subId === "abon" ? "pcs" : (isCupItem ? "cup" : "g");
                          const displayVal = isCupItem ? Math.floor((row.sisaGram || 0) / row.gramPerCup) : (row.sisaGram || 0);
                          const maxDisplayVal = isCupItem ? row.distQty : row.distQty * row.gramPerCup;

                          return (
                            <TableRow key={row.key}>
                              <TableCell className="font-semibold whitespace-nowrap">{row.label}</TableCell>
                              <TableCell className="text-right font-medium">{row.distQty}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={maxDisplayVal}
                                    value={displayVal || ""}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      const clamped = Math.min(Math.max(val, 0), maxDisplayVal);
                                      const storeVal = isCupItem ? clamped * row.gramPerCup : clamped;
                                      handleSisaChange(row.key, storeVal);
                                    }}
                                    className="w-20 h-8 text-xs text-center"
                                    placeholder="0"
                                  />
                                  <span className="text-[11px] text-muted-foreground w-5 shrink-0">{displayUnit}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium text-xs">
                                {row.sisaCups} {row.subId === "abon" ? "pcs" : "cup"}
                              </TableCell>
                              <TableCell className="text-right font-bold text-success">{row.terjual}</TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground">{rupiah(row.harga)}</TableCell>
                              <TableCell className="text-right font-bold text-primary">{rupiah(row.omset)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ====================================================================
// RIWAYAT TRANSAKSI TAB — SHARED BY ALL ROLES
// ====================================================================
function RiwayatTransaksiTab({
  user,
  isOutlet,
  outlets,
  produk,
  penjualan,
  permohonanStok,
  outletId,
  setOutletId,
  range,
  setRange,
}: {
  user: any;
  isOutlet: boolean;
  outlets: any[];
  produk: any[];
  penjualan: any[];
  permohonanStok: any[];
  outletId: string;
  setOutletId: (id: string) => void;
  range: DateRange;
  setRange: (r: DateRange) => void;
}) {
  const [saving, setSaving] = useState(false);

  // Get distributions (permohonanStok Disetujui) for the selected outlet(s)
  const distributions = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      const matchOutlet = isOutlet
        ? r.outletId === user.outletId
        : outletId === "all"
          ? true
          : r.outletId === outletId;
      return (
        matchOutlet &&
        r.status === "Disetujui" &&
        PRODUCTION_PRODUCTS.includes(r.produkId) &&
        inRange(r.tanggalKirim, range)
      );
    });
  }, [permohonanStok, user.outletId, outletId, range, isOutlet]);

  // Read actual sales from penjualan table (by base produkId)
  const salesMap = useMemo(() => {
    const map = new Map<string, number>();
    (penjualan || []).forEach((p: any) => {
      const matchOutlet = isOutlet ? p.outletId === user.outletId : true;
      if (!matchOutlet) return;
      if (!inRange(p.tanggal, range)) return;
      const key = `${p.tanggal}-${p.outletId}-${p.produkId}`;
      map.set(key, (map.get(key) || 0) + p.qty);
    });
    return map;
  }, [penjualan, user.outletId, range, isOutlet]);

  // Expand distributions into individual variant rows (Bubur Daging, Bubur Ikan, etc.)
  const transaksiRows = useMemo(() => {
    const rows: {
      tanggal: string;
      outletId: string;
      outletNama: string;
      subId: string;
      produkNama: string;
      baseId: string;
      stokAwalPcs: number;
      harga: number;
    }[] = [];

    distributions.forEach((r: any) => {
      const p = produk.find((x: any) => x.id === r.produkId);
      const outlet = outlets.find((o: any) => o.id === r.outletId);
      const harga = p?.harga ?? 0;
      const split = parseSplit(r.catatan || "");

      if (r.produkId === "p-bubur" || r.produkId === "p-nasitim") {
        // Split into D and I variant rows
        const subs = PRODUK_SUB[r.produkId];
        if (!subs) return;

        // Check if catatan has [D:X,I:Y] split format
        const hasSplit = /D:\d+,I:\d+/.test(r.catatan || "");
        const dQty = hasSplit ? split.d : r.qty;
        const iQty = hasSplit ? split.i : 0;

        if (dQty > 0) {
          rows.push({
            tanggal: r.tanggalKirim,
            outletId: r.outletId,
            outletNama: outlet?.nama ?? "-",
            subId: subs[0].subId,
            produkNama: subs[0].label,
            baseId: r.produkId,
            stokAwalPcs: dQty,
            harga,
          });
        }

        if (iQty > 0) {
          rows.push({
            tanggal: r.tanggalKirim,
            outletId: r.outletId,
            outletNama: outlet?.nama ?? "-",
            subId: subs[1].subId,
            produkNama: subs[1].label,
            baseId: r.produkId,
            stokAwalPcs: iQty,
            harga,
          });
        }
      } else {
        // Single product row (Oatmeal, Puding, Abon)
        const subs = PRODUK_SUB[r.produkId];
        if (!subs) return;
        rows.push({
          tanggal: r.tanggalKirim,
          outletId: r.outletId,
          outletNama: outlet?.nama ?? "-",
          subId: subs[0].subId,
          produkNama: subs[0].label,
          baseId: r.produkId,
          stokAwalPcs: r.qty,
          harga,
        });
      }
    });

    // Group by (tanggal, outletId, subId) to merge duplicates
    const grouped = new Map<string, typeof rows[0]>();
    rows.forEach((row) => {
      const key = `${row.tanggal}-${row.outletId}-${row.subId}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.stokAwalPcs += row.stokAwalPcs;
      } else {
        grouped.set(key, { ...row });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [distributions, produk, outlets]);

  // Calculate actual sales and retur for each row
  const rowsWithActuals = useMemo(() => {
    // For admin: aggregate actualSold by baseId, distribute proportionally across variants
    const baseSoldTotals = new Map<string, number>();
    transaksiRows.forEach((row) => {
      const key = `${row.tanggal}-${row.outletId}-${row.baseId}`;
      const totalSold = salesMap.get(key) || 0;
      baseSoldTotals.set(key, totalSold);
    });

    // Group by (tanggal, outletId, baseId) to get total stok per base
    const baseStokTotals = new Map<string, number>();
    transaksiRows.forEach((row) => {
      const key = `${row.tanggal}-${row.outletId}-${row.baseId}`;
      baseStokTotals.set(key, (baseStokTotals.get(key) || 0) + row.stokAwalPcs);
    });

    return transaksiRows.map((row) => {
      const baseKey = `${row.tanggal}-${row.outletId}-${row.baseId}`;
      const totalSold = baseSoldTotals.get(baseKey) || 0;
      const totalStok = baseStokTotals.get(baseKey) || row.stokAwalPcs;
      const gramPerCup = GRAM_PER_CUP[row.baseId] || 100;

      // Distribute totalSold proportionally across variants
      const proportion = totalStok > 0 ? row.stokAwalPcs / totalStok : 0;
      const actualSold = Math.round(totalSold * proportion);
      const actualReturPcs = Math.max(0, row.stokAwalPcs - actualSold);
      const actualReturGram = actualReturPcs * gramPerCup;

      // For outlet: use locally entered retur grams if available
      return {
        ...row,
        actualSold,
        actualReturPcs,
        actualReturGram,
        displayReturGr: actualReturGram,
        displayReturPcs: actualReturPcs,
        displayTerjual: actualSold,
      };
    });
  }, [transaksiRows, salesMap]);

  // Summary
  const summary = useMemo(() => {
    let totalStok = 0, totalReturPcs = 0, totalTerjual = 0, totalOmset = 0;
    rowsWithActuals.forEach((row) => {
      totalStok += row.stokAwalPcs;
      totalReturPcs += row.displayReturPcs;
      totalTerjual += row.displayTerjual;
      totalOmset += row.displayTerjual * row.harga;
    });
    return { totalStok, totalReturPcs, totalTerjual, totalOmset };
  }, [rowsWithActuals]);

  // Note: Penjualan input done via SisaProduksiOH tab, not here

  const pagination = usePagination(rowsWithActuals, 10);

  const colSpan = isOutlet ? 10 : 11;

  return (
    <div className="space-y-6">
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
          <div>
            <CardTitle>Riwayat Transaksi Penjualan</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {isOutlet
                ? "Input retur (gram) per menu untuk mencatat penjualan harian"
                : "Data stok dari distribusi produksi & penjualan tersinkron"}
            </p>
          </div>            <div className="flex items-center gap-2 flex-wrap">
            {!isOutlet && (
              <Select value={outletId} onValueChange={setOutletId}>
                <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Outlet</SelectItem>
                  {outlets.map((o: any) => (
                    <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Compact summary bar */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-b pb-3">
            <span>Stok: <strong className="text-foreground">{summary.totalStok}</strong> cup</span>
            <span className="text-warning">Retur: <strong>{summary.totalReturPcs}</strong> cup</span>
            <span className="text-success">Terjual: <strong>{summary.totalTerjual}</strong> cup</span>
            <span className="text-primary">Omset: <strong>{rupiah(summary.totalOmset)}</strong></span>
          </div>

          {/* Main Table */}
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Tanggal</TableHead>
                    {!isOutlet && <TableHead>Outlet</TableHead>}
                    <TableHead>Nama Produk</TableHead>
                    <TableHead className="text-right">Stok Awal (Pcs)</TableHead>
                    <TableHead className="text-right">Stok Awal (Gram)</TableHead>
                    <TableHead className="text-right">Sisa/Retur (Gram)</TableHead>
                    <TableHead className="text-right">Retur (Pcs)</TableHead>
                    <TableHead className="text-right">Terjual (Pcs)</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Omset</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsWithActuals.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="text-center text-muted-foreground py-8">
                        Belum ada distribusi produk untuk periode ini
                      </TableCell>
                    </TableRow>
                  )}
                  {pagination.paged.map((row: any) => {
                    const gramPerCup = GRAM_PER_CUP[row.baseId] || 100;
                    const stokAwalGram = row.stokAwalPcs * gramPerCup;
                    const returKey = `${row.tanggal}-${row.subId}`;

                    const isEditable = false; // Input via Sisa Produksi (OH) tab, not here
                    const displayReturGr = row.actualReturGram;
                    const returPcs = isEditable
                      ? Math.floor(displayReturGr / gramPerCup)
                      : row.actualReturPcs;
                    const terjual = isEditable
                      ? Math.max(0, row.stokAwalPcs - returPcs)
                      : row.actualSold;
                    const omset = terjual * row.harga;

                    return (
                      <TableRow key={`${row.tanggal}-${row.outletId}-${row.subId}`}>
                        <TableCell className="whitespace-nowrap">{row.tanggal}</TableCell>
                        {!isOutlet && (
                          <TableCell className="whitespace-nowrap font-medium">{row.outletNama}</TableCell>
                        )}
                        <TableCell className="whitespace-nowrap font-semibold">{row.produkNama}</TableCell>
                        <TableCell className="text-right font-semibold">{row.stokAwalPcs}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {stokAwalGram.toLocaleString()} g
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="text-sm">{displayReturGr > 0 ? `${displayReturGr} g` : "-"}</span>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {returPcs > 0 ? (
                            <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]">
                              {returPcs} cup
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-success">{terjual}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{rupiah(row.harga)}</TableCell>
                        <TableCell className="text-right font-bold text-primary">{rupiah(omset)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
          <TablePagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pagination.pageSize}
            onChange={pagination.setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
