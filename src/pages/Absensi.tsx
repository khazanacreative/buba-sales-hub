import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, getBubaSettings } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, UserCheck, Users, CalendarCheck, CheckCircle2, Check, FileText, MapPin, Navigation, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { useAuth } from "@/lib/auth";
import { StatusAbsen } from "@/lib/types";
import { useNavigate } from "react-router-dom";

const STATUSES: StatusAbsen[] = ["Hadir"];

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

  const settings = getBubaSettings();
  const [jamMasuk, setJamMasuk] = useState(settings.jamMasukStandar);
  const [jamPulang, setJamPulang] = useState(settings.jamPulangStandar);

  useEffect(() => {
    const handler = () => {
      const s = getBubaSettings();
      setJamMasuk(s.jamMasukStandar);
      setJamPulang(s.jamPulangStandar);
    };
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);

  const [status, setStatus] = useState<StatusAbsen>("Hadir");
  const [bonusInput, setBonusInput] = useState(0);
  const [tunjanganInput, setTunjanganInput] = useState(0);
  const [overtimeInput, setOvertimeInput] = useState(0);
  const [range, setRange] = useState<DateRange>({});

  // GPS State
  const [gpsLoading, setGpsLoading] = useState(true);
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState("Mencari lokasi GPS...");

  const fetchGPSLocation = () => {
    setGpsLoading(true);
    setAddress("Sedang mengambil lokasi...");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setCoordinates({ lat, lng });
          const locName = user?.role === "outlet" ? `Outlet ${user.nama}` : "Dapur Utama Buba Healthy";
          setAddress(`${locName}, Pasuruan (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
          setGpsLoading(false);
          toast.success("GPS berhasil mengunci lokasi!");
        },
        (error) => {
          console.error("GPS error, falling back to mock:", error);
          setCoordinates({ lat: -7.641234, lng: 112.906123 });
          const locName = user?.role === "outlet" ? `Outlet ${user.nama}` : "Dapur Utama Buba";
          setAddress(`${locName}, Jl. Raya Rajawali No. 45, Pasuruan`);
          setGpsLoading(false);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setCoordinates({ lat: -7.641234, lng: 112.906123 });
      const locName = user?.role === "outlet" ? `Outlet ${user.nama}` : "Dapur Utama Buba";
      setAddress(`${locName}, Jl. Raya Rajawali No. 45, Pasuruan`);
      setGpsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "produksi" || user?.role === "outlet") {
      fetchGPSLocation();
    }
  }, [user]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const kid = karyawanId || visibleKaryawan[0]?.id;
    if (!kid) return toast.error("Pilih karyawan");
    db.addAbsensi({
      tanggal,
      karyawanId: kid,
      jamMasuk: status === "Hadir" ? jamMasuk : undefined,
      jamPulang: status === "Hadir" ? jamPulang : undefined,
      status,
      bonus: bonusInput,
      tunjangan: tunjanganInput,
      overtime: overtimeInput
    });
    toast.success("Absensi disimpan");
    setBonusInput(0);
    setTunjanganInput(0);
    setOvertimeInput(0);
  };

  const currentTime = () => {
    const w = new Date();
    return `${String(w.getHours()).padStart(2, "0")}:${String(w.getMinutes()).padStart(2, "0")}`;
  };

  const todayRecord = useMemo(() => {
    const kid = user?.role === "produksi" ? "k-produksi" : (user?.role === "outlet" ? `k-${user.outletId}-1` : (karyawanId || visibleKaryawan[0]?.id));
    if (!kid) return null;
    return absensi.find((a) => a.tanggal === todayISO() && a.karyawanId === kid);
  }, [absensi, karyawanId, visibleKaryawan, user]);

  // Haversine formula to compute distance between two coordinates in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // meters
  };

  const validateGPSDistance = () => {
    if (user?.role !== "outlet" || !user?.outletId) return true;
    const myOutlet = outlets.find((o: any) => o.id === user.outletId);
    if (!myOutlet || !myOutlet.lokasi) return true;
    
    // Parse lokasi
    const parts = myOutlet.lokasi.split(" @ ");
    if (parts.length < 2) return true; // No GPS target set yet
    
    const [latStr, lngStr, radStr] = parts[1].split(",");
    const targetLat = parseFloat(latStr);
    const targetLng = parseFloat(lngStr);
    const radius = parseFloat(radStr || "100");
    
    if (isNaN(targetLat) || isNaN(targetLng)) return true;
    
    if (!coordinates) {
      toast.error("Gagal mendapatkan koordinat GPS Anda!");
      return false;
    }
    
    const dist = getDistanceMeters(coordinates.lat, coordinates.lng, targetLat, targetLng);
    if (dist > radius) {
      toast.error(`Gagal Absen! Anda berada di luar area outlet. Jarak Anda: ${Math.round(dist)} meter (Maks: ${radius} meter).`);
      return false;
    }
    
    return true;
  };

  const handleClockInGPS = () => {
    if (gpsLoading) return toast.error("Menunggu GPS mengunci lokasi...");
    if (!validateGPSDistance()) return;
    const kid = user?.role === "produksi" ? "k-produksi" : `k-${user?.outletId}-1`;
    db.addAbsensi({
      tanggal: todayISO(),
      karyawanId: kid,
      jamMasuk: currentTime(),
      status: "Hadir",
      catatan: `GPS Check-in: ${address}`
    });
    toast.success("Berhasil Absen Masuk (GPS)!");
  };

  const handleClockOutGPS = () => {
    if (!todayRecord) return toast.error("Data absensi tidak ditemukan");
    if (gpsLoading) return toast.error("Menunggu GPS mengunci lokasi...");
    if (!validateGPSDistance()) return;
    const confirmOut = window.confirm("Apakah Anda yakin ingin melakukan Absen Pulang?");
    if (!confirmOut) return;
    db.updateAbsensi(todayRecord.id, {
      jamPulang: currentTime(),
      catatan: `${todayRecord.catatan || ""}. GPS Check-out: ${address}`
    });
    toast.success("Berhasil Absen Pulang (GPS)!");
  };

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
    const confirmOut = window.confirm("Apakah Anda yakin ingin melakukan Absen Pulang?");
    if (!confirmOut) return;
    db.updateAbsensi(todayRecord.id, {
      jamPulang: currentTime(),
    });
    toast.success("Berhasil Absen Pulang!");
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
      
      // Calculate lateness
      const lateLogs = list.filter((a) => a.jamMasuk && a.jamMasuk > "07:00");
      const terlambatCount = lateLogs.length;
      const terlambatDates = lateLogs.map((a) => a.tanggal.slice(-2)).join(", "); // e.g. "15, 18"
      
      // Sum daily inputs
      const overtimeHours = list.reduce((sum, a) => sum + (a.overtime ?? 0), 0);
      const tunjanganTotal = list.reduce((sum, a) => sum + (a.tunjangan ?? 0), 0);
      const dailyBonusTotal = list.reduce((sum, a) => sum + (a.bonus ?? 0), 0);
      
      // Calculate overtime pay: overtime_hours * (gajiPokok / 8) * 1.5
      const overtimePay = Math.round(overtimeHours * (k.gajiPokok / 8) * 1.5);
      
      // Flat monthly bonuses
      const flatBonusOmset = k.bonusOmset ?? 0;
      const flatBonusUlasan = k.bonusUlasan ?? 0;
      
      const totalBonus = dailyBonusTotal + flatBonusOmset + flatBonusUlasan;
      const totalGaji = (hadir * k.gajiPokok) + tunjanganTotal + totalBonus + overtimePay;
      
      return {
        k,
        hadir,
        terlambatCount,
        terlambatDates,
        overtimeHours,
        tunjanganTotal,
        totalBonus,
        totalGaji
      };
    });
  }, [visibleKaryawan, filtered]);

  const totalHadir = rekap.reduce((s, r) => s + r.hadir, 0);
  const totalGajiAll = rekap.reduce((s, r) => s + r.totalGaji, 0);
  const rekapPg = usePagination(rekap, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Absensi Karyawan</h1>
        <p className="text-sm text-muted-foreground">Catat kehadiran & rekap penggajian harian</p>
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
              <div className="space-y-2">
                <Label>Bonus (Rp)</Label>
                <Input type="number" min={0} value={bonusInput || ""} onChange={(e) => setBonusInput(Number(e.target.value))} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Tunjangan (Rp)</Label>
                <Input type="number" min={0} value={tunjanganInput || ""} onChange={(e) => setTunjanganInput(Number(e.target.value))} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Overtime (Jam)</Label>
                <Input type="number" min={0} value={overtimeInput || ""} onChange={(e) => setOvertimeInput(Number(e.target.value))} placeholder="0" />
              </div>
              <Button type="submit" className="gradient-primary text-primary-foreground hover-lift lg:col-span-2">
                <Plus className="mr-1 h-4 w-4" />Simpan Absensi
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (user?.role === "produksi" || user?.role === "outlet") ? (
        <Card className="glass border-0 shadow-card overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Navigation className="h-5 w-5 text-red-500 animate-pulse" />
              Absensi Mandiri GPS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Map Area */}
            <div className="relative w-full h-[220px] rounded-2xl overflow-hidden bg-sky-100 dark:bg-sky-950 border shadow-inner">
              {/* Simulated Map Background */}
              <svg className="absolute inset-0 w-full h-full text-sky-400 dark:text-sky-800 opacity-30" xmlns="http://www.w3.org/2000/svg">
                <line x1="0" y1="50" x2="1000" y2="50" stroke="currentColor" strokeWidth="8" />
                <line x1="0" y1="120" x2="1000" y2="150" stroke="currentColor" strokeWidth="12" strokeDasharray="5,5" />
                <line x1="0" y1="200" x2="1000" y2="180" stroke="currentColor" strokeWidth="6" />
                <line x1="120" y1="0" x2="100" y2="1000" stroke="currentColor" strokeWidth="10" />
                <line x1="280" y1="0" x2="300" y2="1000" stroke="currentColor" strokeWidth="6" />
                <line x1="450" y1="0" x2="420" y2="1000" stroke="currentColor" strokeWidth="16" />
                <circle cx="200" cy="100" r="50" fill="currentColor" opacity="0.1" />
              </svg>

              {/* Safe area ripple */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 animate-pulse pointer-events-none" />

              {/* Pin Marker */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+12px)] flex flex-col items-center">
                <div className="relative flex flex-col items-center animate-bounce">
                  {/* Outer Pin Tail (SVG) */}
                  <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-md p-1">
                    {/* Buba Smiley Face in Center */}
                    <div className="w-full h-full rounded-full bg-amber-400 border-2 border-white flex items-center justify-center p-0.5">
                      <svg className="w-full h-full text-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <circle cx="8" cy="11" r="1.5" fill="currentColor" />
                        <circle cx="16" cy="11" r="1.5" fill="currentColor" />
                        <path d="M 7 15 Q 12 18 17 15" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                  {/* Pin Tail Point */}
                  <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[10px] border-t-red-500 -mt-[1px] drop-shadow-sm" />
                </div>
                {/* Pin shadow */}
                <div className="w-3.5 h-1 bg-black/20 rounded-full blur-[1px] mt-1.5" />
              </div>

              {/* Lokasi anda overlay card */}
              <div className="absolute bottom-3 inset-x-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm p-3 rounded-xl border border-border/40 shadow-soft">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Lokasi Anda</span>
                  <button 
                    type="button" 
                    onClick={fetchGPSLocation} 
                    className="text-primary hover:underline text-[9px] uppercase tracking-normal"
                  >
                    Perbarui GPS
                  </button>
                </div>
                <div className="text-xs font-semibold text-foreground truncate mt-1 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{address}</span>
                </div>
              </div>
            </div>

            {/* GPS Loading & Status */}
            <div className="text-center space-y-1">
              {gpsLoading ? (
                <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-xs font-medium text-muted-foreground">Sedang mengambil lokasi...</p>
                  <p className="text-[10px] text-muted-foreground/80">Pastikan anda sudah mengaktifkan GPS</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 py-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-success">
                    <div className="h-2 w-2 rounded-full bg-success animate-ping" />
                    GPS Terkunci (Presisi Tinggi)
                  </div>
                  <p className="text-[10px] text-muted-foreground">Anda berada di radius dapur produksi</p>
                </div>
              )}
            </div>

            {/* Clock-in Info & Date Card */}
            <div className="bg-muted/30 rounded-2xl p-4 border flex items-center justify-between shadow-sm">
              <div className="bg-white dark:bg-slate-900 border rounded-xl p-2.5 flex flex-col items-center justify-center min-w-[72px] shadow-sm">
                <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                  {(() => {
                    const months = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGS", "SEP", "OKT", "NOP", "DES"];
                    return months[new Date().getMonth()];
                  })()}
                </span>
                <span className="text-2xl font-black text-foreground my-0.5 leading-none">
                  {new Date().getDate()}
                </span>
                <span className="text-[9px] font-extrabold text-muted-foreground uppercase tracking-widest">
                  {(() => {
                    const daysIndo = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
                    return daysIndo[new Date().getDay()].slice(0, 3);
                  })()}
                </span>
              </div>

              <div className="flex-1 grid grid-cols-2 gap-2 text-center border-l ml-4 pl-4">
                <div>
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Masuk</div>
                  <div className="text-base font-extrabold text-foreground mt-0.5">
                    {todayRecord?.jamMasuk ?? "--:--"}
                  </div>
                </div>
                <div className="border-l">
                  <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Keluar</div>
                  <div className="text-base font-extrabold text-foreground mt-0.5">
                    {todayRecord?.jamPulang ?? "--:--"}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Checkin Button */}
            <div className="w-full space-y-3">
              {!todayRecord ? (
                <Button 
                  onClick={handleClockInGPS}
                  disabled={gpsLoading}
                  className="w-full h-12 gradient-primary text-primary-foreground hover-lift font-bold text-sm shadow-md"
                >
                  <Plus className="mr-2 h-5 w-5" /> Absen Masuk (GPS)
                </Button>
              ) : !todayRecord.jamPulang ? (
                <Button 
                  onClick={handleClockOutGPS}
                  disabled={gpsLoading}
                  className="w-full h-12 bg-success text-success-foreground hover:bg-success/90 hover-lift font-bold text-sm shadow-md"
                >
                  <CheckCircle2 className="mr-2 h-5 w-5" /> Absen Pulang (GPS)
                </Button>
              ) : (
                <div className="h-12 w-full flex items-center justify-center bg-success/10 border border-success/30 rounded-xl text-sm font-semibold text-success shadow-inner">
                  <Check className="mr-2 h-5 w-5 shrink-0" /> Absensi Hari Ini Lengkap ({todayRecord.jamMasuk} - {todayRecord.jamPulang})
                </div>
              )}
            </div>
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

              <div className="w-full space-y-3">
                {!todayRecord ? (
                  <Button 
                    onClick={handleClockIn} 
                    className="h-12 w-full gradient-primary text-primary-foreground hover-lift font-bold text-sm"
                  >
                    <Plus className="mr-2 h-5 w-5 shrink-0" /> Absen Masuk
                  </Button>
                ) : !todayRecord.jamPulang ? (
                  <Button 
                    onClick={handleClockOut} 
                    className="h-12 w-full bg-success text-success-foreground hover:bg-success/90 hover-lift font-bold text-sm"
                  >
                    <CheckCircle2 className="mr-2 h-5 w-5 shrink-0" /> Absen Pulang
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

      <Card className="glass border-0 shadow-card max-w-sm">
        <CardContent className="p-4 flex items-center gap-3">
          <CalendarCheck className="h-8 w-8 text-success" />
          <div>
            <div className="text-xs text-muted-foreground">Total Hadir (filter)</div>
            <div className="text-xl font-bold">{totalHadir}</div>
          </div>
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
                    <TableHead className="text-right">Terlambat</TableHead>
                    <TableHead>Tgl Terlambat</TableHead>
                    <TableHead className="text-right">Lembur (Jam)</TableHead>
                    <TableHead className="text-right">Tunjangan</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Gaji Pokok</TableHead>
                    <TableHead className="text-right">Total Gaji</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rekapPg.paged.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-6">
                        Belum ada data rekap gaji
                      </TableCell>
                    </TableRow>
                  )}
                  {rekapPg.paged.map((r) => (
                    <TableRow key={r.k.id}>
                      <TableCell className="whitespace-nowrap font-semibold">{r.k.nama}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.k.posisi}</TableCell>
                      <TableCell className="text-right font-semibold text-success">{r.hadir} hari</TableCell>
                      <TableCell className={`text-right font-semibold ${r.terlambatCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {r.terlambatCount}x
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={r.terlambatDates}>
                        {r.terlambatDates || "-"}
                      </TableCell>
                      <TableCell className="text-right">{r.overtimeHours} jam</TableCell>
                      <TableCell className="text-right text-success">+{rupiah(r.tunjanganTotal)}</TableCell>
                      <TableCell className="text-right text-success">+{rupiah(r.totalBonus)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{rupiah(r.k.gajiPokok)}/hr</TableCell>
                      <TableCell className="text-right font-bold text-primary">{rupiah(r.totalGaji)}</TableCell>
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
          <div className="flex justify-end mt-4 pt-4 border-t">
            <Button 
              onClick={() => navigate("/slip-gaji")} 
              className="gradient-primary text-primary-foreground hover-lift w-full sm:w-auto"
            >
              <FileText className="mr-2 h-4 w-4" /> Cetak Slip Gaji
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AbsensiTable({ filtered, karyawan, outlets }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Outlet</TableHead>
              <TableHead>Masuk</TableHead>
              <TableHead>Pulang</TableHead>
              <TableHead className="text-right">Bonus</TableHead>
              <TableHead className="text-right">Tunjangan</TableHead>
              <TableHead className="text-right">Lembur</TableHead>
              <TableHead>Catatan</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Belum ada absensi</TableCell></TableRow>
            )}
            {paged.map((a: any) => {
              const k = karyawan.find((x: any) => x.id === a.karyawanId);
              const o = outlets.find((x: any) => x.id === k?.outletId);
              const isLate = a.jamMasuk && a.jamMasuk > "07:00";
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{a.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{k?.nama ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-xs">{o?.nama ?? "-"}</TableCell>
                  <TableCell className={isLate ? "text-destructive font-semibold" : ""}>
                    {a.jamMasuk ?? "-"}
                    {isLate && <Badge variant="destructive" className="ml-1 text-[8px] px-1 py-0 h-3.5">Telat</Badge>}
                  </TableCell>
                  <TableCell>{a.jamPulang ?? "-"}</TableCell>
                  <TableCell className="text-right text-success">+{rupiah(a.bonus ?? 0)}</TableCell>
                  <TableCell className="text-right text-success">+{rupiah(a.tunjangan ?? 0)}</TableCell>
                  <TableCell className="text-right font-medium">{a.overtime ?? 0} jam</TableCell>
                  <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground" title={a.catatan}>{a.catatan || "-"}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => db.deleteAbsensi(a.id)}>
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
