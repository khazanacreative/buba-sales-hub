import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useDB, GRAM_EXCLUDED_BAHAN, useHistoricalLoading } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { rupiah, todayISO, DateRange, inRange, nilaiBahan } from "@/lib/format";
import { AkunKategori } from "@/lib/types";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { DateInput } from "@/components/DateInput";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import { useAutoHistoricalFetch } from "@/hooks/useAutoHistoricalFetch";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { formatDecimal } from "@/lib/produksi-utils";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

const KATEGORI: AkunKategori[] = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"];

export default function Keuangan() {
  const { user } = useAuth();
  const { jurnal, penjualan, coa, bahan, stokMov } = useDB();
  const histLoading = useHistoricalLoading();
  const [tanggal, setTanggal] = useState(todayISO());
  const [keterangan, setKeterangan] = useState("");
  const [kodeAkun, setKodeAkun] = useState(coa[0]?.kode ?? "");
  const [tipe, setTipe] = useState<"Debit" | "Kredit">("Debit");
  const [jumlah, setJumlah] = useState("");
  const [range, setRange] = useState<DateRange>({});

  // Auto-fetch historical data with debounce + caching
  useAutoHistoricalFetch(range);

  const akunObj = coa.find((a) => a.kode === kodeAkun);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const jml = Number(jumlah);
    if (!akunObj || !jumlah || !(jml > 0)) return toast.error("Lengkapi data");
    db.addJurnal({
      tanggal,
      keterangan,
      kodeAkun: akunObj.kode,
      akun: akunObj.nama,
      tipe,
      jumlah: jml,
      kategori: akunObj.kategori,
    });
    toast.success("Jurnal ditambahkan");
    setKeterangan("");
    setJumlah("");
  };

  const filteredJurnal = useMemo(
    () => jurnal.filter((j) => inRange(j.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [jurnal, range]
  );

  const filteredPenjualan = useMemo(
    () => penjualan.filter((p) => inRange(p.tanggal, range)),
    [penjualan, range]
  );

  const filteredStokMov = useMemo(
    () =>
      stokMov
        .filter((m) => inRange(m.tanggal, range))
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [stokMov, range]
  );

  // Stok tersimpan dalam GRAM untuk bahan ber-konversiGram (lihat StokGudang: qtyGram = qty * kg),
  // dan dalam satuan utuh untuk bahan tanpa konversi / GRAM_EXCLUDED_BAHAN (puding, oat).
  // Konversi balik ke satuan utuh (pcs/sachet/pack) agar tampilan qty konsisten.
  const stokQtyUnit = (mov: any) => {
    const item = bahan.find((b) => b.id === mov.bahanId);
    if (!item) return mov.qty;
    const konv = item.konversiGram && item.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(item.id) ? item.konversiGram : null;
    return konv ? mov.qty / konv : mov.qty;
  };

  // Nilai mutasi stok = qty (gram) × harga per gram = satuan utuh × hargaBeli (per pcs).
  const stokMovValue = (mov: any) => {
    const item = bahan.find((b) => b.id === mov.bahanId);
    if (!item) return 0;
    return nilaiBahan(mov.qty, item.hargaBeli, GRAM_EXCLUDED_BAHAN.has(item.id) ? null : item.konversiGram);
  };

  const totalStokIn = filteredStokMov
    .filter((m) => m.tipe === "IN")
    .reduce((s, m) => s + stokQtyUnit(m), 0);
  const totalStokOut = filteredStokMov
    .filter((m) => m.tipe === "OUT")
    .reduce((s, m) => s + stokQtyUnit(m), 0);
  const totalStokInValue = filteredStokMov
    .filter((m) => m.tipe === "IN")
    .reduce((s, m) => s + stokMovValue(m), 0);
  const totalStokOutValue = filteredStokMov
    .filter((m) => m.tipe === "OUT")
    .reduce((s, m) => s + stokMovValue(m), 0);
  const totalReturInQty = filteredStokMov
    .filter((m) => m.tipe === "IN" && m.keterangan?.toLowerCase().includes("retur"))
    .reduce((s, m) => s + stokQtyUnit(m), 0);
  const totalReturInValue = filteredStokMov
    .filter((m) => m.tipe === "IN" && m.keterangan?.toLowerCase().includes("retur"))
    .reduce((s, m) => s + stokMovValue(m), 0);

  const stokMovPagination = usePagination(filteredStokMov, 10);

  const neracaJurnal = useMemo(() => {
    return jurnal.filter((j) => !range.to || j.tanggal <= range.to);
  }, [jurnal, range.to]);

  const neraca = useMemo(() => {
    const sum = (kat: AkunKategori) =>
      neracaJurnal.filter((j) => j.kategori === kat)
        .reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : -j.jumlah), 0);
    const saldoAkun = (kode: string) =>
      neracaJurnal.filter((j) => j.kodeAkun === kode)
        .reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : -j.jumlah), 0);
    const aset = sum("Aset");
    const kewajiban = -sum("Kewajiban");
    const ekuitas = -sum("Ekuitas");
    return {
      aset,
      kewajiban,
      ekuitas,
      total: kewajiban + ekuitas,
      // Rincian akun utama sesuai alur keuangan: Kas Rupiah/Bank/Persediaan (Aset),
      // Hutang Usaha (Kewajiban — kredit positif).
      kasRupiah: saldoAkun("110000"),
      bank: saldoAkun("120000"),
      persediaan: saldoAkun("140000"),
      hutangUsaha: -saldoAkun("210000"),
    };
  }, [neracaJurnal]);

  const labaRugi = useMemo(() => {
    const pendapatanJurnal = filteredJurnal
      .filter((j) => j.kategori === "Pendapatan")
      .reduce((s, j) => s + (j.tipe === "Kredit" ? j.jumlah : -j.jumlah), 0);
    const beban = filteredJurnal
      .filter((j) => j.kategori === "Beban")
      .reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : -j.jumlah), 0);

    // Rincian beban sesuai alur keuangan (kode akun tetap):
    //   HPP  → 541000, OH → 543000, Gaji → 520001
    const bebanByKode = (kode: string) =>
      filteredJurnal
        .filter((j) => j.kategori === "Beban" && j.kodeAkun === kode)
        .reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : -j.jumlah), 0);
    const hppJurnal = bebanByKode("541000");
    const ohJurnal = bebanByKode("543000");
    const gajiJurnal = bebanByKode("520001");
    const bebanLain = beban - hppJurnal - ohJurnal - gajiJurnal;

    // Detect dates that already have OUT-SALES jurnal (siklus closed)
    const closedDates = new Set(
      filteredJurnal
        .filter((j) => j.ref === "OUT-SALES")
        .map((j) => j.tanggal)
    );

    // Only add penjualan omzet for dates WITHOUT OUT-SALES (not yet closed)
    // This prevents double counting when siklus sudah ditutup
    const penjualanBelumDitutup = filteredPenjualan.filter(
      (p) => !closedDates.has(p.tanggal)
    );
    const totalPenjualanBelumDitutup = penjualanBelumDitutup.reduce(
      (s, p) => s + p.total, 0
    );

    const pendapatan = pendapatanJurnal + totalPenjualanBelumDitutup;
    return {
      pendapatan,
      pendapatanJurnal,
      penjualanOtomatis: totalPenjualanBelumDitutup,
      beban,
      hppJurnal,
      ohJurnal,
      gajiJurnal,
      bebanLain,
      laba: pendapatan - beban,
    };
  }, [filteredJurnal, filteredPenjualan]);

  const totalDebit = filteredJurnal.reduce((s, j) => s + (j.tipe === "Debit" ? j.jumlah : 0), 0);
  const totalKredit = filteredJurnal.reduce((s, j) => s + (j.tipe === "Kredit" ? j.jumlah : 0), 0);

  const onImport = (rows: any[]) => {
    const items = rows
      .map((r) => {
        const tgl = String(r.Tanggal ?? r.tanggal ?? "").slice(0, 10);
        const kode = String(r.Kode ?? r.kode ?? r.KodeAkun ?? "");
        const akun = coa.find((a) => a.kode === kode) ?? coa.find((a) => a.nama.toLowerCase() === String(r.Akun ?? "").toLowerCase());
        const debet = Number(r.Debet ?? r.debet ?? 0);
        const kredit = Number(r.Kredit ?? r.kredit ?? 0);
        if (!tgl || !akun || (debet <= 0 && kredit <= 0)) return null;
        return {
          tanggal: tgl,
          ref: String(r.Ref ?? r.ref ?? ""),
          keterangan: String(r.Keterangan ?? r.keterangan ?? ""),
          kodeAkun: akun.kode,
          akun: akun.nama,
          tipe: (debet > 0 ? "Debit" : "Kredit") as "Debit" | "Kredit",
          jumlah: debet > 0 ? debet : kredit,
          kategori: akun.kategori,
        };
      })
      .filter(Boolean) as any[];
    if (!items.length) return toast.error("Kolom diperlukan: Tanggal, Kode/Akun, Debet/Kredit");
    db.addJurnalBulk(items);
    toast.success(`${items.length} entri jurnal diimport`);
  };

  // Guard: halaman Keuangan hanya boleh diakses admin (Financial/Admin Utama)
  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Keuangan</h1>
          <p className="text-sm text-muted-foreground">Jurnal umum, neraca, dan laporan laba rugi</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          <ImportExcelButton onData={onImport} />
        </div>
      </div>

      {histLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30 rounded-xl px-4 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>Memuat data historis...</span>
        </div>
      )}

      <Tabs defaultValue="jurnal" className="w-full">
        <TabsList className="grid w-full grid-cols-4 gap-0">
          <TabsTrigger value="jurnal" className="rounded-t-lg font-semibold">Jurnal Umum</TabsTrigger>
          <TabsTrigger value="neraca" className="rounded-t-lg font-semibold">Neraca</TabsTrigger>
          <TabsTrigger value="stok" className="rounded-t-lg font-semibold">Stok</TabsTrigger>
          <TabsTrigger value="lr" className="rounded-t-lg font-semibold">Laba Rugi</TabsTrigger>
        </TabsList>

        <TabsContent value="jurnal" className="space-y-6">
          <Card className="glass border-0 shadow-card">
            <CardHeader><CardTitle>Tambah Jurnal</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-6 items-end">
                <div className="space-y-2 lg:col-span-2"><Label>Tanggal</Label><DateInput value={tanggal} onChange={setTanggal} /></div>
                <div className="space-y-2 lg:col-span-2"><Label>Keterangan</Label><Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="cth: Bayar listrik" className="h-10" /></div>
                <div className="space-y-2 lg:col-span-1">
                  <Label>Akun (COA)</Label>
                  <Select value={kodeAkun} onValueChange={setKodeAkun}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {coa.map((a) => (
                        <SelectItem key={a.kode} value={a.kode}>
                          <span className="font-mono text-xs text-muted-foreground mr-2">{a.kode}</span>
                          {a.nama}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:col-span-2">
                  <div className="space-y-2">
                    <Label>D/K</Label>
                    <Select value={tipe} onValueChange={(v) => setTipe(v as "Debit" | "Kredit")}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Debit">Debit</SelectItem><SelectItem value="Kredit">Kredit</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Jumlah</Label>
                    <Input type="number" min={0} value={jumlah} onChange={(e) => setJumlah(e.target.value)} placeholder="0" className="h-10" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="invisible hidden lg:block">.</Label>
                  <Button type="submit" className="w-full h-10 gradient-primary text-primary-foreground hover-lift"><Plus className="mr-1 h-4 w-4" />Simpan</Button>
                </div>
              </form>
              {akunObj && <div className="text-xs text-muted-foreground mt-2">Kategori: {akunObj.kategori} · {akunObj.tipe}</div>}
            </CardContent>
          </Card>

          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Daftar Jurnal</CardTitle>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <div className="text-sm text-muted-foreground">
                  {filteredJurnal.length} entri · D: <span className="text-success font-medium">{rupiah(totalDebit)}</span> · K: <span className="text-warning font-medium">{rupiah(totalKredit)}</span>
                  {totalDebit !== totalKredit && (
                    <span className="ml-2 text-destructive">⚠ Selisih {rupiah(Math.abs(totalDebit - totalKredit))}</span>
                  )}
                </div>
                <div className="w-full sm:w-auto sm:ml-auto">
                  <ExportButtons
                    filename="jurnal"
                    title="Jurnal Umum"
                    headers={["Tanggal", "Kode", "Akun", "Keterangan", "Debit", "Kredit"]}
                    rows={filteredJurnal.map((j) => [
                      j.tanggal,
                      j.kodeAkun ?? "-",
                      j.akun,
                      j.keterangan,
                      j.tipe === "Debit" ? j.jumlah : 0,
                      j.tipe === "Kredit" ? j.jumlah : 0,
                    ])}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <JurnalTable filteredJurnal={filteredJurnal} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="neraca">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Neraca</CardTitle>
              <p className="text-xs text-muted-foreground">
                Per Tanggal: {range.to ?? todayISO()}
              </p>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-semibold mb-3 text-primary">Aset</h3>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Kas Rupiah (110000)</span><span>{rupiah(neraca.kasRupiah)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Bank (120000)</span><span>{rupiah(neraca.bank)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Persediaan (140000)</span><span>{rupiah(neraca.persediaan)}</span></div>
                  <div className="flex justify-between border-t pt-2"><span>Total Aset</span><span className="font-bold">{rupiah(neraca.aset)}</span></div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-3 text-primary">Kewajiban + Ekuitas</h3>
                <div className="space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Hutang Usaha (210000)</span><span>{rupiah(neraca.hutangUsaha)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Kewajiban</span><span>{rupiah(neraca.kewajiban)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ekuitas</span><span>{rupiah(neraca.ekuitas)}</span></div>
                  <div className="flex justify-between border-t pt-2"><span>Total</span><span className="font-bold">{rupiah(neraca.total)}</span></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stok">
          <Card className="glass border-0 shadow-card">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Mutasi Stok</CardTitle>
                <p className="text-xs text-muted-foreground">Ringkasan stok masuk/keluar dan retur bahan dalam periode.</p>
              </div>
              <ExportButtons
                filename="mutasi-stok"
                title="Mutasi Stok"
                headers={["Tanggal", "Bahan", "Tipe", "Qty", "Nilai", "Keterangan"]}
                rows={filteredStokMov.map((m) => [
                  m.tanggal,
                  bahan.find((b: any) => b.id === m.bahanId)?.nama ?? m.bahanId,
                  m.tipe,
                  formatDecimal(stokQtyUnit(m)),
                  rupiah(stokMovValue(m)),
                  m.keterangan ?? ""
                ])}
              />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground">Total Mutasi</div>
                  <div className="text-2xl font-bold">{filteredStokMov.length}</div>
                </div>
                <div className="rounded-2xl border p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground">Stok Masuk</div>
                  <div className="text-2xl font-bold">{formatDecimal(totalStokIn)}</div>
                  <div className="text-xs text-muted-foreground">{rupiah(totalStokInValue)}</div>
                </div>
                <div className="rounded-2xl border p-4 bg-muted/30">
                  <div className="text-sm text-muted-foreground">Stok Keluar</div>
                  <div className="text-2xl font-bold">{formatDecimal(totalStokOut)}</div>
                  <div className="text-xs text-muted-foreground">{rupiah(totalStokOutValue)}</div>
                </div>
              </div>
              <div className="rounded-2xl border p-4 bg-muted/30">
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Retur Bahan</p>
                    <p className="text-lg font-semibold">{formatDecimal(totalReturInQty)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nilai Retur</p>
                    <p className="text-lg font-semibold">{rupiah(totalReturInValue)}</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Bahan</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Nilai</TableHead>
                        <TableHead>Keterangan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredStokMov.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada data stok sesuai filter</TableCell></TableRow>
                      )}
                      {stokMovPagination.paged.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell>{m.tanggal}</TableCell>
                          <TableCell>{bahan.find((b: any) => b.id === m.bahanId)?.nama ?? m.bahanId}</TableCell>
                          <TableCell>{m.tipe}</TableCell>
                          <TableCell className="text-right">{formatDecimal(stokQtyUnit(m))}</TableCell>
                          <TableCell className="text-right">{rupiah(stokMovValue(m))}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{m.keterangan ?? "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={stokMovPagination.page}
                  totalPages={stokMovPagination.totalPages}
                  total={stokMovPagination.total}
                  pageSize={stokMovPagination.pageSize}
                  onChange={stokMovPagination.setPage}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lr">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Laporan Laba Rugi</CardTitle>
              <p className="text-xs text-muted-foreground">
                Periode: {range.from ?? "awal"} → {range.to ?? "kini"}
              </p>
            </CardHeader>
            <CardContent className="space-y-2 max-w-xl">
              <div className="flex justify-between"><span className="text-muted-foreground">Pendapatan dari Penjualan</span><span>{rupiah(labaRugi.penjualanOtomatis)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pendapatan Lain (jurnal)</span><span>{rupiah(labaRugi.pendapatanJurnal)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-medium">Total Pendapatan</span><span className="font-bold text-success">{rupiah(labaRugi.pendapatan)}</span></div>
              <div className="flex justify-between mt-2"><span className="text-muted-foreground">HPP (541000)</span><span className="text-destructive">({rupiah(labaRugi.hppJurnal)})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">OH (543000)</span><span className="text-destructive">({rupiah(labaRugi.ohJurnal)})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Gaji (520001)</span><span className="text-destructive">({rupiah(labaRugi.gajiJurnal)})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Beban Lain</span><span className="text-destructive">({rupiah(labaRugi.bebanLain)})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Beban</span><span className="text-destructive">({rupiah(labaRugi.beban)})</span></div>
              <div className="flex justify-between border-t pt-3 text-lg"><span className="font-bold">Laba / Rugi Bersih</span><span className={`font-bold ${labaRugi.laba >= 0 ? "text-success" : "text-destructive"}`}>{rupiah(labaRugi.laba)}</span></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function JurnalTable({ filteredJurnal }: { filteredJurnal: any[] }) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filteredJurnal, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Kode</TableHead>
              <TableHead>Akun</TableHead>
              <TableHead>Ket</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Kredit</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJurnal.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada jurnal sesuai filter</TableCell></TableRow>)}
            {paged.map((j: any) => (
              <TableRow key={j.id}>
                <TableCell className="whitespace-nowrap">{j.tanggal}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{j.kodeAkun ?? "-"}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{j.akun}</TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-[180px] truncate">{j.keterangan}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{j.tipe === "Debit" ? rupiah(j.jumlah) : "-"}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{j.tipe === "Kredit" ? rupiah(j.jumlah) : "-"}</TableCell>
                <TableCell>
                  <ConfirmDeleteButton
                    onConfirm={() => db.deleteJurnal(j.id)}
                    title="Hapus Jurnal"
                    description={`Entri jurnal ${j.tanggal} — ${j.akun} (${j.tipe} ${rupiah(j.jumlah)}) akan dihapus permanen.`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
    </div>
  );
}
