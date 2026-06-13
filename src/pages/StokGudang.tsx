import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, saldoBahan } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

export default function StokGudang() {
  const dbState = useDB();
  const { bahan, stokMov, produksi, produk } = dbState;
  const [tanggal, setTanggal] = useState(todayISO());
  const [bahanId, setBahanId] = useState(bahan[0]?.id ?? "");
  const [tipe, setTipe] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState(1);
  const [ket, setKet] = useState("");
  const [range, setRange] = useState<DateRange>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bahanId || qty <= 0) return toast.error("Lengkapi data");
    db.addStokMov({ tanggal, bahanId, tipe, qty, keterangan: ket || (tipe === "IN" ? "Pembelian" : "Pemakaian") });
    toast.success(`Stok ${tipe === "IN" ? "masuk" : "keluar"} dicatat`);
    setQty(1); setKet("");
  };

  const saldoMap = useMemo(() => {
    const m: Record<string, number> = {};
    bahan.forEach((b) => (m[b.id] = saldoBahan(b.id, dbState)));
    return m;
  }, [bahan, stokMov, dbState]);

  const totalNilai = bahan.reduce((s, b) => s + (saldoMap[b.id] || 0) * b.hargaBeli, 0);
  const lowStock = bahan.filter((b) => (saldoMap[b.id] || 0) <= b.stokMin);

  const filteredMov = useMemo(
    () => [...stokMov].filter((m) => inRange(m.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [stokMov, range]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Stok Gudang</h1>
        <p className="text-sm text-muted-foreground">Pantau bahan baku & pemakaian dari produksi</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Jumlah Bahan</div>
              <div className="text-xl font-bold">{bahan.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <ArrowUpCircle className="h-8 w-8 text-success" />
            <div>
              <div className="text-xs text-muted-foreground">Nilai Persediaan</div>
              <div className="text-xl font-bold">{rupiah(totalNilai)}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <div>
              <div className="text-xs text-muted-foreground">Bahan Menipis</div>
              <div className="text-xl font-bold">{lowStock.length}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Catat Pergerakan Stok</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-6 lg:items-end">
            <div className="space-y-2">
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Bahan</Label>
              <Select value={bahanId} onValueChange={setBahanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {bahan.map((b) => <SelectItem key={b.id} value={b.id}>{b.kode} — {b.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipe</Label>
              <Select value={tipe} onValueChange={(v) => setTipe(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN">Masuk</SelectItem>
                  <SelectItem value="OUT">Keluar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Qty</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div className="space-y-2 lg:col-span-1">
              <Label>Keterangan</Label>
              <Input value={ket} onChange={(e) => setKet(e.target.value)} placeholder="opsional" />
            </div>
            <Button type="submit" className="gradient-primary text-primary-foreground hover-lift">
              <Plus className="mr-1 h-4 w-4" />Simpan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Saldo Bahan Baku</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Satuan</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead className="text-right">Nilai</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bahan.map((b) => {
                    const saldo = saldoMap[b.id] || 0;
                    const low = saldo <= b.stokMin;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                        <TableCell className="whitespace-nowrap">{b.nama}</TableCell>
                        <TableCell>{b.satuan}</TableCell>
                        <TableCell className="text-right font-semibold">{saldo}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{b.stokMin}</TableCell>
                        <TableCell className="text-right">{rupiah(saldo * b.hargaBeli)}</TableCell>
                        <TableCell>
                          {low
                            ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Menipis</Badge>
                            : <Badge className="bg-success text-success-foreground">Aman</Badge>}
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

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Riwayat Pergerakan</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2 items-center">
            <DateRangeFilter value={range} onChange={setRange} />
            <div className="w-full sm:w-auto sm:ml-auto">
              <ExportButtons
                filename="stok-movement"
                title="Pergerakan Stok"
                headers={["Tanggal", "Bahan", "Tipe", "Qty", "Keterangan"]}
                rows={filteredMov.map((m) => [
                  m.tanggal,
                  bahan.find((b) => b.id === m.bahanId)?.nama ?? "-",
                  m.tipe,
                  m.qty,
                  m.keterangan ?? "-",
                ])}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MovTable mov={filteredMov} bahan={bahan} produksi={produksi} produk={produk} />
        </CardContent>
      </Card>
    </div>
  );
}

function MovTable({ mov, bahan, produksi, produk }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(mov, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Bahan</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Keterangan</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mov.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada pergerakan</TableCell></TableRow>
            )}
            {paged.map((m: any) => {
              const b = bahan.find((x: any) => x.id === m.bahanId);
              const linkProd = m.produksiId ? produksi.find((p: any) => p.id === m.produksiId) : null;
              const linkProdNama = linkProd ? produk.find((x: any) => x.id === linkProd.produkId)?.nama : null;
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{m.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap">{b?.nama ?? "-"}</TableCell>
                  <TableCell>
                    {m.tipe === "IN"
                      ? <Badge className="bg-success text-success-foreground gap-1"><ArrowUpCircle className="h-3 w-3" />Masuk</Badge>
                      : <Badge variant="destructive" className="gap-1"><ArrowDownCircle className="h-3 w-3" />Keluar</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{m.qty}</TableCell>
                  <TableCell className="text-xs">
                    {m.keterangan ?? "-"}
                    {linkProdNama && <span className="text-muted-foreground"> · Produksi {linkProdNama}</span>}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => db.deleteStokMov(m.id)}>
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
