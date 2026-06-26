import { useMemo, useState } from "react";
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
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

type Periode = "harian" | "mingguan" | "bulanan";

export default function Laporan() {
  const { penjualan, outlets, produk } = useDB();
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

      <Tabs defaultValue="rekap" className="space-y-6">
        <TabsList className="grid w-full max-w-[400px] grid-cols-2 bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="rekap" className="rounded-lg">Rekap Penjualan</TabsTrigger>
          <TabsTrigger value="riwayat" className="rounded-lg">Riwayat Transaksi</TabsTrigger>
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
      </Tabs>
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
