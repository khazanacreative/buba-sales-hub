import { useState } from "react";
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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";

import { db, useDB } from "@/lib/store";
import { rupiah } from "@/lib/format";

import { Plus, Trash2, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";

import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

export default function MasterData() {
  const { outlets = [], produk = [], coa = [], karyawan = [] } = useDB();

  const outletPg = usePagination(outlets, 10);
  const produkPg = usePagination(produk, 10);
  const coaPg = usePagination(coa, 10);
  const karyawanPg = usePagination(karyawan, 10);

  const [oNama, setONama] = useState("");
  const [oLokasi, setOLokasi] = useState("");

  const [pNama, setPNama] = useState("");
  const [pHarga, setPHarga] = useState(0);
  const [pSatuan, setPSatuan] = useState("cup");

  // Karyawan form state
  const [kNama, setKNama] = useState("");
  const [kPosisi, setKPosisi] = useState("Kasir");
  const [kOutletId, setKOutletId] = useState(outlets[0]?.id ?? "none");
  const [kGajiPokok, setKGajiPokok] = useState(17500);
  const [kBonusOmset, setKBonusOmset] = useState(0);
  const [kBonusUlasan, setKBonusUlasan] = useState(0);

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">

      {/* HEADER */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Master Data</h1>
          <p className="text-muted-foreground">
            Kelola outlet, produk, COA, dan karyawan
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

      <Tabs defaultValue="outlet">
        <TabsList className="glass">
          <TabsTrigger value="outlet">Outlet ({outlets.length})</TabsTrigger>
          <TabsTrigger value="produk">Produk ({produk.length})</TabsTrigger>
          <TabsTrigger value="coa">COA ({coa.length})</TabsTrigger>
          <TabsTrigger value="karyawan">Karyawan ({karyawan.length})</TabsTrigger>
        </TabsList>

        {/* ================= OUTLET ================= */}
        <TabsContent value="outlet">
          <div className="grid gap-6 lg:grid-cols-3">

            {/* FORM */}
            <div className="min-w-0">
              <Card>
                <CardHeader><CardTitle>Tambah Outlet</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!oNama) return;
                      db.addOutlet({ nama: oNama, lokasi: oLokasi });
                      setONama("");
                      setOLokasi("");
                      toast.success("Outlet ditambahkan");
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <Label>Nama Outlet</Label>
                      <Input value={oNama} onChange={(e) => setONama(e.target.value)} />
                    </div>

                    <div>
                      <Label>Lokasi</Label>
                      <Input value={oLokasi} onChange={(e) => setOLokasi(e.target.value)} />
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
                <CardHeader><CardTitle>Daftar Outlet</CardTitle></CardHeader>
                <CardContent>

                  <div className="w-full overflow-hidden rounded-xl border">
                    <div className="w-full overflow-x-auto">
                      <Table className="w-full text-sm">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Nama</TableHead>
                            <TableHead className="text-center">Lokasi</TableHead>
                            <TableHead className="text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>

                        <TableBody>
                          {outletPg.paged.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell>{o.nama}</TableCell>
                              <TableCell className="text-center">{o.lokasi}</TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center gap-1">
                                  <EditOutletDialog outlet={o} />
                                  <Button size="icon" variant="ghost" onClick={() => db.deleteOutlet(o.id)}>
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

      </Tabs>
    </div>
  );
}

/* ================= EDIT DIALOGS ================= */

function EditOutletDialog({ outlet }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState(outlet.nama);
  const [lokasi, setLokasi] = useState(outlet.lokasi);

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
              db.updateOutlet(outlet.id, { nama, lokasi });
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
              <Label>Lokasi</Label>
              <Input value={lokasi} onChange={(e) => setLokasi(e.target.value)} />
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