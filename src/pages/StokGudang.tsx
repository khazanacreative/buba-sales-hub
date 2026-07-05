import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, saldoBahan } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, Check, X, Clock, Send, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import { AkunKategori } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// === SUBCOMPONENT: OUTLET VIEW FOR REQUESTING STOCK & RETUR ===
function OutletPermohonanStok({ user, dbState }: { user: any; dbState: any }) {
  const { produk = [], permohonanStok = [] } = dbState;
  const tomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  const [activeTab, setActiveTab] = useState("request");

  // === REQUEST PERLENGKAPAN ===
  const supportItems = useMemo(() => {
    // Filter only supply/perlengkapan items (id mulai dengan b-)
    return (produk || []).filter((p: any) => p.id.startsWith("b-"));
  }, [produk]);

  const [selectedItems, setSelectedItems] = useState<{ produkId: string; qty: number }[]>([]);
  const [produkId, setProdukId] = useState("");
  const [qty, setQty] = useState(1);
  const [tanggalKirim, setTanggalKirim] = useState(tomorrow());
  const [catatan, setCatatan] = useState("");

  // Retur state
  const [returProdukId, setReturProdukId] = useState("");
  const [returQty, setReturQty] = useState(0);
  const [returTanggal, setReturTanggal] = useState(todayISO());

  const selectedProduct = useMemo(() => {
    return (produk || []).find((p: any) => p.id === produkId);
  }, [produk, produkId]);

  useEffect(() => {
    if (supportItems.length > 0) {
      if (!produkId) setProdukId(supportItems[0].id);
      if (!returProdukId) setReturProdukId(supportItems[0].id);
    }
  }, [supportItems, produkId, returProdukId]);

  const handleAddItem = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!produkId || qty < 1) return toast.error("Pilih perlengkapan dan jumlah valid");
    
    const existingIndex = selectedItems.findIndex(item => item.produkId === produkId);
    if (existingIndex > -1) {
      const updated = [...selectedItems];
      updated[existingIndex].qty += qty;
      setSelectedItems(updated);
    } else {
      setSelectedItems([...selectedItems, { produkId, qty }]);
    }
    setQty(1);
    toast.success("Perlengkapan ditambahkan ke daftar");
  };

  const handleRemoveItem = (index: number) => {
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return toast.error("Tambahkan minimal 1 perlengkapan ke daftar");
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
    toast.success("Permohonan perlengkapan berhasil dikirim ke Admin");
    setSelectedItems([]);
    setCatatan("");
  };

  const handleSubmitRetur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returProdukId) return toast.error("Pilih perlengkapan");
    if (returQty <= 0) return toast.error("Masukkan jumlah retur yang valid");

    const prod = produk.find((p: any) => p.id === returProdukId);
    await db.addPermohonanStok({
      tanggal: returTanggal,
      tanggalKirim: returTanggal,
      outletId: user.outletId,
      produkId: returProdukId,
      qty: returQty,
      catatan: "RETUR PERLENGKAPAN"
    });

    toast.success(`Retur ${prod?.nama ?? "perlengkapan"} berhasil dikirim, menunggu persetujuan Admin`);
    setReturQty(0);
  };

  const myRequests = useMemo(() => {
    return (permohonanStok || [])
      .filter((r: any) => r.outletId === user.outletId && !r.catatan?.startsWith("RETUR") && r.produkId?.startsWith("b-"))
      .sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
  }, [permohonanStok, user.outletId]);

  const myReturRequests = useMemo(() => {
    return (permohonanStok || [])
      .filter((r: any) => r.outletId === user.outletId && r.catatan?.startsWith("RETUR"))
      .sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id));
  }, [permohonanStok, user.outletId]);

  const requestPg = usePagination(myRequests, 10);
  const returPg = usePagination(myReturRequests, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Permohonan Outlet</h1>
        <p className="text-sm text-muted-foreground">Ajukan permohonan perlengkapan dan retur perlengkapan ke admin</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 gap-0">
          <TabsTrigger value="request" className="rounded-t-lg">Request Perlengkapan</TabsTrigger>
          <TabsTrigger value="retur" className="rounded-t-lg">Retur Perlengkapan</TabsTrigger>
        </TabsList>

        {/* TAB 1: REQUEST PERLENGKAPAN */}
        <TabsContent value="request" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Form Request Perlengkapan</CardTitle>
              <p className="text-xs text-muted-foreground">Pilih perlengkapan yang dibutuhkan (Cup Bubur/Tim, Tutup, Kresek, Sendok, Tisu)</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-4 items-end">
                <div className="space-y-2 md:col-span-2">
                  <Label>Pilih Perlengkapan</Label>
                  <Select value={produkId} onValueChange={setProdukId}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {supportItems.map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Jumlah ({selectedProduct?.satuan ?? "pcs"})</Label>
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

              {selectedItems.length > 0 && (
                <div className="rounded-2xl border overflow-hidden bg-card/50">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Perlengkapan</TableHead>
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
                            <TableCell className="text-right font-semibold">{item.qty} {prod?.satuan ?? "pcs"}</TableCell>
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

              <form onSubmit={submit} className="border-t pt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 items-end">
                <div className="space-y-2">
                  <Label>Tanggal Kirim</Label>
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
                    <Send className="mr-2 h-4 w-4" /> Kirim Permohonan ({selectedItems.length} Item)
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
                        <TableHead>Perlengkapan</TableHead>
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
                            Belum ada permohonan stok perlengkapan
                          </TableCell>
                        </TableRow>
                      )}
                      {requestPg.paged.map((r: any) => {
                        const prod = produk.find((p: any) => p.id === r.produkId);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{r.tanggal}</TableCell>
                            <TableCell className="whitespace-nowrap">{r.tanggalKirim}</TableCell>
                            <TableCell className="whitespace-nowrap font-medium">{prod?.nama ?? "-"}</TableCell>
                            <TableCell className="text-right font-semibold">{r.qty} {prod?.satuan ?? "pcs"}</TableCell>
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
              <TablePagination page={requestPg.page} totalPages={requestPg.totalPages} total={requestPg.total} pageSize={requestPg.pageSize} onChange={requestPg.setPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: RETUR PERLENGKAPAN */}
        <TabsContent value="retur" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Form Retur Perlengkapan</CardTitle>
              <p className="text-xs text-muted-foreground">Kembalikan perlengkapan yang tidak terpakai ke gudang</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitRetur} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3 items-end">
                  <div className="space-y-2">
                    <Label>Tanggal Retur</Label>
                    <Input
                      type="date"
                      value={returTanggal}
                      onChange={(e) => setReturTanggal(e.target.value)}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pilih Perlengkapan</Label>
                    <Select value={returProdukId} onValueChange={setReturProdukId}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {supportItems.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.nama}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Jumlah Retur</Label>
                    <Input
                      type="number"
                      min={1}
                      value={returQty || ""}
                      onChange={(e) => setReturQty(Number(e.target.value))}
                      className="h-10"
                      placeholder="0"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={returQty <= 0} className="w-full h-10 gradient-primary text-primary-foreground hover-lift">
                  <RotateCcw className="mr-2 h-4 w-4" /> Ajukan Retur
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Riwayat Retur Perlengkapan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-2xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tgl Request</TableHead>
                        <TableHead>Perlengkapan</TableHead>
                        <TableHead className="text-right">Jumlah</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myReturRequests.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            Belum ada retur perlengkapan
                          </TableCell>
                        </TableRow>
                      )}
                      {returPg.paged.map((r: any) => {
                        const prod = produk.find((p: any) => p.id === r.produkId);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="whitespace-nowrap">{r.tanggal}</TableCell>
                            <TableCell className="whitespace-nowrap font-medium">{prod?.nama ?? "-"}</TableCell>
                            <TableCell className="text-right font-semibold">{r.qty} {prod?.satuan ?? "pcs"}</TableCell>
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
                                  toast.success("Retur dibatalkan");
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
              <TablePagination page={returPg.page} totalPages={returPg.totalPages} total={returPg.total} pageSize={returPg.pageSize} onChange={returPg.setPage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
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
  const [bahanId, setBahanId] = useState("");
  const [tipe, setTipe] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState(1);
  const [selectedKetSource, setSelectedKetSource] = useState("Supplier");
  const [customKet, setCustomKet] = useState("");
  const [range, setRange] = useState<DateRange>({});

  useEffect(() => {
    setSelectedKetSource(tipe === "IN" ? "Supplier" : "Plan Produksi");
    setCustomKet("");
  }, [tipe]);

  // States for Kiriman Supplier Form
  const [supTanggal, setSupTanggal] = useState(todayISO());
  const [supBahanId, setSupBahanId] = useState("");
  const [supQty, setSupQty] = useState(1);
  const [supCost, setSupCost] = useState(0);
  const [supBayar, setSupBayar] = useState("110000"); // Kas Rupiah as default

  // States for Barang Rusak Form
  const [rusakTanggal, setRusakTanggal] = useState(todayISO());
  const [rusakBahanId, setRusakBahanId] = useState("");
  const [rusakQty, setRusakQty] = useState(1);
  const [rusakKeterangan, setRusakKeterangan] = useState("");

  useEffect(() => {
    if (bahan.length > 0) {
      if (!bahanId) setBahanId(bahan[0].id);
      if (!supBahanId) setSupBahanId(bahan[0].id);
      if (!rusakBahanId) setRusakBahanId(bahan[0].id);
    }
  }, [bahan, bahanId, supBahanId, rusakBahanId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bahanId || qty <= 0) return toast.error("Lengkapi data");
    const finalKet = selectedKetSource === "Lainnya" ? customKet : selectedKetSource;
    db.addStokMov({ tanggal, bahanId, tipe, qty, keterangan: finalKet || (tipe === "IN" ? "Pembelian" : "Pemakaian") });
    toast.success(`Stok ${tipe === "IN" ? "masuk" : "keluar"} dicatat`);
    setQty(1); setCustomKet("");
  };

  const submitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supBahanId || supQty <= 0 || supCost <= 0) {
      return toast.error("Lengkapi data kiriman supplier dengan benar");
    }
    
    const selectedBahan = bahan.find(b => b.id === supBahanId);
    if (!selectedBahan) return toast.error("Bahan baku tidak ditemukan");

    const labelBahan = selectedBahan.nama;
    
    // 1. Record stock movement IN
    await db.addStokMov({
      tanggal: supTanggal,
      bahanId: supBahanId,
      tipe: "IN",
      qty: supQty,
      keterangan: `Kiriman Supplier: ${labelBahan} (${supQty} ${selectedBahan.satuan})`
    });

    // 2. Determine credit account name and category
    let creditAkun = "Kas Rupiah";
    let creditKategori: AkunKategori = "Aset";
    if (supBayar === "120000") {
      creditAkun = "Bank";
      creditKategori = "Aset";
    } else if (supBayar === "210000") {
      creditAkun = "Hutang Usaha";
      creditKategori = "Kewajiban";
    }

    // 3. Post to Journal
    await db.addJurnalBulk([
      {
        tanggal: supTanggal,
        ref: "IN-SUPP",
        keterangan: `Pembelian Persediaan: ${labelBahan} (${supQty} ${selectedBahan.satuan})`,
        kodeAkun: "140000",
        akun: "Persediaan",
        tipe: "Debit",
        jumlah: supCost,
        kategori: "Aset"
      },
      {
        tanggal: supTanggal,
        ref: "IN-SUPP",
        keterangan: `Pembelian Persediaan: ${labelBahan} (${supQty} ${selectedBahan.satuan})`,
        kodeAkun: supBayar,
        akun: creditAkun,
        tipe: "Kredit",
        jumlah: supCost,
        kategori: creditKategori
      }
    ]);

    toast.success("Kiriman supplier berhasil dicatat dan jurnal otomatis terposting!");
    setSupQty(1);
    setSupCost(0);
  };

  const submitRusak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rusakBahanId || rusakQty <= 0) {
      return toast.error("Lengkapi data barang rusak dengan benar");
    }

    const selectedBahan = bahan.find(b => b.id === rusakBahanId);
    if (!selectedBahan) return toast.error("Bahan baku tidak ditemukan");

    const currentStock = saldoMap[rusakBahanId] || 0;
    if (rusakQty > currentStock) {
      return toast.error(`Stok tidak mencukupi! Stok saat ini: ${currentStock} ${selectedBahan.satuan}`);
    }

    const labelBahan = selectedBahan.nama;
    const totalLoss = rusakQty * selectedBahan.hargaBeli;

    // 1. Catat pergerakan stok keluar
    await db.addStokMov({
      tanggal: rusakTanggal,
      bahanId: rusakBahanId,
      tipe: "OUT",
      qty: rusakQty,
      keterangan: `Barang Rusak: ${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`
    });

    // 2. Posting ke Jurnal (Debit Beban Operasional / Kredit Persediaan)
    await db.addJurnalBulk([
      {
        tanggal: rusakTanggal,
        ref: "OUT-RUSAK",
        keterangan: `Kerusakan Persediaan: ${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`,
        kodeAkun: "510000",
        akun: "Operasional",
        tipe: "Debit",
        jumlah: totalLoss,
        kategori: "Beban"
      },
      {
        tanggal: rusakTanggal,
        ref: "OUT-RUSAK",
        keterangan: `Kerusakan Persediaan: ${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`,
        kodeAkun: "140000",
        akun: "Persediaan",
        tipe: "Kredit",
        jumlah: totalLoss,
        kategori: "Aset"
      }
    ]);

    toast.success("Laporan barang rusak berhasil dicatat dan jurnal otomatis terposting!");
    setRusakQty(1);
    setRusakKeterangan("");
  };

  const getGramasiInfo = (b: any) => {
    const nama = (b.nama || "").toLowerCase();
    const satuan = (b.satuan || "").toLowerCase();

    // Beras -> 600gr per unit
    if (nama.includes("beras")) {
      return { gramPerUnit: 600, label: `600 gr/${b.satuan}` };
    }

    // Ikan, daging, ayam (sachet) -> 35gr per unit
    const sachet35List = ["tuna", "tengiri", "salmon", "gurami", "kakap", "dori", "daging", "ayam"];
    if (sachet35List.some((ik) => nama.includes(ik))) {
      return { gramPerUnit: 35, label: `35 gr/${b.satuan}` };
    }

    // Use existing konversiGram if set
    if (b.konversiGram && b.konversiGram > 0) {
      return { gramPerUnit: b.konversiGram, label: `${b.konversiGram} gr/${b.satuan}` };
    }

    return null;
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

            <Tabs defaultValue="pergerakan" className="w-full space-y-4">            <TabsList className="grid grid-cols-5 gap-0 rounded-lg">
            <TabsTrigger value="pergerakan" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
              <span className="group-data-[state=active]:hidden">Stok</span>
              <span className="hidden group-data-[state=active]:inline">Pergerakan Stok</span>
            </TabsTrigger>
            <TabsTrigger value="supplier" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
              <span className="group-data-[state=active]:hidden">Supplier</span>
              <span className="hidden group-data-[state=active]:inline">Kiriman Supplier</span>
            </TabsTrigger>
            <TabsTrigger value="permohonan" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
              <span className="group-data-[state=active]:hidden">Request</span>
              <span className="hidden group-data-[state=active]:inline">Permohonan Outlet</span>
            </TabsTrigger>
            <TabsTrigger value="retur-perlengkapan" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
              <span className="group-data-[state=active]:hidden">Retur</span>
              <span className="hidden group-data-[state=active]:inline">Retur Perlengkapan</span>
            </TabsTrigger>
            <TabsTrigger value="rusak" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
              <span className="group-data-[state=active]:hidden">Rusak</span>
              <span className="hidden group-data-[state=active]:inline">Barang Rusak</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pergerakan" className="m-0">
            <Card className="glass border-0 shadow-card">
              <div>
                <CardHeader>
                  <CardTitle>Catat Pergerakan Stok (Manual)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Melakukan penyesuaian stok manual (seperti stock opname atau selisih stok). Hanya memperbarui kartu stok (IN/OUT) tanpa posting jurnal keuangan pembelian/kerugian otomatis.
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submit} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
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
                    </div>
                    <div className="space-y-2">
                      <Label>Sumber / Keterangan</Label>
                      <Select value={selectedKetSource} onValueChange={setSelectedKetSource}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {tipe === "IN" ? (
                            <>
                              <SelectItem value="Supplier">Supplier</SelectItem>
                              <SelectItem value="Retur Perlengkapan">Retur Perlengkapan</SelectItem>
                              <SelectItem value="Lainnya">Lainnya (Tulis Manual)</SelectItem>
                            </>
                          ) : (
                            <>
                              <SelectItem value="Plan Produksi">Plan Produksi</SelectItem>
                              <SelectItem value="Request Outlet">Request Outlet</SelectItem>
                              <SelectItem value="Barang Rusak">Barang Rusak</SelectItem>
                              <SelectItem value="Lainnya">Lainnya (Tulis Manual)</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedKetSource === "Lainnya" && (
                      <div className="space-y-2">
                        <Label>Keterangan Manual</Label>
                        <Input value={customKet} onChange={(e) => setCustomKet(e.target.value)} placeholder="Masukkan keterangan..." />
                      </div>
                    )}
                    <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift mt-2">
                      <Plus className="mr-1 h-4 w-4" />Simpan Penyesuaian
                    </Button>
                  </form>
                </CardContent>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="supplier" className="m-0">
            <Card className="glass border-0 shadow-card">
              <div>
                <CardHeader>
                  <CardTitle>Kiriman Supplier (Pembelian)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mencatat pembelian bahan baku dari supplier. Menambah stok gudang (IN) dan otomatis membukukan transaksi pembayaran/hutang di jurnal keuangan.
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitSupplier} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tanggal Kirim</Label>
                        <Input type="date" value={supTanggal} onChange={(e) => setSupTanggal(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Bahan Baku</Label>
                        <Select value={supBahanId} onValueChange={setSupBahanId}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {bahan.map((b) => <SelectItem key={b.id} value={b.id}>{b.kode} — {b.nama}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Qty Datang</Label>
                        <Input type="number" min={1} value={supQty} onChange={(e) => setSupQty(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Biaya (Rp)</Label>
                        <Input type="number" min={0} value={supCost} onChange={(e) => setSupCost(Number(e.target.value))} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Metode Pembayaran</Label>
                      <Select value={supBayar} onValueChange={setSupBayar}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="110000">Kas Rupiah (Cash)</SelectItem>
                          <SelectItem value="120000">Bank (Transfer)</SelectItem>
                          <SelectItem value="210000">Hutang Usaha (Belum Bayar)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift mt-2">
                      <Package className="mr-1 h-4 w-4" />Catat Pembelian & Posting Jurnal
                    </Button>
                  </form>
                </CardContent>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="permohonan" className="m-0">
            <AdminPermohonanOutletInner dbState={dbState} />
          </TabsContent>

          <TabsContent value="retur-perlengkapan" className="m-0">
            <AdminReturPerlengkapanInner dbState={dbState} />
          </TabsContent>

          <TabsContent value="rusak" className="m-0">
            <Card className="glass border-0 shadow-card">
              <div>
                <CardHeader>
                  <CardTitle>Lapor Barang Rusak (Wastage)</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mencatat penyusutan bahan baku yang rusak, pecah, atau kadaluarsa. Mengurangi stok gudang (OUT) dan otomatis membukukan biaya kerugian operasional di jurnal keuangan.
                  </p>
                </CardHeader>
                <CardContent>
                  <form onSubmit={submitRusak} className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Tanggal Lapor</Label>
                        <Input type="date" value={rusakTanggal} onChange={(e) => setRusakTanggal(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>Bahan Baku</Label>
                        <Select value={rusakBahanId} onValueChange={setRusakBahanId}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {bahan.map((b) => <SelectItem key={b.id} value={b.id}>{b.kode} — {b.nama}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Qty Rusak</Label>
                        <Input type="number" min={1} value={rusakQty} onChange={(e) => setRusakQty(Number(e.target.value))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Keterangan / Alasan</Label>
                        <Input value={rusakKeterangan} onChange={(e) => setRusakKeterangan(e.target.value)} placeholder="Contoh: Pecah, Kadaluarsa, dll." />
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift mt-2">
                      <AlertTriangle className="mr-1 h-4 w-4" />Catat Kerusakan & Posting Jurnal
                    </Button>
                  </form>
                </CardContent>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

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
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead className="text-right">Gramasi</TableHead>
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
                    const gramasi = getGramasiInfo(b);
                    const totalGram = gramasi ? saldo * gramasi.gramPerUnit : null;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                        <TableCell className="whitespace-nowrap">{b.nama}</TableCell>
                        <TableCell className="text-right font-semibold">{saldo}</TableCell>
                        <TableCell className="text-right text-xs">
                          {totalGram !== null
                            ? <><span className="font-medium">{totalGram.toLocaleString()} gr</span><br /><span className="text-muted-foreground">{gramasi!.label}</span></>
                            : <span className="text-muted-foreground">{b.satuan}</span>}
                        </TableCell>
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

// === SUBCOMPONENT FOR PERMOHONAN OUTLET TAB ===
function AdminPermohonanOutletInner({ dbState }: { dbState: any }) {
  const { permohonanStok = [], outlets = [], produk = [] } = dbState;
  const PRODUCTION_PRODUCTS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];

  const [range, setRange] = useState<DateRange>({
    from: todayISO().slice(0, 7) + "-01",
    to: todayISO()
  });
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");

  const filteredRequests = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      if (PRODUCTION_PRODUCTS.includes(r.produkId)) return false;
      if (r.catatan?.startsWith("RETUR")) return false; // Retur handled in Retur Perlengkapan tab
      const matchDate = inRange(r.tanggalKirim, range);
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

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(sortedRequests, 10);

  return (
    <Card className="glass border-0 shadow-card flex-1">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <CardTitle className="text-sm">Daftar Permohonan Outlet</CardTitle>
          <p className="text-[10px] text-muted-foreground">Setujui atau tolak permohonan perlengkapan — stok otomatis terpotong</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {outlets.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Perlengkapan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[130px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Tidak ada permohonan
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((r: any) => {
                  const outlet = outlets.find((o: any) => o.id === r.outletId);
                  const prod = produk.find((p: any) => p.id === r.produkId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium text-xs">{outlet?.nama ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{prod?.nama ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{r.qty}</TableCell>
                      <TableCell>
                        {r.status === "Pending" && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]"><Clock className="h-3 w-3" /> Pending</Badge>}
                        {r.status === "Disetujui" && <Badge className="bg-success text-success-foreground text-[10px]"><Check className="h-3 w-3" /> OK</Badge>}
                        {r.status === "Ditolak" && <Badge variant="destructive" className="text-[10px]"><X className="h-3 w-3" /> Tolak</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.status === "Pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 w-7 p-0" variant="outline"
                              onClick={async () => {
                                await db.updatePermohonanStokStatus(r.id, "Disetujui");
                                if (r.produkId.startsWith("b-")) {
                                  await db.addStokMov({
                                    tanggal: todayISO(), bahanId: r.produkId,
                                    tipe: "OUT", qty: r.qty,
                                    keterangan: `Permohonan ${prod?.nama ?? ""} dari ${outlet?.nama ?? "Outlet"}`
                                  });
                                }
                                toast.success(`Disetujui!`);
                              }}>
                              <Check className="h-3 w-3 text-success" />
                            </Button>
                            <Button size="sm" className="h-7 w-7 p-0" variant="outline"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Ditolak");
                                toast.error("Ditolak");
                              }}>
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
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

// === SUBCOMPONENT FOR RETUR PERLENGKAPAN TAB ===
function AdminReturPerlengkapanInner({ dbState }: { dbState: any }) {
  const { permohonanStok = [], outlets = [], produk = [] } = dbState;

  const [range, setRange] = useState<DateRange>({
    from: todayISO().slice(0, 7) + "-01",
    to: todayISO()
  });
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");

  const filteredRequests = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      if (!r.catatan?.startsWith("RETUR")) return false; // Only retur requests
      const matchDate = inRange(r.tanggalKirim, range);
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

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(sortedRequests, 10);

  return (
    <Card className="glass border-0 shadow-card flex-1">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <CardTitle className="text-sm">Retur Perlengkapan Outlet</CardTitle>
          <p className="text-[10px] text-muted-foreground">Setujui retur perlengkapan — stok otomatis bertambah (IN)</p>
        </div>
        <div className="flex gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua</SelectItem>
              {outlets.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Perlengkapan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Tgl Retur</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[130px]">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Tidak ada retur perlengkapan
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((r: any) => {
                  const outlet = outlets.find((o: any) => o.id === r.outletId);
                  const prod = produk.find((p: any) => p.id === r.produkId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-medium text-xs">{outlet?.nama ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{prod?.nama ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{r.qty} {prod?.satuan ?? "pcs"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.tanggal}</TableCell>
                      <TableCell>
                        {r.status === "Pending" && <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-[10px]"><Clock className="h-3 w-3" /> Pending</Badge>}
                        {r.status === "Disetujui" && <Badge className="bg-success text-success-foreground text-[10px]"><Check className="h-3 w-3" /> OK</Badge>}
                        {r.status === "Ditolak" && <Badge variant="destructive" className="text-[10px]"><X className="h-3 w-3" /> Tolak</Badge>}
                      </TableCell>
                      <TableCell>
                        {r.status === "Pending" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 w-7 p-0" variant="outline"
                              onClick={async () => {
                                await db.updatePermohonanStokStatus(r.id, "Disetujui");
                                // Retur approved = stock IN
                                await db.addStokMov({
                                  tanggal: todayISO(), bahanId: r.produkId,
                                  tipe: "IN", qty: r.qty,
                                  keterangan: `Retur ${prod?.nama ?? ""} dari ${outlet?.nama ?? "Outlet"}`
                                });
                                toast.success(`Retur disetujui! Stok bertambah ${r.qty}`);
                              }}>
                              <Check className="h-3 w-3 text-success" />
                            </Button>
                            <Button size="sm" className="h-7 w-7 p-0" variant="outline"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Ditolak");
                                toast.error("Retur ditolak");
                              }}>
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
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
