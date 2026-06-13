import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB } from "@/lib/store";
import { todayISO, DateRange, inRange } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

export default function Produksi() {
  const { produk, produksi, penjualan, bahan } = useDB();
  const [tanggal, setTanggal] = useState(todayISO());
  const [produkId, setProdukId] = useState(produk[0]?.id ?? "");
  const [qtyRencana, setQtyRencana] = useState(50);
  const [qtyRealisasi, setQtyRealisasi] = useState(0);
  const [range, setRange] = useState<DateRange>({});

  // Default BOM: per cup produksi → 1 CUP BUBUR, 1 TUTUP, 1 SENDOK (jika tersedia di gudang)
  const consumeStock = (qty: number, produkNama: string) => {
    if (qty <= 0) return;
    const codes = ["CB01", "TTP01", "SEN01"];
    let count = 0;
    codes.forEach((code) => {
      const b = bahan.find((x) => x.kode === code);
      if (!b) return;
      db.addStokMov({
        tanggal, bahanId: b.id, tipe: "OUT", qty,
        keterangan: `Produksi ${produkNama}`,
      });
      count++;
    });
    if (count) toast.info(`${count} bahan dikurangi dari stok gudang`);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!produkId || qtyRencana < 1) return toast.error("Lengkapi data");
    db.addProduksi({ tanggal, produkId, qtyRencana, qtyRealisasi });
    const prodNama = produk.find((p) => p.id === produkId)?.nama ?? "";
    consumeStock(qtyRealisasi, prodNama);
    toast.success("Rencana produksi disimpan");
    setQtyRencana(50);
    setQtyRealisasi(0);
  };

  const filtered = useMemo(
    () => [...produksi].filter((p) => inRange(p.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [produksi, range]
  );

  const onImport = (rows: any[]) => {
    const items = rows
      .map((r) => {
        const p = produk.find((x) => x.nama.toLowerCase() === String(r.Produk ?? r.produk ?? "").toLowerCase());
        const tgl = String(r.Tanggal ?? r.tanggal ?? "").slice(0, 10);
        const plan = Number(r.Rencana ?? r.rencana ?? r.Plan ?? 0);
        if (!p || !tgl || plan <= 0) return null;
        return {
          tanggal: tgl,
          produkId: p.id,
          qtyRencana: plan,
          qtyRealisasi: Number(r.Realisasi ?? r.realisasi ?? 0),
        };
      })
      .filter(Boolean) as any[];
    if (!items.length) return toast.error("Kolom diperlukan: Tanggal, Produk, Rencana, Realisasi");
    db.addProduksiBulk(items);
    toast.success(`${items.length} produksi diimport`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Produksi MPASI</h1>
          <p className="text-sm text-muted-foreground">Rencana produksi harian dan perbandingan dengan penjualan</p>
        </div>
        <ImportExcelButton onData={onImport} />
      </div>

      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Input Rencana Produksi</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-5 lg:items-end">
            <div className="space-y-2">
              <Label>Tanggal</Label>
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Produk</Label>
              <Select value={produkId} onValueChange={setProdukId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {produk.map((p) => <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Qty Rencana</Label>
              <Input type="number" min={1} value={qtyRencana} onChange={(e) => setQtyRencana(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Qty Realisasi</Label>
              <Input type="number" min={0} value={qtyRealisasi} onChange={(e) => setQtyRealisasi(Number(e.target.value))} />
            </div>
            <Button type="submit" className="gradient-primary text-primary-foreground hover-lift">
              <Plus className="mr-1 h-4 w-4" />Simpan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Riwayat Produksi & Status Stok</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2 items-center">
            <DateRangeFilter value={range} onChange={setRange} />
            <div className="w-full sm:w-auto sm:ml-auto">
              <ExportButtons
                filename="produksi"
                title="Riwayat Produksi"
                headers={["Tanggal", "Produk", "Rencana", "Realisasi", "Terjual", "Sisa"]}
                rows={filtered.map((p) => {
                  const terjual = penjualan.filter((s) => s.tanggal === p.tanggal && s.produkId === p.produkId).reduce((s, x) => s + x.qty, 0);
                  return [
                    p.tanggal,
                    produk.find((x) => x.id === p.produkId)?.nama ?? "-",
                    p.qtyRencana,
                    p.qtyRealisasi,
                    terjual,
                    p.qtyRealisasi - terjual,
                  ];
                })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RiwayatProduksiTable filtered={filtered} produk={produk} penjualan={penjualan} />
        </CardContent>
      </Card>
    </div>
  );
}

function RiwayatProduksiTable({ filtered, produk, penjualan }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Rencana</TableHead>
              <TableHead className="text-right">Realisasi</TableHead>
              <TableHead className="text-right">Terjual</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada data sesuai filter</TableCell></TableRow>
            )}
            {paged.map((p: any) => {
              const terjual = penjualan.filter((s: any) => s.tanggal === p.tanggal && s.produkId === p.produkId).reduce((s: number, x: any) => s + x.qty, 0);
              const sisa = p.qtyRealisasi - terjual;
              const kurang = p.qtyRealisasi < p.qtyRencana || sisa < 0;
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap">{produk.find((x: any) => x.id === p.produkId)?.nama ?? "-"}</TableCell>
                  <TableCell className="text-right">{p.qtyRencana}</TableCell>
                  <TableCell className="text-right">{p.qtyRealisasi}</TableCell>
                  <TableCell className="text-right">{terjual}</TableCell>
                  <TableCell>
                    {kurang ? (
                      <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Kurang</Badge>
                    ) : (
                      <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Cukup</Badge>
                    )}
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
