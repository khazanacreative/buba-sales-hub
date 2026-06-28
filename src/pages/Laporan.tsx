import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, useDB } from "@/lib/store";
import { rupiah, monthKey, DateRange, inRange } from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, ShoppingCart, TrendingUp, Package } from "lucide-react";
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
        <TabsList className={`grid w-full max-w-[600px] ${isOutlet ? 'grid-cols-3' : 'grid-cols-2'} bg-muted/50 p-1 rounded-xl`}>
          {isOutlet && (
            <TabsTrigger value="sisa-produksi" className="rounded-lg">Sisa Produksi (OH)</TabsTrigger>
          )}
          <TabsTrigger value="riwayat" className="rounded-lg">Riwayat Transaksi</TabsTrigger>
          <TabsTrigger value="rekap" className="rounded-lg">Rekap Penjualan</TabsTrigger>
        </TabsList>

        {/* ==================== TAB SISA PRODUKSI (OH) - OUTLET ONLY ==================== */}
        {isOutlet && (
          <TabsContent value="sisa-produksi" className="space-y-6">
            <SisaProduksiOH
              user={user!}
              outlets={outlets}
              produk={produk}
              penjualan={penjualan}
              permohonanStok={permohonanStok}
              range={range}
              setRange={setRange}
            />
          </TabsContent>
        )}

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
// SISA PRODUKSI (OH) TAB — OUTLET ONLY: Input sisa produksi dari 7 menu
// ====================================================================
function SisaProduksiOH({
  user,
  outlets,
  produk,
  penjualan,
  permohonanStok,
  range,
  setRange,
}: {
  user: any;
  outlets: any[];
  produk: any[];
  penjualan: any[];
  permohonanStok: any[];
  range: DateRange;
  setRange: (r: DateRange) => void;
}) {
  const [sisaGrid, setSisaGrid] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // 7 Menu items
  const MENU_ITEMS = [
    { subId: "bubur_d", baseId: "p-bubur", label: "Bubur Daging", gramPerCup: 118 },
    { subId: "bubur_i", baseId: "p-bubur", label: "Bubur Ikan", gramPerCup: 118 },
    { subId: "tim_d", baseId: "p-nasitim", label: "Nasi Tim Daging", gramPerCup: 108 },
    { subId: "tim_i", baseId: "p-nasitim", label: "Nasi Tim Ikan", gramPerCup: 108 },
    { subId: "oatmeal", baseId: "p-oatmeal", label: "Oatmeal", gramPerCup: 100 },
    { subId: "puding", baseId: "p-puding", label: "Puding", gramPerCup: 80 },
    { subId: "abon", baseId: "p-abon", label: "Abon", gramPerCup: 10 },
  ];

  // Get distributions (permohonanStok Disetujui) for the outlet
  const distributions = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      return (
        r.outletId === user.outletId &&
        r.status === "Disetujui" &&
        PRODUCTION_PRODUCTS.includes(r.produkId) &&
        inRange(r.tanggalKirim, range)
      );
    });
  }, [permohonanStok, user.outletId, range]);

  // Build distribution map: key = subId, value = { tanggal, qty }
  const distMap = useMemo(() => {
    const map = new Map<string, { tanggal: string; qty: number }[]>();
    distributions.forEach((r: any) => {
      const split = parseSplit(r.catatan || "");
      const items: { subId: string; qty: number }[] = [];

      if (r.produkId === "p-bubur") {
        items.push({ subId: "bubur_d", qty: split.d || r.qty });
        items.push({ subId: "bubur_i", qty: split.i || 0 });
      } else if (r.produkId === "p-nasitim") {
        items.push({ subId: "tim_d", qty: split.d || r.qty });
        items.push({ subId: "tim_i", qty: split.i || 0 });
      } else if (r.produkId === "p-oatmeal") {
        items.push({ subId: "oatmeal", qty: r.qty });
      } else if (r.produkId === "p-puding") {
        items.push({ subId: "puding", qty: r.qty });
      } else if (r.produkId === "p-abon") {
        items.push({ subId: "abon", qty: r.qty });
      }

      items.forEach((item) => {
        const key = `${r.tanggalKirim}-${item.subId}`;
        const existing = map.get(key) || [];
        existing.push({ tanggal: r.tanggalKirim, qty: item.qty });
        map.set(key, existing);
      });
    });
    return map;
  }, [distributions]);

  // Build rows combining distribution + sisa input
  const rows = useMemo(() => {
    // Group by (tanggal, subId) and merge
    const grouped = new Map<string, { tanggal: string; subId: string; distribusi: number; baseId: string }>();

    distMap.forEach((items, key) => {
      const [tanggal, subId] = key.split("-");
      const totalDist = items.reduce((sum, i) => sum + i.qty, 0);
      const menuItem = MENU_ITEMS.find(m => m.subId === subId);
      const existing = grouped.get(key);
      if (existing) {
        existing.distribusi += totalDist;
      } else {
        grouped.set(key, {
          tanggal,
          subId,
          distribusi: totalDist,
          baseId: menuItem?.baseId || "",
        });
      }
    });

    return Array.from(grouped.values())
      .filter((r) => r.distribusi > 0)
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || MENU_ITEMS.findIndex(m => m.subId === a.subId) - MENU_ITEMS.findIndex(m => m.subId === b.subId));
  }, [distMap]);

  // Load existing penjualan to pre-fill sisa values
  useEffect(() => {
    const newSisa: Record<string, number> = {};
    rows.forEach((row) => {
      const existingSales = (penjualan || []).filter(
        (p: any) => p.outletId === user.outletId && p.tanggal === row.tanggal && p.produkId === row.baseId
      );
      const totalSold = existingSales.reduce((sum: number, p: any) => sum + p.qty, 0);
      const sisa = Math.max(0, row.distribusi - totalSold);
      newSisa[`${row.tanggal}-${row.subId}`] = sisa;
    });
    setSisaGrid((prev) => ({ ...prev, ...newSisa }));
  }, [rows, penjualan, user.outletId]);

  const handleSisaChange = (key: string, val: number) => {
    setSisaGrid((prev) => ({ ...prev, [key]: isNaN(val) ? 0 : Math.max(0, val) }));
  };

  // Summary
  const summary = useMemo(() => {
    let totalDistribusi = 0, totalSisa = 0, totalTerjual = 0, totalOmset = 0;
    rows.forEach((row) => {
      const key = `${row.tanggal}-${row.subId}`;
      const sisa = sisaGrid[key] ?? 0;
      const terjual = Math.max(0, row.distribusi - sisa);
      const menuItem = MENU_ITEMS.find(m => m.subId === row.subId);
      const prod = produk.find((p: any) => p.id === row.baseId);
      const harga = prod?.harga || 0;
      totalDistribusi += row.distribusi;
      totalSisa += Math.min(sisa, row.distribusi);
      totalTerjual += terjual;
      totalOmset += terjual * harga;
    });
    return { totalDistribusi, totalSisa, totalTerjual, totalOmset };
  }, [rows, sisaGrid, produk]);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      // Aggregate by base produkId
      const groups = new Map<string, { tanggal: string; produkId: string; distribusi: number; sisa: number; harga: number }>();

      rows.forEach((row) => {
        const key = `${row.tanggal}-${row.subId}`;
        const sisa = sisaGrid[key] ?? 0;
        const terjual = Math.max(0, row.distribusi - Math.min(sisa, row.distribusi));
        const menuItem = MENU_ITEMS.find(m => m.subId === row.subId);
        const prod = produk.find((p: any) => p.id === row.baseId);
        const harga = prod?.harga || 0;

        // Group by (tanggal, baseId) - merge D and I for same base
        const groupKey = `${row.tanggal}-${row.baseId}`;
        const existing = groups.get(groupKey) || {
          tanggal: row.tanggal,
          produkId: row.baseId,
          distribusi: 0,
          sisa: 0,
          harga,
        };
        existing.distribusi += row.distribusi;
        existing.sisa += Math.min(sisa, row.distribusi);
        groups.set(groupKey, existing);
      });

      let savedCount = 0;
      for (const [_, group] of groups) {
        const terjual = Math.max(0, group.distribusi - group.sisa);

        // Delete existing penjualan for this outlet+tanggal+produk
        const existingPenjualan = (penjualan || []).filter(
          (p: any) => p.outletId === user.outletId && p.tanggal === group.tanggal && p.produkId === group.produkId
        );
        for (const p of existingPenjualan) {
          await db.deletePenjualan(p.id);
        }

        // Create new penjualan record
        if (terjual > 0) {
          await db.addPenjualan({
            tanggal: group.tanggal,
            outletId: user.outletId,
            produkId: group.produkId,
            qty: terjual,
            harga: group.harga,
          });
          savedCount++;
        }
      }

      if (savedCount > 0) {
        toast.success(`${savedCount} penjualan berhasil disimpan! Data terhubung ke Langkah 5 Produksi.`);
      } else {
        toast.info("Tidak ada penjualan yang perlu dicatat (semua produk tersisa)");
      }
    } catch (err) {
      toast.error("Gagal menyimpan data sisa produksi");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [rows, sisaGrid, user.outletId, penjualan, produk]);

  return (
    <div className="space-y-6">
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Input Sisa Produksi (OH)
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Masukkan sisa produksi (cup) yang tidak terjual dari 7 menu. Penjualan akan terhitung otomatis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <Button
              onClick={handleSubmit}
              disabled={saving || rows.length === 0}
              size="sm"
              className="gradient-primary text-primary-foreground h-9"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Menyimpan..." : "Submit Sisa Produksi"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/40 p-3 rounded-xl border">
              <div className="text-[10px] text-muted-foreground uppercase font-bold">Distribusi</div>
              <div className="text-lg font-bold mt-1">
                {summary.totalDistribusi} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-warning/5 p-3 rounded-xl border border-warning/20">
              <div className="text-[10px] text-warning uppercase font-bold">Sisa Produksi (OH)</div>
              <div className="text-lg font-bold mt-1">
                {summary.totalSisa} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-success/5 p-3 rounded-xl border border-success/20">
              <div className="text-[10px] text-success uppercase font-bold">Terjual</div>
              <div className="text-lg font-bold mt-1">
                {summary.totalTerjual} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-primary/5 p-3 rounded-xl border border-primary/20">
              <div className="text-[10px] text-primary uppercase font-bold">Total Omset</div>
              <div className="text-lg font-bold mt-1 text-primary">{rupiah(summary.totalOmset)}</div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Package className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground">
                <p className="font-semibold text-blue-700 dark:text-blue-400 mb-1">Terhubung dengan Langkah 5: Retur &amp; Penjualan Akhir Hari</p>
                <p>Data sisa produksi yang Anda input akan otomatis tersinkron ke tahap produksi. Admin akan melihat data penjualan dari outlet untuk ditutup di Langkah 5 siklus produksi.</p>
              </div>
            </div>
          </div>

          {/* Main Table */}
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Menu</TableHead>
                    <TableHead className="text-right">Distribusi (Cup)</TableHead>
                    <TableHead className="text-right">Sisa Produksi (OH)</TableHead>
                    <TableHead className="text-right">Terjual</TableHead>
                    <TableHead className="text-right">Omset</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Belum ada distribusi produk untuk periode ini
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((row) => {
                    const key = `${row.tanggal}-${row.subId}`;
                    const sisa = sisaGrid[key] ?? 0;
                    const terjual = Math.max(0, row.distribusi - Math.min(sisa, row.distribusi));
                    const menuItem = MENU_ITEMS.find(m => m.subId === row.subId);
                    const prod = produk.find((p: any) => p.id === row.baseId);
                    const harga = prod?.harga || 0;
                    const omset = terjual * harga;

                    return (
                      <TableRow key={key}>
                        <TableCell className="whitespace-nowrap font-medium">{row.tanggal}</TableCell>
                        <TableCell className="whitespace-nowrap font-semibold">{menuItem?.label || row.subId}</TableCell>
                        <TableCell className="text-right font-semibold">{row.distribusi}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Input
                              type="number"
                              min={0}
                              max={row.distribusi}
                              value={sisa || ""}
                              onChange={(e) => handleSisaChange(key, parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-xs text-center"
                              placeholder="0"
                            />
                            <span className="text-[10px] text-muted-foreground">cup</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-success">
                          {terjual}
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary">
                          {rupiah(omset)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
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
  const [returGrams, setReturGrams] = useState<Record<string, number>>({});
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
      const returKey = `${row.tanggal}-${row.subId}`;
      const localReturGr = returGrams[returKey];
      const hasLocalEntry = localReturGr !== undefined;

      return {
        ...row,
        actualSold,
        actualReturPcs,
        actualReturGram,
        displayReturGr: hasLocalEntry ? localReturGr : actualReturGram,
        displayReturPcs: hasLocalEntry ? Math.floor(localReturGr / gramPerCup) : actualReturPcs,
        displayTerjual: hasLocalEntry
          ? Math.max(0, row.stokAwalPcs - Math.floor(localReturGr / gramPerCup))
          : actualSold,
      };
    });
  }, [transaksiRows, salesMap, returGrams]);

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

  const handleReturChange = (key: string, grams: number) => {
    setReturGrams((prev) => ({ ...prev, [key]: isNaN(grams) ? 0 : Math.max(0, grams) }));
  };

  const handleSavePenjualan = useCallback(async () => {
    if (!isOutlet) return;
    setSaving(true);
    try {
      // Aggregate by base produkId to avoid duplicate/split records
      const groups = new Map<string, { tanggal: string; produkId: string; stokAwalPcs: number; returPcs: number; harga: number }>();

      rowsWithActuals.forEach((row) => {
        const returKey = `${row.tanggal}-${row.subId}`;
        const gramPerCup = GRAM_PER_CUP[row.baseId] || 100;
        const returGr = returGrams[returKey] ?? row.actualReturGram;
        const returPcs = Math.floor(returGr / gramPerCup);

        const groupKey = `${row.tanggal}-${row.baseId}`;
        const existing = groups.get(groupKey) || {
          tanggal: row.tanggal,
          produkId: row.baseId,
          stokAwalPcs: 0,
          returPcs: 0,
          harga: row.harga,
        };
        existing.stokAwalPcs += row.stokAwalPcs;
        existing.returPcs += returPcs;
        groups.set(groupKey, existing);
      });

      let savedCount = 0;
      for (const [_, group] of groups) {
        const terjual = Math.max(0, group.stokAwalPcs - group.returPcs);

        // Delete existing penjualan records for this outlet+tanggal+produk
        const existingPenjualan = (penjualan || []).filter(
          (p: any) => p.outletId === user.outletId && p.tanggal === group.tanggal && p.produkId === group.produkId
        );
        for (const p of existingPenjualan) {
          await db.deletePenjualan(p.id);
        }

        // Create new penjualan record
        if (terjual > 0) {
          await db.addPenjualan({
            tanggal: group.tanggal,
            outletId: user.outletId,
            produkId: group.produkId,
            qty: terjual,
            harga: group.harga,
          });
          savedCount++;
        }
      }

      if (savedCount > 0) {
        toast.success(`${savedCount} penjualan berhasil disimpan dan tersinkron!`);
      } else {
        toast.info("Tidak ada penjualan yang perlu dicatat");
      }

      setReturGrams({});
    } catch (err) {
      toast.error("Gagal menyimpan penjualan");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [rowsWithActuals, returGrams, user.outletId, isOutlet, penjualan]);

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
          </div>
          <div className="flex items-center gap-2 flex-wrap">
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
            {isOutlet && (
              <Button
                onClick={handleSavePenjualan}
                disabled={saving || rowsWithActuals.length === 0}
                size="sm"
                className="gradient-primary text-primary-foreground h-9"
              >
                <Save className="h-4 w-4 mr-1.5" />
                {saving ? "Menyimpan..." : "Simpan Penjualan"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/40 p-3 rounded-xl border">
              <div className="text-[10px] text-muted-foreground uppercase font-bold flex items-center gap-1">
                <Package className="h-3 w-3" /> Stok Diterima
              </div>
              <div className="text-lg font-bold mt-1">
                {summary.totalStok} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-warning/5 p-3 rounded-xl border border-warning/20">
              <div className="text-[10px] text-warning uppercase font-bold">Retur (Sisa)</div>
              <div className="text-lg font-bold mt-1">
                {summary.totalReturPcs} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-success/5 p-3 rounded-xl border border-success/20">
              <div className="text-[10px] text-success uppercase font-bold flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> Terjual
              </div>
              <div className="text-lg font-bold mt-1">
                {summary.totalTerjual} <span className="text-xs font-normal text-muted-foreground">cup</span>
              </div>
            </div>
            <div className="bg-primary/5 p-3 rounded-xl border border-primary/20">
              <div className="text-[10px] text-primary uppercase font-bold flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Total Omset
              </div>
              <div className="text-lg font-bold mt-1 text-primary">{rupiah(summary.totalOmset)}</div>
            </div>
          </div>

          {/* Main Table */}
          <div className="rounded-2xl border overflow-hidden">
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

                    const isEditable = isOutlet;
                    const displayReturGr = isEditable
                      ? (returGrams[returKey] ?? (row.actualReturGram > 0 ? row.actualReturGram : 0))
                      : row.actualReturGram;
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
                          {isEditable ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={stokAwalGram}
                                value={displayReturGr || ""}
                                onChange={(e) => handleReturChange(returKey, parseInt(e.target.value) || 0)}
                                className="w-20 h-8 text-xs text-center"
                                placeholder="0"
                              />
                              <span className="text-[10px] text-muted-foreground">g</span>
                            </div>
                          ) : (
                            <span className="text-sm">{displayReturGr > 0 ? `${displayReturGr} g` : "-"}</span>
                          )}
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
