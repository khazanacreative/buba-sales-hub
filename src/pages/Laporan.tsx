import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDB } from "@/lib/store";
import { rupiah, monthKey, DateRange, inRange } from "@/lib/format";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useAuth } from "@/lib/auth";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

type Periode = "harian" | "mingguan" | "bulanan";

export default function Laporan() {
  const { penjualan, outlets, produk } = useDB();
  const { user } = useAuth();
  const isOutlet = user?.role === "outlet";

  const [periode, setPeriode] = useState<Periode>("harian");
  const [outletId, setOutletId] = useState<string>(isOutlet ? user!.outletId! : "all");
  const [range, setRange] = useState<DateRange>({});

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Laporan Penjualan</h1>
          <p className="text-muted-foreground">Rekap harian, mingguan, dan bulanan</p>
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
      </div>

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <div className="flex gap-3 pt-2 flex-wrap">
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
        </CardHeader>
        <CardContent>
          <LaporanTable rows={rows} totalQty={totalQty} totalOmzet={totalOmzet} />
        </CardContent>
      </Card>
    </div>
  );
}

function LaporanTable({ rows, totalQty, totalOmzet }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(rows, 10);
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
