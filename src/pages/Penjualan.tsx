import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db, useDB } from "@/lib/store";
import { rupiah, todayISO, DateRange, inRange } from "@/lib/format";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { useAuth } from "@/lib/auth";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

export default function Penjualan() {
  const { outlets, produk, penjualan } = useDB();
  const { user } = useAuth();
  const isOutlet = user?.role === "outlet";
  const lockedOutletId = isOutlet ? user!.outletId! : undefined;

  const [tanggal, setTanggal] = useState(todayISO());
  const [outletId, setOutletId] = useState(lockedOutletId ?? outlets[0]?.id ?? "");
  const [produkId, setProdukId] = useState(produk[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [filterOutlet, setFilterOutlet] = useState<string>(lockedOutletId ?? "all");
  const [range, setRange] = useState<DateRange>({});

  const harga = produk.find((p) => p.id === produkId)?.harga ?? 0;
  const total = qty * harga;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalOutlet = lockedOutletId ?? outletId;
    if (!finalOutlet || !produkId || qty < 1) return toast.error("Lengkapi semua field");
    db.addPenjualan({ tanggal, outletId: finalOutlet, produkId, qty, harga });
    toast.success("Penjualan dicatat");
    setQty(1);
  };

  const filtered = useMemo(() => {
    return penjualan
      .filter((p) => (lockedOutletId ? p.outletId === lockedOutletId : true))
      .filter((p) => (filterOutlet === "all" ? true : p.outletId === filterOutlet))
      .filter((p) => inRange(p.tanggal, range))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [penjualan, filterOutlet, range, lockedOutletId]);

  const totalQty = filtered.reduce((s, p) => s + p.qty, 0);
  const totalOmzet = filtered.reduce((s, p) => s + p.total, 0);

  const onImport = (rows: any[]) => {
    const items = rows
      .map((r) => {
        const o = outlets.find((x) => x.nama.toLowerCase() === String(r.Outlet ?? r.outlet ?? "").toLowerCase());
        const p = produk.find((x) => x.nama.toLowerCase() === String(r.Produk ?? r.produk ?? "").toLowerCase());
        const tgl = String(r.Tanggal ?? r.tanggal ?? "").slice(0, 10);
        const qty = Number(r.Qty ?? r.qty ?? 0);
        if (!o || !p || !tgl || qty <= 0) return null;
        if (lockedOutletId && o.id !== lockedOutletId) return null;
        return {
          tanggal: tgl,
          outletId: o.id,
          produkId: p.id,
          qty,
          harga: Number(r.Harga ?? r.harga ?? p.harga),
        };
      })
      .filter(Boolean) as any[];
    if (!items.length) return toast.error("Tidak ada baris valid (kolom: Tanggal, Outlet, Produk, Qty, Harga)");
    db.addPenjualanBulk(items);
    toast.success(`${items.length} penjualan diimport`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Input Penjualan</h1>
          <p className="text-sm text-muted-foreground">Catat transaksi penjualan harian {isOutlet ? `untuk outlet ${user?.nama}` : "per outlet"}</p>
        </div>
        {!isOutlet && <ImportExcelButton onData={onImport} />}
      </div>

      {/* Form utama (di atas) */}
      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Form Penjualan</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-end">
            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="h-10" />
            </div>
            {!isOutlet && (
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Outlet</Label>
                <Select value={outletId} onValueChange={setOutletId}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label>Produk</Label>
              <Select value={produkId} onValueChange={setProdukId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {produk.map((p) => <SelectItem key={p.id} value={p.id}>{p.nama} — {rupiah(p.harga)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Jumlah</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label>Total</Label>
              <div className="h-10 rounded-md gradient-soft px-3 flex items-center border border-border/50 font-bold text-primary text-sm">
                {rupiah(total)}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="invisible hidden lg:block">.</Label>
              <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift">
                <Plus className="mr-1 h-4 w-4" />Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Riwayat (di bawah) */}
      <Riwayat
        filtered={filtered}
        outlets={outlets}
        produk={produk}
        isOutlet={isOutlet}
        filterOutlet={filterOutlet}
        setFilterOutlet={setFilterOutlet}
        range={range}
        setRange={setRange}
        totalQty={totalQty}
        totalOmzet={totalOmzet}
      />
    </div>
  );
}

function Riwayat({
  filtered, outlets, produk, isOutlet, filterOutlet, setFilterOutlet, range, setRange, totalQty, totalOmzet,
}: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);

  return (
    <Card className="glass border-0 shadow-card">
      <CardHeader>
        <CardTitle>Riwayat Penjualan</CardTitle>

        {/* Baris 1: filter outlet (kiri) + total ringkas (di bawah/di sebelah outlet) */}
        {!isOutlet && (
          <div className="flex flex-col gap-1.5 pt-2 sm:max-w-xs">
            <Select value={filterOutlet} onValueChange={setFilterOutlet}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Outlet</SelectItem>
                {outlets.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground px-1">
              {filtered.length} trx · {totalQty} cup · <span className="font-semibold text-primary">{rupiah(totalOmzet)}</span>
            </div>
          </div>
        )}
        {isOutlet && (
          <div className="text-xs text-muted-foreground pt-2">
            {filtered.length} trx · {totalQty} cup · <span className="font-semibold text-primary">{rupiah(totalOmzet)}</span>
          </div>
        )}

        {/* Baris 2: date range + export sejajar */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <div className="w-full sm:w-auto sm:ml-auto">
            <ExportButtons
              filename="penjualan"
              title="Riwayat Penjualan"
              headers={["Tanggal", "Outlet", "Produk", "Qty", "Harga", "Total"]}
              rows={filtered.map((p: any) => [
                p.tanggal,
                outlets.find((o: any) => o.id === p.outletId)?.nama ?? "-",
                produk.find((x: any) => x.id === p.produkId)?.nama ?? "-",
                p.qty,
                p.harga,
                p.total,
              ])}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border overflow-hidden max-w-full">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tgl</TableHead>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data sesuai filter</TableCell></TableRow>
                )}
                {paged.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                    <TableCell className="whitespace-nowrap">{outlets.find((o: any) => o.id === p.outletId)?.nama ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{produk.find((x: any) => x.id === p.produkId)?.nama ?? "-"}</TableCell>
                    <TableCell className="text-right">{p.qty}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{rupiah(p.total)}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => db.deletePenjualan(p.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        </div>
      </CardContent>
    </Card>
  );
}
