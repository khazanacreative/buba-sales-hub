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
import { Plus, Trash2, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, Check, X, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";

// === SUBCOMPONENT: OUTLET VIEW FOR REQUESTING STOCK ===
function OutletPermohonanStok({ user, dbState }: { user: any; dbState: any }) {
  const { produk = [], permohonanStok = [] } = dbState;
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const [selectedItems, setSelectedItems] = useState<{ produkId: string; qty: number }[]>([]);
  const [produkId, setProdukId] = useState(produk[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [tanggalKirim, setTanggalKirim] = useState(tomorrow());
  const [catatan, setCatatan] = useState("");

  const handleAddItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!produkId || qty < 1) return toast.error("Pilih produk dan jumlah valid");
    
    const existingIndex = selectedItems.findIndex(item => item.produkId === produkId);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      updated[existingIndex].qty += qty;
      setSelectedItems(updated);
    } else {
      setSelectedItems([...selectedItems, { produkId, qty }]);
    }
    setQty(1);
    toast.success("Produk ditambahkan ke daftar");
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return toast.error("Tambahkan minimal 1 produk ke daftar permintaan");
    if (!tanggalKirim) return toast.error("Pilih tanggal kirim");

    const batch = selectedItems.map(item => ({
      tanggal: todayISO(),
      tanggalKirim,
      outletId: user.outletId,
      produkId: item.produkId,
      qty: item.qty,
      catatan
    }));

    db.addPermohonanStokBulk(batch);
    toast.success("Permohonan stok berhasil dikirim ke Admin");
    setSelectedItems([]);
    setCatatan("");
  };

  const myRequests = useMemo(() => {
    return (permohonanStok || [])
      .filter((r: any) => r.outletId === user.outletId)
      .sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
  }, [permohonanStok, user.outletId]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(myRequests, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Permohonan Stok</h1>
        <p className="text-sm text-muted-foreground">Pesan beberapa stok produk Buba Healthy ke admin dalam satu pengiriman</p>
      </div>

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Form Permohonan Stok Multi-Produk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Item Selector Form Row */}
          <div className="grid gap-4 md:grid-cols-4 items-end">
            <div className="space-y-2 md:col-span-2">
              <Label>Produk</Label>
              <Select value={produkId} onValueChange={setProdukId}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {produk.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Jumlah (Cup)</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="h-10"
              />
            </div>
            <div>
              <Button type="button" onClick={handleAddItem} className="w-full h-10 gradient-primary text-primary-foreground hover-lift">
                <Plus className="mr-2 h-4 w-4" /> Tambah ke Daftar
              </Button>
            </div>
          </div>

          {/* List of Added Items */}
          {selectedItems.length > 0 && (
            <div className="rounded-2xl border overflow-hidden bg-card/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedItems.map((item, idx) => {
                    const prod = produk.find((p: any) => p.id === item.produkId);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{prod?.nama ?? "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{item.qty} cup</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => handleRemoveItem(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Submit/Batch Details Form */}
          <form onSubmit={submit} className="border-t pt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
            <div className="space-y-2">
              <Label>Tanggal Kirim (Besok)</Label>
              <Input
                type="date"
                value={tanggalKirim}
                onChange={(e) => setTanggalKirim(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Catatan Pengiriman</Label>
              <Input
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Contoh: Titip di rombong, dll (opsional)"
                className="h-10"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={selectedItems.length === 0} className="w-full h-10 gradient-primary text-primary-foreground hover-lift">
                <Send className="mr-2 h-4 w-4" /> Kirim Permohonan ({selectedItems.length} Produk)
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Riwayat Permohonan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tgl Request</TableHead>
                    <TableHead>Tgl Kirim</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead>Catatan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Belum ada permohonan stok
                      </TableCell>
                    </TableRow>
                  )}
                  {paged.map((r: any) => {
                    const prod = produk.find((p: any) => p.id === r.produkId);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.tanggal}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.tanggalKirim}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium">{prod?.nama ?? "-"}</TableCell>
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
                        <TableCell>
                          {r.status === "Pending" && (
                            <Button size="icon" variant="ghost" onClick={() => {
                              db.deletePermohonanStok(r.id);
                              toast.success("Permohonan stok dibatalkan");
                            }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
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
    </div>
  );
}

// === MAIN COMPONENT ===
export default function StokGudang() {
  const dbState = useDB();
  const { user } = useAuth();
  const isOutlet = user?.role === "outlet";

  if (isOutlet) {
    return <OutletPermohonanStok user={user} dbState={dbState} />;
  }

  // Admin original states and computations
  const { bahan = [], stokMov = [], produksi = [], produk = [] } = dbState;
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
  const bahanPg = usePagination(bahan, 10);

  const filteredMov = useMemo(
    () => [...stokMov].filter((m) => inRange(m.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [stokMov, range]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Stok Gudang</h1>
        <p className="text-sm text-muted-foreground">Kelola persediaan bahan baku gudang utama</p>
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
                  {bahanPg.paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Belum ada saldo bahan baku
                      </TableCell>
                    </TableRow>
                  )}
                  {bahanPg.paged.map((b) => {
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
          <TablePagination 
            page={bahanPg.page} 
            totalPages={bahanPg.totalPages} 
            total={bahanPg.total} 
            pageSize={bahanPg.pageSize} 
            onChange={bahanPg.setPage} 
          />
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

// === HELPER COMPONENT FOR HISTORICAL MOVEMENTS ===
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
