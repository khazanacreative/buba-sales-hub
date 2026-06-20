import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, UserCheck, Users, CalendarCheck, CheckCircle2, Check, FileText } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import { StatusAbsen } from "@/lib/types";
import { useNavigate } from "react-router-dom";

const STATUSES: StatusAbsen[] = ["Hadir", "Izin", "Sakit", "Alpha"];

export default function Absensi() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const { karyawan = [], absensi = [], outlets = [] } = useDB();

  const visibleKaryawan = useMemo(
    () => (isAdmin ? karyawan : karyawan.filter((k) => k.outletId === user?.outletId)),
    [karyawan, isAdmin, user]
  );

  const [tanggal, setTanggal] = useState(todayISO());
  const [karyawanId, setKaryawanId] = useState(visibleKaryawan[0]?.id ?? "");
  const [jamMasuk, setJamMasuk] = useState("07:00");
  const [jamPulang, setJamPulang] = useState("15:00");
  const [status, setStatus] = useState<StatusAbsen>("Hadir");
  const [range, setRange] = useState<DateRange>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kid = karyawanId || visibleKaryawan[0]?.id;
    if (!kid) return toast.error("Pilih karyawan");
    db.addAbsensi({ tanggal, karyawanId: kid, jamMasuk: status === "Hadir" ? jamMasuk : undefined, jamPulang: status === "Hadir" ? jamPulang : undefined, status });
    toast.success("Absensi disimpan");
  };

  const currentTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  };

  const todayRecord = useMemo(() => {
    const kid = karyawanId || visibleKaryawan[0]?.id;
    if (!kid) return null;
    return absensi.find((a) => a.tanggal === todayISO() && a.karyawanId === kid);
  }, [absensi, karyawanId, visibleKaryawan]);

  const handleClockIn = () => {
    const kid = karyawanId || visibleKaryawan[0]?.id;
    if (!kid) return toast.error("Pilih karyawan terlebih dahulu");
    db.addAbsensi({
      tanggal: todayISO(),
      karyawanId: kid,
      jamMasuk: currentTime(),
      status: "Hadir",
    });
    toast.success("Berhasil Absen Masuk!");
  };

  const handleClockOut = () => {
    if (!todayRecord) return toast.error("Data absensi tidak ditemukan");
    db.updateAbsensi(todayRecord.id, {
      jamPulang: currentTime(),
    });
    toast.success("Berhasil Absen Pulang!");
  };

  const handleSakitIzin = (st: "Sakit" | "Izin") => {
    const kid = karyawanId || visibleKaryawan[0]?.id;
    if (!kid) return toast.error("Pilih karyawan terlebih dahulu");
    db.addAbsensi({
      tanggal: todayISO(),
      karyawanId: kid,
      status: st,
      catatan: `Dilaporkan oleh outlet via tombol cepat`
    });
    toast.success(`Berhasil mencatat status ${st}`);
  };

  const visibleIds = new Set(visibleKaryawan.map((k) => k.id));
  const filtered = useMemo(
    () => absensi.filter((a) => visibleIds.has(a.karyawanId) && inRange(a.tanggal, range)).sort((a, b) => b.tanggal.localeCompare(a.tanggal)),
    [absensi, visibleIds, range]
  );

  // Rekap gaji per karyawan
  const rekap = useMemo(() => {
    return visibleKaryawan.map((k) => {
      const list = filtered.filter((a) => a.karyawanId === k.id);
      const hadir = list.filter((a) => a.status === "Hadir").length;
      const izin = list.filter((a) => a.status === "Izin").length;
      const sakit = list.filter((a) => a.status === "Sakit").length;
      const alpha = list.filter((a) => a.status === "Alpha").length;
      const totalGaji = hadir * k.gajiPokok;
      return { k, hadir, izin, sakit, alpha, totalGaji };
    });
  }, [visibleKaryawan, filtered]);

  const totalHadir = rekap.reduce((s, r) => s + r.hadir, 0);
  const totalGajiAll = rekap.reduce((s, r) => s + r.totalGaji, 0);
  const rekapPg = usePagination(rekap, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Absensi Karyawan</h1>
          <p className="text-sm text-muted-foreground">Catat kehadiran & rekap penggajian harian</p>
        </div>
        <Button 
          onClick={() => navigate("/slip-gaji")} 
          className="gradient-primary text-primary-foreground hover-lift"
        >
          <FileText className="mr-2 h-4 w-4" /> Slip Gaji
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Karyawan</div>
              <div className="text-xl font-bold">{visibleKaryawan.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <CalendarCheck className="h-8 w-8 text-success" />
            <div>
              <div className="text-xs text-muted-foreground">Total Hadir (filter)</div>
              <div className="text-xl font-bold">{totalHadir}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-4 flex items-center gap-3">
            <UserCheck className="h-8 w-8 text-accent-foreground" />
            <div>
              <div className="text-xs text-muted-foreground">Estimasi Gaji</div>
              <div className="text-xl font-bold">{rupiah(totalGajiAll)}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <Card className="glass border-0 shadow-card">
          <CardHeader><CardTitle>Input Absensi</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-3 md:grid-cols-2 lg:grid-cols-6 lg:items-end">
              <div className="space-y-2">
                <Label>Tanggal</Label>
                <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Karyawan</Label>
                <Select value={karyawanId || visibleKaryawan[0]?.id || ""} onValueChange={setKaryawanId}>
                  <SelectTrigger><SelectValue placeholder="Pilih" /></SelectTrigger>
                  <SelectContent>
                    {visibleKaryawan.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.nama} ({k.posisi})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as StatusAbsen)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jam Masuk</Label>
                <Input type="time" value={jamMasuk} onChange={(e) => setJamMasuk(e.target.value)} disabled={status !== "Hadir"} />
              </div>
              <div className="space-y-2">
                <Label>Jam Pulang</Label>
                <Input type="time" value={jamPulang} onChange={(e) => setJamPulang(e.target.value)} disabled={status !== "Hadir"} />
              </div>
              <Button type="submit" className="gradient-primary text-primary-foreground hover-lift">
                <Plus className="mr-1 h-4 w-4" />Simpan
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass border-0 shadow-card">
          <CardHeader>
            <CardTitle>Absensi Mandiri Cabang</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 items-end">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Pilih Nama Karyawan</Label>
                <Select value={karyawanId || visibleKaryawan[0]?.id || ""} onValueChange={setKaryawanId}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Pilih Karyawan" /></SelectTrigger>
                  <SelectContent>
                    {visibleKaryawan.map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.nama} ({k.posisi})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="w-full">
                {!todayRecord ? (
                  <div className="grid grid-cols-3 gap-2 w-full">
                    <Button 
                      onClick={handleClockIn} 
                      className="h-12 gradient-primary text-primary-foreground hover-lift font-bold text-xs sm:text-sm"
                    >
                      <Plus className="mr-1 h-4 w-4 shrink-0" /> Masuk
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSakitIzin("Sakit")} 
                      className="h-12 border-destructive/30 text-destructive hover:bg-destructive/10 font-bold text-xs sm:text-sm"
                    >
                      Sakit
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => handleSakitIzin("Izin")} 
                      className="h-12 border-amber-600/30 text-amber-600 hover:bg-amber-50 font-bold text-xs sm:text-sm"
                    >
                      Izin
                    </Button>
                  </div>
                ) : todayRecord.status !== "Hadir" ? (
                  <div className="h-12 w-full flex items-center justify-center bg-muted/60 border rounded-xl text-sm font-semibold text-muted-foreground">
                    Status Hari Ini: <Badge className="ml-2 bg-warning">{todayRecord.status}</Badge>
                  </div>
                ) : !todayRecord.jamPulang ? (
                  <Button 
                    onClick={handleClockOut} 
                    className="h-12 w-full bg-success text-success-foreground hover:bg-success/90 hover-lift font-bold text-sm"
                  >
                    <CheckCircle2 className="mr-2 h-5 w-5 shrink-0" /> Pulang
                  </Button>
                ) : (
                  <div className="h-12 w-full flex items-center justify-center bg-success/10 border border-success/30 rounded-xl text-sm font-semibold text-success">
                    <Check className="mr-1 h-4 w-4 shrink-0" /> Absensi Lengkap · Masuk: {todayRecord.jamMasuk} · Pulang: {todayRecord.jamPulang}
                  </div>
                )}
              </div>
            </div>

            {todayRecord && todayRecord.status === "Hadir" && (
              <div className="bg-muted/40 p-4 rounded-2xl border text-xs text-muted-foreground space-y-1">
                <span className="font-bold text-muted-foreground uppercase tracking-wider block mb-1">Status Absensi Hari Ini:</span>
                <div>• Jam Masuk: <span className="font-semibold text-foreground">{todayRecord.jamMasuk ?? "-"}</span></div>
                <div>• Jam Pulang: <span className="font-semibold text-foreground">{todayRecord.jamPulang ?? "Belum Checkout (Pulang)"}</span></div>
                <div>• Status Data: <span className="font-semibold text-foreground">{todayRecord.jamPulang ? "Komplit" : "Sementara (Menunggu Pulang)"}</span></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Riwayat Absensi</CardTitle>
          <div className="flex flex-wrap gap-2 pt-2 items-center">
            <DateRangeFilter value={range} onChange={setRange} />
            <div className="w-full sm:w-auto sm:ml-auto">
              <ExportButtons
                filename="absensi"
                title="Riwayat Absensi"
                headers={["Tanggal", "Karyawan", "Status", "Masuk", "Pulang"]}
                rows={filtered.map((a) => {
                  const k = karyawan.find((x) => x.id === a.karyawanId);
                  return [a.tanggal, k?.nama ?? "-", a.status, a.jamMasuk ?? "-", a.jamPulang ?? "-"];
                })}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AbsensiTable filtered={filtered} karyawan={karyawan} outlets={outlets} />
        </CardContent>
      </Card>

      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Rekap Gaji (sesuai filter tanggal)</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Posisi</TableHead>
                    <TableHead className="text-right">Hadir</TableHead>
                    <TableHead className="text-right">Izin</TableHead>
                    <TableHead className="text-right">Sakit</TableHead>
                    <TableHead className="text-right">Alpha</TableHead>
                    <TableHead className="text-right">Gaji Pokok</TableHead>
                    <TableHead className="text-right">Total Gaji</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rekapPg.paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                        Belum ada data rekap gaji
                      </TableCell>
                    </TableRow>
                  )}
                  {rekapPg.paged.map((r) => (
                    <TableRow key={r.k.id}>
                      <TableCell className="whitespace-nowrap">{r.k.nama}</TableCell>
                      <TableCell>{r.k.posisi}</TableCell>
                      <TableCell className="text-right">{r.hadir}</TableCell>
                      <TableCell className="text-right">{r.izin}</TableCell>
                      <TableCell className="text-right">{r.sakit}</TableCell>
                      <TableCell className="text-right">{r.alpha}</TableCell>
                      <TableCell className="text-right">{rupiah(r.k.gajiPokok)}</TableCell>
                      <TableCell className="text-right font-semibold">{rupiah(r.totalGaji)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <TablePagination 
            page={rekapPg.page} 
            totalPages={rekapPg.totalPages} 
            total={rekapPg.total} 
            pageSize={rekapPg.pageSize} 
            onChange={rekapPg.setPage} 
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AbsensiTable({ filtered, karyawan, outlets }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  const colorFor = (s: StatusAbsen) => {
    if (s === "Hadir") return "bg-success text-success-foreground";
    if (s === "Izin") return "bg-accent text-accent-foreground";
    if (s === "Sakit") return "bg-secondary text-secondary-foreground";
    return "";
  };
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Masuk</TableHead>
              <TableHead>Pulang</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Belum ada absensi</TableCell></TableRow>
            )}
            {paged.map((a: any) => {
              const k = karyawan.find((x: any) => x.id === a.karyawanId);
              const o = outlets.find((x: any) => x.id === k?.outletId);
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{a.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap">{k?.nama ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{o?.nama ?? "-"}</TableCell>
                  <TableCell>
                    {a.status === "Alpha"
                      ? <Badge variant="destructive">{a.status}</Badge>
                      : <Badge className={colorFor(a.status)}>{a.status}</Badge>}
                  </TableCell>
                  <TableCell>{a.jamMasuk ?? "-"}</TableCell>
                  <TableCell>{a.jamPulang ?? "-"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => db.deleteAbsensi(a.id)}>
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
