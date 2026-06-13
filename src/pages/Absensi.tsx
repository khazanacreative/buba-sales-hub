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
import { Plus, Trash2, UserCheck, Users, CalendarCheck } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import { StatusAbsen } from "@/lib/types";

const STATUSES: StatusAbsen[] = ["Hadir", "Izin", "Sakit", "Alpha"];

export default function Absensi() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { karyawan, absensi, outlets } = useDB();

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
    if (!karyawanId) return toast.error("Pilih karyawan");
    db.addAbsensi({ tanggal, karyawanId, jamMasuk: status === "Hadir" ? jamMasuk : undefined, jamPulang: status === "Hadir" ? jamPulang : undefined, status });
    toast.success("Absensi disimpan");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Absensi Karyawan</h1>
        <p className="text-sm text-muted-foreground">Catat kehadiran & rekap penggajian harian</p>
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
              <Select value={karyawanId} onValueChange={setKaryawanId}>
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
                  {rekap.map((r) => (
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
