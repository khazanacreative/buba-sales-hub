import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDB } from "@/lib/store";
import { rupiah, todayISO, monthKey } from "@/lib/format";
import { Printer, FileText, Landmark, User, CalendarDays, Award } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function SlipGaji() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { karyawan, absensi, outlets } = useDB();

  // Filter employees based on role
  const visibleKaryawan = useMemo(
    () => (isAdmin ? karyawan : karyawan.filter((k) => k.outletId === user?.outletId)),
    [karyawan, isAdmin, user]
  );

  const [karyawanId, setKaryawanId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(todayISO().slice(0, 7)); // YYYY-MM

  useEffect(() => {
    if (visibleKaryawan.length > 0 && !karyawanId) {
      setKaryawanId(visibleKaryawan[0].id);
    }
  }, [visibleKaryawan, karyawanId]);

  const activeKaryawan = useMemo(
    () => karyawan.find((k) => k.id === karyawanId),
    [karyawan, karyawanId]
  );

  const activeOutlet = useMemo(
    () => outlets.find((o) => o.id === activeKaryawan?.outletId),
    [outlets, activeKaryawan]
  );

  // Get attendance list for selected month
  const monthlyAbsensi = useMemo(() => {
    if (!karyawanId) return [];
    return absensi.filter(
      (a) => a.karyawanId === karyawanId && a.tanggal.startsWith(selectedMonth)
    );
  }, [absensi, karyawanId, selectedMonth]);

  const stats = useMemo(() => {
    const hadir = monthlyAbsensi.filter((a) => a.status === "Hadir").length;
    const izin = monthlyAbsensi.filter((a) => a.status === "Izin").length;
    const sakit = monthlyAbsensi.filter((a) => a.status === "Sakit").length;
    const alpha = monthlyAbsensi.filter((a) => a.status === "Alpha").length;
    return { hadir, izin, sakit, alpha };
  }, [monthlyAbsensi]);

  // Calculate salary details
  const payroll = useMemo(() => {
    if (!activeKaryawan) return { pokok: 0, bonusOmset: 0, bonusUlasan: 0, total: 0 };
    const pokok = stats.hadir * activeKaryawan.gajiPokok;
    const bonusOmset = activeKaryawan.bonusOmset ?? 0;
    const bonusUlasan = activeKaryawan.bonusUlasan ?? 0;
    const total = pokok + bonusOmset + bonusUlasan;
    return { pokok, bonusOmset, bonusUlasan, total };
  }, [activeKaryawan, stats]);

  // Get available months from absensi dates to populate selector
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(todayISO().slice(0, 7));
    absensi.forEach((a) => {
      if (a.tanggal) {
        months.add(a.tanggal.slice(0, 7));
      }
    });
    return Array.from(months).sort().reverse();
  }, [absensi]);

  const handlePrint = () => {
    window.print();
  };

  const formatMonthName = (yearMonth: string) => {
    const [year, month] = yearMonth.split("-");
    const months = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];
    const mIdx = parseInt(month, 10) - 1;
    return `${months[mIdx]} ${year}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Slip Gaji Karyawan</h1>
          <p className="text-sm text-muted-foreground">Lihat dan cetak slip gaji bulanan karyawan</p>
        </div>
        {activeKaryawan && (
          <Button onClick={handlePrint} className="gradient-primary text-primary-foreground hover-lift">
            <Printer className="mr-2 h-4 w-4" /> Cetak Slip Gaji
          </Button>
        )}
      </div>

      {/* Selectors card - Hidden on print */}
      <Card className="glass border-0 shadow-card print:hidden">
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          {visibleKaryawan.length > 1 ? (
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground">Pilih Karyawan</label>
              <Select value={karyawanId} onValueChange={setKaryawanId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Pilih Karyawan" /></SelectTrigger>
                <SelectContent>
                  {visibleKaryawan.map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.nama} ({k.posisi})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2 flex-1 min-w-[200px]">
              <label className="text-xs font-semibold text-muted-foreground">Karyawan</label>
              <div className="h-10 flex items-center px-3 border rounded-lg bg-muted text-foreground text-sm font-semibold">
                {activeKaryawan?.nama} ({activeKaryawan?.posisi})
              </div>
            </div>
          )}

          <div className="space-y-2 w-44">
            <label className="text-xs font-semibold text-muted-foreground">Pilih Bulan</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableMonths.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatMonthName(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Slip Gaji Content - Styled for print compatibility */}
      {activeKaryawan ? (
        <div className="max-w-2xl mx-auto bg-card rounded-2xl border border-border/80 shadow-md p-6 sm:p-8 print:border-0 print:shadow-none print:p-0 print:mx-0 print:w-full">
          {/* Header */}
          <div className="flex justify-between items-start border-b border-border/60 pb-6 mb-6">
            <div>
              <h2 className="text-xl font-bold text-primary">BUBA HEALTHY</h2>
              <p className="text-xs text-muted-foreground">Sistem Informasi Penjualan MPASI</p>
              {activeOutlet && <p className="text-xs text-muted-foreground">{activeOutlet.nama} — {activeOutlet.lokasi}</p>}
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary print:border print:border-primary">
                Slip Gaji Resmi
              </span>
              <p className="text-xs text-muted-foreground mt-2">Periode: <strong>{formatMonthName(selectedMonth)}</strong></p>
            </div>
          </div>

          {/* Employee Info Grid */}
          <div className="grid grid-cols-2 gap-4 bg-muted/30 rounded-xl p-4 mb-6 border border-border/40 text-xs sm:text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5" />
                <span>Nama Karyawan</span>
              </div>
              <p className="font-semibold pl-5.5">{activeKaryawan.nama}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Award className="h-3.5 w-3.5" />
                <span>Jabatan / Posisi</span>
              </div>
              <p className="font-semibold pl-5.5">{activeKaryawan.posisi}</p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary" /> Kehadiran
              </h3>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="border rounded-xl p-2.5">
                  <div className="text-[10px] text-muted-foreground font-bold">Hadir</div>
                  <div className="text-lg font-bold text-success">{stats.hadir}</div>
                </div>
                <div className="border rounded-xl p-2.5">
                  <div className="text-[10px] text-muted-foreground font-bold">Izin</div>
                  <div className="text-lg font-bold text-accent-foreground">{stats.izin}</div>
                </div>
                <div className="border rounded-xl p-2.5">
                  <div className="text-[10px] text-muted-foreground font-bold">Sakit</div>
                  <div className="text-lg font-bold text-secondary-foreground">{stats.sakit}</div>
                </div>
                <div className="border rounded-xl p-2.5">
                  <div className="text-[10px] text-muted-foreground font-bold">Alpha</div>
                  <div className="text-lg font-bold text-destructive">{stats.alpha}</div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/40 pt-6">
              <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider mb-3 flex items-center gap-1.5">
                <Landmark className="h-4 w-4 text-primary" /> Rincian Gaji & Pendapatan
              </h3>
              <div className="divide-y text-xs sm:text-sm">
                <div className="flex justify-between py-2.5">
                  <span className="text-muted-foreground">
                    Gaji Pokok <span className="text-[10px] text-muted-foreground">({stats.hadir} Hari @ {rupiah(activeKaryawan.gajiPokok)})</span>
                  </span>
                  <span className="font-medium">{rupiah(payroll.pokok)}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-muted-foreground">Bonus Pencapaian Omset</span>
                  <span className="font-medium text-success">+{rupiah(payroll.bonusOmset)}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-muted-foreground">Bonus Ulasan Bintang 5</span>
                  <span className="font-medium text-success">+{rupiah(payroll.bonusUlasan)}</span>
                </div>
                <div className="flex justify-between py-3 text-sm sm:text-base font-bold bg-muted/40 rounded-lg px-3 mt-2">
                  <span className="text-foreground">Total Gaji Diterima (Take Home Pay)</span>
                  <span className="text-primary">{rupiah(payroll.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Signatures */}
          <div className="grid grid-cols-2 gap-4 pt-12 mt-12 border-t border-dashed border-border/60 text-center text-xs sm:text-sm">
            <div className="space-y-12">
              <p className="text-muted-foreground">Diterima Oleh</p>
              <div className="space-y-1">
                <p className="font-bold underline">{activeKaryawan.nama}</p>
                <p className="text-[10px] text-muted-foreground">Karyawan</p>
              </div>
            </div>
            <div className="space-y-12">
              <p className="text-muted-foreground">Disetujui Oleh</p>
              <div className="space-y-1">
                <p className="font-bold underline">Management Buba Healthy</p>
                <p className="text-[10px] text-muted-foreground">Administrator</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Card className="glass border-0 shadow-card">
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            Tidak ada data karyawan yang terdaftar untuk outlet Anda.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
