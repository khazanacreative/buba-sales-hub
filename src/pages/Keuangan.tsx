import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useDB, db } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { DateInput } from "@/components/DateInput";
import { useAutoHistoricalFetch } from "@/hooks/useAutoHistoricalFetch";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { rupiah, todayISO, DateRange, inRange } from "@/lib/format";
import { AkunKategori, Jurnal, AkunCOA } from "@/lib/types";
import { Plus } from "lucide-react";
import { totalDebitKredit, aggregateByAkun, aggregateByKategori, computeArusKas, getTransaksiPerAkun, computeRunningBalance } from "@/lib/keuangan-utils";

const KATEGORI_ORDER: AkunKategori[] = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"];

export default function Keuangan() {
  const { user } = useAuth();
  const { jurnal, penjualan, coa, bahan, stokMov } = useDB();
  const [range, setRange] = useState<DateRange>({});
  useAutoHistoricalFetch(range);

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div><h1 className="text-2xl md:text-3xl font-bold">Keuangan</h1><p className="text-sm text-muted-foreground">Jurnal umum, neraca, laba rugi, arus kas</p></div>
        <div className="flex flex-wrap items-center gap-2"><DateRangeFilter value={range} onChange={setRange} /><ImportExcelButton onData={() => {}} /></div>
      </div>

      <Tabs defaultValue="jurnal" className="w-full">
        <TabsList className="grid w-full grid-cols-8 gap-0">
          <TabsTrigger value="jurnal" className="font-semibold">Jurnal Umum</TabsTrigger>
          <TabsTrigger value="neraca" className="font-semibold">Neraca</TabsTrigger>
          <TabsTrigger value="stok" className="font-semibold">Stok</TabsTrigger>
          <TabsTrigger value="lr" className="font-semibold">Laba Rugi</TabsTrigger>
          <TabsTrigger value="kode-bantu" className="font-semibold">Kode Bantu</TabsTrigger>
          <TabsTrigger value="buku-pembantu" className="font-semibold">Buku Pembantu</TabsTrigger>
          <TabsTrigger value="buku-besar" className="font-semibold">Buku Besar</TabsTrigger>
          <TabsTrigger value="arus-kas" className="font-semibold">Arus Kas</TabsTrigger>
        </TabsList>

        <TabsContent value="jurnal"><JurnalUmumTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="neraca"><NeracaTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="stok"><StokTab stokMov={stokMov} bahan={bahan} range={range} /></TabsContent>
        <TabsContent value="lr"><LabaRugiTab jurnal={jurnal} penjualan={penjualan} coa={coa} range={range} /></TabsContent>
        <TabsContent value="kode-bantu"><KodeBantuTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="buku-pembantu"><BukuPembantuTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="buku-besar"><BukuBesarTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="arus-kas"><ArusKasTab semuaJurnal={jurnal} coa={coa} range={range} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== JURNAL UMUM ====================
function JurnalUmumTab({ jurnal, coa, range }: { jurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const [tanggal, setTanggal] = useState(todayISO());
  const [keterangan, setKeterangan] = useState("");
  const [debitKodeAkun, setDebitKodeAkun] = useState(coa[0]?.kode ?? "");
  const [kreditKodeAkun, setKreditKodeAkun] = useState("");
  const [jumlah, setJumlah] = useState("");
  const debitObj = coa.find((a) => a.kode === debitKodeAkun);
  const kreditObj = coa.find((a) => a.kode === kreditKodeAkun);
  const balance = Number(jumlah);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debitObj || !kreditObj || balance <= 0 || debitKodeAkun === kreditKodeAkun) return toast.error("Invalid input");
    db.addJurnalBulk([{
      tanggal, keterangan, kodeAkun: debitObj.kode, akun: debitObj.nama, tipe: "Debit", jumlah: balance, kategori: debitObj.kategori,
    }, {
      tanggal, keterangan, kodeAkun: kreditObj.kode, akun: kreditObj.nama, tipe: "Kredit", jumlah: balance, kategori: kreditObj.kategori,
    }] as any);
    toast.success("Jurnal ditambahkan");
  };

  const filtered = useMemo(() => jurnal.filter((j) => inRange(j.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [jurnal, range]);
  const { totalDebit, totalKredit } = totalDebitKredit(filtered);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Input Jurnal (Double-Entry)</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-7 items-end">
            <div className="space-y-2 lg:col-span-1"><Label>Tanggal</Label><DateInput value={tanggal} onChange={setTanggal} /></div>
            <div className="space-y-2 lg:col-span-2"><Label>Keterangan</Label><Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} /></div>
            <div className="space-y-2 lg:col-span-1"><Label>Debit</Label><Select value={debitKodeAkun} onValueChange={setDebitKodeAkun}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{coa.map(a => <SelectItem key={a.kode} value={a.kode}>{a.kode} - {a.nama}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-2 lg:col-span-1"><Label>Kredit</Label><Select value={kreditKodeAkun} onValueChange={setKreditKodeAkun}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{coa.map(a => <SelectItem key={a.kode} value={a.kode}>{a.kode} - {a.nama}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-2 lg:col-span-1"><Label>Jumlah</Label><Input type="number" min={0} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></div>
            <div className="space-y-2 lg:col-span-1"><Button type="submit" disabled={!debitObj || !kreditObj || balance <= 0} className="w-full h-10"><Plus className="mr-1 h-4 w-4" /> Simpan</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Daftar Jurnal</CardTitle><div className="text-sm text-muted-foreground">{filtered.length} entri · D: {rupiah(totalDebit)} K: {rupiah(totalKredit)}</div></CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Tgl</TableHead><TableHead>Kode</TableHead><TableHead>Akun</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 && (<TableRow><TableCell colSpan={6} className="text-center">Belum ada jurnal</TableCell></TableRow>)}
                  {filtered.map(j => (
                    <TableRow key={j.id}>
                      <TableCell>{j.tanggal}</TableCell><TableCell className="font-mono">{j.kodeAkun}</TableCell><TableCell>{j.akun}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{j.keterangan}</TableCell>
                      <TableCell className="text-right">{j.tipe === "Debit" ? rupiah(j.jumlah) : "-"}</TableCell>
                      <TableCell className="text-right">{j.tipe === "Kredit" ? rupiah(j.jumlah) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== OTHER TABS ====================
function NeracaTab({ jurnal, coa, range }: { jurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const filtered = useMemo(() => jurnal.filter((j) => inRange(j.tanggal, range)), [jurnal, range]);
  const aggregated = aggregateByAkun(filtered, coa);
  const aset = aggregated.filter((a) => a.kategori === "Aset");
  const kw = aggregated.filter((a) => a.kategori === "Kewajiban");
  const ek = aggregated.filter((a) => a.kategori === "Ekuitas");
  return (
    <Card>
      <CardHeader><CardTitle>Neraca</CardTitle></CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <div><h3 className="font-semibold">Aset</h3><div className="space-y-2">{aset.map(r => (<div key={r.kode} className="flex justify-between"><span>{r.nama}</span><span>{rupiah(r.saldo)}</span></div>))}</div></div>
        <div><h3 className="font-semibold">Kewajiban + Ekuitas</h3><div className="space-y-2">{kw.map(r => (<div key={r.kode} className="flex justify-between"><span>{r.nama}</span><span>{rupiah(r.saldo)}</span></div>))}{ek.map(r => (<div key={r.kode} className="flex justify-between"><span>{r.nama}</span><span>{rupiah(r.saldo)}</span></div>))}</div></div>
      </CardContent>
    </Card>
  );
}

function StokTab({ stokMov, bahan, range }: { stokMov: any[]; bahan: any[]; range: DateRange }) {
  const filtered = useMemo(() => stokMov.filter((m) => (!range.from || m.tanggal >= range.from) && (!range.to || m.tanggal <= range.to)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [stokMov, range]);
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  return (
    <Card>
      <CardHeader><CardTitle>Mutasi Stok</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Bahan</TableHead><TableHead>Tipe</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Nilai</TableHead></TableRow></TableHeader>
          <TableBody>{filtered.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center">Tidak ada data</TableCell></TableRow>) :
            paged.map(m => (<TableRow key={m.id}>
              <TableCell>{m.tanggal}</TableCell><TableCell>{bahan.find((b) => b.id === m.bahanId)?.nama ?? m.bahanId}</TableCell>
              <TableCell>{m.tipe}</TableCell><TableCell className="text-right">{m.qty}</TableCell><TableCell className="text-right">{rupiah(m.qty * 5000)}</TableCell>
            </TableRow>))}</TableBody>
        </Table></div>
      <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} /></CardContent>
    </Card>
  );
}

function LabaRugiTab({ jurnal, penjualan, coa, range }: { jurnal: Jurnal[]; penjualan: any[]; coa: AkunCOA[]; range: DateRange }) {
  const filtered = useMemo(() => jurnal.filter((j) => inRange(j.tanggal, range)), [jurnal, range]);
  const byKat = aggregateByKategori(filtered);
  const pendapatan = byKat["Pendapatan"]?.saldo ?? 0;
  const beban = byKat["Beban"]?.saldo ?? 0;
  const laba = pendapatan - beban;
  return (
    <Card>
      <CardHeader><CardTitle>Laba Rugi</CardTitle></CardHeader>
      <CardContent>
        <div className="flex justify-between"><span>Pendapatan</span><span className="text-success font-medium">{rupiah(pendapatan)}</span></div>
        <div className="flex justify-between"><span>Beban</span><span className="text-destructive">{rupiah(beban)}</span></div>
        <div className="flex justify-between border-t pt-2 font-bold"><span>Laba / Rugi</span><span className={laba >= 0 ? "text-green-600" : "text-red-600"}>{rupiah(laba)}</span></div>
      </CardContent>
    </Card>
  );
}

function KodeBantuTab({ jurnal, coa, range }: { jurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const filtered = useMemo(() => jurnal.filter((j) => (!range.from || j.tanggal >= range.from) && (!range.to || j.tanggal <= range.to)), [jurnal, range]);
  const aggregated = aggregateByAkun(filtered, coa);
  return (
    <Card><CardHeader><CardTitle>Kode Bantu</CardTitle></CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">{KATEGORI_ORDER.map(kat => {
          const rows = aggregated.filter(r => r.kategori === kat);
          return rows.length > 0 ? (<div key={kat} className="rounded-xl border p-3">
            <h3 className="font-semibold mb-2">{kat}</h3>
            <div className="grid gap-2">{rows.map(r => (<div key={r.kode} className="flex justify-between text-sm">
              <span>{r.nama} ({r.kode})</span><span>{rupiah(r.saldo)}</span>
            </div>))}</div>
          </div>) : null;
        })}</div>
      </CardContent>
    </Card>
  );
}

function BukuPembantuTab({ jurnal, coa, range }: { jurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const filtered = useMemo(() => jurnal.filter((j) => (!range.from || j.tanggal >= range.from) && (!range.to || j.tanggal <= range.to)), [jurnal, range]);
  const [selected, setSelected] = useState("");
  const akun = aggregateByAkun(filtered, coa).find((a) => a.kode === selected);
  const transaksi = useMemo(() => selected ? getTransaksiPerAkun(filtered, selected) : [], [selected, filtered]);
  const balance = useMemo(() => computeRunningBalance(transaksi), [transaksi]);
  return (
    <Card><CardHeader><CardTitle>Buku Pembantu</CardTitle></CardHeader>
      <CardContent>
        <div className="mb-3"><Label>Pilih Akun</Label><Select value={selected} onValueChange={setSelected}>
          <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
          <SelectContent>{coa.map((a) => <SelectItem key={a.kode} value={a.kode}>{a.kode}</SelectItem>)}</SelectContent>
        </Select></div>
        {akun && (<div className="mb-3"><span>{akun.nama} ({akun.kode}) - Saldo: {rupiah(akun.saldo)}</span></div>)}
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Tgl</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead><TableHead className="text-right">Saldo</TableHead></TableRow></TableHeader>
          <TableBody>{transaksi.length === 0 ? (<TableRow><TableCell colSpan={5} className="text-center">Tidak ada data</TableCell></TableRow>) :
            balance.map((item) => (<TableRow key={item.jurnal.id}>
              <TableCell>{item.jurnal.tanggal}</TableCell><TableCell className="max-w-[150px]">{item.jurnal.keterangan}</TableCell>
              <TableCell className="text-right">{item.jurnal.tipe === "Debit" ? rupiah(item.jurnal.jumlah) : "-"}</TableCell>
              <TableCell className="text-right">{item.jurnal.tipe === "Kredit" ? rupiah(item.jurnal.jumlah) : "-"}</TableCell>
              <TableCell className="text-right font-medium">{rupiah(item.saldo)}</TableCell>
            </TableRow>))}</TableBody>
        </Table></div>
      </CardContent>
    </Card>
  );
}

function BukuBesarTab({ jurnal, coa, range }: { jurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const filtered = useMemo(() => jurnal.filter((j) => (!range.from || j.tanggal >= range.from) && (!range.to || j.tanggal <= range.to)), [jurnal, range]);
  const aggregated = aggregateByAkun(filtered, coa);
  return (
    <Card><CardHeader><CardTitle>Buku Besar</CardTitle></CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {aggregated.map((akun) => (
            <AccordionItem key={akun.kode} value={akun.kode}>
              <AccordionTrigger><div className="flex justify-between w-full"><span>{akun.kode} - {akun.nama}</span><span className="font-bold">{rupiah(akun.saldo)}</span></div></AccordionTrigger>
              <AccordionContent>
                <div className="overflow-x-auto"><Table>
                  <TableHeader><TableRow><TableHead>Tgl</TableHead><TableHead>Keterangan</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Kredit</TableHead></TableRow></TableHeader>
                  <TableBody>{getTransaksiPerAkun(filtered, akun.kode).map((j) => (
                    <TableRow key={j.id}>
                      <TableCell>{j.tanggal}</TableCell><TableCell>{j.keterangan}</TableCell>
                      <TableCell className="text-right">{j.tipe === "Debit" ? rupiah(j.jumlah) : "-"}</TableCell>
                      <TableCell className="text-right">{j.tipe === "Kredit" ? rupiah(j.jumlah) : "-"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table></div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function ArusKasTab({ semuaJurnal, coa, range }: { semuaJurnal: Jurnal[]; coa: AkunCOA[]; range: DateRange }) {
  const arus = computeArusKas(semuaJurnal, coa, range);
  return (
    <Card><CardHeader><CardTitle>Arus Kas</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border p-3"><h3 className="font-semibold mb-2">Aktivitas Operasional</h3>
          <div className="flex justify-between"><span>Debit</span><span>{rupiah(arus.operasional.debit)}</span></div>
          <div className="flex justify-between"><span>Kredit</span><span>{rupiah(arus.operasional.kredit)}</span></div></div>
        <div className="rounded-xl border p-3"><h3 className="font-semibold mb-2">Aktivitas Investasi</h3>
          <div className="flex justify-between"><span>Debit</span><span>{rupiah(arus.investing.debit)}</span></div>
          <div className="flex justify-between"><span>Kredit</span><span>{rupiah(arus.investing.kredit)}</span></div></div>
        <div className="rounded-xl border p-3"><h3 className="font-semibold mb-2">Aktivitas Pendanaan</h3>
          <div className="flex justify-between"><span>Debit</span><span>{rupiah(arus.pendanaan.debit)}</span></div>
          <div className="flex justify-between"><span>Kredit</span><span>{rupiah(arus.pendanaan.kredit)}</span></div></div>
        <div className="pt-4"><div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border p-3"><div className="text-sm text-muted-foreground">Saldo Awal</div><div className="text-lg font-bold">{rupiah(arus.saldoKasAwal)}</div></div>
          <div className="rounded-xl border p-3"><div className="text-sm text-muted-foreground">Saldo Akhir</div><div className="text-lg font-bold">{rupiah(arus.saldoKasAkhir)}</div></div>
        </div></div>
      </CardContent>
    </Card>
  );
}