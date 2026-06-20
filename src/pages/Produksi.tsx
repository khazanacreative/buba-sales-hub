import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Check, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// === SUBCOMPONENT: ADMIN VIEW FOR APPROVING REQUESTS ===
function AdminPermohonanStok({ dbState }: { dbState: any }) {
  const { permohonanStok = [], outlets = [], produk = [] } = dbState;

  const [range, setRange] = useState<DateRange>({
    start: todayISO().slice(0, 7) + "-01", // awal bulan ini
    end: todayISO()
  });
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");

  const filteredRequests = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      const matchDate = inRange(r.tanggalKirim, range.start, range.end);
      const matchOutlet = selectedOutletId === "all" || r.outletId === selectedOutletId;
      return matchDate && matchOutlet;
    });
  }, [permohonanStok, range, selectedOutletId]);

  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a: any, b: any) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (a.status !== "Pending" && b.status === "Pending") return 1;
      return b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id);
    });
  }, [filteredRequests]);

  const productTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredRequests.forEach((r: any) => {
      totals[r.produkId] = (totals[r.produkId] || 0) + r.qty;
    });
    return totals;
  }, [filteredRequests]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(sortedRequests, 10);

  return (
    <Card className="glass border-0 shadow-card">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Daftar Permohonan Stok Outlet</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Kelola dan setujui permintaan stok produk dari outlet</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DateRangeFilter value={range} onChange={setRange} />
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[180px] h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Outlet</SelectItem>
              {outlets.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Permohonan per Produk Summary */}
        <div className="flex flex-wrap gap-3 bg-muted/40 p-4 rounded-2xl border">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-full">
            Total Permohonan per Produk (Tanggal Kirim: {range.start} s/d {range.end}):
          </div>
          {produk.map((p: any) => {
            const qty = productTotals[p.id] || 0;
            return (
              <div key={p.id} className="bg-card px-3 py-2 rounded-xl border shadow-sm flex items-center gap-2">
                <span className="font-semibold text-xs text-muted-foreground">{p.nama}:</span>
                <span className="font-bold text-sm text-primary">{qty} {p.satuan}</span>
              </div>
            );
          })}
        </div>
        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Tgl Request</TableHead>
                  <TableHead>Tgl Kirim</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[180px] text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Belum ada permohonan stok dari outlet
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((r: any) => {
                  const outlet = outlets.find((o: any) => o.id === r.outletId);
                  const prod = produk.find((p: any) => p.id === r.produkId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-semibold">{outlet?.nama ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.tanggal}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.tanggalKirim}</TableCell>
                      <TableCell className="whitespace-nowrap">{prod?.nama ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{r.qty} cup</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={r.catatan}>{r.catatan || "-"}</TableCell>
                      <TableCell>
                        {r.status === "Pending" && (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                            <Clock className="h-3 w-3" /> Pending
                          </Badge>
                        )}
                        {r.status === "Disetujui" && (
                          <Badge className="bg-success text-success-foreground gap-1">
                            <Check className="h-3 w-3" /> Disetujui
                          </Badge>
                        )}
                        {r.status === "Ditolak" && (
                          <Badge variant="destructive" className="gap-1">
                            <X className="h-3 w-3" /> Ditolak
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.status === "Pending" ? (
                          <div className="flex justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-success/35 text-success hover:bg-success/10 hover:text-success hover:border-success/60 font-semibold"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Disetujui");
                                toast.success(`Permohonan stok dari ${outlet?.nama} disetujui`);
                              }}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Setujui
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 font-semibold"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Ditolak");
                                toast.error(`Permohonan stok dari ${outlet?.nama} ditolak`);
                              }}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Tolak
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
        <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </CardContent>
    </Card>
  );
}

// === MAIN COMPONENT ===
export default function Produksi() {
  const dbState = useDB();
  const { produk, produksi, penjualan, bahan, permohonanStok } = dbState;
  const [tanggal, setTanggal] = useState(todayISO());
  const [produkId, setProdukId] = useState(produk[0]?.id ?? "");
  const [qtyRencana, setQtyRencana] = useState(50);
  const [qtyRealisasi, setQtyRealisasi] = useState(0);
  const [range, setRange] = useState<DateRange>({});
  const [activeTab, setActiveTab] = useState("produksi");

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

  const pendingCount = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => r.status === "Pending").length;
  }, [permohonanStok]);

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
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Produksi & Permohonan</h1>
          <p className="text-sm text-muted-foreground">Rencana produksi harian dan persetujuan stok untuk outlet</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <TabsList className="grid w-full max-w-[420px] grid-cols-2 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="produksi" className="rounded-lg font-semibold">Produksi MPASI</TabsTrigger>
            <TabsTrigger value="permohonan" className="rounded-lg font-semibold relative">
              Permohonan Outlet
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow animate-pulse">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          {activeTab === "produksi" && (
            <div className="flex items-center gap-2">
              <ImportExcelButton onData={onImport} />
            </div>
          )}
        </div>

        <TabsContent value="produksi" className="space-y-6 mt-0">

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
                  <Label>Rencana (porsi)</Label>
                  <Input type="number" min={1} value={qtyRencana} onChange={(e) => setQtyRencana(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Realisasi (porsi)</Label>
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
              <CardTitle>Riwayat Produksi</CardTitle>
              <div className="flex flex-wrap gap-2 pt-2 items-center">
                <DateRangeFilter value={range} onChange={setRange} />
                <div className="w-full sm:w-auto sm:ml-auto">
                  <ExportButtons
                    filename="produksi"
                    title="Riwayat Produksi"
                    headers={["Tanggal", "Produk", "Rencana", "Realisasi"]}
                    rows={filtered.map((p) => [
                      p.tanggal,
                      produk.find((x) => x.id === p.produkId)?.nama ?? "-",
                      p.qtyRencana,
                      p.qtyRealisasi,
                    ])}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProduksiTable filtered={filtered} produk={produk} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permohonan" className="mt-0">
          <AdminPermohonanStok dbState={dbState} />
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
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada produksi</TableCell></TableRow>
            )}
            {paged.map((p: any) => {
              const pr = produk.find((x: any) => x.id === p.produkId);
              const ok = p.qtyRealisasi >= p.qtyRencana;
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{pr?.nama ?? "-"}</TableCell>
                  <TableCell className="text-right">{p.qtyRencana}</TableCell>
                  <TableCell className="text-right font-semibold">{p.qtyRealisasi}</TableCell>
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
