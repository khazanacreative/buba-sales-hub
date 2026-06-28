import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, useDB } from "@/lib/store";
import { rupiah, todayISO, monthKey, DateRange, inRange } from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type Periode = "harian" | "mingguan" | "bulanan";

// Gramasi per cup untuk konversi
const GRAM_PER_CUP: Record<string, number> = {
  "p-bubur": 118,
  "p-nasitim": 108,
  "p-oatmeal": 100,
  "p-puding": 80,
  "p-abon": 10
};

const PRODUCTION_PRODUCTS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];



export default function Laporan() {
  const { penjualan, outlets, produk, permohonanStok, stokMov, bahan } = useDB();
  const { user } = useAuth();
  const isOutlet = user?.role === "outlet";

  const [periode, setPeriode] = useState<Periode>("harian");
  const [outletId, setOutletId] = useState<string>(isOutlet ? user!.outletId! : "all");
  const [range, setRange] = useState<DateRange>({});

  // 1. Filtered data for Rekap
  const baseFiltered = useMemo(
    () =>
      penjualan
        .filter((p) => (isOutlet ? p.outletId === user!.outletId : true))
        .filter((p) => (outletId === "all" ? true : p.outletId === outletId))
        .filter((p) => inRange(p.tanggal, range)),
    [penjualan, outletId, range, isOutlet, user]
  );

  const rows = useMemo(() => {
    const groups = new Map<string, { periode: string; qty: number; omzet: number }>();
    baseFiltered.forEach((p) => {
      let key = p.tanggal;
      if (periode === "bulanan") key = monthKey(p.tanggal);
      else if (periode === "mingguan") {
        const d = new Date(p.tanggal);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
        key = `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
      }
      const cur = groups.get(key) ?? { periode: key, qty: 0, omzet: 0 };
      cur.qty += p.qty;
      cur.omzet += p.total;
      groups.set(key, cur);
    });
    return [...groups.values()].sort((a, b) => b.periode.localeCompare(a.periode));
  }, [baseFiltered, periode]);

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalOmzet = rows.reduce((s, r) => s + r.omzet, 0);

  // 2. Filtered data for Riwayat Detail
  const historyFiltered = useMemo(() => {
    return penjualan
      .filter((p) => (isOutlet ? p.outletId === user!.outletId : true))
      .filter((p) => (outletId === "all" ? true : p.outletId === outletId))
      .filter((p) => inRange(p.tanggal, range))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [penjualan, outletId, range, isOutlet, user]);

  const totalQtyHistory = historyFiltered.reduce((s, p) => s + p.qty, 0);
  const totalOmzetHistory = historyFiltered.reduce((s, p) => s + p.total, 0);

  const rekapPagination = usePagination(rows, 10);
  const historyPagination = usePagination(historyFiltered, 10);

  const deletePenjualanItem = async (id: string) => {
    try {
      await db.deletePenjualan(id);
      toast.success("Transaksi penjualan berhasil dihapus");
    } catch (err) {
      toast.error("Gagal menghapus transaksi penjualan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Laporan Penjualan</h1>
          <p className="text-muted-foreground">Rekapitulasi dan riwayat transaksi penjualan</p>
        </div>
      </div>

      <Tabs defaultValue={isOutlet ? "outlet-transaksi" : "rekap"} className="space-y-6">
        <TabsList className={`grid w-full ${isOutlet ? "max-w-[600px] grid-cols-3" : "max-w-[400px] grid-cols-2"} bg-muted/50 p-1 rounded-xl`}>
          <TabsTrigger value="rekap" className="rounded-lg">Rekap Penjualan</TabsTrigger>
          <TabsTrigger value="riwayat" className="rounded-lg">Riwayat Transaksi</TabsTrigger>
          {isOutlet && (
            <TabsTrigger value="outlet-transaksi" className="rounded-lg">Riwayat Outlet</TabsTrigger>
          )}
        </TabsList>

        {/* Tab 1: Rekap Penjualan */}
        <TabsContent value="rekap" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
              <div>
                <CardTitle>Filter & Ekspor Rekap</CardTitle>
              </div>
              <ExportButtons
                filename={`laporan-${periode}`}
                title={`Laporan Penjualan (${periode})`}
                headers={["Periode", "Total Qty", "Total Omzet"]}
                rows={[
                  ...rows.map((r) => [r.periode, r.qty, r.omzet]),
                  ["TOTAL", totalQty, totalOmzet],
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
              <LaporanTable rows={rows} totalQty={totalQty} totalOmzet={totalOmzet} pagination={rekapPagination} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Riwayat Transaksi */}
        <TabsContent value="riwayat" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
              <div>
                <CardTitle>Riwayat Transaksi Detail</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  {historyFiltered.length} trx · {totalQtyHistory} cup · <span className="font-semibold text-primary">{rupiah(totalOmzetHistory)}</span>
                </div>
              </div>
              <ExportButtons
                filename="riwayat-penjualan"
                title="Riwayat Penjualan Detail"
                headers={["Tanggal", "Outlet", "Produk", "Qty", "Harga", "Total"]}
                rows={historyFiltered.map((p) => [
                  p.tanggal,
                  outlets.find((o) => o.id === p.outletId)?.nama ?? "-",
                  produk.find((x) => x.id === p.produkId)?.nama ?? "-",
                  p.qty,
                  p.harga,
                  p.total,
                ])}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 flex-wrap">
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
              <RiwayatTable
                historyFiltered={historyFiltered}
                outlets={outlets}
                produk={produk}
                isOutlet={isOutlet}
                pagination={historyPagination}
                onDelete={deletePenjualanItem}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Outlet Riwayat Transaksi (only for outlet role) */}
        {isOutlet && (
          <TabsContent value="outlet-transaksi" className="space-y-6">
            <OutletRiwayatTransaksi
              user={user!}
              permohonanStok={permohonanStok}
              produk={produk}
            />
          </TabsContent>
        )}
      </Tabs>

    </div>
  );
}

// === OUTLET RIWAYAT TRANSAKSI COMPONENT ===
function OutletRiwayatTransaksi({ user, permohonanStok, produk }: any) {
  const [range, setRange] = useState<DateRange>({});
  const [returGrams, setReturGrams] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Filter permohonan stok yang Disetujui untuk outlet ini (produk produksi)
  const distributions = useMemo(() => {
    return (permohonanStok || [])
      .filter((r: any) => 
        r.outletId === user.outletId && 
        r.status === "Disetujui" &&
        PRODUCTION_PRODUCTS.includes(r.produkId) &&
        inRange(r.tanggalKirim, range)
      )
      .sort((a: any, b: any) => b.tanggalKirim.localeCompare(a.tanggalKirim));
  }, [permohonanStok, user.outletId, range]);

  // Group by tanggal + produk
  const transaksiRows = useMemo(() => {
    const grouped = new Map<string, {
      tanggal: string;
      produkId: string;
      produkNama: string;
      stokAwalPcs: number;
      harga: number;
    }>();

    distributions.forEach((r: any) => {
      const key = `${r.tanggalKirim}-${r.produkId}`;
      const existing = grouped.get(key);
      const p = produk.find((x: any) => x.id === r.produkId);
      if (existing) {
        existing.stokAwalPcs += r.qty;
      } else {
        grouped.set(key, {
          tanggal: r.tanggalKirim,
          produkId: r.produkId,
          produkNama: p?.nama ?? r.produkId,
          stokAwalPcs: r.qty,
          harga: p?.harga ?? 0
        });
      }
    });

    return Array.from(grouped.values()).sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [distributions, produk]);

  // Total summary
  const summary = useMemo(() => {
    let totalStok = 0;
    let totalReturPcs = 0;
    let totalTerjual = 0;
    let totalOmset = 0;

    transaksiRows.forEach((row) => {
      const gramPerCup = GRAM_PER_CUP[row.produkId] || 100;
      const returGr = returGrams[`${row.tanggal}-${row.produkId}`] || 0;
      const returPcs = Math.floor(returGr / gramPerCup);
      const terjual = Math.max(0, row.stokAwalPcs - returPcs);
      const omset = terjual * row.harga;

      totalStok += row.stokAwalPcs;
      totalReturPcs += returPcs;
      totalTerjual += terjual;
      totalOmset += omset;
    });

    return { totalStok, totalReturPcs, totalTerjual, totalOmset };
  }, [transaksiRows, returGrams]);

  const handleReturChange = (key: string, grams: number) => {
    setReturGrams(prev => ({ ...prev, [key]: isNaN(grams) ? 0 : Math.max(0, grams) }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      let savedCount = 0;
      for (const row of transaksiRows) {
        const key = `${row.tanggal}-${row.produkId}`;
        const gramPerCup = GRAM_PER_CUP[row.produkId] || 100;
        const returGr = returGrams[key] || 0;
        const returPcs = Math.floor(returGr / gramPerCup);

        if (returPcs <= 0) continue;

        // Map produk to bahan for stok return
        let bahanId = "";
        if (row.produkId === "p-bubur" || row.produkId === "p-nasitim") {
          bahanId = "b-brs01"; // Beras
        } else if (row.produkId === "p-oatmeal") {
          bahanId = "b-oat01";
        } else if (row.produkId === "p-puding") {
          bahanId = "b-pud01";
        } else if (row.produkId === "p-abon") {
          bahanId = "b-ab01";
        }

        if (bahanId) {
          await db.addStokMov({
            tanggal: row.tanggal,
            bahanId,
            tipe: "IN",
            qty: Math.round(returPcs * (gramPerCup / (bahanId === "b-brs01" ? 600 : 35)) * 100) / 100,
            keterangan: `Retur Outlet: ${user.nama} - ${row.produkNama} (${returGr}g / ${returPcs} cup)`
          });
        }
        savedCount++;
      }

      if (savedCount > 0) {
        toast.success(`${savedCount} retur berhasil disimpan dan stok gudang bertambah!`);
      } else {
        toast.info("Tidak ada retur yang perlu disimpan");
      }
    } catch (err) {
      toast.error("Gagal menyimpan retur");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }, [transaksiRows, returGrams, user.nama]);

  const pagination = usePagination(transaksiRows, 10);

  return (
    <div className="space-y-6">
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4 pb-2">
          <div>
            <CardTitle>Riwayat Transaksi Outlet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Data stok dari distribusi produksi, retur (sisa) dan penjualan
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangeFilter value={range} onChange={setRange} />
            <Button
              onClick={handleSave}
              disabled={saving || transaksiRows.length === 0}
              size="sm"
              className="gradient-primary text-primary-foreground h-9"
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? "Menyimpan..." : "Simpan Retur"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/40 p-3 rounded-xl border">
              <div className="text-[10px] text-muted-foreground uppercase font-bold">Stok Diterima</div>
              <div className="text-lg font-bold mt-1">{summary.totalStok} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
            </div>
            <div className="bg-warning/5 p-3 rounded-xl border border-warning/20">
              <div className="text-[10px] text-warning uppercase font-bold">Retur (Sisa)</div>
              <div className="text-lg font-bold mt-1">{summary.totalReturPcs} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
            </div>
            <div className="bg-success/5 p-3 rounded-xl border border-success/20">
              <div className="text-[10px] text-success uppercase font-bold">Terjual</div>
              <div className="text-lg font-bold mt-1">{summary.totalTerjual} <span className="text-xs font-normal text-muted-foreground">cup</span></div>
            </div>
            <div className="bg-primary/5 p-3 rounded-xl border border-primary/20">
              <div className="text-[10px] text-primary uppercase font-bold">Total Omset</div>
              <div className="text-lg font-bold mt-1 text-primary">{rupiah(summary.totalOmset)}</div>
            </div>
          </div>

          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Tanggal</TableHead>
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
                  {transaksiRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        Belum ada distribusi produk ke outlet ini
                      </TableCell>
                    </TableRow>
                  )}
                  {pagination.paged.map((row: any) => {
                    const key = `${row.tanggal}-${row.produkId}`;
                    const gramPerCup = GRAM_PER_CUP[row.produkId] || 100;
                    const stokAwalGram = row.stokAwalPcs * gramPerCup;
                    const returGr = returGrams[key] || 0;
                    const returPcs = Math.floor(returGr / gramPerCup);
                    const terjual = Math.max(0, row.stokAwalPcs - returPcs);
                    const omset = terjual * row.harga;

                    return (
                      <TableRow key={key}>
                        <TableCell className="whitespace-nowrap">{row.tanggal}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="font-semibold">{row.produkNama}</span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{row.stokAwalPcs}</TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                          {stokAwalGram.toLocaleString()} g
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              min={0}
                              max={stokAwalGram}
                              value={returGr || ""}
                              onChange={(e) => handleReturChange(key, parseInt(e.target.value) || 0)}
                              className="w-20 h-8 text-xs text-center"
                              placeholder="0"
                            />
                            <span className="text-[10px] text-muted-foreground">g</span>
                          </div>
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
                        <TableCell className="text-right font-bold text-success">
                          {terjual}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {rupiah(row.harga)}
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

function LaporanTable({ rows, totalQty, totalOmzet, pagination }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = pagination;
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Total Qty</TableHead>
              <TableHead className="text-right">Total Omzet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">Belum ada data sesuai filter</TableCell></TableRow>
            )}
            {paged.map((r: any) => (
              <TableRow key={r.periode}>
                <TableCell className="font-medium">{r.periode}</TableCell>
                <TableCell className="text-right">{r.qty}</TableCell>
                <TableCell className="text-right">{rupiah(r.omzet)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && page === totalPages && (
              <TableRow className="bg-muted/50 font-bold">
                <TableCell>TOTAL</TableCell>
                <TableCell className="text-right">{totalQty}</TableCell>
                <TableCell className="text-right text-primary">{rupiah(totalOmzet)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
    </div>
  );
}

function RiwayatTable({ historyFiltered, outlets, produk, isOutlet, pagination, onDelete }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = pagination;
  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {!isOutlet && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyFiltered.length === 0 && (
              <TableRow>
                <TableCell colSpan={isOutlet ? 5 : 6} className="text-center text-muted-foreground py-8">
                  Belum ada data sesuai filter
                </TableCell>
              </TableRow>
            )}
            {paged.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {outlets.find((o: any) => o.id === p.outletId)?.nama ?? "-"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {produk.find((x: any) => x.id === p.produkId)?.nama ?? "-"}
                </TableCell>
                <TableCell className="text-right">{p.qty}</TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap">{rupiah(p.total)}</TableCell>
                {!isOutlet && (
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
    </div>
  );
}
