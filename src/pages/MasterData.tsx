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

import { db, useDB } from "@/lib/store";
import { rupiah } from "@/lib/format";

import { Plus, Trash2, RotateCcw, Pencil } from "lucide-react";
import { toast } from "sonner";

import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";

export default function MasterData() {
  const { outlets = [], produk = [], coa = [] } = useDB();

  const outletPg = usePagination(outlets, 10);
  const produkPg = usePagination(produk, 10);
  const coaPg = usePagination(coa, 10);

  const [oNama, setONama] = useState("");
  const [oLokasi, setOLokasi] = useState("");

  const [pNama, setPNama] = useState("");
  const [pHarga, setPHarga] = useState(0);
  const [pSatuan, setPSatuan] = useState("cup");

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">

      {/* HEADER */}
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Master Data</h1>
          <p className="text-muted-foreground">
            Kelola outlet, produk, dan COA
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

      </Tabs>
    </div>
  );
}

/* ================= EDIT ================= */

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
            <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            <Input value={lokasi} onChange={(e) => setLokasi(e.target.value)} />

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
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
            <Input value={nama} onChange={(e) => setNama(e.target.value)} />
            <Input type="number" value={harga} onChange={(e) => setHarga(Number(e.target.value))} />
            <Input value={satuan} onChange={(e) => setSatuan(e.target.value)} />

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}