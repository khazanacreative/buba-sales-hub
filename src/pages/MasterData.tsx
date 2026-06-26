import { useState, useMemo, useEffect } from "react";
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
  Tabs, TabsContent, TabsList, TabsTrigger
} from "@/components/ui/tabs";
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

import { Plus, Trash2, RotateCcw, Pencil, Settings, Sliders, Warehouse, Store, ShoppingCart, BookOpen, UserCheck, Users } from "lucide-react";
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

  const visibleUsers = useMemo(() => {
    return users.filter((u: any) => u.username !== "khazana" || user?.username === "khazana");
  }, [users, user]);

  const outletPg = usePagination(outlets, 10);
  const produkPg = usePagination(produk, 10);
  const coaPg = usePagination(coa, 10);
  const karyawanPg = usePagination(karyawan, 10);
  const usersPg = usePagination(visibleUsers, 10);
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

  // Karyawan form state
  const [kNama, setKNama] = useState("");
  const [kPosisi, setKPosisi] = useState("Kasir");
  const [kOutletId, setKOutletId] = useState(outlets[0]?.id ?? "none");
  const [kGajiPokok, setKGajiPokok] = useState(17500);
  const [kBonusOmset, setKBonusOmset] = useState(0);
  const [kBonusUlasan, setKBonusUlasan] = useState(0);

  // User form state
  const [uUsername, setUUsername] = useState("");
  const [uPassword, setUPassword] = useState("");
  const [uNama, setUNama] = useState("");
  const [uRole, setURole] = useState<"admin" | "outlet">("outlet");
  const [uOutletId, setUOutletId] = useState(outlets[0]?.id ?? "none");

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

  const [sJamMasukStandar, setSJamMasukStandar] = useState(globalSettings.jamMasukStandar);
  const [sJamPulangStandar, setSJamPulangStandar] = useState(globalSettings.jamPulangStandar);
  const [sOvertimeRate, setSOvertimeRate] = useState(globalSettings.overtimeRate);
  const [sTunjanganHarian, setSTunjanganHarian] = useState(globalSettings.tunjanganHarian);

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
      setSJamMasukStandar(gs.jamMasukStandar);
      setSJamPulangStandar(gs.jamPulangStandar);
      setSOvertimeRate(gs.overtimeRate);
      setSTunjanganHarian(gs.tunjanganHarian);
    };
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const newSettings = {
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

      jamMasukStandar: sJamMasukStandar,
      jamPulangStandar: sJamPulangStandar,
      overtimeRate: Number(sOvertimeRate),
      tunjanganHarian: Number(sTunjanganHarian),
    };
    saveBubaSettings(newSettings);
    toast.success("Pengaturan global berhasil disimpan!");
  };

  const resetUserForm = () => {
    setUUsername("");
    setUPassword("");
    setUNama("");
    setURole("outlet");
    setUOutletId(outlets[0]?.id ?? "none");
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uUsername || !uPassword || !uNama) {
      return toast.error("Lengkapi data user");
    }
    const alreadyExists = users.some((u: any) => u.username === uUsername);
    if (alreadyExists) {
      return toast.error("Username sudah terdaftar");
    }
    db.addUser({
      username: uUsername,
      password: uPassword,
      nama: uNama,
      role: uRole,
      outletId: uRole === "admin" ? undefined : (uOutletId === "none" ? undefined : uOutletId)
    });
    toast.success("Akun pengguna ditambahkan");
    resetUserForm();
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

      <div className="hidden md:block">
      <Tabs defaultValue="outlet" className="w-full">
        <TabsList className="mb-6 bg-muted/50 p-1 rounded-xl w-full overflow-x-auto flex-nowrap justify-start gap-1">
          <TabsTrigger value="outlet" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Outlet ({outlets.length})</TabsTrigger>
          <TabsTrigger value="produk" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Produk ({produk.length})</TabsTrigger>
          <TabsTrigger value="bahan" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Bahan Baku ({bahan.length})</TabsTrigger>
          <TabsTrigger value="coa" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">COA ({coa.length})</TabsTrigger>
          <TabsTrigger value="karyawan" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Karyawan ({karyawan.length})</TabsTrigger>
          <TabsTrigger value="users" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Pengguna ({users.length})</TabsTrigger>
          <TabsTrigger value="pengaturan" className="rounded-lg font-semibold shrink-0 px-3.5 py-1.5 data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-primary/20 transition-all">Pengaturan</TabsTrigger>
        </TabsList>

        {/* ================= OUTLET ================= */}
        <TabsContent value="outlet">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* FORM */}
            <div className="min-w-0">
              <Card className="glass border-0 shadow-card">
                <CardHeader><CardTitle>Tambah Outlet</CardTitle></CardHeader>
                <CardContent className="space-y-3">
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
                    className="space-y-3"
                  >
                    <div>
                      <Label>Nama Outlet</Label>
                      <Input value={oNama} onChange={(e) => setONama(e.target.value)} placeholder="Contoh: Gunung Gangsir" />
                    </div>

                    <div>
                      <Label>Alamat / Lokasi</Label>
                      <Input value={oLokasi} onChange={(e) => setOLokasi(e.target.value)} placeholder="Contoh: Jl. Raya Rajawali No. 45" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>Latitude GPS</Label>
                        <Input value={oLat} onChange={(e) => setOLat(e.target.value)} placeholder="Contoh: -7.641234" />
                      </div>
                      <div>
                        <Label>Longitude GPS</Label>
                        <Input value={oLng} onChange={(e) => setOLng(e.target.value)} placeholder="Contoh: 112.906123" />
                      </div>
                    </div>

                    <div>
                      <Label>Radius Absensi (Meter)</Label>
                      <Input type="number" value={oRadius} onChange={(e) => setORadius(e.target.value)} placeholder="Contoh: 100" />
                    </div>

                    <Button className="w-full h-10 gradient-primary text-primary-foreground hover-lift mt-2">
                      <Plus className="mr-2 h-4 w-4" />Tambah Outlet
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* TABLE */}
            <div className="min-w-0 lg:col-span-2">
              <Card className="glass border-0 shadow-card">
                <CardHeader><CardTitle>Daftar Outlet</CardTitle></CardHeader>
                <CardContent>

                  <div className="w-full overflow-hidden rounded-xl border">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Lokasi / Koordinat GPS</TableHead>
                            <TableHead className="text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {outletPg.paged.map((o) => {
                            const parsed = parseLokasi(o.lokasi);
                            return (
                              <TableRow key={o.id}>
                                <TableCell className="font-semibold">{o.nama}</TableCell>
                                <TableCell className="text-left">
                                  <div className="text-sm font-medium">{parsed.alamat || "-"}</div>
                                  {parsed.lat && parsed.lng && (
                                    <div className="text-[10px] text-primary font-mono mt-0.5">
                                      GPS: {parsed.lat}, {parsed.lng} (Radius: {parsed.rad}m)
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center gap-1">
                                    <EditOutletDialog outlet={o} />
                                    <Button size="icon" variant="ghost" onClick={() => {
                                      if (confirm(`Hapus outlet ${o.nama}?`)) db.deleteOutlet(o.id);
                                    }}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
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

          </div>
        </TabsContent>

        {/* ================= PRODUK ================= */}
        <TabsContent value="produk">
          <div className="grid gap-6 lg:grid-cols-3">

            <div className="min-w-0">
              <Card>
                <CardHeader><CardTitle>Tambah Produk</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!pNama || pHarga <= 0) return;
                      db.addProduk({ nama: pNama, harga: pHarga, satuan: pSatuan });
                      setPNama("");
                      setPHarga(0);
                      toast.success("Produk ditambahkan");
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <Label>Nama Produk</Label>
                      <Input value={pNama} onChange={(e) => setPNama(e.target.value)} />
                    </div>

                    <div>
                      <Label>Harga</Label>
                      <Input type="number" value={pHarga} onChange={(e) => setPHarga(Number(e.target.value))} />
                    </div>

                    <div>
                      <Label>Satuan</Label>
                      <Input value={pSatuan} onChange={(e) => setPSatuan(e.target.value)} />
                    </div>

                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />Tambah
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="min-w-0 lg:col-span-2">
              <Card>
                <CardHeader><CardTitle>Daftar Produk</CardTitle></CardHeader>
                <CardContent>

                  <div className="w-full overflow-hidden rounded-xl border">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead className="text-center">Harga</TableHead>
                            <TableHead className="text-center">Satuan</TableHead>
                            <TableHead className="text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {produkPg.paged.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>{p.nama}</TableCell>
                              <TableCell className="text-center">{rupiah(p.harga)}</TableCell>
                              <TableCell className="text-center">{p.satuan}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <EditProdukDialog produk={p} />
                                  <Button size="icon" variant="ghost" onClick={() => db.deleteProduk(p.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <TablePagination 
                    page={produkPg.page}
                    totalPages={produkPg.totalPages}
                    total={produkPg.total}
                    pageSize={produkPg.pageSize}
                    onChange={produkPg.setPage}
                  />
                </CardContent>
              </Card>
            </div>

          </div>
        </TabsContent>

        {/* ================= BAHAN BAKU ================= */}
        <TabsContent value="bahan">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* FORM */}
            <div className="min-w-0">
              <Card className="glass border-0 shadow-card">
                <CardHeader><CardTitle>Tambah Bahan Baku</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!bKode || !bNama) return toast.error("Lengkapi kode dan nama bahan!");
                      db.addBahan({
                        kode: bKode,
                        nama: bNama,
                        satuan: bSatuan,
                        stokMin: bStokMin,
                        stokAwal: bStokAwal,
                        hargaBeli: bHargaBeli
                      });
                      setBKode("");
                      setBNama("");
                      setBSatuan("sachet");
                      setBStokMin(0);
                      setBStokAwal(0);
                      setBHargaBeli(0);
                      toast.success("Bahan baku ditambahkan");
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <Label>Kode Bahan</Label>
                      <Input value={bKode} onChange={(e) => setBKode(e.target.value)} placeholder="Contoh: BRS01" />
                    </div>

                    <div>
                      <Label>Nama Bahan Baku</Label>
                      <Input value={bNama} onChange={(e) => setBNama(e.target.value)} placeholder="Contoh: BERAS" />
                    </div>

                    <div>
                      <Label>Satuan</Label>
                      <Input value={bSatuan} onChange={(e) => setBSatuan(e.target.value)} placeholder="Contoh: sachet, Pack, biji" />
                    </div>

                    <div>
                      <Label>Stok Minimum</Label>
                      <Input type="number" value={bStokMin} onChange={(e) => setBStokMin(Number(e.target.value))} />
                    </div>

                    <div>
                      <Label>Stok Awal</Label>
                      <Input type="number" value={bStokAwal} onChange={(e) => setBStokAwal(Number(e.target.value))} />
                    </div>

                    <div>
                      <Label>Harga Beli (Rp)</Label>
                      <Input type="number" value={bHargaBeli} onChange={(e) => setBHargaBeli(Number(e.target.value))} />
                    </div>

                    <Button className="w-full h-10 gradient-primary text-primary-foreground hover-lift mt-2">
                      <Plus className="mr-2 h-4 w-4" />Tambah Bahan Baku
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* TABLE */}
            <div className="min-w-0 lg:col-span-2">
              <Card className="glass border-0 shadow-card">
                <CardHeader><CardTitle>Daftar Bahan Baku</CardTitle></CardHeader>
                <CardContent>

                  <div className="w-full overflow-hidden rounded-xl border">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Kode</TableHead>
                            <TableHead>Nama</TableHead>
                            <TableHead>Satuan</TableHead>
                            <TableHead className="text-right">Stok Min</TableHead>
                            <TableHead className="text-right">Stok Awal</TableHead>
                            <TableHead className="text-right">Harga Beli</TableHead>
                            <TableHead className="text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {bahanPg.paged.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell className="font-mono font-bold text-xs">{b.kode}</TableCell>
                              <TableCell className="font-semibold">{b.nama}</TableCell>
                              <TableCell>{b.satuan}</TableCell>
                              <TableCell className="text-right font-semibold">{b.stokMin}</TableCell>
                              <TableCell className="text-right font-semibold">{b.stokAwal}</TableCell>
                              <TableCell className="text-right font-semibold text-primary">{rupiah(b.hargaBeli)}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <EditBahanDialog bahan={b} />
                                  <Button size="icon" variant="ghost" onClick={() => {
                                    if (confirm(`Hapus bahan baku ${b.nama}?`)) db.deleteBahan(b.id);
                                  }}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
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
            </div>

          </div>
        </TabsContent>

        {/* ================= COA ================= */}
        <TabsContent value="coa">
          <Card>
            <CardHeader><CardTitle>Chart of Accounts</CardTitle></CardHeader>
            <CardContent>

              <div className="w-full overflow-hidden rounded-xl border">
                <div className="w-full overflow-x-auto">
                  <Table className="w-full text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Nama</TableHead>
                        <TableHead className="text-center">Tipe</TableHead>
                        <TableHead className="text-center">Kategori</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {coaPg.paged.map((a) => (
                        <TableRow key={a.kode}>
                          <TableCell>{a.kode}</TableCell>
                          <TableCell>{a.nama}</TableCell>
                          <TableCell className="text-center">{a.tipe}</TableCell>
                          <TableCell className="text-center">{a.kategori}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <TablePagination 
                page={coaPg.page}
                totalPages={coaPg.totalPages}
                total={coaPg.total}
                pageSize={coaPg.pageSize}
                onChange={coaPg.setPage}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= KARYAWAN ================= */}
        <TabsContent value="karyawan">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* FORM */}
            <div className="min-w-0">
              <Card>
                <CardHeader><CardTitle>Tambah Karyawan</CardTitle></CardHeader>
                <CardContent>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!kNama) return toast.error("Nama karyawan diperlukan");
                      db.addKaryawan({
                        nama: kNama,
                        posisi: kPosisi,
                        outletId: kOutletId === "none" ? undefined : kOutletId,
                        gajiPokok: kGajiPokok,
                        bonusOmset: kBonusOmset,
                        bonusUlasan: kBonusUlasan
                      });
                      setKNama("");
                      setKGajiPokok(17500);
                      setKBonusOmset(0);
                      setKBonusUlasan(0);
                      toast.success("Karyawan berhasil ditambahkan");
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <Label>Nama Karyawan</Label>
                      <Input value={kNama} onChange={(e) => setKNama(e.target.value)} placeholder="Contoh: Budi" />
                    </div>

                    <div>
                      <Label>Posisi / Jabatan</Label>
                      <Select value={kPosisi} onValueChange={setKPosisi}>
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
                      <Select value={kOutletId} onValueChange={setKOutletId}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tanpa Outlet (Pusat)</SelectItem>
                          {outlets.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Gaji Pokok (per Hari)</Label>
                      <Input type="number" value={kGajiPokok} onChange={(e) => setKGajiPokok(Number(e.target.value))} />
                    </div>

                    <div>
                      <Label>Bonus Pencapaian Omset (Bulanan)</Label>
                      <Input type="number" value={kBonusOmset} onChange={(e) => setKBonusOmset(Number(e.target.value))} />
                    </div>

                    <div>
                      <Label>Bonus Ulasan Bintang 5 (Bulanan)</Label>
                      <Input type="number" value={kBonusUlasan} onChange={(e) => setKBonusUlasan(Number(e.target.value))} />
                    </div>

                    <Button className="w-full">
                      <Plus className="mr-2 h-4 w-4" />Tambah
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* TABLE */}
            <div className="min-w-0 lg:col-span-2">
              <Card>
                <CardHeader><CardTitle>Daftar Karyawan</CardTitle></CardHeader>
                <CardContent>
                  <div className="w-full overflow-hidden rounded-xl border">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead>Posisi</TableHead>
                            <TableHead>Outlet</TableHead>
                            <TableHead className="text-right">Gaji Pokok</TableHead>
                            <TableHead className="text-right">Bonus Omset</TableHead>
                            <TableHead className="text-right">Bonus Ulasan</TableHead>
                            <TableHead className="text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {karyawanPg.paged.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                                Belum ada karyawan terdaftar
                              </TableCell>
                            </TableRow>
                          )}
                          {karyawanPg.paged.map((k) => {
                            const o = outlets.find((x) => x.id === k.outletId);
                            return (
                              <TableRow key={k.id}>
                                <TableCell className="font-medium">{k.nama}</TableCell>
                                <TableCell>{k.posisi}</TableCell>
                                <TableCell className="text-muted-foreground">{o?.nama ?? "Pusat"}</TableCell>
                                <TableCell className="text-right">{rupiah(k.gajiPokok)}</TableCell>
                                <TableCell className="text-right text-success">{rupiah(k.bonusOmset)}</TableCell>
                                <TableCell className="text-right text-success">{rupiah(k.bonusUlasan)}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center gap-1">
                                    <EditKaryawanDialog karyawan={k} outlets={outlets} />
                                    <Button size="icon" variant="ghost" onClick={() => {
                                      if (confirm(`Hapus karyawan ${k.nama}?`)) {
                                        db.deleteKaryawan(k.id);
                                        toast.success("Karyawan dihapus");
                                      }
                                    }}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <TablePagination 
                    page={karyawanPg.page}
                    totalPages={karyawanPg.totalPages}
                    total={karyawanPg.total}
                    pageSize={karyawanPg.pageSize}
                    onChange={karyawanPg.setPage}
                  />
                </CardContent>
              </Card>
            </div>

          </div>
        </TabsContent>

        {/* ================= PENGGUNA ================= */}
        <TabsContent value="users">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* FORM */}
            <div className="min-w-0">
              <Card>
                <CardHeader><CardTitle>Tambah Pengguna</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <form onSubmit={handleAddUser} className="space-y-3">
                    <div>
                      <Label>Username</Label>
                      <Input
                        value={uUsername}
                        onChange={(e) => setUUsername(e.target.value.toLowerCase().trim())}
                        placeholder="contoh: budi-outlet"
                      />
                    </div>
                    <div>
                      <Label>Password</Label>
                      <Input
                        type="text"
                        value={uPassword}
                        onChange={(e) => setUPassword(e.target.value)}
                        placeholder="Masukkan password"
                      />
                    </div>
                    <div>
                      <Label>Nama Lengkap</Label>
                      <Input
                        value={uNama}
                        onChange={(e) => setUNama(e.target.value)}
                        placeholder="Nama lengkap pemilik akun"
                      />
                    </div>
                    <div>
                      <Label>Peran / Role</Label>
                      <Select value={uRole} onValueChange={(v) => setURole(v as "admin" | "outlet")}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrator</SelectItem>
                          <SelectItem value="outlet">Outlet (Cabang)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {uRole === "outlet" && (
                      <div>
                        <Label>Penugasan Outlet</Label>
                        <Select value={uOutletId} onValueChange={setUOutletId}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Tanpa Outlet</SelectItem>
                            {outlets.map((o) => (
                              <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Button type="submit" className="w-full gradient-primary text-primary-foreground hover-lift">
                      <Plus className="mr-1 h-4 w-4" /> Tambah User
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* TABLE */}
            <div className="lg:col-span-2 min-w-0">
              <Card>
                <CardHeader>
                  <CardTitle>Daftar Akun Pengguna</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border overflow-hidden">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Nama Lengkap</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Password</TableHead>
                            <TableHead>Outlet</TableHead>
                            <TableHead className="w-[100px] text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                Belum ada akun pengguna
                              </TableCell>
                            </TableRow>
                          )}
                          {usersPg.paged.map((u: any) => {
                            const o = outlets.find((x: any) => x.id === u.outletId);
                            return (
                              <TableRow key={u.username}>
                                <TableCell className="font-semibold">{u.username}</TableCell>
                                <TableCell>{u.nama}</TableCell>
                                <TableCell className="capitalize">{u.role}</TableCell>
                                <TableCell className="font-mono text-xs">{u.password}</TableCell>
                                <TableCell className="text-muted-foreground">{o?.nama ?? "-"}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center gap-1">
                                    <EditUserDialog userAccount={u} outlets={outlets} />
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={u.username === "admin" || u.username === "khazana"}
                                      onClick={() => {
                                        if (confirm(`Hapus akun ${u.username}?`)) {
                                          db.deleteUser(u.username);
                                          toast.success("Akun dihapus");
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <TablePagination 
                    page={usersPg.page}
                    totalPages={usersPg.totalPages}
                    total={usersPg.total}
                    pageSize={usersPg.pageSize}
                    onChange={usersPg.setPage}
                  />
                </CardContent>
              </Card>
            </div>

          </div>
        </TabsContent>

        {/* ================= PENGATURAN GLOBAL ================= */}
        <TabsContent value="pengaturan">
          <form onSubmit={handleSaveSettings} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* CARD 1: GRAMASI */}
              <Card className="glass border-0 shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-primary" />
                    Konversi Gramasi (Resep per Cup)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-amber-600 border-b pb-1">Varian Bubur</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Beras (gr)</Label>
                        <Input type="number" step="any" value={sBerasBubur} onChange={(e) => setSBerasBubur(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Air (ml)</Label>
                        <Input type="number" step="any" value={sAirBubur} onChange={(e) => setSAirBubur(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Daging (gr)</Label>
                        <Input type="number" step="any" value={sDagingBubur} onChange={(e) => setSDagingBubur(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Hijau (gr)</Label>
                        <Input type="number" step="any" value={sSayurHijauBubur} onChange={(e) => setSSayurHijauBubur(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Brokoli (gr)</Label>
                        <Input type="number" step="any" value={sSayurBrokoliBubur} onChange={(e) => setSSayurBrokoliBubur(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Putih (gr)</Label>
                        <Input type="number" step="any" value={sSayurPutihBubur} onChange={(e) => setSSayurPutihBubur(Number(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-bold text-blue-600 border-b pb-1">Varian Nasi Tim</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Beras (gr)</Label>
                        <Input type="number" step="any" value={sBerasTim} onChange={(e) => setSBerasTim(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Air (ml)</Label>
                        <Input type="number" step="any" value={sAirTim} onChange={(e) => setSAirTim(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Daging (gr)</Label>
                        <Input type="number" step="any" value={sDagingTim} onChange={(e) => setSDagingTim(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Hijau (gr)</Label>
                        <Input type="number" step="any" value={sSayurHijauTim} onChange={(e) => setSSayurHijauTim(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Brokoli (gr)</Label>
                        <Input type="number" step="any" value={sSayurBrokoliTim} onChange={(e) => setSSayurBrokoliTim(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">S. Putih (gr)</Label>
                        <Input type="number" step="any" value={sSayurPutihTim} onChange={(e) => setSSayurPutihTim(Number(e.target.value))} />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <h3 className="text-sm font-bold text-muted-foreground border-b pb-1">Menu Lainnya (per Cup)</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Oatmeal (gr)</Label>
                        <Input type="number" step="any" value={sOatmealCup} onChange={(e) => setSOatmealCup(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Puding (gr)</Label>
                        <Input type="number" step="any" value={sPudingCup} onChange={(e) => setSPudingCup(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label className="text-xs">Abon (gr)</Label>
                        <Input type="number" step="any" value={sAbonCup} onChange={(e) => setSAbonCup(Number(e.target.value))} />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CARD 2: JAM & LAINNYA */}
              <Card className="glass border-0 shadow-card self-start">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Pengaturan Jam Operasional & Absensi
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Jam Masuk Standar</Label>
                      <Input type="text" value={sJamMasukStandar} onChange={(e) => setSJamMasukStandar(e.target.value)} placeholder="Contoh: 07:30" />
                    </div>
                    <div>
                      <Label>Jam Pulang Standar</Label>
                      <Input type="text" value={sJamPulangStandar} onChange={(e) => setSJamPulangStandar(e.target.value)} placeholder="Contoh: 15:00" />
                    </div>
                  </div>

                  <div>
                    <Label>Tarif Lembur per Jam (Rp)</Label>
                    <Input type="number" value={sOvertimeRate} onChange={(e) => setSOvertimeRate(Number(e.target.value))} />
                  </div>

                  <div>
                    <Label>Tunjangan Harian Karyawan (Rp)</Label>
                    <Input type="number" value={sTunjanganHarian} onChange={(e) => setSTunjanganHarian(Number(e.target.value))} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Button type="submit" className="w-full h-11 gradient-primary text-primary-foreground hover-lift text-sm font-semibold shadow-md">
              Simpan Semua Pengaturan
            </Button>
          </form>
        </TabsContent>

      </Tabs>
    </div>

      {/* ===== MOBILE ACCORDION VIEW ===== */}
      <div className="block md:hidden space-y-3">
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
                {/* FORM */}
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

                {/* TABLE */}
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
                            {parsed.lat && parsed.lng && (
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
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!pNama || pHarga <= 0) return;
                        db.addProduk({ nama: pNama, harga: pHarga, satuan: pSatuan });
                        setPNama("");
                        setPHarga(0);
                        toast.success("Produk ditambahkan");
                      }}
                      className="space-y-2"
                    >
                      <Input value={pNama} onChange={(e) => setPNama(e.target.value)} placeholder="Nama Produk" />
                      <Input type="number" value={pHarga} onChange={(e) => setPHarga(Number(e.target.value))} placeholder="Harga" />
                      <Input value={pSatuan} onChange={(e) => setPSatuan(e.target.value)} placeholder="Satuan" />
                      <Button className="w-full h-9 text-xs">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah
                      </Button>
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
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => db.deleteProduk(p.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {produkPg.paged.length === 0 && (
                        <div className="text-center text-muted-foreground py-6 text-sm">Belum ada produk</div>
                      )}
                    </div>
                    <TablePagination 
                      page={produkPg.page}
                      totalPages={produkPg.totalPages}
                      total={produkPg.total}
                      pageSize={produkPg.pageSize}
                      onChange={produkPg.setPage}
                    />
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
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!bKode || !bNama) return toast.error("Lengkapi kode dan nama bahan!");
                        db.addBahan({ kode: bKode, nama: bNama, satuan: bSatuan, stokMin: bStokMin, stokAwal: bStokAwal, hargaBeli: bHargaBeli });
                        setBKode(""); setBNama(""); setBSatuan("sachet"); setBStokMin(0); setBStokAwal(0); setBHargaBeli(0);
                        toast.success("Bahan baku ditambahkan");
                      }}
                      className="space-y-2"
                    >
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
                      <Button className="w-full h-9 text-xs gradient-primary text-primary-foreground">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah Bahan Baku
                      </Button>
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
                            <div>
                              <span className="font-mono font-bold text-xs text-primary">{b.kode}</span>
                              <span className="font-semibold ml-2">{b.nama}</span>
                            </div>
                            <div className="flex gap-1">
                              <EditBahanDialog bahan={b} />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                if (confirm(`Hapus ${b.nama}?`)) db.deleteBahan(b.id);
                              }}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span>Satuan: {b.satuan}</span>
                            <span>Min: {b.stokMin}</span>
                            <span>Awal: {b.stokAwal}</span>
                            <span className="text-primary font-semibold">{rupiah(b.hargaBeli)}</span>
                          </div>
                        </div>
                      ))}
                      {bahanPg.paged.length === 0 && (
                        <div className="text-center text-muted-foreground py-6 text-sm">Belum ada bahan baku</div>
                      )}
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
                    {coaPg.paged.length === 0 && (
                      <div className="text-center text-muted-foreground py-6 text-sm">Belum ada COA</div>
                    )}
                  </div>
                  <TablePagination 
                    page={coaPg.page}
                    totalPages={coaPg.totalPages}
                    total={coaPg.total}
                    pageSize={coaPg.pageSize}
                    onChange={coaPg.setPage}
                  />
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
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-2">
                    <h3 className="text-sm font-bold">Tambah Karyawan</h3>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!kNama) return toast.error("Nama karyawan diperlukan");
                        db.addKaryawan({ nama: kNama, posisi: kPosisi, outletId: kOutletId === "none" ? undefined : kOutletId, gajiPokok: kGajiPokok, bonusOmset: kBonusOmset, bonusUlasan: kBonusUlasan });
                        setKNama(""); setKGajiPokok(17500); setKBonusOmset(0); setKBonusUlasan(0);
                        toast.success("Karyawan ditambahkan");
                      }}
                      className="space-y-2"
                    >
                      <Input value={kNama} onChange={(e) => setKNama(e.target.value)} placeholder="Nama Karyawan" />
                      <Select value={kPosisi} onValueChange={setKPosisi}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Kasir">Kasir</SelectItem>
                          <SelectItem value="Produksi">Produksi</SelectItem>
                          <SelectItem value="Helper">Helper</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={kOutletId} onValueChange={setKOutletId}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Tanpa Outlet (Pusat)</SelectItem>
                          {outlets.map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-3 gap-2">
                        <Input type="number" value={kGajiPokok} onChange={(e) => setKGajiPokok(Number(e.target.value))} placeholder="Gaji/hr" />
                        <Input type="number" value={kBonusOmset} onChange={(e) => setKBonusOmset(Number(e.target.value))} placeholder="Bonus Omset" />
                        <Input type="number" value={kBonusUlasan} onChange={(e) => setKBonusUlasan(Number(e.target.value))} placeholder="Bonus Ulasan" />
                      </div>
                      <Button className="w-full h-9 text-xs">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah
                      </Button>
                    </form>
                  </CardContent>
                </Card>

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
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                                  if (confirm(`Hapus ${k.nama}?`)) db.deleteKaryawan(k.id);
                                }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                              <span>{k.posisi}</span>
                              <span>•</span>
                              <span>{o?.nama ?? "Pusat"}</span>
                              <span>•</span>
                              <span className="font-semibold">{rupiah(k.gajiPokok)}/hr</span>
                            </div>
                          </div>
                        );
                      })}
                      {karyawanPg.paged.length === 0 && (
                        <div className="text-center text-muted-foreground py-6 text-sm">Belum ada karyawan</div>
                      )}
                    </div>
                    <TablePagination 
                      page={karyawanPg.page}
                      totalPages={karyawanPg.totalPages}
                      total={karyawanPg.total}
                      pageSize={karyawanPg.pageSize}
                      onChange={karyawanPg.setPage}
                    />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* PENGGUNA */}
          <AccordionItem value="pengguna" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Pengguna</div>
                  <div className="text-[11px] text-muted-foreground">{users.length} akun</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid gap-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-2">
                    <h3 className="text-sm font-bold">Tambah Pengguna</h3>
                    <form onSubmit={handleAddUser} className="space-y-2">
                      <Input value={uUsername} onChange={(e) => setUUsername(e.target.value.toLowerCase().trim())} placeholder="Username" />
                      <Input type="text" value={uPassword} onChange={(e) => setUPassword(e.target.value)} placeholder="Password" />
                      <Input value={uNama} onChange={(e) => setUNama(e.target.value)} placeholder="Nama Lengkap" />
                      <Select value={uRole} onValueChange={(v) => setURole(v as "admin" | "outlet")}>
                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrator</SelectItem>
                          <SelectItem value="outlet">Outlet (Cabang)</SelectItem>
                        </SelectContent>
                      </Select>
                      {uRole === "outlet" && (
                        <Select value={uOutletId} onValueChange={setUOutletId}>
                          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Tanpa Outlet</SelectItem>
                            {outlets.map((o) => (
                              <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Button type="submit" className="w-full h-9 text-xs gradient-primary text-primary-foreground">
                        <Plus className="mr-1.5 h-3.5 w-3.5" />Tambah User
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                <Card className="border shadow-sm">
                  <CardContent className="p-3">
                    <h3 className="text-sm font-bold mb-2 px-1">Daftar Akun</h3>
                    <div className="space-y-2">
                      {usersPg.paged.map((u: any) => {
                        const o = outlets.find((x: any) => x.id === u.outletId);
                        return (
                          <div key={u.username} className="rounded-lg border p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-semibold">{u.username}</span>
                                <span className="text-xs text-muted-foreground ml-2">{u.nama}</span>
                              </div>
                              <div className="flex gap-1">
                                <EditUserDialog userAccount={u} outlets={outlets} />
                                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={u.username === "admin" || u.username === "khazana"}
                                  onClick={() => {
                                    if (confirm(`Hapus akun ${u.username}?`)) { db.deleteUser(u.username); toast.success("Akun dihapus"); }
                                  }}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="capitalize bg-muted px-1.5 py-0.5 rounded">{u.role}</span>
                              <span>PW: {u.password}</span>
                              <span>{o?.nama ?? "-"}</span>
                            </div>
                          </div>
                        );
                      })}
                      {usersPg.paged.length === 0 && (
                        <div className="text-center text-muted-foreground py-6 text-sm">Belum ada akun</div>
                      )}
                    </div>
                    <TablePagination 
                      page={usersPg.page}
                      totalPages={usersPg.totalPages}
                      total={usersPg.total}
                      pageSize={usersPg.pageSize}
                      onChange={usersPg.setPage}
                    />
                  </CardContent>
                </Card>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* PENGATURAN */}
          <AccordionItem value="pengaturan" className="rounded-xl border bg-card overflow-hidden">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/40">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-sm">Pengaturan</div>
                  <div className="text-[11px] text-muted-foreground">Gramasi & Absensi</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Sliders className="h-4 w-4 text-primary" /> Konversi Gramasi
                    </h3>
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
                  </CardContent>
                </Card>

                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-2">
                      <Settings className="h-4 w-4 text-primary" /> Jam & Absensi
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px]">Jam Masuk</Label><Input type="text" value={sJamMasukStandar} onChange={(e) => setSJamMasukStandar(e.target.value)} /></div>
                      <div><Label className="text-[10px]">Jam Pulang</Label><Input type="text" value={sJamPulangStandar} onChange={(e) => setSJamPulangStandar(e.target.value)} /></div>
                    </div>
                    <div><Label className="text-[10px]">Lembur/Jam</Label><Input type="number" value={sOvertimeRate} onChange={(e) => setSOvertimeRate(Number(e.target.value))} /></div>
                    <div><Label className="text-[10px]">Tunjangan Harian</Label><Input type="number" value={sTunjanganHarian} onChange={(e) => setSTunjanganHarian(Number(e.target.value))} /></div>
                    <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground text-xs">Simpan Semua Pengaturan</Button>
                  </CardContent>
                </Card>
              </form>
            </AccordionContent>
          </AccordionItem>

        </Accordion>
      </div>
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
              db.updateBahan(bahan.id, { kode, nama, satuan, stokMin, stokAwal, hargaBeli });
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

function EditKaryawanDialog({ karyawan, outlets }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(karyawan.nama);
  const [posisi, setPosisi] = useState(karyawan.posisi);
  const [outletId, setOutletId] = useState(karyawan.outletId ?? "none");
  const [gajiPokok, setGajiPokok] = useState(karyawan.gajiPokok);
  const [bonusOmset, setBonusOmset] = useState(karyawan.bonusOmset ?? 0);
  const [bonusUlasan, setBonusUlasan] = useState(karyawan.bonusUlasan ?? 0);

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4 text-primary" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Data Karyawan</DialogTitle></DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              db.updateKaryawan(karyawan.id, {
                nama,
                posisi,
                outletId: outletId === "none" ? undefined : outletId,
                gajiPokok,
                bonusOmset,
                bonusUlasan
              });
              toast.success("Data karyawan diperbarui");
              setOpen(false);
            }}
            className="space-y-3"
          >
            <div>
              <Label>Nama Karyawan</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} />
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
                  <SelectItem value="none">Tanpa Outlet (Pusat)</SelectItem>
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

            <div>
              <Label>Bonus Pencapaian Omset (Bulanan)</Label>
              <Input type="number" value={bonusOmset} onChange={(e) => setBonusOmset(Number(e.target.value))} />
            </div>

            <div>
              <Label>Bonus Ulasan Bintang 5 (Bulanan)</Label>
              <Input type="number" value={bonusUlasan} onChange={(e) => setBonusUlasan(Number(e.target.value))} />
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
              <Select value={role} onValueChange={(v) => setRole(v as "admin" | "outlet")}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrator</SelectItem>
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
                    <SelectItem value="none">Tanpa Outlet</SelectItem>
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