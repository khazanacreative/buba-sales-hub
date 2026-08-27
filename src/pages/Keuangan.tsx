import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
import { AkunKategori, Jurnal, AkunCOA, KodeBantu } from "@/lib/types";
import { Plus, Pencil, Search } from "lucide-react";
import { totalDebitKredit, aggregateByAkun, aggregateByKategori, computeArusKas, getTransaksiPerAkun, computeRunningBalance } from "@/lib/keuangan-utils";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

const KATEGORI_ORDER: AkunKategori[] = ["Aset", "Kewajiban", "Ekuitas", "Pendapatan", "Beban"];

// Akun yang boleh punya kode bantu (Hutang / Piutang)
const KODE_BANTU_KODE_AKUN = ["210000", "130000", "131000"] as const;
type KodeBantuTipe = "Hutang" | "Piutang";

function getKodeBantuTipe(kodeAkun: string): KodeBantuTipe | null {
  if (kodeAkun === "210000") return "Hutang";
  if (kodeAkun === "130000" || kodeAkun === "131000") return "Piutang";
  return null;
}

function getKodeBantuPrefix(kodeAkun: string): "H" | "C" | null {
  if (kodeAkun === "210000") return "H";
  if (kodeAkun === "130000" || kodeAkun === "131000") return "C";
  return null;
}

export default function Keuangan() {
  const { user } = useAuth();
  const { jurnal, penjualan, coa, bahan, stokMov, kodeBantu } = useDB();
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

        <TabsContent value="jurnal"><JurnalUmumTab jurnal={jurnal} coa={coa} kodeBantu={kodeBantu} range={range} /></TabsContent>
        <TabsContent value="neraca"><NeracaTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="stok"><StokTab stokMov={stokMov} bahan={bahan} range={range} /></TabsContent>
        <TabsContent value="lr"><LabaRugiTab jurnal={jurnal} penjualan={penjualan} coa={coa} range={range} /></TabsContent>
        <TabsContent value="kode-bantu"><KodeBantuTab kodeBantu={kodeBantu} jurnal={jurnal} /></TabsContent>
        <TabsContent value="buku-pembantu"><BukuPembantuTab jurnal={jurnal} coa={coa} kodeBantu={kodeBantu} range={range} /></TabsContent>
        <TabsContent value="buku-besar"><BukuBesarTab jurnal={jurnal} coa={coa} range={range} /></TabsContent>
        <TabsContent value="arus-kas"><ArusKasTab semuaJurnal={jurnal} coa={coa} range={range} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== JURNAL UMUM ====================
function JurnalUmumTab({ jurnal, coa, kodeBantu, range }: {
  jurnal: Jurnal[]; coa: AkunCOA[]; kodeBantu: KodeBantu[]; range: DateRange;
}) {
  // Form state
  const [tanggal, setTanggal] = useState(todayISO());
  const [keterangan, setKeterangan] = useState("");
  const [debitKodeAkun, setDebitKodeAkun] = useState(coa[0]?.kode ?? "");
  const [kreditKodeAkun, setKreditKodeAkun] = useState("");
  const [jumlah, setJumlah] = useState("");
  const [kodeBantuId, setKodeBantuId] = useState<string>("");

  // Reset kode bantu selection when neither account is 210000/130000/131000
  useEffect(() => {
    if (!KODE_BANTU_KODE_AKUN.includes(debitKodeAkun as any) &&
        !KODE_BANTU_KODE_AKUN.includes(kreditKodeAkun as any)) {
      setKodeBantuId("");
    }
  }, [debitKodeAkun, kreditKodeAkun]);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTanggal, setEditTanggal] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  const [editDebitKodeAkun, setEditDebitKodeAkun] = useState("");
  const [editKreditKodeAkun, setEditKreditKodeAkun] = useState("");
  const [editJumlah, setEditJumlah] = useState("");
  const [editKodeBantuId, setEditKodeBantuId] = useState<string>("");

  const debitObj = coa.find((a) => a.kode === debitKodeAkun);
  const kreditObj = coa.find((a) => a.kode === kreditKodeAkun);
  const balance = Number(jumlah);
  const isKodeBantuApplicable =
    KODE_BANTU_KODE_AKUN.includes(debitKodeAkun as any) ||
    KODE_BANTU_KODE_AKUN.includes(kreditKodeAkun as any);
  const applicableKodeBantu = useMemo(() => {
    if (!isKodeBantuApplicable) return [];
    const activeAkun = KODE_BANTU_KODE_AKUN.includes(debitKodeAkun as any) ? debitKodeAkun : kreditKodeAkun;
    return kodeBantu.filter((k) => k.kodeAkun === activeAkun);
  }, [isKodeBantuApplicable, debitKodeAkun, kreditKodeAkun, kodeBantu]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!debitObj || !kreditObj || balance <= 0 || debitKodeAkun === kreditKodeAkun) return toast.error("Input tidak valid");
    // kodeBantuId required when applicable
    if (isKodeBantuApplicable && !kodeBantuId) {
      return toast.error("Pilih kode bantu (H-XXX / C-XXX) untuk akun Hutang/Piutang");
    }
    db.addJurnalBulk([{
      tanggal, keterangan, kodeAkun: debitObj.kode, akun: debitObj.nama, tipe: "Debit", jumlah: balance, kategori: debitObj.kategori,
      kodeBantuId: kodeBantuId || undefined,
    }, {
      tanggal, keterangan, kodeAkun: kreditObj.kode, akun: kreditObj.nama, tipe: "Kredit", jumlah: balance, kategori: kreditObj.kategori,
      kodeBantuId: kodeBantuId || undefined,
    }] as any);
    toast.success("Jurnal ditambahkan");
    // Reset
    setKeterangan("");
    setJumlah("");
    setKodeBantuId("");
  };

  const handleEdit = (j: Jurnal) => {
    setEditingId(j.id);
    setEditTanggal(j.tanggal);
    setEditKeterangan(j.keterangan);
    setEditJumlah(String(j.jumlah));
    setEditKodeBantuId(j.kodeBantuId ?? "");
  };

  // Untuk edit, kita perlu pasangan Debit-Kredit dengan id yang sama (sama-sama di-update)
  // Cari pasangan berdasarkan ref atau urutan debit->kredit
  const findPair = (j: Jurnal): Jurnal | null => {
    // Cari baris dengan tanggal+keterangan+jumlah sama, akun berlawanan
    return jurnal.find((other) =>
      other.id !== j.id &&
      other.tanggal === j.tanggal &&
      other.keterangan === j.keterangan &&
      other.jumlah === j.jumlah &&
      other.tipe !== j.tipe &&
      Math.abs(new Date(j.tanggal).getTime() - new Date(other.tanggal).getTime()) < 1000
    ) ?? null;
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const original = jurnal.find((j) => j.id === editingId);
    if (!original) return;
    const debitEntry = original.tipe === "Debit" ? original : findPair(original);
    const kreditEntry = original.tipe === "Kredit" ? original : findPair(original);
    if (!debitEntry || !kreditEntry) {
      toast.error("Tidak dapat menemukan pasangan jurnal");
      return;
    }
    const newDebit = coa.find((a) => a.kode === editDebitKodeAkun);
    const newKredit = coa.find((a) => a.kode === editKreditKodeAkun);
    if (!newDebit || !newKredit || Number(editJumlah) <= 0 || editDebitKodeAkun === editKreditKodeAkun) {
      toast.error("Input tidak valid");
      return;
    }
    try {
      await db.updateJurnal(debitEntry.id, {
        tanggal: editTanggal,
        keterangan: editKeterangan,
        kodeAkun: newDebit.kode,
        akun: newDebit.nama,
        tipe: "Debit",
        jumlah: Number(editJumlah),
        kategori: newDebit.kategori,
        kodeBantuId: editKodeBantuId || undefined,
      });
      await db.updateJurnal(kreditEntry.id, {
        tanggal: editTanggal,
        keterangan: editKeterangan,
        kodeAkun: newKredit.kode,
        akun: newKredit.nama,
        tipe: "Kredit",
        jumlah: Number(editJumlah),
        kategori: newKredit.kategori,
        kodeBantuId: editKodeBantuId || undefined,
      });
      toast.success("Jurnal diperbarui");
      setEditingId(null);
    } catch (err) {
      toast.error("Gagal memperbarui jurnal");
      console.error(err);
    }
  };

  const handleDelete = async (j: Jurnal) => {
    if (!confirm("Hapus jurnal ini? Tindakan ini tidak dapat dibatalkan.")) return;
    try {
      // Hapus baris yang dipilih, lalu cari pasangan dengan tanggal+keterangan+jumlah sama
      await db.deleteJurnal(j.id);
      const pair = findPair(j);
      if (pair) await db.deleteJurnal(pair.id);
      toast.success("Jurnal dihapus");
    } catch (err) {
      toast.error("Gagal menghapus jurnal");
      console.error(err);
    }
  };

  const filtered = useMemo(() => jurnal.filter((j) => inRange(j.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)), [jurnal, range]);
  const { totalDebit, totalKredit } = totalDebitKredit(filtered);
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 25);

  // Group paged entries by (tanggal, keterangan, jumlah) untuk display rows
  // Tampilkan 1 baris per pair dengan tombol edit/hapus di sisi Debit
  const groupedDisplay = useMemo(() => {
    const seen = new Set<string>();
    const result: { debit?: Jurnal; kredit?: Jurnal; key: string }[] = [];
    for (const j of paged) {
      const pair = paged.find((o) =>
        o.id !== j.id &&
        o.tanggal === j.tanggal &&
        o.keterangan === j.keterangan &&
        o.jumlah === j.jumlah &&
        o.tipe !== j.tipe
      );
      const key = `${j.tanggal}|${j.keterangan}|${j.jumlah}|${j.tipe}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (j.tipe === "Debit") {
        result.push({ debit: j, kredit: pair, key });
      } else {
        result.push({ debit: pair, kredit: j, key });
      }
    }
    return result;
  }, [paged]);

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
              <SelectTrigger><SelectValue placeholder="Pilih akun" /></SelectTrigger>
              <SelectContent>{coa.map(a => <SelectItem key={a.kode} value={a.kode}>{a.kode} - {a.nama}</SelectItem>)}</SelectContent>
            </Select></div>
            <div className="space-y-2 lg:col-span-1"><Label>Jumlah</Label><Input type="number" min={0} value={jumlah} onChange={(e) => setJumlah(e.target.value)} /></div>
            <div className="space-y-2 lg:col-span-1"><Button type="submit" disabled={!debitObj || !kreditObj || balance <= 0} className="w-full h-10"><Plus className="mr-1 h-4 w-4" /> Simpan</Button></div>
            {isKodeBantuApplicable && (
              <div className="space-y-2 lg:col-span-7">
                <Label>Kode Bantu (Wajib untuk Hutang/Piutang)</Label>
                <Select value={kodeBantuId} onValueChange={setKodeBantuId}>
                  <SelectTrigger><SelectValue placeholder="Pilih kode bantu" /></SelectTrigger>
                  <SelectContent>
                    {applicableKodeBantu.length === 0 ? (
                      <SelectItem value="none" disabled>Belum ada kode bantu — tambahkan di tab Kode Bantu</SelectItem>
                    ) : (
                      applicableKodeBantu.map((k) => (
                        <SelectItem key={k.id} value={k.id}>{k.kode} — {k.nama}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daftar Jurnal</CardTitle><div className="text-sm text-muted-foreground">{filtered.length} entri · D: {rupiah(totalDebit)} K: {rupiah(totalKredit)}</div></CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Tgl</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Akun</TableHead>
                  <TableHead>Kode Bantu</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Kredit</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {groupedDisplay.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center">Belum ada jurnal</TableCell></TableRow>)}
                  {groupedDisplay.map((g) => {
                    const debit = g.debit;
                    const kredit = g.kredit;
                    const kb = debit?.kodeBantuId ? kodeBantu.find((k) => k.id === debit.kodeBantuId) : null;
                    return (
                      <TableRow key={g.key}>
                        <TableCell>{debit?.tanggal ?? kredit?.tanggal}</TableCell>
                        <TableCell className="font-mono">{debit?.kodeAkun ?? kredit?.kodeAkun}</TableCell>
                        <TableCell>{debit ? `${debit.akun}` : kredit ? `${kredit.akun} (Kredit)` : ""}</TableCell>
                        <TableCell className="font-mono text-xs">{kb ? `${kb.kode} (${kb.nama})` : "-"}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{debit?.keterangan ?? kredit?.keterangan}</TableCell>
                        <TableCell className="text-right">{debit ? rupiah(debit.jumlah) : "-"}</TableCell>
                        <TableCell className="text-right">{kredit ? rupiah(kredit.jumlah) : "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => debit && handleEdit(debit)}
                              title="Edit jurnal"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {debit && (
                              <ConfirmDeleteButton
                                onConfirm={() => handleDelete(debit)}
                                title="Hapus jurnal ini?"
                                description="Seluruh entri debit & kredit terkait akan dihapus."
                                className="h-7 w-7"
                              />
                            )}
                          </div>
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

      {/* Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Jurnal</DialogTitle>
            <DialogDescription>Ubah entri jurnal ini. Debit & Kredit akan diperbarui bersama.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label>Tanggal</Label><DateInput value={editTanggal} onChange={setEditTanggal} /></div>
            <div className="space-y-2"><Label>Jumlah</Label><Input type="number" min={0} value={editJumlah} onChange={(e) => setEditJumlah(e.target.value)} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Keterangan</Label><Input value={editKeterangan} onChange={(e) => setEditKeterangan(e.target.value)} /></div>
            <div className="space-y-2"><Label>Debit</Label>
              <Select value={editDebitKodeAkun} onValueChange={setEditDebitKodeAkun}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{coa.map(a => <SelectItem key={a.kode} value={a.kode}>{a.kode} - {a.nama}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Kredit</Label>
              <Select value={editKreditKodeAkun} onValueChange={setEditKreditKodeAkun}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{coa.map(a => <SelectItem key={a.kode} value={a.kode}>{a.kode} - {a.nama}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(KODE_BANTU_KODE_AKUN.includes(editDebitKodeAkun as any) || KODE_BANTU_KODE_AKUN.includes(editKreditKodeAkun as any)) && (
              <div className="space-y-2 md:col-span-2">
                <Label>Kode Bantu</Label>
                <Select value={editKodeBantuId} onValueChange={setEditKodeBantuId}>
                  <SelectTrigger><SelectValue placeholder="Pilih kode bantu" /></SelectTrigger>
                  <SelectContent>
                    {kodeBantu.filter((k) => KODE_BANTU_KODE_AKUN.includes(k.kodeAkun as any)).map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.kode} — {k.nama} ({k.kodeAkun})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingId(null)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan Perubahan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== KODE BANTU ====================
function KodeBantuTab({ kodeBantu, jurnal }: { kodeBantu: KodeBantu[]; jurnal: Jurnal[] }) {
  const [tipe, setTipe] = useState<"Hutang" | "Piutang">("Hutang");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<KodeBantu | null>(null);
  const [editNama, setEditNama] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addNama, setAddNama] = useState("");
  const [addKeterangan, setAddKeterangan] = useState("");

  const hutangAkun = "210000";
  const piutangAkun = "130000";

  // List kode bantu untuk tipe yang dipilih
  const filtered = useMemo(() => {
    const akun = tipe === "Hutang" ? hutangAkun : piutangAkun;
    return kodeBantu
      .filter((k) => k.kodeAkun === akun)
      .filter((k) => {
        if (!search) return true;
        const s = search.toLowerCase();
        return k.kode.toLowerCase().includes(s) || k.nama.toLowerCase().includes(s) || (k.keterangan?.toLowerCase().includes(s) ?? false);
      })
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [kodeBantu, tipe, search]);

  // Hitung saldo per kode bantu
  const saldoMap = useMemo(() => {
    const map = new Map<string, { debit: number; kredit: number; saldo: number }>();
    for (const j of jurnal) {
      if (!j.kodeBantuId) continue;
      const rec = map.get(j.kodeBantuId) ?? { debit: 0, kredit: 0, saldo: 0 };
      if (j.tipe === "Debit") {
        rec.debit += j.jumlah;
        rec.saldo += j.jumlah;
      } else {
        rec.kredit += j.jumlah;
        rec.saldo -= j.jumlah;
      }
      map.set(j.kodeBantuId, rec);
    }
    return map;
  }, [jurnal]);

  const handleAdd = async () => {
    if (!addNama.trim()) return toast.error("Nama wajib diisi");
    const akun = tipe === "Hutang" ? hutangAkun : piutangAkun;
    const prefix = tipe === "Hutang" ? "H" : "C";
    const nextKode = db.generateKodeBantuNext(prefix);
    try {
      await db.addKodeBantu({
        kode: nextKode,
        kodeAkun: akun,
        nama: addNama.trim(),
        keterangan: addKeterangan.trim() || undefined,
      });
      toast.success(`Kode bantu ${nextKode} berhasil ditambahkan`);
      setAddOpen(false);
      setAddNama("");
      setAddKeterangan("");
    } catch (err: any) {
      toast.error("Gagal menambah kode bantu: " + (err?.message ?? String(err)));
    }
  };

  const handleEditClick = (k: KodeBantu) => {
    setEditing(k);
    setEditNama(k.nama);
    setEditKeterangan(k.keterangan ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editNama.trim()) return toast.error("Nama wajib diisi");
    try {
      await db.updateKodeBantu(editing.id, {
        nama: editNama.trim(),
        keterangan: editKeterangan.trim() || undefined,
      });
      toast.success("Kode bantu diperbarui");
      setEditing(null);
    } catch (err: any) {
      toast.error("Gagal update: " + (err?.message ?? String(err)));
    }
  };

  const handleDelete = async (k: KodeBantu) => {
    const saldo = saldoMap.get(k.id);
    if (saldo && (saldo.debit > 0 || saldo.kredit > 0)) {
      if (!confirm(`Kode bantu ${k.kode} (${k.nama}) memiliki ${saldo.debit + saldo.kredit > 0 ? "transaksi" : ""}. Hapus tetap?`)) return;
    } else {
      if (!confirm(`Hapus kode bantu ${k.kode} (${k.nama})?`)) return;
    }
    try {
      await db.deleteKodeBantu(k.id);
      toast.success("Kode bantu dihapus");
    } catch (err: any) {
      toast.error("Gagal hapus: " + (err?.message ?? String(err)));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kode Bantu (Sub-Akun Hutang & Piutang)</CardTitle>
        <div className="text-sm text-muted-foreground">
          Setiap person yang terlibat dalam transaksi Hutang Usaha (210000) atau Piutang Karyawan/Usaha (130000/131000)
          didaftarkan di sini untuk pelacakan per individu.
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border overflow-hidden">
            <Button
              variant={tipe === "Hutang" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setTipe("Hutang")}
            >
              Hutang (H-XXX)
            </Button>
            <Button
              variant={tipe === "Piutang" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setTipe("Piutang")}
            >
              Piutang (C-XXX)
            </Button>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Cari kode / nama..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-9"
            />
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Tambah {tipe}
          </Button>
        </div>

        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Akun Induk</TableHead>
                  <TableHead>Nama Person</TableHead>
                  <TableHead>Keterangan</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Belum ada kode bantu {tipe.toLowerCase()}.</TableCell></TableRow>
                ) : filtered.map((k) => {
                  const saldo = saldoMap.get(k.id);
                  const saldoVal = saldo?.saldo ?? 0;
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-mono font-semibold">{k.kode}</TableCell>
                      <TableCell className="font-mono text-xs">{k.kodeAkun}</TableCell>
                      <TableCell>{k.nama}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">{k.keterangan ?? "-"}</TableCell>
                      <TableCell className={`text-right font-medium ${saldoVal > 0 ? "text-success" : saldoVal < 0 ? "text-destructive" : ""}`}>
                        {rupiah(saldoVal)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleEditClick(k)}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <ConfirmDeleteButton
                            onConfirm={() => handleDelete(k)}
                            title={`Hapus kode bantu ${k.kode}?`}
                            description={saldo && (saldo.debit > 0 || saldo.kredit > 0)
                              ? `Kode bantu ini memiliki transaksi terkait. Transaksi jurnal yang ter-link akan kehilangan referensinya.`
                              : "Tindakan ini tidak dapat dibatalkan."}
                            className="h-7 w-7"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Kode Bantu {tipe}</DialogTitle>
            <DialogDescription>
              {tipe === "Hutang"
                ? `Akun: Hutang Usaha (210000). Kode akan di-generate otomatis (H-XXX).`
                : `Akun: Piutang Karyawan (130000). Kode akan di-generate otomatis (C-XXX).`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nama Person *</Label>
              <Input
                placeholder={tipe === "Hutang" ? "cth: Pak Ahmad (Supplier)" : "cth: Budi Santoso"}
                value={addNama}
                onChange={(e) => setAddNama(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Keterangan (opsional)</Label>
              <Input
                placeholder="cth: Supplier bahan baku utama"
                value={addKeterangan}
                onChange={(e) => setAddKeterangan(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={handleAdd}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Kode Bantu {editing?.kode}</DialogTitle>
            <DialogDescription>Ubah nama atau keterangan person. Kode & akun tidak dapat diubah.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nama Person *</Label>
              <Input value={editNama} onChange={(e) => setEditNama(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Keterangan</Label>
              <Input value={editKeterangan} onChange={(e) => setEditKeterangan(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Batal</Button>
            <Button onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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

// ==================== BUKU PEMBANTU (per Kode Bantu) ====================
function BukuPembantuTab({ jurnal, coa, kodeBantu, range }: {
  jurnal: Jurnal[]; coa: AkunCOA[]; kodeBantu: KodeBantu[]; range: DateRange;
}) {
  const filtered = useMemo(() => jurnal.filter((j) => (!range.from || j.tanggal >= range.from) && (!range.to || j.tanggal <= range.to)), [jurnal, range]);
  const [selectedKodeBantuId, setSelectedKodeBantuId] = useState<string>("");

  // Hanya tampilkan kode bantu untuk akun Hutang/Piutang
  const pembantuList = useMemo(() => {
    return kodeBantu
      .filter((k) => KODE_BANTU_KODE_AKUN.includes(k.kodeAkun as any))
      .sort((a, b) => a.kode.localeCompare(b.kode));
  }, [kodeBantu]);

  // Transaksi untuk kode bantu yang dipilih
  const transaksi = useMemo(() => {
    if (!selectedKodeBantuId) return [];
    return filtered
      .filter((j) => j.kodeBantuId === selectedKodeBantuId)
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }, [filtered, selectedKodeBantuId]);

  const balance = useMemo(() => computeRunningBalance(transaksi), [transaksi]);
  const selected = pembantuList.find((k) => k.id === selectedKodeBantuId);
  const akunInduk = selected ? coa.find((a) => a.kode === selected.kodeAkun) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buku Pembantu (Per Kode Bantu)</CardTitle>
        <div className="text-sm text-muted-foreground">
          Pilih kode bantu untuk menampilkan transaksi per person (Hutang/Piutang).
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 space-y-2">
          <Label>Pilih Kode Bantu</Label>
          <Select value={selectedKodeBantuId} onValueChange={setSelectedKodeBantuId}>
            <SelectTrigger><SelectValue placeholder="Pilih kode bantu (H-XXX / C-XXX)" /></SelectTrigger>
            <SelectContent>
              {pembantuList.length === 0 ? (
                <SelectItem value="none" disabled>Belum ada kode bantu</SelectItem>
              ) : (
                pembantuList.map((k) => {
                  const akun = coa.find((a) => a.kode === k.kodeAkun);
                  return (
                    <SelectItem key={k.id} value={k.id}>
                      {k.kode} — {k.nama} ({akun?.nama ?? k.kodeAkun})
                    </SelectItem>
                  );
                })
              )}
            </SelectContent>
          </Select>
        </div>
        {selected && akunInduk && (
          <div className="mb-4 p-3 rounded-lg bg-muted/50">
            <div className="text-sm text-muted-foreground">Akun Induk</div>
            <div className="font-semibold">{akunInduk.kode} — {akunInduk.nama}</div>
            <div className="text-sm text-muted-foreground mt-1">Kode Bantu</div>
            <div className="font-mono font-semibold">{selected.kode} — {selected.nama}</div>
            {selected.keterangan && (
              <div className="text-xs text-muted-foreground mt-1">{selected.keterangan}</div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tgl</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transaksi.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">
                  {selectedKodeBantuId ? "Tidak ada transaksi untuk kode bantu ini" : "Pilih kode bantu untuk menampilkan transaksi"}
                </TableCell></TableRow>
              ) : balance.map((item) => (
                <TableRow key={item.jurnal.id}>
                  <TableCell>{item.jurnal.tanggal}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.jurnal.keterangan}</TableCell>
                  <TableCell className="text-right">{item.jurnal.tipe === "Debit" ? rupiah(item.jurnal.jumlah) : "-"}</TableCell>
                  <TableCell className="text-right">{item.jurnal.tipe === "Kredit" ? rupiah(item.jurnal.jumlah) : "-"}</TableCell>
                  <TableCell className={`text-right font-medium ${item.saldo > 0 ? "text-success" : item.saldo < 0 ? "text-destructive" : ""}`}>{rupiah(item.saldo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
