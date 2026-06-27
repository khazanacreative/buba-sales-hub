import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  Card, CardContent, CardHeader, CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

import { db, useDB, getBubaSettings, saveBubaSettings } from "@/lib/store";
import { rupiah } from "@/lib/format";

import { Plus, Trash2, RotateCcw, Pencil, Sliders, Warehouse, Store, ShoppingCart, BookOpen, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";

import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

// GPS Location parsing helper
const parseLokasi = (lokasiStr: string) => {
  const parts = (lokasiStr || "").split(" @ ");
  const alamat = parts[0] || "";
  let lat = "";
  let lng = "";
  let rad = "100";
  if (parts[1]) {
    const coords = parts[1].split(",");
    lat = coords[0] || "";
    lng = coords[1] || "";
    rad = coords[2] || "100";
  }
  return { alamat, lat, lng, rad };
};

export default function MasterData() {
  const { user } = useAuth();
  const { outlets = [], produk = [], coa = [], karyawan = [], users = [], bahan = [] } = useDB();

  const outletPg = usePagination(outlets, 10);
  const produkPg = usePagination(produk, 10);
  const coaPg = usePagination(coa, 10);
  const karyawanPg = usePagination(karyawan, 10);
  const bahanPg = usePagination(bahan, 10);

  // Outlet form state with GPS
  const [oNama, setONama] = useState("");
  const [oLokasi, setOLokasi] = useState("");
  const [oLat, setOLat] = useState("");
  const [oLng, setOLng] = useState("");
  const [oRadius, setORadius] = useState("100");

  const [pNama, setPNama] = useState("");
  const [pHarga, setPHarga] = useState(0);
  const [pSatuan, setPSatuan] = useState("cup");

  // Bahan Baku form state
  const [bKode, setBKode] = useState("");
  const [bNama, setBNama] = useState("");
  const [bSatuan, setBSatuan] = useState("sachet");
  const [bStokMin, setBStokMin] = useState(0);
  const [bStokAwal, setBStokAwal] = useState(0);
  const [bHargaBeli, setBHargaBeli] = useState(0);
  const [bKonversiGram, setBKonversiGram] = useState(0);



  // Global Settings state
  const [globalSettings, setGlobalSettings] = useState(getBubaSettings());
  const [sBerasBubur, setSBerasBubur] = useState(globalSettings.berasBubur);
  const [sDagingBubur, setSDagingBubur] = useState(globalSettings.dagingBubur);
  const [sAirBubur, setSAirBubur] = useState(globalSettings.airBubur);
  const [sSayurHijauBubur, setSSayurHijauBubur] = useState(globalSettings.sayurHijauBubur);
  const [sSayurBrokoliBubur, setSSayurBrokoliBubur] = useState(globalSettings.sayurBrokoliBubur);
  const [sSayurPutihBubur, setSSayurPutihBubur] = useState(globalSettings.sayurPutihBubur);

  const [sBerasTim, setSBerasTim] = useState(globalSettings.berasTim);
  const [sDagingTim, setSDagingTim] = useState(globalSettings.dagingTim);
  const [sAirTim, setSAirTim] = useState(globalSettings.airTim);
  const [sSayurHijauTim, setSSayurHijauTim] = useState(globalSettings.sayurHijauTim);
  const [sSayurBrokoliTim, setSSayurBrokoliTim] = useState(globalSettings.sayurBrokoliTim);
  const [sSayurPutihTim, setSSayurPutihTim] = useState(globalSettings.sayurPutihTim);

  const [sOatmealCup, setSOatmealCup] = useState(globalSettings.oatmealCup);
  const [sPudingCup, setSPudingCup] = useState(globalSettings.pudingCup);
  const [sAbonCup, setSAbonCup] = useState(globalSettings.abonCup);

  useEffect(() => {
    const handler = () => {
      const gs = getBubaSettings();
      setGlobalSettings(gs);
      setSBerasBubur(gs.berasBubur);
      setSDagingBubur(gs.dagingBubur);
      setSAirBubur(gs.airBubur);
      setSSayurHijauBubur(gs.sayurHijauBubur);
      setSSayurBrokoliBubur(gs.sayurBrokoliBubur);
      setSSayurPutihBubur(gs.sayurPutihBubur);
      setSBerasTim(gs.berasTim);
      setSDagingTim(gs.dagingTim);
      setSAirTim(gs.airTim);
      setSSayurHijauTim(gs.sayurHijauTim);
      setSSayurBrokoliTim(gs.sayurBrokoliTim);
      setSSayurPutihTim(gs.sayurPutihTim);
      setSOatmealCup(gs.oatmealCup);
      setSPudingCup(gs.pudingCup);
      setSAbonCup(gs.abonCup);
    };
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);

  const handleSaveGramasi = (e: React.FormEvent) => {
    e.preventDefault();
    const current = getBubaSettings();
    saveBubaSettings({
      ...current,
      berasBubur: Number(sBerasBubur),
      dagingBubur: Number(sDagingBubur),
      airBubur: Number(sAirBubur),
      sayurHijauBubur: Number(sSayurHijauBubur),
      sayurBrokoliBubur: Number(sSayurBrokoliBubur),
      sayurPutihBubur: Number(sSayurPutihBubur),
      
      berasTim: Number(sBerasTim),
      dagingTim: Number(sDagingTim),
      airTim: Number(sAirTim),
      sayurHijauTim: Number(sSayurHijauTim),
      sayurBrokoliTim: Number(sSayurBrokoliTim),
      sayurPutihTim: Number(sSayurPutihTim),

      oatmealCup: Number(sOatmealCup),
      pudingCup: Number(sPudingCup),
      abonCup: Number(sAbonCup),
    });
    toast.success("Pengaturan gramasi berhasil disimpan!");
  };



  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">

      {/* HEADER */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Master Data</h1>
          <p className="text-muted-foreground">
            Kelola outlet, produk, bahan baku, COA, karyawan, dan pengaturan global
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            if (confirm("Reset semua data?")) {
              db.reset();
              toast.success("Data direset");
            }
          }}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
      </div>





      {/* ===== ACCORDION VIEW ===== */}
      <div>
        <Accordion type="single" collapsible className="space-y-2">
          {/* OUTLET */}
          <AccordionItem value="outlet" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Store className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Outlet</div>
                  <div className="text-[11px] text-muted-foreground">{outlets.length} terdaftar</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold">Tambah Outlet</h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!oNama) return;
                        let lokasiCombined = oLokasi;
                        if (oLat && oLng) {
                          lokasiCombined += ` @ ${oLat},${oLng},${oRadius || 100}`;
                        }
                        db.addOutlet({ nama: oNama, lokasi: lokasiCombined });
                        setONama("");
                        setOLokasi("");
                        setOLat("");
                        setOLng("");
                        setORadius("100");
                        toast.success("Outlet ditambahkan");
                      }}
                      className="space-y-2"
                    >
                      <Input value={oNama} onChange={(e) => setONama(e.target.value)} placeholder="Nama Outlet" />
                      <Input value={oLokasi} onChange={(e) => setOLokasi(e.target.value)} placeholder="Alamat" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={oLat} onChange={(e) => setOLat(e.target.value)} placeholder="Latitude GPS" />
                        <Input value={oLng} onChange={(e) => setOLng(e.target.value)} placeholder="Longitude GPS" />
                      </div>
                      <Input type="number" value={oRadius} onChange={(e) => setORadius(e.target.value)} placeholder="Radius Absensi (M)" />
                      <Button className="w-full h-9 text-xs gradient-primary text-primary-foreground">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah Outlet
                      </Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold mb-2 px-1">Daftar Outlet</h3>
                    <div className="space-y-2">
                      {outletPg.paged.map((o) => {
                        const parsed = parseLokasi(o.lokasi);
                        return (
                          <div key={o.id} className="rounded-lg border p-3 text-sm space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{o.nama}</span>
                              <div className="flex gap-1">
                                <EditOutletDialog outlet={o} />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                  if (confirm(`Hapus outlet ${o.nama}?`)) db.deleteOutlet(o.id);
                                }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">{parsed.alamat || "-"}</div>
                            {parsed.lat !== "" && parsed.lng !== "" && (
                              <div className="text-[10px] text-primary font-mono">
                                GPS: {parsed.lat}, {parsed.lng} (R:{parsed.rad}m)
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {outletPg.paged.length === 0 && (
                        <div className="text-center text-muted-foreground py-6 text-sm">Belum ada outlet</div>
                      )}
                    </div>
                    <TablePagination 
                      page={outletPg.page}
                      totalPages={outletPg.totalPages}
                      total={outletPg.total}
                      pageSize={outletPg.pageSize}
                      onChange={outletPg.setPage}
                    />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* PRODUK */}
          <AccordionItem value="produk" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Produk</div>
                  <div className="text-[11px] text-muted-foreground">{produk.length} terdaftar</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold">Tambah Produk</h3>
                    <form onSubmit={(e) => { e.preventDefault(); if (!pNama || pHarga <= 0) return; db.addProduk({ nama: pNama, harga: pHarga, satuan: pSatuan }); setPNama(""); setPHarga(0); toast.success("Produk ditambahkan"); }} className="space-y-2">
                      <Input value={pNama} onChange={(e) => setPNama(e.target.value)} placeholder="Nama Produk" />
                      <Input type="number" value={pHarga} onChange={(e) => setPHarga(Number(e.target.value))} placeholder="Harga" />
                      <Input value={pSatuan} onChange={(e) => setPSatuan(e.target.value)} placeholder="Satuan" />
                      <Button className="w-full h-9 text-xs"><Plus className="mr-1.5 h-3.5 w-3.5" />Tambah</Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold mb-2 px-1">Daftar Produk</h3>
                    <div className="space-y-2">
                      {produkPg.paged.map((p) => (
                        <div key={p.id} className="rounded-lg border p-3 text-sm flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{p.nama}</div>
                            <div className="text-xs text-muted-foreground">{rupiah(p.harga)} / {p.satuan}</div>
                          </div>
                          <div className="flex gap-1">
                            <EditProdukDialog produk={p} />
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => db.deleteProduk(p.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        </div>
                      ))}
                      {produkPg.paged.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">Belum ada produk</div>}
                    </div>
                    <TablePagination page={produkPg.page} totalPages={produkPg.totalPages} total={produkPg.total} pageSize={produkPg.pageSize} onChange={produkPg.setPage} />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* BAHAN BAKU */}
          <AccordionItem value="bahan" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Warehouse className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Bahan Baku</div>
                  <div className="text-[11px] text-muted-foreground">{bahan.length} terdaftar</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-2">
                    <h3 className="text-sm font-bold">Tambah Bahan Baku</h3>
                    <form onSubmit={(e) => { e.preventDefault(); if (!bKode || !bNama) return toast.error("Lengkapi kode dan nama bahan!"); db.addBahan({ kode: bKode, nama: bNama, satuan: bSatuan, stokMin: bStokMin, stokAwal: bStokAwal, hargaBeli: bHargaBeli, konversiGram: bKonversiGram || undefined }); setBKode(""); setBNama(""); setBSatuan("sachet"); setBStokMin(0); setBStokAwal(0); setBHargaBeli(0); setBKonversiGram(0); toast.success("Bahan baku ditambahkan"); }} className="space-y-2">
                      <Input value={bKode} onChange={(e) => setBKode(e.target.value)} placeholder="Kode (contoh: BRS01)" />
                      <Input value={bNama} onChange={(e) => setBNama(e.target.value)} placeholder="Nama Bahan" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={bSatuan} onChange={(e) => setBSatuan(e.target.value)} placeholder="Satuan" />
                        <Input type="number" value={bStokMin} onChange={(e) => setBStokMin(Number(e.target.value))} placeholder="Stok Min" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" value={bStokAwal} onChange={(e) => setBStokAwal(Number(e.target.value))} placeholder="Stok Awal" />
                        <Input type="number" value={bHargaBeli} onChange={(e) => setBHargaBeli(Number(e.target.value))} placeholder="Harga Beli" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" value={bKonversiGram} onChange={(e) => setBKonversiGram(Number(e.target.value))} placeholder="Konversi Gram" />
                        <div className="text-[10px] text-muted-foreground flex items-center px-1">gr / {bSatuan || "satuan"}</div>
                      </div>
                      <Button className="w-full h-9 text-xs gradient-primary text-primary-foreground"><Plus className="mr-1.5 h-3.5 w-3.5" />Tambah Bahan Baku</Button>
                    </form>
                  </CardContent>
                </Card>
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold mb-2 px-1">Daftar Bahan Baku</h3>
                    <div className="space-y-2">
                      {bahanPg.paged.map((b) => (
                        <div key={b.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <div><span className="font-mono font-bold text-xs text-primary">{b.kode}</span><span className="font-semibold ml-2">{b.nama}</span></div>
                            <div className="flex gap-1">
                              <EditBahanDialog bahan={b} />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Hapus ${b.nama}?`)) db.deleteBahan(b.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                            </div>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            <span>Satuan: {b.satuan}</span><span>Min: {b.stokMin}</span><span>Awal: {b.stokAwal}</span><span className="text-primary font-semibold">{rupiah(b.hargaBeli)}</span>
                            {b.konversiGram ? <span className="text-amber-600 font-medium">Konv: {b.konversiGram} gr/{b.satuan}</span> : null}
                          </div>
                        </div>
                      ))}
                      {bahanPg.paged.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">Belum ada bahan baku</div>}
                    </div>
                    <TablePagination page={bahanPg.page} totalPages={bahanPg.totalPages} total={bahanPg.total} pageSize={bahanPg.pageSize} onChange={bahanPg.setPage} />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* COA */}
          <AccordionItem value="coa" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">COA</div>
                  <div className="text-[11px] text-muted-foreground">{coa.length} akun</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border shadow-sm">
                <CardContent className="p-3">
                  <h3 className="text-sm font-bold mb-2 px-1">Chart of Accounts</h3>
                  <div className="space-y-2">
                    {coaPg.paged.map((a) => (
                      <div key={a.kode} className="rounded-lg border p-3 text-sm flex items-center justify-between">
                        <div>
                          <span className="font-mono text-xs text-muted-foreground">{a.kode}</span>
                          <span className="font-semibold ml-2">{a.nama}</span>
                        </div>
                        <div className="text-xs">
                          <span className="bg-muted px-2 py-0.5 rounded-full">{a.kategori}</span>
                        </div>
                      </div>
                    ))}
                    {coaPg.paged.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">Belum ada COA</div>}
                  </div>
                  <TablePagination page={coaPg.page} totalPages={coaPg.totalPages} total={coaPg.total} pageSize={coaPg.pageSize} onChange={coaPg.setPage} />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
          {/* KARYAWAN */}
          <AccordionItem value="karyawan" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <UserCheck className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Karyawan</div>
                  <div className="text-[11px] text-muted-foreground">{karyawan.length} terdaftar</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4">
                <div className="flex justify-end">
                  <TambahKaryawanDialog outlets={outlets} />
                </div>
                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold mb-2 px-1">Daftar Karyawan</h3>
                    <div className="space-y-2">
                      {karyawanPg.paged.map((k) => {
                        const o = outlets.find((x) => x.id === k.outletId);
                        return (
                          <div key={k.id} className="rounded-lg border p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{k.nama}</span>
                              <div className="flex gap-1">
                                <EditKaryawanDialog karyawan={k} outlets={outlets} />
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm(`Hapus ${k.nama}?`)) db.deleteKaryawan(k.id); }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span className="capitalize bg-muted px-1.5 py-0.5 rounded text-[10px]">{k.role}</span>
                              <span>{k.posisi}</span><span>•</span><span>{o?.nama ?? "Pusat"}</span><span>•</span><span className="font-semibold">{rupiah(k.gajiPokok)}/hr</span>
                            </div>
                            {k.username && (
                              <div className="mt-1.5 text-[10px] text-primary flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                <span>Akun: {k.username}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {karyawanPg.paged.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">Belum ada karyawan</div>}
                    </div>
                    <TablePagination page={karyawanPg.page} totalPages={karyawanPg.totalPages} total={karyawanPg.total} pageSize={karyawanPg.pageSize} onChange={karyawanPg.setPage} />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>
          {/* AKUN ADMIN */}
          <AccordionItem value="pengguna" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Akun Admin</div>
                  <div className="text-[11px] text-muted-foreground">{users.filter((u: any) => !u.karyawanId).length} akun utama</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border shadow-sm">
                <CardContent className="p-3">
                  <h3 className="text-sm font-bold mb-2 px-1">Akun Administrator & Super Admin</h3>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Akun ini adalah akun utama yang tidak terhubung ke data karyawan. 
                    Untuk akun karyawan, kelola melalui seksi Karyawan di atas.
                  </p>
                  <div className="space-y-2">
                    {users.filter((u: any) => !u.karyawanId).map((u: any) => {
                      return (
                        <div key={u.username} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-center justify-between">
                            <div><span className="font-semibold">{u.username}</span><span className="text-xs text-muted-foreground ml-2">{u.nama}</span></div>
                            <div className="flex gap-1">
                              <EditUserDialog userAccount={u} outlets={outlets} />
                            </div>
                          </div>
                          <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="capitalize bg-muted px-1.5 py-0.5 rounded">{u.role}</span>
                            <span>PW: {u.password}</span>
                          </div>
                        </div>
                      );
                    })}
                    {users.filter((u: any) => !u.karyawanId).length === 0 && 
                      <div className="text-center text-muted-foreground py-6 text-sm">Tidak ada akun utama</div>
                    }
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
          {/* GRAMASI */}
          <AccordionItem value="gramasi" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Sliders className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Gramasi</div>
                  <div className="text-[11px] text-muted-foreground">Konversi berat per cup</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <form onSubmit={handleSaveGramasi} className="space-y-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-2"><Sliders className="h-4 w-4 text-primary" /> Konversi Gramasi</h3>
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-amber-600">Varian Bubur</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">Beras</Label><Input type="number" step="any" value={sBerasBubur} onChange={(e) => setSBerasBubur(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Air</Label><Input type="number" step="any" value={sAirBubur} onChange={(e) => setSAirBubur(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Daging</Label><Input type="number" step="any" value={sDagingBubur} onChange={(e) => setSDagingBubur(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Hijau</Label><Input type="number" step="any" value={sSayurHijauBubur} onChange={(e) => setSSayurHijauBubur(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Brokoli</Label><Input type="number" step="any" value={sSayurBrokoliBubur} onChange={(e) => setSSayurBrokoliBubur(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Putih</Label><Input type="number" step="any" value={sSayurPutihBubur} onChange={(e) => setSSayurPutihBubur(Number(e.target.value))} /></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-blue-600">Varian Nasi Tim</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">Beras</Label><Input type="number" step="any" value={sBerasTim} onChange={(e) => setSBerasTim(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Air</Label><Input type="number" step="any" value={sAirTim} onChange={(e) => setSAirTim(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Daging</Label><Input type="number" step="any" value={sDagingTim} onChange={(e) => setSDagingTim(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Hijau</Label><Input type="number" step="any" value={sSayurHijauTim} onChange={(e) => setSSayurHijauTim(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Brokoli</Label><Input type="number" step="any" value={sSayurBrokoliTim} onChange={(e) => setSSayurBrokoliTim(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">S.Putih</Label><Input type="number" step="any" value={sSayurPutihTim} onChange={(e) => setSSayurPutihTim(Number(e.target.value))} /></div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-muted-foreground">Menu Lainnya</h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div><Label className="text-[10px]">Oatmeal</Label><Input type="number" step="any" value={sOatmealCup} onChange={(e) => setSOatmealCup(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Puding</Label><Input type="number" step="any" value={sPudingCup} onChange={(e) => setSPudingCup(Number(e.target.value))} /></div>
                        <div><Label className="text-[10px]">Abon</Label><Input type="number" step="any" value={sAbonCup} onChange={(e) => setSAbonCup(Number(e.target.value))} /></div>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground text-xs">Simpan Pengaturan Gramasi</Button>
                  </CardContent>
                </Card>
              </form>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

/* ================= EDIT DIALOGS ================= */

/* ================= TAMBAH KARYAWAN DIALOG ================= */

// Generate username from name: "Budi Santoso" → "budisantoso"
function generateUsernameFromNama(nama: string): string {
  return nama
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]/g, "") // remove non-alphanumeric
    .trim();
}

// Find unique username by appending number if already taken
function findUniqueUsername(base: string, existingUsernames: string[]): string {
  if (!existingUsernames.includes(base)) return base;
  let i = 1;
  while (existingUsernames.includes(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function TambahKaryawanDialog({ outlets }: { outlets: any[] }) {
  const { users } = useDB();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState("");
  const [username, setUsername] = useState("");
  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("outlet");
  const [posisi, setPosisi] = useState("Kasir");
  const [outletId, setOutletId] = useState(outlets[0]?.id ?? "none");
  const [gajiPokok, setGajiPokok] = useState(17500);
  const [bonusOmset, setBonusOmset] = useState(0);
  const [bonusUlasan, setBonusUlasan] = useState(0);
  const [tunjanganHarian, setTunjanganHarian] = useState(0);
  const [overtimeRate, setOvertimeRate] = useState(0);
  const [jamMasuk, setJamMasuk] = useState("07:30");
  const [jamPulang, setJamPulang] = useState("15:00");

  // Auto-generate username from nama (unless user has manually edited it)
  useEffect(() => {
    if (!usernameManuallyEdited) {
      const existingUsernames = users.map((u: any) => u.username);
      const base = generateUsernameFromNama(nama);
      const unique = base ? findUniqueUsername(base, existingUsernames) : "";
      setUsername(unique);
    }
  }, [nama, usernameManuallyEdited, users]);

  const resetForm = () => {
    setNama("");
    setUsername("");
    setUsernameManuallyEdited(false);
    setPassword("");
    setRole("outlet");
    setPosisi("Kasir");
    setOutletId(outlets[0]?.id ?? "none");
    setGajiPokok(17500);
    setBonusOmset(0);
    setBonusUlasan(0);
    setTunjanganHarian(0);
    setOvertimeRate(0);
    setJamMasuk("07:30");
    setJamPulang("15:00");
  };

  return (
    <>
      <Button onClick={() => { setOpen(true); resetForm(); }} className="gradient-primary text-primary-foreground h-9 text-xs">
        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah Karyawan
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tambah Karyawan</DialogTitle></DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!nama) return toast.error("Nama karyawan diperlukan");
              if (!username) return toast.error("Username untuk akun pengguna diperlukan");
              if (!password) return toast.error("Password untuk akun pengguna diperlukan");
              const finalUsername = username.toLowerCase().trim();
              if (users.some((u: any) => u.username === finalUsername)) {
                return toast.error("Username sudah terdaftar");
              }
              try {
                await db.addKaryawan({
                  nama,
                  posisi,
                  role,
                  outletId: outletId === "none" ? undefined : outletId,
                  gajiPokok,
                  bonusOmset,
                  bonusUlasan,
                  tunjanganHarian,
                  overtimeRate,
                  jamMasuk,
                  jamPulang
                }, {
                  username: finalUsername,
                  password,
                  role
                });
                toast.success("Karyawan & akun pengguna berhasil ditambahkan");
                setOpen(false);
                resetForm();
              } catch (err: any) {
                toast.error(err?.message || "Gagal menambahkan karyawan");
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nama Karyawan</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama Karyawan" />
            </div>

            <div className="border-t pt-3 mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-muted-foreground italic">Akun Pengguna (username otomatis dibuat dari nama)</p>
                {usernameManuallyEdited && (
                  <button
                    type="button"
                    className="text-[10px] text-primary underline"
                    onClick={() => {
                      setUsernameManuallyEdited(false);
                    }}
                  >
                    Reset otomatis
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="flex items-center gap-1">
                    Username
                    {!usernameManuallyEdited && username && (
                      <span className="text-[9px] font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">otomatis</span>
                    )}
                  </Label>
                  <Input
                    value={username}
                    onChange={(e) => {
                      setUsernameManuallyEdited(true);
                      setUsername(e.target.value.toLowerCase().trim());
                    }}
                    placeholder="Username untuk login"
                  />
                </div>
                <div>
                  <Label>Password <span className="text-destructive">*</span></Label>
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password untuk login" />
                </div>
              </div>
            </div>

            <div>
              <Label>Role / Hak Akses</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outlet">Outlet (Cabang)</SelectItem>
                  <SelectItem value="produksi">Produksi</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Posisi / Jabatan</Label>
              <Select value={posisi} onValueChange={setPosisi}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kasir">Kasir</SelectItem>
                  <SelectItem value="Produksi">Produksi</SelectItem>
                  <SelectItem value="Helper">Helper</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Outlet Penugasan</Label>
              <Select value={outletId} onValueChange={(val) => {
                setOutletId(val);
                // Set default jam based on outlet
                const isPusat = val === "none";
                setJamMasuk(isPusat ? "07:30" : "07:00");
                setJamPulang(isPusat ? "15:00" : "14:00");
              }}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kantor Pusat</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Gaji Pokok (per Hari)</Label>
              <Input type="number" value={gajiPokok} onChange={(e) => setGajiPokok(Number(e.target.value))} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Bonus Omset (Bulanan)</Label>
                <Input type="number" value={bonusOmset} onChange={(e) => setBonusOmset(Number(e.target.value))} />
              </div>
              <div>
                <Label>Bonus Ulasan (Bulanan)</Label>
                <Input type="number" value={bonusUlasan} onChange={(e) => setBonusUlasan(Number(e.target.value))} />
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-[11px] text-muted-foreground italic mb-2">Tunjangan Harian & Lembur (per karyawan)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tunjangan Harian (Rp)</Label>
                  <Input type="number" value={tunjanganHarian} onChange={(e) => setTunjanganHarian(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Tarif Lembur / Jam (Rp)</Label>
                  <Input type="number" value={overtimeRate} onChange={(e) => setOvertimeRate(Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-[11px] text-muted-foreground italic mb-2">Jam Kerja (per karyawan)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Jam Masuk</Label>
                  <Input type="time" value={jamMasuk} onChange={(e) => setJamMasuk(e.target.value)} />
                </div>
                <div>
                  <Label>Jam Pulang</Label>
                  <Input type="time" value={jamPulang} onChange={(e) => setJamPulang(e.target.value)} />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ================= EDIT DIALOGS ================= */

function EditOutletDialog({ outlet }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(outlet.nama);

  const parsed = parseLokasi(outlet.lokasi);
  const [alamat, setAlamat] = useState(parsed.alamat);
  const [lat, setLat] = useState(parsed.lat);
  const [lng, setLng] = useState(parsed.lng);
  const [rad, setRad] = useState(parsed.rad);

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Outlet</DialogTitle></DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              let lokasiCombined = alamat;
              if (lat && lng) {
                lokasiCombined += ` @ ${lat},${lng},${rad || 100}`;
              }
              db.updateOutlet(outlet.id, { nama, lokasi: lokasiCombined });
              toast.success("Outlet diperbarui");
              setOpen(false);
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nama Outlet</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div>
              <Label>Alamat / Lokasi</Label>
              <Input value={alamat} onChange={(e) => setAlamat(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Latitude GPS</Label>
                <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Contoh: -7.641234" />
              </div>
              <div>
                <Label>Longitude GPS</Label>
                <Input value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Contoh: 112.906123" />
              </div>
            </div>
            <div>
              <Label>Radius Absensi (Meter)</Label>
              <Input type="number" value={rad} onChange={(e) => setRad(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditBahanDialog({ bahan }) {
  const [open, setOpen] = useState(false);
  const [kode, setKode] = useState(bahan.kode);
  const [nama, setNama] = useState(bahan.nama);
  const [satuan, setSatuan] = useState(bahan.satuan);
  const [stokMin, setStokMin] = useState(bahan.stokMin);
  const [stokAwal, setStokAwal] = useState(bahan.stokAwal);
  const [hargaBeli, setHargaBeli] = useState(bahan.hargaBeli);
  const [konversiGram, setKonversiGram] = useState(bahan.konversiGram ?? 0);

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Bahan Baku</DialogTitle></DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              db.updateBahan(bahan.id, { kode, nama, satuan, stokMin, stokAwal, hargaBeli, konversiGram: konversiGram || undefined });
              toast.success("Bahan baku diperbarui");
              setOpen(false);
            }}
            className="space-y-3"
          >
            <div>
              <Label>Kode</Label>
              <Input value={kode} onChange={(e) => setKode(e.target.value)} />
            </div>
            <div>
              <Label>Nama Bahan Baku</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div>
              <Label>Satuan</Label>
              <Input value={satuan} onChange={(e) => setSatuan(e.target.value)} />
            </div>
            <div>
              <Label>Stok Minimum</Label>
              <Input type="number" value={stokMin} onChange={(e) => setStokMin(Number(e.target.value))} />
            </div>
            <div>
              <Label>Stok Awal</Label>
              <Input type="number" value={stokAwal} onChange={(e) => setStokAwal(Number(e.target.value))} />
            </div>
            <div>
              <Label>Harga Beli (Rp)</Label>
              <Input type="number" value={hargaBeli} onChange={(e) => setHargaBeli(Number(e.target.value))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Konversi Gram</Label>
                <Input type="number" value={konversiGram} onChange={(e) => setKonversiGram(Number(e.target.value))} />
              </div>
              <div className="flex items-end pb-1">
                <span className="text-xs text-muted-foreground">gr / {satuan}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditProdukDialog({ produk }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(produk.nama);
  const [harga, setHarga] = useState(produk.harga);
  const [satuan, setSatuan] = useState(produk.satuan);

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Produk</DialogTitle></DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              db.updateProduk(produk.id, { nama, harga, satuan });
              toast.success("Produk diperbarui");
              setOpen(false);
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nama Produk</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div>
              <Label>Harga</Label>
              <Input type="number" value={harga} onChange={(e) => setHarga(Number(e.target.value))} />
            </div>
            <div>
              <Label>Satuan</Label>
              <Input value={satuan} onChange={(e) => setSatuan(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditKaryawanDialog({ karyawan, outlets }: { karyawan: any; outlets: any[] }) {
  const { users } = useDB();
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(karyawan.nama);
  const [posisi, setPosisi] = useState(karyawan.posisi);
  const [role, setRole] = useState(karyawan.role || "outlet");
  const [username, setUsername] = useState(karyawan.username || "");
  const [password, setPassword] = useState(karyawan.password || "");
  const [newPassword, setNewPassword] = useState("");
  const [outletId, setOutletId] = useState(karyawan.outletId ?? "none");
  const [gajiPokok, setGajiPokok] = useState(karyawan.gajiPokok);
  const [bonusOmset, setBonusOmset] = useState(karyawan.bonusOmset ?? 0);
  const [bonusUlasan, setBonusUlasan] = useState(karyawan.bonusUlasan ?? 0);
  const [tunjanganHarian, setTunjanganHarian] = useState(karyawan.tunjanganHarian ?? 0);
  const [overtimeRate, setOvertimeRate] = useState(karyawan.overtimeRate ?? 0);
  const [jamMasuk, setJamMasuk] = useState(karyawan.jamMasuk || "07:30");
  const [jamPulang, setJamPulang] = useState(karyawan.jamPulang || "15:00");

  const hasAkun = !!karyawan.username;

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => { setOpen(true); setNewPassword(""); }}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Data Karyawan</DialogTitle></DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const finalUsername = username.toLowerCase().trim();
              if (finalUsername !== karyawan.username) {
                // Check local state for duplicate
                if (users.some((u: any) => u.username === finalUsername && u.karyawanId !== karyawan.id)) {
                  return toast.error("Username sudah digunakan oleh karyawan lain");
                }
              }
              try {
                await db.updateKaryawan(karyawan.id, {
                  nama,
                  posisi,
                  role,
                  username: username || undefined,
                  outletId: outletId === "none" ? undefined : outletId,
                  gajiPokok,
                  bonusOmset,
                  bonusUlasan,
                  tunjanganHarian,
                  overtimeRate,
                  jamMasuk,
                  jamPulang
                }, newPassword || undefined);
                toast.success(newPassword ? "Data karyawan & password diperbarui" : "Data karyawan diperbarui");
                setOpen(false);
              } catch (err: any) {
                toast.error(err?.message || "Gagal memperbarui karyawan");
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nama Karyawan</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>

            {/* Akun Pengguna Terkait */}
            <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
              <p className="text-[11px] text-muted-foreground font-medium mb-1">
                {hasAkun ? "Akun Pengguna Terkait" : "Buat Akun Pengguna"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Username</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().trim())}
                    placeholder="Username untuk login"
                    className="text-xs"
                    required
                  />
                </div>
                <div>
                  <Label className="text-[11px]">
                    {hasAkun ? "Password Baru (kosongkan jika tidak diganti)" : "Password"}
                  </Label>
                  <Input
                    type="text"
                    value={hasAkun ? newPassword : password}
                    onChange={(e) => {
                      if (hasAkun) setNewPassword(e.target.value);
                      else setPassword(e.target.value);
                    }}
                    placeholder={hasAkun ? "Biarkan kosong jika tidak diganti" : "Password untuk login"}
                    className="text-xs"
                    required={!hasAkun}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Role / Hak Akses</Label>
              <Select value={role} onValueChange={(v) => setRole(v)}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outlet">Outlet (Cabang)</SelectItem>
                  <SelectItem value="produksi">Produksi</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Posisi / Jabatan</Label>
              <Select value={posisi} onValueChange={setPosisi}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kasir">Kasir</SelectItem>
                  <SelectItem value="Produksi">Produksi</SelectItem>
                  <SelectItem value="Helper">Helper</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Outlet Penugasan</Label>
              <Select value={outletId} onValueChange={setOutletId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kantor Pusat</SelectItem>
                  {outlets.map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Gaji Pokok (per Hari)</Label>
              <Input type="number" value={gajiPokok} onChange={(e) => setGajiPokok(Number(e.target.value))} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Bonus Omset (Bulanan)</Label>
                <Input type="number" value={bonusOmset} onChange={(e) => setBonusOmset(Number(e.target.value))} />
              </div>
              <div>
                <Label>Bonus Ulasan (Bulanan)</Label>
                <Input type="number" value={bonusUlasan} onChange={(e) => setBonusUlasan(Number(e.target.value))} />
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-[11px] text-muted-foreground italic mb-2">Tunjangan Harian & Lembur (per karyawan)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Tunjangan Harian (Rp)</Label>
                  <Input type="number" value={tunjanganHarian} onChange={(e) => setTunjanganHarian(Number(e.target.value))} />
                </div>
                <div>
                  <Label>Tarif Lembur / Jam (Rp)</Label>
                  <Input type="number" value={overtimeRate} onChange={(e) => setOvertimeRate(Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-[11px] text-muted-foreground italic mb-2">Jam Kerja (per karyawan)</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Jam Masuk</Label>
                  <Input type="time" value={jamMasuk} onChange={(e) => setJamMasuk(e.target.value)} />
                </div>
                <div>
                  <Label>Jam Pulang</Label>
                  <Input type="time" value={jamPulang} onChange={(e) => setJamPulang(e.target.value)} />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditUserDialog({ userAccount, outlets }: { userAccount: any; outlets: any[] }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(userAccount.nama);
  const [password, setPassword] = useState(userAccount.password);
  const [role, setRole] = useState(userAccount.role);
  const [outletId, setOutletId] = useState(userAccount.outletId ?? "none");

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Akun Pengguna</DialogTitle></DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              db.updateUser(userAccount.username, {
                nama,
                password,
                role,
                outletId: role === "admin" ? undefined : (outletId === "none" ? undefined : outletId)
              });
              toast.success("Akun pengguna diperbarui");
              setOpen(false);
            }}
            className="space-y-3"
          >
            <div>
              <Label>Username (Permanen)</Label>
              <Input value={userAccount.username} disabled />
            </div>
            <div>
              <Label>Nama Lengkap</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            </div>
            <div>
              <Label>Password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <Label>Role / Peran</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "outlet" | "produksi")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
                  <SelectItem value="produksi">Produksi</SelectItem>
                  <SelectItem value="outlet">Outlet (Cabang)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {role === "outlet" && (
              <div>
                <Label>Penugasan Outlet</Label>
                <Select value={outletId} onValueChange={setOutletId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Kantor Pusat</SelectItem>
                    {outlets.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}