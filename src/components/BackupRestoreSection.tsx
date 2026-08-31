import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, AlertTriangle, CheckCircle, Loader2, Calendar, Database, FileText } from "lucide-react";
import { toast } from "sonner";
import { db, useDB, getBubaSettings, fetchFromSupabase } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";

// ─── Full Backup Interface ────────────────────────────────────────────────────
interface BackupData {
  version: 1;
  createdAt: string;
  settings: ReturnType<typeof getBubaSettings>;
  data: {
    outlets: any[];
    produk: any[];
    coa: any[];
    bahan: any[];
    karyawan: any[];
    users: any[];
    penjualan: any[];
    produksi: any[];
    jurnal: any[];
    stokMov: any[];
    absensi: any[];
    permohonanStok: any[];
    kodeBantu: any[];
    hppProduk: any[];
    hppBahan: any[];
    hppConsumable: any[];
    logAktivitas: any[];
  };
}

// ─── Monthly Session Backup Interface ─────────────────────────────────────────
interface MonthlySessionBackup {
  version: 2;
  type: "monthly-session";
  createdAt: string;
  bulan: number; // 1-12
  tahun: number;
  data: {
    penjualan: any[];
    produksi: any[];
    stokMov: any[];
    absensi: any[];
  };
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const BATCH_SIZE = 500;

export default function BackupRestoreSection() {
  const dbState = useDB();
  const fullFileInputRef = useRef<HTMLInputElement>(null);
  const monthlyFileInputRef = useRef<HTMLInputElement>(null);

  const [restoring, setRestoring] = useState(false);
  const [restoringMonthly, setRestoringMonthly] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ count: number; size: string } | null>(null);

  // Monthly session state
  const now = new Date();
  const [bulan, setBulan] = useState(String(now.getMonth() + 1));
  const [tahun, setTahun] = useState(String(now.getFullYear()));

  // ─── Available years from data ───────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    dbState.penjualan.forEach((p: any) => {
      if (p.tanggal) years.add(Number(p.tanggal.slice(0, 4)));
    });
    dbState.produksi.forEach((p: any) => {
      if (p.tanggal) years.add(Number(p.tanggal.slice(0, 4)));
    });
    dbState.stokMov.forEach((m: any) => {
      if (m.tanggal) years.add(Number(m.tanggal.slice(0, 4)));
    });
    dbState.absensi.forEach((a: any) => {
      if (a.tanggal) years.add(Number(a.tanggal.slice(0, 4)));
    });
    years.add(now.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [dbState.penjualan, dbState.produksi, dbState.stokMov, dbState.absensi]);

  // ─── Count records for selected month ────────────────────────────────────────
  const monthlyStats = useMemo(() => {
    const prefix = `${tahun}-${String(bulan).padStart(2, "0")}`;
    const penjualan = dbState.penjualan.filter((p: any) => p.tanggal?.startsWith(prefix)).length;
    const produksi = dbState.produksi.filter((p: any) => p.tanggal?.startsWith(prefix)).length;
    const stokMov = dbState.stokMov.filter((m: any) => m.tanggal?.startsWith(prefix)).length;
    const absensi = dbState.absensi.filter((a: any) => a.tanggal?.startsWith(prefix)).length;
    return { penjualan, produksi, stokMov, absensi, total: penjualan + produksi + stokMov + absensi };
  }, [dbState.penjualan, dbState.produksi, dbState.stokMov, dbState.absensi, bulan, tahun]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // FULL BACKUP
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleFullBackup = () => {
    try {
      const backupData: BackupData = {
        version: 1,
        createdAt: new Date().toISOString(),
        settings: getBubaSettings(),
        data: {
          outlets: dbState.outlets,
          produk: dbState.produk,
          coa: dbState.coa,
          bahan: dbState.bahan,
          karyawan: dbState.karyawan,
          users: dbState.users,
          penjualan: dbState.penjualan,
          produksi: dbState.produksi,
          jurnal: dbState.jurnal,
          stokMov: dbState.stokMov,
          absensi: dbState.absensi,
          permohonanStok: dbState.permohonanStok,
          kodeBantu: dbState.kodeBantu,
          hppProduk: dbState.hppProduk,
          hppBahan: dbState.hppBahan,
          hppConsumable: dbState.hppConsumable,
          logAktivitas: dbState.logAktivitas,
        },
      };

      const json = JSON.stringify(backupData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const totalRecords = Object.values(backupData.data).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
      );
      const sizeKB = (blob.size / 1024).toFixed(1);

      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `buba-backup-full-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupInfo({ count: totalRecords, size: `${sizeKB} KB` });
      toast.success(`Backup penuh berhasil! ${totalRecords} records (${sizeKB} KB)`);
    } catch (err: any) {
      toast.error(`Backup gagal: ${err?.message || "Terjadi kesalahan"}`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // MONTHLY SESSION BACKUP
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleMonthlyBackup = () => {
    try {
      const prefix = `${tahun}-${String(bulan).padStart(2, "0")}`;

      const penjualan = dbState.penjualan.filter((p: any) => p.tanggal?.startsWith(prefix));
      const produksi = dbState.produksi.filter((p: any) => p.tanggal?.startsWith(prefix));
      const stokMov = dbState.stokMov.filter((m: any) => m.tanggal?.startsWith(prefix));
      const absensi = dbState.absensi.filter((a: any) => a.tanggal?.startsWith(prefix));

      if (penjualan.length === 0 && produksi.length === 0 && stokMov.length === 0 && absensi.length === 0) {
        toast.error(`Tidak ada data untuk ${MONTHS[Number(bulan) - 1]} ${tahun}`);
        return;
      }

      const backup: MonthlySessionBackup = {
        version: 2,
        type: "monthly-session",
        createdAt: new Date().toISOString(),
        bulan: Number(bulan),
        tahun: Number(tahun),
        data: { penjualan, produksi, stokMov, absensi },
      };

      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const totalRecords = penjualan.length + produksi.length + stokMov.length + absensi.length;
      const sizeKB = (blob.size / 1024).toFixed(1);

      const monthName = MONTHS[Number(bulan) - 1].toLowerCase();
      const a = document.createElement("a");
      a.href = url;
      a.download = `buba-sesi-${monthName}${tahun}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(
        `Backup sesi ${MONTHS[Number(bulan) - 1]} ${tahun} berhasil! ` +
        `${penjualan.length} penjualan, ${produksi.length} produksi, ${stokMov.length} stok, ${absensi.length} absensi (${sizeKB} KB)`
      );
    } catch (err: any) {
      toast.error(`Backup sesi gagal: ${err?.message || "Terjadi kesalahan"}`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // FULL RESTORE
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleFullRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.endsWith(".json")) {
      toast.error("File harus berformat JSON (.json)");
      return;
    }

    const confirmed = window.confirm(
      "⚠️ RESTORE DATA PENUH\n\nIni akan mengganti SELURUH data saat ini dengan data dari file backup.\n\nData yang ada akan DIHAPUS terlebih dahulu, lalu diganti dengan data backup.\n\nLanjutkan?"
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      const text = await file.text();
      const backup: BackupData = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error("Format file backup tidak valid");
      }

      const d = backup.data;

      // Step 1: Delete all
      toast.info("Menghapus data lama...");
      await Promise.all([
        supabaseDelete("penjualan"), supabaseDelete("produksi"),
        supabaseDelete("jurnal"), supabaseDelete("stok_movement"),
        supabaseDelete("absensi"), supabaseDelete("permohonan_stok"),
        supabaseDelete("hpp_consumable"), supabaseDelete("hpp_bahan"),
        supabaseDelete("hpp_produk"), supabaseDelete("kode_bantu"),
        supabaseDelete("log_aktivitas"), supabaseDelete("karyawan"),
        supabaseDelete("users"), supabaseDelete("produk"),
        supabaseDelete("outlets"), supabaseDelete("coa"),
        supabaseDelete("bahan_baku"),
      ]);

      // Step 2: Restore in order
      toast.info("Memulihkan data...");
      if (d.outlets?.length) await supabaseInsert("outlets", d.outlets.map(mapOutlet));
      if (d.produk?.length) await supabaseInsert("produk", d.produk.map(mapProduk));
      if (d.coa?.length) await supabaseInsert("coa", d.coa);
      if (d.bahan?.length) await supabaseInsert("bahan_baku", d.bahan.map(mapBahan));
      if (d.users?.length) await supabaseInsert("users", d.users.map(mapUser));
      if (d.karyawan?.length) await supabaseInsert("karyawan", d.karyawan.map(mapKaryawan));
      if (d.penjualan?.length) await supabaseInsert("penjualan", d.penjualan.map(mapPenjualan));
      if (d.produksi?.length) await supabaseInsert("produksi", d.produksi.map(mapProduksi));
      if (d.stokMov?.length) await supabaseInsert("stok_movement", d.stokMov.map(mapStokMov));
      if (d.absensi?.length) await supabaseInsert("absensi", d.absensi.map(mapAbsensi));
      if (d.permohonanStok?.length) await supabaseInsert("permohonan_stok", d.permohonanStok.map(mapPermohonanStok));
      if (d.kodeBantu?.length) await supabaseInsert("kode_bantu", d.kodeBantu.map(mapKodeBantu));
      if (d.jurnal?.length) await supabaseInsert("jurnal", d.jurnal.map(mapJurnal));
      if (d.hppProduk?.length) await supabaseInsert("hpp_produk", d.hppProduk.map(mapHppProduk));
      if (d.hppBahan?.length) await supabaseInsert("hpp_bahan", d.hppBahan.map(mapHppBahan));
      if (d.hppConsumable?.length) await supabaseInsert("hpp_consumable", d.hppConsumable.map(mapHppConsumable));
      if (d.logAktivitas?.length) await supabaseInsert("log_aktivitas", d.logAktivitas.map(mapLogAktivitas));

      if (backup.settings) {
        const { saveAppSettings } = await import("@/lib/store");
        saveAppSettings(backup.settings);
      }

      await fetchFromSupabase();

      const totalRecords = Object.values(d).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0
      );
      toast.success(`Restore penuh berhasil! ${totalRecords} records dipulihkan.`);
    } catch (err: any) {
      console.error("Full restore error:", err);
      toast.error(`Restore gagal: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      setRestoring(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // MONTHLY SESSION RESTORE
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleMonthlyRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.endsWith(".json")) {
      toast.error("File harus berformat JSON (.json)");
      return;
    }

    setRestoringMonthly(true);
    try {
      const text = await file.text();
      const backup: BackupData | MonthlySessionBackup = JSON.parse(text);

      // Detect backup type
      const isMonthlySession = backup.type === "monthly-session" || (backup as MonthlySessionBackup).bulan;

      if (isMonthlySession) {
        // Monthly session restore
        const mb = backup as MonthlySessionBackup;
        const monthLabel = MONTHS[(mb.bulan || 1) - 1];
        const prefix = `${mb.tahun}-${String(mb.bulan).padStart(2, "0")}`;

        const confirmed = window.confirm(
          `⚠️ RESTORE SESI BULANAN\n\n` +
          `Memulihkan data bulan ${monthLabel} ${mb.tahun}:\n` +
          `• ${mb.data?.penjualan?.length || 0} Penjualan\n` +
          `• ${mb.data?.produksi?.length || 0} Produksi\n` +
          `• ${mb.data?.stokMov?.length || 0} Stok Movement\n` +
          `• ${mb.data?.absensi?.length || 0} Absensi\n\n` +
          `Data bulan ${monthLabel} ${mb.tahun} yang ada akan DIHAPUS lalu diganti.\n` +
          `Data bulan lain TIDAK terpengaruh.\n\nLanjutkan?`
        );
        if (!confirmed) { setRestoringMonthly(false); return; }

        // Delete existing data for this month only
        toast.info(`Menghapus data ${monthLabel} ${mb.tahun}...`);
        await Promise.all([
          supabaseDeleteByMonth("penjualan", "tanggal", prefix),
          supabaseDeleteByMonth("produksi", "tanggal", prefix),
          supabaseDeleteByMonth("stok_movement", "tanggal", prefix),
          supabaseDeleteByMonth("absensi", "tanggal", prefix),
        ]);

        // Insert new data
        toast.info(`Memulihkan data ${monthLabel} ${mb.tahun}...`);
        if (mb.data?.penjualan?.length) {
          await supabaseInsert("penjualan", mb.data.penjualan.map(mapPenjualan));
        }
        if (mb.data?.produksi?.length) {
          await supabaseInsert("produksi", mb.data.produksi.map(mapProduksi));
        }
        if (mb.data?.stokMov?.length) {
          await supabaseInsert("stok_movement", mb.data.stokMov.map(mapStokMov));
        }
        if (mb.data?.absensi?.length) {
          await supabaseInsert("absensi", mb.data.absensi.map(mapAbsensi));
        }

        await fetchFromSupabase();

        const total = (mb.data?.penjualan?.length || 0) +
                      (mb.data?.produksi?.length || 0) +
                      (mb.data?.stokMov?.length || 0) +
                      (mb.data?.absensi?.length || 0);
        toast.success(`Restore sesi ${monthLabel} ${mb.tahun} berhasil! ${total} records dipulihkan.`);

      } else {
        // Full backup format — ask if user wants full restore or extract month
        const fb = backup as BackupData;
        if (!fb.data) {
          throw new Error("Format file backup tidak valid");
        }

        // Check if there's data to extract by month
        const d = fb.data;
        const hasMonthlyData = (d.penjualan?.length || 0) + (d.produksi?.length || 0) + (d.stokMov?.length || 0) + (d.absensi?.length || 0) > 0;

        if (!hasMonthlyData) {
          throw new Error("File backup tidak mengandung data penjualan, produksi, stok, atau absensi");
        }

        // Get available months from the backup file
        const allDates = [
          ...(d.penjualan || []).map((p: any) => p.tanggal),
          ...(d.produksi || []).map((p: any) => p.tanggal),
          ...(d.stokMov || []).map((m: any) => m.tanggal),
          ...(d.absensi || []).map((a: any) => a.tanggal),
        ].filter(Boolean);

        const monthSet = new Set<string>();
        allDates.forEach((dt: string) => {
          if (dt?.length >= 7) monthSet.add(dt.slice(0, 7)); // "YYYY-MM"
        });

        const availableMonths = Array.from(monthSet).sort().reverse();

        if (availableMonths.length === 0) {
          throw new Error("Tidak ditemukan data dengan tanggal yang valid di file backup");
        }

        // Build month options for user selection
        const monthOptions = availableMonths.map((m) => {
          const [y, mo] = m.split("-");
          return { key: m, label: `${MONTHS[parseInt(mo) - 1]} ${y}`, prefix: m };
        });

        // Prompt user to pick a month
        const monthListStr = monthOptions.map((m, i) => `${i + 1}. ${m.label}`).join("\n");
        const selection = window.prompt(
          `📅 PILIH BULAN UNTUK RESTORE\n\n` +
          `File backup berisi data bulan berikut:\n${monthListStr}\n\n` +
          `Masukkan nomor bulan (1-${monthOptions.length}):`
        );

        if (!selection) { setRestoringMonthly(false); return; }

        const idx = parseInt(selection) - 1;
        if (isNaN(idx) || idx < 0 || idx >= monthOptions.length) {
          toast.error("Nomor bulan tidak valid");
          setRestoringMonthly(false);
          return;
        }

        const chosen = monthOptions[idx];
        const confirmed = window.confirm(
          `⚠️ RESTORE SESI BULANAN\n\n` +
          `Memulihkan data bulan ${chosen.label} dari file backup penuh.\n` +
          `Data bulan ${chosen.label} yang ada akan DIHAPUS lalu diganti.\n` +
          `Data bulan lain TIDAK terpengaruh.\n\nLanjutkan?`
        );
        if (!confirmed) { setRestoringMonthly(false); return; }

        // Filter data by chosen month
        const penjualanData = (d.penjualan || []).filter((p: any) => p.tanggal?.startsWith(chosen.prefix));
        const produksiData = (d.produksi || []).filter((p: any) => p.tanggal?.startsWith(chosen.prefix));
        const stokData = (d.stokMov || []).filter((m: any) => m.tanggal?.startsWith(chosen.prefix));
        const absensiData = (d.absensi || []).filter((a: any) => a.tanggal?.startsWith(chosen.prefix));

        // Delete existing data for this month
        toast.info(`Menghapus data ${chosen.label}...`);
        await Promise.all([
          supabaseDeleteByMonth("penjualan", "tanggal", chosen.prefix),
          supabaseDeleteByMonth("produksi", "tanggal", chosen.prefix),
          supabaseDeleteByMonth("stok_movement", "tanggal", chosen.prefix),
          supabaseDeleteByMonth("absensi", "tanggal", chosen.prefix),
        ]);

        // Insert filtered data
        toast.info(`Memulihkan data ${chosen.label}...`);
        if (penjualanData.length) await supabaseInsert("penjualan", penjualanData.map(mapPenjualan));
        if (produksiData.length) await supabaseInsert("produksi", produksiData.map(mapProduksi));
        if (stokData.length) await supabaseInsert("stok_movement", stokData.map(mapStokMov));
        if (absensiData.length) await supabaseInsert("absensi", absensiData.map(mapAbsensi));

        await fetchFromSupabase();

        const total = penjualanData.length + produksiData.length + stokData.length + absensiData.length;
        toast.success(`Restore sesi ${chosen.label} berhasil! ${total} records dipulihkan.`);
      }
    } catch (err: any) {
      console.error("Monthly restore error:", err);
      toast.error(`Restore sesi gagal: ${err?.message || "Terjadi kesalahan"}`);
    } finally {
      setRestoringMonthly(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">

      {/* ─── BACKUP & RESTORE SESI BULANAN ──────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Backup & Restore Sesi Bulanan
          </h3>
          <p className="text-xs text-muted-foreground">
            Ekspor atau impor data <strong>Penjualan, Produksi, Stok, dan Absensi</strong> per bulan tertentu.
            Cocok untuk arsip bulanan atau migrasi data antar komputer per sesi.
          </p>

          {/* Month/Year Selector */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Bulan</Label>
              <Select value={bulan} onValueChange={setBulan}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px]">Tahun</Label>
              <Select value={tahun} onValueChange={setTahun}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stats for selected month */}
          <div className="bg-muted/30 rounded-lg p-2 text-[10px] space-y-0.5">
            <div className="font-semibold text-foreground">
              {MONTHS[Number(bulan) - 1]} {tahun}
            </div>
            <div className="text-muted-foreground">
              📊 {monthlyStats.penjualan} penjualan &bull; {monthlyStats.produksi} produksi &bull; {monthlyStats.stokMov} stok &bull; {monthlyStats.absensi} absensi
            </div>
            {monthlyStats.total === 0 && (
              <div className="text-amber-600">Tidak ada data untuk bulan ini</div>
            )}
          </div>

          {/* Monthly Backup Button */}
          <Button
            onClick={handleMonthlyBackup}
            disabled={monthlyStats.total === 0}
            className="w-full h-9 text-xs gradient-primary text-primary-foreground"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download Sesi {MONTHS[Number(bulan) - 1]} {tahun}
          </Button>

          {/* Monthly Restore */}
          <div className="border-t pt-3 mt-1">
            <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Hanya data <strong>Penjualan, Produksi, Stok, dan Absensi</strong> bulan yang dipilih akan diganti.
                Data bulan lain tidak terpengaruh.
              </span>
            </div>
            <input
              ref={monthlyFileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleMonthlyRestore}
            />
            <Button
              onClick={() => monthlyFileInputRef.current?.click()}
              disabled={restoringMonthly}
              variant="outline"
              className="w-full h-9 text-xs"
            >
              {restoringMonthly ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Memulihkan sesi bulanan...
                </>
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Restore Sesi Bulanan dari File
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── FULL BACKUP ──────────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Backup Penuh
          </h3>
          <p className="text-xs text-muted-foreground">
            Ekspor seluruh data aplikasi ke file JSON. Termasuk semua master data, transaksi, dan pengaturan.
          </p>
          <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2 space-y-0.5">
            <div>📦 Data yang di-backup:</div>
            <div className="ml-2">
              Outlet, Produk, COA, Bahan Baku, Karyawan, Users<br/>
              Penjualan, Produksi, Jurnal, Stok Movement<br/>
              Absensi, Permohonan Stok, Kode Bantu<br/>
              HPP Produk/Bahan/Consumable, Log Aktivitas, Settings
            </div>
          </div>
          {backupInfo && (
            <div className="text-[10px] text-emerald-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Terakhir: {backupInfo.count} records ({backupInfo.size})
            </div>
          )}
          <Button
            onClick={handleFullBackup}
            className="w-full h-9 text-xs gradient-primary text-primary-foreground"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download Backup Penuh
          </Button>
        </CardContent>
      </Card>

      {/* ─── FULL RESTORE ─────────────────────────────────────────────────────── */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Upload className="h-4 w-4 text-amber-600" />
            Restore Penuh
          </h3>
          <p className="text-xs text-muted-foreground">
            Impor data dari file backup JSON. <strong>Semua data</strong> saat ini akan diganti.
          </p>
          <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              <strong>Peringatan:</strong> Semua data saat ini akan dihapus dan diganti. Gunakan Restore Sesi Bulanan jika hanya ingin mengembalikan data bulan tertentu.
            </span>
          </div>
          <input
            ref={fullFileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFullRestore}
          />
          <Button
            onClick={() => fullFileInputRef.current?.click()}
            disabled={restoring}
            variant="outline"
            className="w-full h-9 text-xs"
          >
            {restoring ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Memulihkan data penuh...
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Pilih File & Restore Penuh
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function supabaseDelete(table: string) {
  const pk = getPrimaryKey(table);
  const { error } = await supabase.from(table).delete().neq(pk, "");
  if (error) console.warn(`supabaseDelete(${table}) error:`, error.message);
}

async function supabaseDeleteByMonth(table: string, dateCol: string, prefix: string) {
  // prefix = "YYYY-MM"
  const gte = `${prefix}-01`;
  const lt = prefix.slice(0, 4) === "12"
    ? `${Number(prefix.slice(0, 4)) + 1}-01-01`
    : `${prefix.slice(0, 4)}-${String(Number(prefix.slice(5, 7)) + 1).padStart(2, "0")}-01`;

  const { error } = await supabase
    .from(table)
    .delete()
    .gte(dateCol, gte)
    .lt(dateCol, lt);

  if (error) console.warn(`supabaseDeleteByMonth(${table}, ${prefix}) error:`, error.message);
}

async function supabaseInsert(table: string, rows: any[]) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`supabaseInsert(${table}) batch ${i}-${i + batch.length} error:`, error.message);
      throw error;
    }
  }
}

function getPrimaryKey(table: string): string {
  const pkMap: Record<string, string> = {
    outlets: "id", produk: "id", coa: "kode", bahan_baku: "id",
    users: "username", karyawan: "id", penjualan: "id", produksi: "id",
    jurnal: "id", stok_movement: "id", absensi: "id", permohonan_stok: "id",
    kode_bantu: "id", hpp_produk: "id", hpp_bahan: "id", hpp_consumable: "id",
    log_aktivitas: "id",
  };
  return pkMap[table] || "id";
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAP FUNCTIONS (JS state → Supabase columns)
// ═══════════════════════════════════════════════════════════════════════════════

function mapOutlet(o: any) {
  return { id: o.id, nama: o.nama, lokasi: o.lokasi };
}
function mapProduk(p: any) {
  return { id: p.id, nama: p.nama, harga: p.harga, satuan: p.satuan };
}
function mapBahan(b: any) {
  return {
    id: b.id, kode: b.kode, nama: b.nama, satuan: b.satuan,
    stok_min: b.stokMin, stok_awal: b.stokAwal,
    harga_beli: b.hargaBeli, konversi_gram: b.konversiGram ?? null,
  };
}
function mapUser(u: any) {
  return {
    username: u.username, password: u.password, nama: u.nama,
    role: u.role, outlet_id: u.outletId ?? null, karyawan_id: u.karyawanId ?? null,
  };
}
function mapKaryawan(k: any) {
  return {
    id: k.id, nama: k.nama, posisi: k.posisi, role: k.role || "outlet",
    outlet_id: k.outletId ?? null, gaji_pokok: k.gajiPokok,
    bonus_omset: k.bonusOmset ?? 0, bonus_ulasan: k.bonusUlasan ?? 0,
    bonus_oh: k.bonusOH ?? 0, tunjangan_harian: k.tunjanganHarian ?? 0,
    overtime_rate: k.overtimeRate ?? 0,
    jam_masuk: k.jamMasuk ?? null, jam_pulang: k.jamPulang ?? null,
  };
}
function mapPenjualan(p: any) {
  return {
    id: p.id, tanggal: p.tanggal, outlet_id: p.outletId,
    produk_id: p.produkId, qty: p.qty, harga: p.harga, total: p.total,
    sisa_gram: p.sisaGram ?? null, variant: p.variant ?? null,
  };
}
function mapProduksi(p: any) {
  return {
    id: p.id, tanggal: p.tanggal, produk_id: p.produkId,
    qty_rencana: p.qtyRencana, qty_realisasi: p.qtyRealisasi,
  };
}
function mapJurnal(j: any) {
  return {
    id: j.id, tanggal: j.tanggal, ref: j.ref, keterangan: j.keterangan,
    kode_akun: j.kodeAkun, akun: j.akun, tipe: j.tipe,
    jumlah: j.jumlah, kategori: j.kategori, kode_bantu_id: j.kodeBantuId ?? null,
  };
}
function mapStokMov(m: any) {
  return {
    id: m.id, tanggal: m.tanggal, bahan_id: m.bahanId,
    tipe: m.tipe, qty: m.qty, keterangan: m.keterangan,
    produksi_id: m.produksiId ?? null,
  };
}
function mapAbsensi(a: any) {
  return {
    id: a.id, tanggal: a.tanggal, karyawan_id: a.karyawanId,
    jam_masuk: a.jamMasuk, jam_pulang: a.jamPulang, status: a.status,
    catatan: a.catatan, bonus: a.bonus ?? 0,
    tunjangan: a.tunjangan ?? 0, overtime: a.overtime ?? 0,
  };
}
function mapPermohonanStok(p: any) {
  return {
    id: p.id, tanggal: p.tanggal, tanggal_kirim: p.tanggalKirim,
    outlet_id: p.outletId, produk_id: p.produkId, qty: p.qty,
    status: p.status, catatan: p.catatan,
    qty_rencana: p.qtyRencana ?? p.qty,
    catatan_rencana: p.catatanRencana ?? p.catatan ?? null,
  };
}
function mapKodeBantu(k: any) {
  return {
    id: k.id, kode: k.kode, kode_akun: k.kodeAkun, nama: k.nama,
    keterangan: k.keterangan ?? null, saldo_awal: k.saldoAwal ?? 0,
    created_at: k.createdAt ?? null,
  };
}
function mapHppProduk(h: any) {
  return {
    id: h.id, produk_id: h.produkId, harga_jual: h.hargaJual,
    catatan: h.catatan ?? null, aktif: h.aktif ?? true,
    updated_at: h.updatedAt ?? null,
  };
}
function mapHppBahan(b: any) {
  return {
    id: b.id, hpp_produk_id: b.hppProdukId, nama_item: b.namaItem,
    satuan: b.satuan, berat: b.berat, harga: b.harga,
    jadi: b.jadi, urutan: b.urutan,
  };
}
function mapHppConsumable(c: any) {
  return {
    id: c.id, hpp_produk_id: c.hppProdukId, nama_item: c.namaItem,
    satuan: c.satuan, berat: c.berat, harga: c.harga,
    jumlah: c.jumlah, urutan: c.urutan,
  };
}
function mapLogAktivitas(l: any) {
  return {
    id: l.id, created_at: l.createdAt, username: l.username,
    nama_user: l.namaUser ?? null, aksi: l.aksi, modul: l.modul,
    record_id: l.recordId ?? null, detail: l.detail ?? null,
    nilai_lama: l.nilaiLama ?? null, nilai_baru: l.nilaiBaru ?? null,
  };
}
