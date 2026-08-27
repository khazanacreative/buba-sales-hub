import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, saldoBahan, GRAM_EXCLUDED_BAHAN, fetchHistoricalData } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { todayISO, DateRange, inRange, rupiah, hargaPerGram, nilaiBahan } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, Package, ArrowUpCircle, ArrowDownCircle, Check, X, Clock, Send, RotateCcw, ChevronUp, ChevronDown, ChevronsUpDown, Eye, EyeOff, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import BahanFilter from "@/components/BahanFilter";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { DateInput } from "@/components/DateInput";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import { AkunKategori } from "@/lib/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  // Poin 2: Item yang boleh direquest outlet — hanya Cup Bubur/Tim, Tutup, Sendok, Kresek, Tisu
  const ALLOWED_REQUEST_IDS = new Set(["b-cb01", "b-ttp01", "b-sen01", "b-ts01", "b-krs01"]);
  // Poin 3: Item yang boleh diretur outlet — hanya Cup Bubur/Tim & Tutup Bubur/Tim
  const ALLOWED_RETUR_IDS = new Set(["b-cb01", "b-ttp01"]);

  const supportItems = useMemo(() => {
    // Filter only supply/perlengkapan items yang boleh direquest
    return (produk || []).filter((p: any) => ALLOWED_REQUEST_IDS.has(p.id));
  }, [produk]);

  const returItems = useMemo(() => {
    // Filter only supply/perlengkapan items yang boleh diretur
    return (produk || []).filter((p: any) => ALLOWED_RETUR_IDS.has(p.id));
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

  // Edit state — edit in-place untuk request/retur ber-status Pending
  const [editing, setEditing] = useState<any>(null);
  const [editQty, setEditQty] = useState(1);
  const [editTanggal, setEditTanggal] = useState("");
  const [editCatatan, setEditCatatan] = useState("");

  const openEdit = (r: any) => {
    const isRetur = r.catatan?.startsWith("RETUR");
    setEditing(r);
    setEditQty(r.qty);
    setEditTanggal(isRetur ? r.tanggal : r.tanggalKirim);
    setEditCatatan(isRetur ? "" : (r.catatan || ""));
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!(editQty > 0)) return toast.error("Jumlah tidak valid");
    if (!editTanggal) return toast.error("Tanggal wajib diisi");
    const isRetur = editing.catatan?.startsWith("RETUR");
    try {
      await db.updatePermohonanStok(
        editing.id,
        isRetur
          ? { qty: editQty, tanggal: editTanggal, tanggalKirim: editTanggal }
          : { qty: editQty, tanggalKirim: editTanggal, catatan: editCatatan }
      );
      toast.success(isRetur ? "Retur perlengkapan diperbarui" : "Permohonan perlengkapan diperbarui");
      setEditing(null);
    } catch (err) {
      toast.error(`Gagal memperbarui: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const selectedProduct = useMemo(() => {
    return (produk || []).find((p: any) => p.id === produkId);
  }, [produk, produkId]);

  useEffect(() => {
    if (supportItems.length > 0) {
      if (!produkId) setProdukId(supportItems[0].id);
    }
    if (returItems.length > 0) {
      if (!returProdukId) setReturProdukId(returItems[0].id);
    }
  }, [supportItems, returItems, produkId, returProdukId]);

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
                  <DateInput value={tanggalKirim} onChange={setTanggalKirim} />
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
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit permohonan" onClick={() => openEdit(r)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <ConfirmDeleteButton
                                    onConfirm={() => {
                                      db.deletePermohonanStok(r.id);
                                      toast.success("Permohonan stok dibatalkan");
                                    }}
                                    title="Batalkan Permohonan"
                                    description={`Permohonan ${prod?.nama ?? "perlengkapan"} (${r.qty}) akan dibatalkan dan dihapus.`}
                                    confirmLabel="Batalkan"
                                  />
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
              <TablePagination page={requestPg.page} totalPages={requestPg.totalPages} total={requestPg.total} pageSize={requestPg.pageSize} onChange={requestPg.setPage} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: RETUR PERLENGKAPAN */}
        <TabsContent value="retur" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Form Retur Perlengkapan</CardTitle>
              <p className="text-xs text-muted-foreground">Kembalikan Cup Bubur/Tim &amp; Tutup yang tidak terpakai ke gudang</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitRetur} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3 items-end">
                  <div className="space-y-2">
                    <Label>Tanggal Retur</Label>
                    <DateInput value={returTanggal} onChange={setReturTanggal} />
                  </div>
                  <div className="space-y-2">
                    <Label>Pilih Perlengkapan</Label>
                    <Select value={returProdukId} onValueChange={setReturProdukId}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {returItems.map((p: any) => (
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
                                <div className="flex items-center justify-end gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit retur" onClick={() => openEdit(r)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <ConfirmDeleteButton
                                    onConfirm={() => {
                                      db.deletePermohonanStok(r.id);
                                      toast.success("Retur dibatalkan");
                                    }}
                                    title="Batalkan Retur"
                                    description={`Retur ${prod?.nama ?? "perlengkapan"} (${r.qty}) akan dibatalkan dan dihapus.`}
                                    confirmLabel="Batalkan"
                                  />
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
              <TablePagination page={returPg.page} totalPages={returPg.totalPages} total={returPg.total} pageSize={returPg.pageSize} onChange={returPg.setPage} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Edit Request/Retur — edit in-place untuk yang masih Pending */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit {editing?.catatan?.startsWith("RETUR") ? "Retur" : "Request"} Perlengkapan
            </DialogTitle>
            <DialogDescription>
              {editing ? (() => {
                const prod = produk.find((p: any) => p.id === editing.produkId);
                return `Perlengkapan: ${prod?.nama ?? "-"} (saat ini ${editing.qty} ${prod?.satuan ?? "pcs"}).`;
              })() : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Jumlah ({produk.find((p: any) => p.id === editing?.produkId)?.satuan ?? "pcs"})</Label>
              <Input type="number" min={1} value={editQty || ""} onChange={(e) => setEditQty(Number(e.target.value))} className="h-10" />
            </div>
            <div className="space-y-2">
              <Label>{editing?.catatan?.startsWith("RETUR") ? "Tanggal Retur" : "Tanggal Kirim"}</Label>
              <DateInput value={editTanggal} onChange={setEditTanggal} />
            </div>
            {editing && !editing.catatan?.startsWith("RETUR") && (
              <div className="space-y-2">
                <Label>Catatan Pengiriman</Label>
                <Input value={editCatatan} onChange={(e) => setEditCatatan(e.target.value)} placeholder="Contoh: Titip di rombong, dll (opsional)" className="h-10" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={saveEdit} className="gradient-primary text-primary-foreground">
              <Save className="h-4 w-4 mr-1.5" /> Simpan Perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === SUBCOMPONENT: GUDANG VIEW (Pegawai Gudang - Read Only) ===
// Hanya bisa melihat saldo dan riwayat pergerakan, tidak diizinkan entry data
function GudangView({ dbState, user }: { dbState: any; user: any }) {
  const { bahan = [], stokMov = [], produksi = [], produk = [] } = dbState;
  const [range, setRange] = useState<DateRange>({});

  const effectiveStokMov = useMemo(
    () => (stokMov || []).filter((m: any) => !m.keterangan?.startsWith("RUSAK:PENDING:") && !m.keterangan?.startsWith("EDIT:PENDING:")),
    [stokMov]
  );

  const filteredDbState = useMemo(
    () => ({ ...dbState, stokMov: effectiveStokMov }),
    [dbState, effectiveStokMov]
  );

  const saldoMap = useMemo(() => {
    const m: Record<string, number> = {};
    bahan.forEach((b) => (m[b.id] = saldoBahan(b.id, filteredDbState)));
    return m;
  }, [bahan, effectiveStokMov, filteredDbState]);

  // Hitung totalNilai menggunakan harga per gram (presisi HPP)
  const totalNilai = bahan.reduce((s, b) => s + nilaiBahan(saldoMap[b.id] || 0, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram), 0);
  const lowStock = bahan.filter((b) => {
    const saldo = saldoMap[b.id] || 0;
    const minGram = !GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? b.stokMin * b.konversiGram : b.stokMin;
    return saldo <= minGram;
  });

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showExtraCols, setShowExtraCols] = useState(true);

  const getGramasiInfo = (b: any) => {
    // Oat & Puding: tetap satuan asli (pcs), bukan gram
    if (GRAM_EXCLUDED_BAHAN.has(b.id)) return null;
    const nama = (b.nama || "").toLowerCase();
    if (nama.includes("beras")) {
      return { gramPerUnit: 700, label: `700 g/${b.satuan?.toLowerCase()}` };
    }
    const sachet35List = ["tuna", "tengiri", "salmon", "gurami", "kakap", "dori", "daging", "ayam"];
    if (sachet35List.some((ik) => nama.includes(ik))) {
      return { gramPerUnit: 35, label: `35 g/${b.satuan?.toLowerCase()}` };
    }
    if (b.konversiGram && b.konversiGram > 0) {
      return { gramPerUnit: b.konversiGram, label: `${b.konversiGram} g/${b.satuan?.toLowerCase()}` };
    }
    return null;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedBahan = useMemo(() => {
    const list = [...bahan];
    if (!sortField) return list;
    return list.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "kode": aVal = a.kode; bVal = b.kode; break;
        case "nama": aVal = a.nama; bVal = b.nama; break;
        case "saldo": aVal = saldoMap[a.id] || 0; bVal = saldoMap[b.id] || 0; break;
        case "gramasi": aVal = getGramasiInfo(a)?.gramPerUnit ?? 0; bVal = getGramasiInfo(b)?.gramPerUnit ?? 0; break;
        case "hrgPerGram": aVal = hargaPerGram(a.hargaBeli, GRAM_EXCLUDED_BAHAN.has(a.id) ? null : a.konversiGram); bVal = hargaPerGram(b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram); break;
        case "nilai": aVal = nilaiBahan(saldoMap[a.id] || 0, a.hargaBeli, GRAM_EXCLUDED_BAHAN.has(a.id) ? null : a.konversiGram); bVal = nilaiBahan(saldoMap[b.id] || 0, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram); break;
        case "min": aVal = a.stokMin; bVal = b.stokMin; break;
        default: aVal = a.kode; bVal = b.kode;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [bahan, sortField, sortDir, saldoMap]);

  const bahanPg = usePagination(sortedBahan, 10);

  const filteredMov = useMemo(
    () => [...effectiveStokMov].filter((m) => inRange(m.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [effectiveStokMov, range]
  );

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === "asc" 
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Stok Gudang</h1>
        <p className="text-sm text-muted-foreground">Pantau stok bahan baku (read-only)</p>
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

      {/* Saldo Bahan Baku */}
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Saldo Bahan Baku</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExtraCols(!showExtraCols)}
              className="h-8 text-xs gap-1"
            >
              {showExtraCols ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showExtraCols ? "Sembunyikan Min & Status" : "Tampilkan Min & Status"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("kode")}>Kode <SortIcon field="kode" /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nama")}>Nama <SortIcon field="nama" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("saldo")}>Saldo <SortIcon field="saldo" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("gramasi")}>Satuan <SortIcon field="gramasi" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("hrgPerGram")}>Harga Satuan <SortIcon field="hrgPerGram" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("nilai")}>Nilai <SortIcon field="nilai" /></TableHead>
                    <TableHead className={`text-right ${!showExtraCols ? 'hidden' : ''}`}>Min</TableHead>
                    <TableHead className={`${!showExtraCols ? 'hidden' : ''}`}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bahanPg.paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={showExtraCols ? 8 : 6} className="text-center text-muted-foreground py-8">Belum ada saldo bahan baku</TableCell>
                    </TableRow>
                  )}
                  {bahanPg.paged.map((b: any) => {
                    const saldo = saldoMap[b.id] || 0;
                    const gramasi = getGramasiInfo(b);
                    const minGram = !GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? b.stokMin * b.konversiGram : b.stokMin;
                    const low = saldo <= minGram;
                    const hrgPerGram = hargaPerGram(b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram);
                    // saldo sekarang dalam gram untuk bahan dengan konversiGram
                    const unitSize = gramasi?.gramPerUnit ?? 0;
                    const fullUnits = unitSize > 0 ? Math.floor(saldo / unitSize) : null;
                    const sisa = unitSize > 0 && fullUnits !== null ? saldo - fullUnits * unitSize : null;
                    const saldoDisplay = GRAM_EXCLUDED_BAHAN.has(b.id)
                      ? <><span className="font-semibold">{Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(2)} {b.satuan?.toLowerCase()}</span> <span className="text-muted-foreground font-normal">({(saldo * unitSize).toLocaleString()} gr)</span></>
                      : gramasi
                        ? <><span className="font-semibold">{Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(1)} gr</span> <span className="text-muted-foreground font-normal">({fullUnits !== null ? `${fullUnits.toLocaleString()} ${b.satuan?.toLowerCase()}${sisa && sisa > 0.001 ? '+' : ''}` : '?'})</span></>
                        : <>{Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(2)} {b.satuan?.toLowerCase()}</>;
                    const gramasiLabel = gramasi ? <span className="text-muted-foreground">{gramasi.label}</span> : <span className="text-muted-foreground">{b.satuan?.toLowerCase()}</span>;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                        <TableCell className="whitespace-nowrap">{b.nama}</TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">{saldoDisplay}</TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">{gramasiLabel}</TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">{rupiah(hrgPerGram)}{!b.konversiGram || GRAM_EXCLUDED_BAHAN.has(b.id) ? `/${b.satuan?.toLowerCase()}` : "/g"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{rupiah(nilaiBahan(saldo, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram))}</TableCell>
                        <TableCell className={`text-right text-muted-foreground ${!showExtraCols ? 'hidden' : ''}`}>{!GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? `${(b.stokMin * b.konversiGram).toLocaleString()} g` : b.stokMin}</TableCell>
                        <TableCell className={`${!showExtraCols ? 'hidden' : ''}`}>
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
          <TablePagination page={bahanPg.page} totalPages={bahanPg.totalPages} total={bahanPg.total} pageSize={bahanPg.pageSize} onChange={bahanPg.setPage} />
        </CardContent>
      </Card>

      {/* Riwayat Pergerakan Stok */}
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Riwayat Pergerakan Stok</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2 items-center">
            <DateRangeFilter value={range} onChange={setRange} />
          </div>
        </CardHeader>
        <CardContent>
          <MovTable mov={filteredMov} bahan={bahan} produksi={produksi} produk={produk} readOnly />
        </CardContent>
      </Card>
    </div>
  );
}

// === SUBCOMPONENT: TL VIEW (Tim Leader - Read Only) ===
// Hanya bisa melihat Request & Retur dari semua outlet, tidak bisa edit/menyetujui
function TLView({ dbState }: { dbState: any }) {
  const [activeTab, setActiveTab] = useState("request");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Request &amp; Retur Outlet</h1>
        <p className="text-sm text-muted-foreground">Pantau permohonan dan retur perlengkapan dari semua outlet (read-only)</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 gap-0">
          <TabsTrigger value="request" className="rounded-t-lg">Request Perlengkapan</TabsTrigger>
          <TabsTrigger value="retur" className="rounded-t-lg">Retur Perlengkapan</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="space-y-6">
          <AdminPermohonanOutletInner dbState={dbState} readOnly />
        </TabsContent>

        <TabsContent value="retur" className="space-y-6">
          <AdminReturPerlengkapanInner dbState={dbState} readOnly />
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

  if (user?.role === "gudang") {
    return <GudangView dbState={dbState} user={user} />;
  }

  if (user?.role === "tl") {
    return <TLView dbState={dbState} />;
  }

  // Produksi role: hanya lihat saldo & riwayat, tidak bisa input
  const isProduksi = user?.role === "produksi";

  // Admin original states and computations
  const { bahan = [], stokMov = [], produksi = [], produk = [] } = dbState;
  const [tanggal, setTanggal] = useState(todayISO());
  const [bahanId, setBahanId] = useState("");
  const [tipe, setTipe] = useState<"IN" | "OUT">("IN");
  const [qty, setQty] = useState<number | undefined>(undefined);
  const [selectedKetSource, setSelectedKetSource] = useState("Supplier");
  const [customKet, setCustomKet] = useState("");
  const [range, setRange] = useState<DateRange>({});

  // Auto-fetch historical data when user selects a date range outside ±3 days
  const loadingHistoricalRef = useRef(false);
  useEffect(() => {
    if (!range.from && !range.to) return;
    const from = range.from || todayISO();
    const to = range.to || todayISO();
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fmt = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const loadedFrom = fmt(threeDaysAgo);
    const loadedTo = fmt(tomorrow);
    if (from < loadedFrom || to > loadedTo) {
      const fetchFrom = from < loadedFrom ? from : loadedFrom;
      const fetchTo = to > loadedTo ? to : loadedTo;
      if (!loadingHistoricalRef.current) {
        loadingHistoricalRef.current = true;
        fetchHistoricalData(fetchFrom, fetchTo).finally(() => {
          loadingHistoricalRef.current = false;
        });
      }
    }
  }, [range]);

  useEffect(() => {
    setSelectedKetSource(tipe === "IN" ? "Supplier" : "Plan Produksi");
    setCustomKet("");
  }, [tipe]);

  // States for Kiriman Supplier Form
  const [supTanggal, setSupTanggal] = useState(todayISO());
  const [supBahanId, setSupBahanId] = useState("");

  const [supQty, setSupQty] = useState<number | undefined>(undefined);
  const [supCost, setSupCost] = useState<number | undefined>(undefined);
  const [supBayar, setSupBayar] = useState("110000"); // Kas Rupiah as default

  // States for Barang Rusak Form
  const [rusakTanggal, setRusakTanggal] = useState(todayISO());
  const [rusakBahanId, setRusakBahanId] = useState("");

  const [rusakQty, setRusakQty] = useState<number | undefined>(undefined);
  const [rusakKeterangan, setRusakKeterangan] = useState("");

  useEffect(() => {
    if (bahan.length > 0) {
      if (!bahanId) setBahanId(bahan[0].id);
      if (!supBahanId) setSupBahanId(bahan[0].id);
      if (!rusakBahanId) setRusakBahanId(bahan[0].id);
    }
  }, [bahan, bahanId, supBahanId, rusakBahanId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bahanId || qty === undefined || qty <= 0) return toast.error("Lengkapi data");
    const finalKet = selectedKetSource === "Lainnya" ? customKet : selectedKetSource;
    // Konversi qty ke gram jika bahan memiliki konversiGram
    const selectedB = bahan.find((b: any) => b.id === bahanId);
    const kg = selectedB?.konversiGram && selectedB.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(selectedB.id) ? selectedB.konversiGram : null;
    const qtyGram = kg ? qty * kg : qty;
    try {
      await db.addStokMov({ tanggal, bahanId, tipe, qty: qtyGram, keterangan: finalKet || (tipe === "IN" ? "Pembelian" : "Pemakaian") });
      toast.success(`Stok ${tipe === "IN" ? "masuk" : "keluar"} dicatat`);
      setQty(undefined); setCustomKet("");
    } catch (err) {
      toast.error(`Gagal menyimpan stok: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const submitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supBahanId || !supQty || supQty <= 0 || !supCost || supCost <= 0) {
      return toast.error("Lengkapi data kiriman supplier dengan benar");
    }
    
    const selectedBahan = bahan.find(b => b.id === supBahanId);
    if (!selectedBahan) return toast.error("Bahan baku tidak ditemukan");

    const labelBahan = selectedBahan.nama;
    
    // 1. Record stock movement IN (konversi ke gram jika ada konversiGram)
    const kgSup = selectedBahan.konversiGram && selectedBahan.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(selectedBahan.id) ? selectedBahan.konversiGram : null;
    const qtyGramSup = kgSup ? supQty * kgSup : supQty;
    await db.addStokMov({
      tanggal: supTanggal,
      bahanId: supBahanId,
      tipe: "IN",
      qty: qtyGramSup,
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
    setSupQty(undefined);
    setSupCost(undefined);
  };

  const submitRusak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rusakBahanId || !rusakQty || rusakQty <= 0) {
      return toast.error("Lengkapi data barang rusak dengan benar");
    }

    const selectedBahan = bahan.find(b => b.id === rusakBahanId);
    if (!selectedBahan) return toast.error("Bahan baku tidak ditemukan");

    const kgRusak = selectedBahan.konversiGram && selectedBahan.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(selectedBahan.id) ? selectedBahan.konversiGram : null;
    const qtyGramRusak = kgRusak ? rusakQty * kgRusak : rusakQty;

    if (!isProduksi) {
      // === ADMIN: langsung kurangi stok + posting jurnal ===
      const currentStock = saldoMap[rusakBahanId] || 0;
      if (qtyGramRusak > currentStock) {
        const stockDisplay = kgRusak
          ? `${(currentStock / kgRusak).toFixed(2)} ${selectedBahan.satuan} (${currentStock.toLocaleString()} gr)`
          : `${currentStock} ${selectedBahan.satuan}`;
        return toast.error(`Stok tidak mencukupi! Stok saat ini: ${stockDisplay}`);
      }

      const labelBahan = selectedBahan.nama;
      // totalLoss pakai qty dalam unit asli × harga per unit (untuk jurnal)
      const totalLoss = rusakQty * selectedBahan.hargaBeli;

      await db.addStokMov({
        tanggal: rusakTanggal,
        bahanId: rusakBahanId,
        tipe: "OUT",
        qty: qtyGramRusak,
        keterangan: `RUSAK:APPROVED:${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`
      });

      await db.addJurnalBulk([
        {
          tanggal: rusakTanggal,
          ref: "OUT-RUSAK",
          keterangan: `Kerusakan Persediaan: ${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`,
          kodeAkun: "510000", akun: "Operasional", tipe: "Debit",
          jumlah: totalLoss, kategori: "Beban"
        },
        {
          tanggal: rusakTanggal,
          ref: "OUT-RUSAK",
          keterangan: `Kerusakan Persediaan: ${labelBahan} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}`,
          kodeAkun: "140000", akun: "Persediaan", tipe: "Kredit",
          jumlah: totalLoss, kategori: "Aset"
        }
      ]);

      toast.success("Barang rusak dicatat & jurnal terposting!");
    } else {
      // === PRODUKSI: simpan sebagai PENDING, menunggu approval admin ===
      const creatorName = user?.nama || user?.username || "Produksi";
      await db.addStokMov({
        tanggal: rusakTanggal,
        bahanId: rusakBahanId,
        tipe: "OUT",
        qty: qtyGramRusak,
        keterangan: `RUSAK:PENDING:${selectedBahan.nama} (${rusakQty} ${selectedBahan.satuan})${rusakKeterangan ? ` - ${rusakKeterangan}` : ""}|dibuat oleh ${creatorName}`
      });
      toast.success("Laporan barang rusak dikirim, menunggu persetujuan Admin.");
    }

    setRusakQty(undefined);
    setRusakKeterangan("");
  };

  // === Helper: Approve pending rusak ===
  const approveRusak = async (mov: any) => {
    const selectedBahan = bahan.find(b => b.id === mov.bahanId);
    if (!selectedBahan) return toast.error("Bahan tidak ditemukan");

    const currentStock = saldoMap[mov.bahanId] || 0;
    if (mov.qty > currentStock) {
      return toast.error(`Stok tidak mencukupi! Stok saat ini: ${currentStock} gr`);
    }

    // mov.qty sudah dalam gram (dari DB). totalLoss perlu dalam unit asli × harga per unit
    const kgAppr = selectedBahan.konversiGram && selectedBahan.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(selectedBahan.id) ? selectedBahan.konversiGram : 1;
    const unitQty = mov.qty / kgAppr;
    const totalLoss = unitQty * selectedBahan.hargaBeli;
    const rawDetail = mov.keterangan?.replace("RUSAK:PENDING:", "") || "";
    // Parse existing format: "itemDetail|dibuat oleh nama" or fallback to legacy
    const parts = rawDetail.split("|");
    const itemDetail = parts[0]?.trim() || rawDetail;
    const creatorInfo = parts[1]?.trim() || "";
    const adminName = user?.nama || user?.username || "Admin";
    const approvedKet = `RUSAK:APPROVED:${itemDetail}${creatorInfo ? ` | ${creatorInfo}` : ""} | disetujui oleh ${adminName}`;

    // Update keterangan jadi APPROVED dengan info creator & approver
    await supabase
      .from("stok_movement")
      .update({ keterangan: approvedKet })
      .eq("id", mov.id);

    // Posting jurnal
    await db.addJurnalBulk([
      {
        tanggal: mov.tanggal,
        ref: "OUT-RUSAK",
        keterangan: `Kerusakan Persediaan (Approved): ${itemDetail}`,
        kodeAkun: "510000", akun: "Operasional", tipe: "Debit",
        jumlah: totalLoss, kategori: "Beban"
      },
      {
        tanggal: mov.tanggal,
        ref: "OUT-RUSAK",
        keterangan: `Kerusakan Persediaan (Approved): ${itemDetail}`,
        kodeAkun: "140000", akun: "Persediaan", tipe: "Kredit",
        jumlah: totalLoss, kategori: "Aset"
      }
    ]);

    toast.success(`Barang rusak disetujui! Stok -${mov.qty}, jurnal terposting.`);
  };

  // === Helper: Reject pending rusak ===
  const rejectRusak = async (mov: any) => {
    await db.deleteStokMov(mov.id);
    toast.success("Laporan barang rusak ditolak & dihapus.");
  };

  // === Helper: Approve pending edit dari gudang ===
  const approveEdit = async (mov: any) => {
    const selectedBahan = bahan.find(b => b.id === mov.bahanId);
    if (!selectedBahan) return toast.error("Bahan tidak ditemukan");

    const rawDetail = mov.keterangan?.replace("EDIT:PENDING:", "") || "";
    const parts = rawDetail.split("|");
    const itemDetail = parts[0]?.trim() || rawDetail;
    const creatorInfo = parts[1]?.trim() || "";
    const adminName = user?.nama || user?.username || "Admin";
    const approvedKet = `EDIT:APPROVED:${itemDetail}${creatorInfo ? ` | ${creatorInfo}` : ""} | disetujui oleh ${adminName}`;

    // Update keterangan jadi APPROVED
    await supabase
      .from("stok_movement")
      .update({ keterangan: approvedKet })
      .eq("id", mov.id);

    const editDisplay = selectedBahan.konversiGram && selectedBahan.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(selectedBahan.id)
      ? `${mov.qty} gr`
      : `${mov.qty} ${selectedBahan.satuan}`;
    toast.success(`Koreksi stok disetujui! ${mov.tipe === "IN" ? "Stok bertambah" : "Stok berkurang"} ${editDisplay}.`);
  };

  // === Helper: Reject pending edit ===
  const rejectEdit = async (mov: any) => {
    await db.deleteStokMov(mov.id);
    toast.success("Pengajuan koreksi stok ditolak & dihapus.");
  };

  const getGramasiInfo = (b: any) => {
    // Oat & Puding: tetap pcs (bukan gram)
    if (GRAM_EXCLUDED_BAHAN.has(b.id)) return null;
    const nama = (b.nama || "").toLowerCase();

    // Beras -> 700g per unit
    if (nama.includes("beras")) {
      return { gramPerUnit: 700, label: `700 g/${b.satuan?.toLowerCase()}` };
    }

    // Ikan, daging, ayam (sachet) -> 35g per unit
    const sachet35List = ["tuna", "tengiri", "salmon", "gurami", "kakap", "dori", "daging", "ayam"];
    if (sachet35List.some((ik) => nama.includes(ik))) {
      return { gramPerUnit: 35, label: `35 g/${b.satuan?.toLowerCase()}` };
    }

    // Use existing konversiGram if set
    if (b.konversiGram && b.konversiGram > 0) {
      return { gramPerUnit: b.konversiGram, label: `${b.konversiGram} g/${b.satuan?.toLowerCase()}` };
    }

    return null;
  };

  // StokMov tanpa PENDING rusak — pending tidak boleh pengaruhi saldo & riwayat
  const effectiveStokMov = useMemo(
    () => (stokMov || []).filter((m: any) => !m.keterangan?.startsWith("RUSAK:PENDING:") && !m.keterangan?.startsWith("EDIT:PENDING:")),
    [stokMov]
  );

  const filteredDbState = useMemo(
    () => ({ ...dbState, stokMov: effectiveStokMov }),
    [dbState, effectiveStokMov]
  );

  const saldoMap = useMemo(() => {
    const m: Record<string, number> = {};
    bahan.forEach((b) => (m[b.id] = saldoBahan(b.id, filteredDbState)));
    return m;
  }, [bahan, effectiveStokMov, filteredDbState]);

  // Hitung totalNilai menggunakan harga per gram (presisi HPP)
  const totalNilai = bahan.reduce((s, b) => s + nilaiBahan(saldoMap[b.id] || 0, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram), 0);
  const lowStock = bahan.filter((b) => {
    const saldo = saldoMap[b.id] || 0;
    const minGram = !GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? b.stokMin * b.konversiGram : b.stokMin;
    return saldo <= minGram;
  });

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showExtraCols, setShowExtraCols] = useState(true);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedBahan = useMemo(() => {
    const list = [...bahan];
    if (!sortField) return list;
    return list.sort((a: any, b: any) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case "kode": aVal = a.kode; bVal = b.kode; break;
        case "nama": aVal = a.nama; bVal = b.nama; break;
        case "saldo": aVal = saldoMap[a.id] || 0; bVal = saldoMap[b.id] || 0; break;
        case "gramasi": aVal = getGramasiInfo(a)?.gramPerUnit ?? 0; bVal = getGramasiInfo(b)?.gramPerUnit ?? 0; break;
        case "hrgPerGram": aVal = hargaPerGram(a.hargaBeli, GRAM_EXCLUDED_BAHAN.has(a.id) ? null : a.konversiGram); bVal = hargaPerGram(b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram); break;
        case "nilai": aVal = nilaiBahan(saldoMap[a.id] || 0, a.hargaBeli, GRAM_EXCLUDED_BAHAN.has(a.id) ? null : a.konversiGram); bVal = nilaiBahan(saldoMap[b.id] || 0, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram); break;
        case "min": aVal = a.stokMin; bVal = b.stokMin; break;
        default: aVal = a.kode; bVal = b.kode;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
  }, [bahan, sortField, sortDir, saldoMap]);

  const bahanPg = usePagination(sortedBahan, 10);

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown className="ml-1 h-3 w-3 inline opacity-40" />;
    return sortDir === "asc" 
      ? <ChevronUp className="ml-1 h-3 w-3 inline" />
      : <ChevronDown className="ml-1 h-3 w-3 inline" />;
  };

  const filteredMov = useMemo(
    () => [...effectiveStokMov].filter((m) => inRange(m.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [effectiveStokMov, range]
  );

  const pendingRusak = useMemo(
    () => (stokMov || []).filter(m => m.keterangan?.startsWith("RUSAK:PENDING:")).reverse(),
    [stokMov]
  );

  const pendingEdit = useMemo(
    () => (stokMov || []).filter(m => m.keterangan?.startsWith("EDIT:PENDING:")).reverse(),
    [stokMov]
  );

  const rusakHistory = useMemo(
    () => (stokMov || [])
      .filter(m => m.keterangan?.startsWith("RUSAK:"))
      .sort((a: any, b: any) => b.tanggal.localeCompare(a.tanggal)),
    [stokMov]
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

            <Tabs defaultValue={isProduksi ? "permohonan" : "pergerakan"} className="w-full space-y-4">
            <TabsList className={`grid ${isProduksi ? "grid-cols-3" : "grid-cols-5"} gap-0 rounded-lg`}>
              {!isProduksi && (
                <TabsTrigger value="pergerakan" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
                  <span className="group-data-[state=active]:hidden">Stok</span>
                  <span className="hidden group-data-[state=active]:inline">Pergerakan Stok</span>
                </TabsTrigger>
              )}
              {!isProduksi && (
                <TabsTrigger value="supplier" className="group rounded-none px-1 text-[11px] leading-tight data-[state=active]:bg-background">
                  <span className="group-data-[state=active]:hidden">Supplier</span>
                  <span className="hidden group-data-[state=active]:inline">Kiriman Supplier</span>
                </TabsTrigger>
              )}
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

          {!isProduksi && (
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
                        <DateInput value={tanggal} onChange={setTanggal} />
                      </div>
                      <BahanFilter bahan={bahan} selectedId={bahanId} onSelect={setBahanId} label="Bahan" />
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
                        <Input type="number" min={1} value={qty ?? ""} onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)} placeholder="" />
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
          )}

          {!isProduksi && (
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
                        <DateInput value={supTanggal} onChange={setSupTanggal} />
                      </div>
                      <div className="space-y-2 sm:col-span-2 md:col-span-1">
                        <BahanFilter bahan={bahan} selectedId={supBahanId} onSelect={setSupBahanId} label="Bahan Baku" />
                      </div>
                      <div className="space-y-2">
                        <Label>Qty Datang</Label>
                        <Input type="number" min={1} value={supQty ?? ""} onChange={(e) => setSupQty(e.target.value ? Number(e.target.value) : undefined)} placeholder="" />
                      </div>
                      <div className="space-y-2">
                        <Label>Total Biaya (Rp)</Label>
                        <Input type="number" min={0} value={supCost ?? ""} onChange={(e) => setSupCost(e.target.value ? Number(e.target.value) : undefined)} placeholder="" />
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
          )}

          <TabsContent value="permohonan" className="m-0">
            <AdminPermohonanOutletInner dbState={dbState} />
          </TabsContent>

          <TabsContent value="retur-perlengkapan" className="m-0">
            <AdminReturPerlengkapanInner dbState={dbState} />
          </TabsContent>

          <TabsContent value="rusak" className="m-0 space-y-4">
            {/* === ADMIN: PENDING EDIT REQUESTS FROM GUDANG === */}
            {!isProduksi && pendingEdit.length > 0 && (
              <Card className="glass border-0 shadow-card border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <Clock className="h-5 w-5" />
                    Form Kesesuaian — Pengajuan dari Gudang
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Setujui untuk mencatat perubahan stok, atau tolak untuk hapus</p>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Bahan</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Tipe</TableHead>
                          <TableHead>Alasan</TableHead>
                          <TableHead className="w-[120px] text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingEdit.slice(0, 20).map((m: any) => {
                          const b = bahan.find((x: any) => x.id === m.bahanId);
                          const raw = m.keterangan?.replace("EDIT:PENDING:", "") || "";
                          const parts = raw.split("|");
                          const detail = parts[0]?.trim() || raw;
                          const creator = parts[1]?.trim() || "";
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap">{m.tanggal}</TableCell>
                              <TableCell className="font-medium">{b?.nama ?? "-"}</TableCell>
                              <TableCell className="text-right font-semibold">{m.qty} {b?.satuan}</TableCell>
                              <TableCell>
                                {m.tipe === "IN" 
                                  ? <Badge className="bg-success text-success-foreground">Tambah</Badge>
                                  : <Badge variant="destructive">Kurang</Badge>
                                }
                              </TableCell>
                              <TableCell className="text-xs max-w-[200px]">
                                <span>{detail}</span>
                                {creator && (
                                  <span className="text-muted-foreground block leading-tight mt-0.5">{creator}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button size="sm" className="h-8 w-8 p-0" variant="outline"
                                    onClick={() => approveEdit(m)} title="Setujui">
                                    <Check className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button size="sm" className="h-8 w-8 p-0" variant="outline"
                                    onClick={() => rejectEdit(m)} title="Tolak">
                                    <X className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {pendingEdit.length > 20 && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Menampilkan 20 request terbaru ({pendingEdit.length} total)
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* === ADMIN: PENDING RUSAK REQUESTS FROM PRODUKSI === */}
            {!isProduksi && pendingRusak.length > 0 && (
              <Card className="glass border-0 shadow-card border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <Clock className="h-5 w-5" />
                    Catat Barang Rusak dari Produksi
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Setujui untuk kurangi stok & posting jurnal, atau tolak untuk hapus</p>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Bahan</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Keterangan</TableHead>
                          <TableHead className="w-[120px] text-right">Aksi</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRusak.slice(0, 20).map((m: any) => {
                          const b = bahan.find((x: any) => x.id === m.bahanId);
                          const parsed = m.keterangan?.startsWith("RUSAK:PENDING:") ? parseRusakKet(m.keterangan) : null;
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap">{m.tanggal}</TableCell>
                              <TableCell className="font-medium">{b?.nama ?? "-"}</TableCell>
                              <TableCell className="text-right font-semibold text-destructive">{m.qty} {b?.satuan}</TableCell>
                              <TableCell className="text-xs max-w-[200px]">
                                {parsed ? (
                                  <>
                                    <span>{parsed.label}</span>
                                    {parsed.extra && (
                                      <span className="text-muted-foreground block leading-tight mt-0.5">
                                        {parsed.extra}
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  <span>{m.keterangan?.replace("RUSAK:PENDING:", "") || "-"}</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <Button size="sm" className="h-8 w-8 p-0" variant="outline"
                                    onClick={() => approveRusak(m)} title="Setujui">
                                    <Check className="h-4 w-4 text-success" />
                                  </Button>
                                  <Button size="sm" className="h-8 w-8 p-0" variant="outline"
                                    onClick={() => rejectRusak(m)} title="Tolak">
                                    <X className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {pendingRusak.length > 20 && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Menampilkan 20 request terbaru ({pendingRusak.length} total)
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* === FORM BARANG RUSAK === */}
            <Card className="glass border-0 shadow-card">
              <CardHeader className={isProduksi ? "pb-2" : ""}>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  {isProduksi ? "Lapor Barang Rusak" : "Catat Barang Rusak Langsung"}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {isProduksi
                    ? "Kirim laporan barang rusak ke admin untuk divalidasi. Stok gudang akan dikurangi setelah disetujui."
                    : "Langsung kurangi stok gudang (OUT) & posting jurnal beban operasional."}
                </p>
              </CardHeader>
              <CardContent>
                {/* Stock info card for selected bahan */}
                {rusakBahanId && (() => {
                  const b = bahan.find(x => x.id === rusakBahanId);
                  if (!b) return null;
                  const saldo = saldoMap[rusakBahanId] || 0;
                  return (
                    <div className="bg-muted/30 rounded-xl p-3 mb-4 flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Stok saat ini:</span>{' '}
                        <strong className={saldo <= b.stokMin ? "text-destructive" : "text-success"}>
                          {Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(1)} {b.konversiGram ? 'gr' : b.satuan}
                        </strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Harga beli:</span>{' '}
                        <strong>{rupiah(b.hargaBeli)}/{b.satuan?.toLowerCase()}</strong>
                        {b.konversiGram && b.konversiGram > 0 && (                           <span className="text-muted-foreground ml-1">({rupiah(hargaPerGram(b.hargaBeli, b.konversiGram))}/g)</span>
                        )}
                      </div>
                      {rusakQty > 0 && (
                        <div>
                          <span className="text-muted-foreground">Estimasi kerugian:</span>{' '}
                          <strong className="text-destructive">{rupiah(rusakQty * b.hargaBeli)}</strong>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <form onSubmit={submitRusak} className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Tanggal</Label>
                      <DateInput value={rusakTanggal} onChange={setRusakTanggal} />
                    </div>
                    <div className="space-y-2 sm:col-span-2 md:col-span-1">
                      <BahanFilter bahan={bahan} selectedId={rusakBahanId} onSelect={setRusakBahanId} label="Bahan Baku" />
                    </div>
                    <div className="space-y-2">
                      <Label>Jumlah Rusak</Label>
                      <Input type="number" min={1} value={rusakQty ?? ""} onChange={(e) => setRusakQty(e.target.value ? Number(e.target.value) : undefined)} placeholder="" />
                    </div>
                    <div className="space-y-2">
                      <Label>Keterangan / Alasan</Label>
                      <Input value={rusakKeterangan} onChange={(e) => setRusakKeterangan(e.target.value)} placeholder="Contoh: Pecah, Kadaluarsa, dll." />
                    </div>
                  </div>
                  <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift">
                    <AlertTriangle className="mr-1.5 h-4 w-4" />
                    {isProduksi ? "Kirim Laporan (Pending)" : "Catat Kerusakan & Posting Jurnal"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* === PRODUKSI: RIWAYAT REQUEST === */}
            {isProduksi && rusakHistory.length > 0 && (
              <Card className="glass border-0 shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle>Riwayat Laporan Barang Rusak</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-xl border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead>Tanggal</TableHead>
                          <TableHead>Bahan</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Keterangan</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rusakHistory.slice(0, 20).map((m: any) => {
                          const b = bahan.find((x: any) => x.id === m.bahanId);
                          const isPending = m.keterangan?.startsWith("RUSAK:PENDING:");
                          const isApproved = m.keterangan?.startsWith("RUSAK:APPROVED:");
                          const rawKet = (m.keterangan || "").replace(/^RUSAK:(PENDING:|APPROVED:)/, "");
                          const parts = rawKet.split("|");
                          const detail = parts[0]?.trim() || rawKet;
                          const extraInfo = parts.slice(1).join(" | ").trim();
                          return (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap">{m.tanggal}</TableCell>
                              <TableCell className="font-medium">{b?.nama ?? "-"}</TableCell>
                              <TableCell className="text-right font-semibold">{m.qty} {b?.satuan}</TableCell>
                              <TableCell className="text-xs max-w-[240px]">
                                <span>{detail}</span>
                                {extraInfo && (
                                  <span className="text-muted-foreground block leading-tight mt-0.5">
                                    {extraInfo}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isPending ? (
                                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                                    <Clock className="h-3 w-3" /> Pending
                                  </Badge>
                                ) : (
                                  <Badge className="bg-success text-success-foreground gap-1">
                                    <Check className="h-3 w-3" /> Disetujui
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {rusakHistory.length > 20 && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Menampilkan 20 laporan terbaru ({rusakHistory.length} total)
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Saldo Bahan Baku</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExtraCols(!showExtraCols)}
              className="h-8 text-xs gap-1"
            >
              {showExtraCols ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showExtraCols ? "Sembunyikan Min & Status" : "Tampilkan Min & Status"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("kode")}>Kode <SortIcon field="kode" /></TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nama")}>Nama <SortIcon field="nama" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("saldo")}>Saldo <SortIcon field="saldo" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("gramasi")}>Satuan <SortIcon field="gramasi" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("hrgPerGram")}>Harga Satuan <SortIcon field="hrgPerGram" /></TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("nilai")}>Nilai <SortIcon field="nilai" /></TableHead>
                    <TableHead className={`text-right ${!showExtraCols ? 'hidden' : ''}`}>Min</TableHead>
                    <TableHead className={`${!showExtraCols ? 'hidden' : ''}`}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bahanPg.paged.length === 0 && (
                    <TableRow><TableCell colSpan={showExtraCols ? 8 : 6} className="text-center text-muted-foreground py-8">Belum ada saldo bahan baku</TableCell>
                    </TableRow>
                  )}
                  {bahanPg.paged.map((b) => {
                    const saldo = saldoMap[b.id] || 0;
                    const gramasi = getGramasiInfo(b);
                    const minGram2 = !GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? b.stokMin * b.konversiGram : b.stokMin;
                    const low = saldo <= minGram2;
                    const hrgPerGram = hargaPerGram(b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram);
                    const unitSize = gramasi?.gramPerUnit ?? 0;
                    const fullUnits = unitSize > 0 ? Math.floor(saldo / unitSize) : null;
                    const sisa = unitSize > 0 && fullUnits !== null ? saldo - fullUnits * unitSize : null;
                    const saldoDisplay = gramasi
                      ? <><span className="font-semibold">{Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(1)} gr</span> <span className="text-muted-foreground font-normal">({fullUnits !== null ? `${fullUnits.toLocaleString()} ${b.satuan?.toLowerCase()}${sisa && sisa > 0.001 ? '+' : ''}` : '?'})</span></>
                      : <>{Number.isInteger(saldo) ? saldo.toLocaleString() : saldo.toFixed(2)} {b.satuan?.toLowerCase()}</>;
                    const gramasiLabel = gramasi ? <span className="text-muted-foreground">{gramasi.label}</span> : <span className="text-muted-foreground">{b.satuan?.toLowerCase()}</span>;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{b.kode}</TableCell>
                        <TableCell className="whitespace-nowrap">{b.nama}</TableCell>
                        <TableCell className="text-right font-semibold whitespace-nowrap">{saldoDisplay}</TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">{gramasiLabel}</TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">{rupiah(hrgPerGram)}{!b.konversiGram || GRAM_EXCLUDED_BAHAN.has(b.id) ? `/${b.satuan?.toLowerCase()}` : "/g"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{rupiah(nilaiBahan(saldo, b.hargaBeli, GRAM_EXCLUDED_BAHAN.has(b.id) ? null : b.konversiGram))}</TableCell>
                        <TableCell className={`text-right text-muted-foreground ${!showExtraCols ? 'hidden' : ''}`}>{!GRAM_EXCLUDED_BAHAN.has(b.id) && b.konversiGram && b.konversiGram > 0 ? `${(b.stokMin * b.konversiGram).toLocaleString()} g` : b.stokMin}</TableCell>
                        <TableCell className={`${!showExtraCols ? 'hidden' : ''}`}>
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
function AdminPermohonanOutletInner({ dbState, readOnly = false }: { dbState: any; readOnly?: boolean }) {
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
          <p className="text-[10px] text-muted-foreground">
            {readOnly
              ? "Pantau permohonan perlengkapan dari outlet (read-only)"
              : "Setujui atau tolak permohonan perlengkapan — stok otomatis terpotong"}
          </p>
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
                  {!readOnly && <TableHead className="w-[130px]">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 4 : 5} className="text-center text-muted-foreground py-8">
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
                      {!readOnly && (
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
                      )}
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
function AdminReturPerlengkapanInner({ dbState, readOnly = false }: { dbState: any; readOnly?: boolean }) {
  const { permohonanStok = [], outlets = [], produk = [], bahan = [] } = dbState;

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
          <p className="text-[10px] text-muted-foreground">
            {readOnly
              ? "Pantau retur perlengkapan dari outlet (read-only)"
              : "Setujui retur perlengkapan — stok otomatis bertambah (IN)"}
          </p>
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
                  {!readOnly && <TableHead className="w-[130px]">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={readOnly ? 5 : 6} className="text-center text-muted-foreground py-8">
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
                      {!readOnly && (
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
                      )}
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

// === HELPER: Parse RUSAK:PENDING:/APPROVED: keterangan for display ===
function parseRusakKet(keterangan: string | null | undefined): { type: "pending" | "approved"; label: string; extra: string } | null {
  if (!keterangan) return null;
  if (keterangan.startsWith("RUSAK:PENDING:")) {
    const raw = keterangan.replace("RUSAK:PENDING:", "");
    const parts = raw.split("|");
    return { type: "pending", label: parts[0]?.trim() || raw, extra: parts.slice(1).join(" | ").trim() };
  }
  if (keterangan.startsWith("RUSAK:APPROVED:")) {
    const raw = keterangan.replace("RUSAK:APPROVED:", "");
    const parts = raw.split("|");
    return { type: "approved", label: parts[0]?.trim() || raw, extra: parts.slice(1).join(" | ").trim() };
  }
  return null;
}

// === HELPER COMPONENT FOR HISTORICAL MOVEMENTS ===
// === REUSABLE COMPONENT: Bahan Filter (Input + filtered list + startsWith) ===


function MovTable({ mov, bahan, produksi, produk, readOnly }: any) {
  const [searchText, setSearchText] = useState("");
  const filteredMov = useMemo(() => {
    if (!searchText.trim()) return mov;
    const q = searchText.toLowerCase();
    return mov.filter((m: any) => {
      const b = bahan.find((x: any) => x.id === m.bahanId);
      const nama = (b?.nama || "").toLowerCase();
      const kode = (b?.kode || "").toLowerCase();
      return nama.includes(q) || kode.includes(q);
    });
  }, [mov, searchText, bahan]);
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filteredMov, 10);
  return (
    <div className="space-y-3">
      <Input
        placeholder="Cari bahan..."
        value={searchText}
        onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
        className="max-w-xs h-9 text-sm"
      />
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
              {!readOnly && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {mov.length === 0 && (
              <TableRow><TableCell colSpan={readOnly ? 5 : 6} className="text-center text-muted-foreground py-8">Belum ada pergerakan</TableCell></TableRow>
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
                    {(() => {
                      const rusak = parseRusakKet(m.keterangan);
                      if (rusak) {
                        return (
                          <>
                            <span>{rusak.label}</span>
                            {rusak.extra && (
                              <span className="text-muted-foreground ml-1">
                                · {rusak.extra}
                              </span>
                            )}
                            <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1.5 gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {rusak.type === "pending" ? "Pending" : "Rusak"}
                            </Badge>
                          </>
                        );
                      }
                      return <>{m.keterangan ?? "-"}</>;
                    })()}
                    {linkProdNama && <span className="text-muted-foreground"> · Produksi {linkProdNama}</span>}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <ConfirmDeleteButton
                        onConfirm={() => db.deleteStokMov(m.id)}
                        title="Hapus Pergerakan Stok"
                        description={`Pergerakan ${b?.nama ?? m.bahanId} (${m.tipe} ${m.qty}) tanggal ${m.tanggal} akan dihapus permanen.`}
                      />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
    </div>
    </div>
  );
}
