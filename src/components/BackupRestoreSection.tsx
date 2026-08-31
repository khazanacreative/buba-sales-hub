import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Upload, AlertTriangle, CheckCircle, Loader2, Calendar, Database, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useDB, getBubaSettings, fetchFromSupabase } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

// ─── Backup Interfaces ────────────────────────────────────────────────────────
interface FullBackupData {
  version: 1;
  type: "full";
  createdAt: string;
  settings: ReturnType<typeof getBubaSettings>;
  data: Record<string, any[]>;
}

interface MonthlySessionBackup {
  version: 2;
  type: "monthly-session";
  createdAt: string;
  bulan: number;
  tahun: number;
  data: Record<string, any[]>;
}

type BackupData = FullBackupData | MonthlySessionBackup;

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const BATCH_SIZE = 500;

// ─── Sheet column definitions ──────────────────────────────────────────────────
const FULL_SHEETS: { key: string; label: string; columns: string[]; mapper: (r: any) => any[] }[] = [
  { key: "outlets",       label: "Outlet",        columns: ["id","nama","lokasi"],                                       mapper: (r) => [r.id, r.nama, r.lokasi] },
  { key: "produk",        label: "Produk",         columns: ["id","nama","harga","satuan"],                               mapper: (r) => [r.id, r.nama, r.harga, r.satuan] },
  { key: "coa",           label: "COA",            columns: ["kode","nama","tipe","kategori"],                            mapper: (r) => [r.kode, r.nama, r.tipe, r.kategori] },
  { key: "bahan",         label: "Bahan Baku",     columns: ["id","kode","nama","satuan","stok_min","stok_awal","harga_beli","konversi_gram"], mapper: (r) => [r.id, r.kode, r.nama, r.satuan, r.stokMin, r.stokAwal, r.hargaBeli, r.konversiGram] },
  { key: "karyawan",      label: "Karyawan",       columns: ["id","nama","posisi","role","outlet_id","gaji_pokok","bonus_omset","bonus_ulasan","bonus_oh","tunjangan_harian","overtime_rate","jam_masuk","jam_pulang"], mapper: (r) => [r.id, r.nama, r.posisi, r.role, r.outletId, r.gajiPokok, r.bonusOmset, r.bonusUlasan, r.bonusOH, r.tunjanganHarian, r.overtimeRate, r.jamMasuk, r.jamPulang] },
  { key: "users",         label: "Users",          columns: ["username","password","nama","role","outlet_id","karyawan_id"], mapper: (r) => [r.username, r.password, r.nama, r.role, r.outletId, r.karyawanId] },
  { key: "penjualan",     label: "Penjualan",      columns: ["id","tanggal","outlet_id","produk_id","qty","harga","total","sisa_gram","variant"], mapper: (r) => [r.id, r.tanggal, r.outletId, r.produkId, r.qty, r.harga, r.total, r.sisaGram, r.variant] },
  { key: "produksi",      label: "Produksi",       columns: ["id","tanggal","produk_id","qty_rencana","qty_realisasi"],   mapper: (r) => [r.id, r.tanggal, r.produkId, r.qtyRencana, r.qtyRealisasi] },
  { key: "stokMov",       label: "Stok Movement",  columns: ["id","tanggal","bahan_id","tipe","qty","keterangan","produksi_id"], mapper: (r) => [r.id, r.tanggal, r.bahanId, r.tipe, r.qty, r.keterangan, r.produksiId] },
  { key: "absensi",       label: "Absensi",        columns: ["id","tanggal","karyawan_id","jam_masuk","jam_pulang","status","catatan","bonus","tunjangan","overtime"], mapper: (r) => [r.id, r.tanggal, r.karyawanId, r.jamMasuk, r.jamPulang, r.status, r.catatan, r.bonus, r.tunjangan, r.overtime] },
  { key: "jurnal",        label: "Jurnal",         columns: ["id","tanggal","ref","keterangan","kode_akun","akun","tipe","jumlah","kategori","kode_bantu_id"], mapper: (r) => [r.id, r.tanggal, r.ref, r.keterangan, r.kodeAkun, r.akun, r.tipe, r.jumlah, r.kategori, r.kodeBantuId] },
  { key: "permohonanStok",label: "Permohonan Stok", columns: ["id","tanggal","tanggal_kirim","outlet_id","produk_id","qty","status","catatan"], mapper: (r) => [r.id, r.tanggal, r.tanggalKirim, r.outletId, r.produkId, r.qty, r.status, r.catatan] },
  { key: "kodeBantu",     label: "Kode Bantu",     columns: ["id","kode","kode_akun","nama","keterangan","saldo_awal"],   mapper: (r) => [r.id, r.kode, r.kodeAkun, r.nama, r.keterangan, r.saldoAwal] },
  { key: "hppProduk",     label: "HPP Produk",     columns: ["id","produk_id","harga_jual","catatan","aktif"],            mapper: (r) => [r.id, r.produkId, r.hargaJual, r.catatan, r.aktif] },
  { key: "hppBahan",      label: "HPP Bahan",      columns: ["id","hpp_produk_id","nama_item","satuan","berat","harga","jadi","urutan"], mapper: (r) => [r.id, r.hppProdukId, r.namaItem, r.satuan, r.berat, r.harga, r.jadi, r.urutan] },
  { key: "hppConsumable", label: "HPP Consumable", columns: ["id","hpp_produk_id","nama_item","satuan","berat","harga","jumlah","urutan"], mapper: (r) => [r.id, r.hppProdukId, r.namaItem, r.satuan, r.berat, r.harga, r.jumlah, r.urutan] },
  { key: "logAktivitas",  label: "Log Aktivitas",  columns: ["id","created_at","username","nama_user","aksi","modul","record_id","detail"], mapper: (r) => [r.id, r.createdAt, r.username, r.namaUser, r.aksi, r.modul, r.recordId, r.detail] },
];

const MONTHLY_SHEETS: { key: string; label: string; columns: string[]; mapper: (r: any) => any[] }[] = [
  { key: "penjualan",  label: "Penjualan",      columns: ["id","tanggal","outlet_id","produk_id","qty","harga","total","sisa_gram","variant"], mapper: (r) => [r.id, r.tanggal, r.outletId, r.produkId, r.qty, r.harga, r.total, r.sisaGram, r.variant] },
  { key: "produksi",   label: "Produksi",        columns: ["id","tanggal","produk_id","qty_rencana","qty_realisasi"],   mapper: (r) => [r.id, r.tanggal, r.produkId, r.qtyRencana, r.qtyRealisasi] },
  { key: "stokMov",    label: "Stok Movement",   columns: ["id","tanggal","bahan_id","tipe","qty","keterangan","produksi_id"], mapper: (r) => [r.id, r.tanggal, r.bahanId, r.tipe, r.qty, r.keterangan, r.produksiId] },
  { key: "absensi",    label: "Absensi",         columns: ["id","tanggal","karyawan_id","jam_masuk","jam_pulang","status","catatan","bonus","tunjangan","overtime"], mapper: (r) => [r.id, r.tanggal, r.karyawanId, r.jamMasuk, r.jamPulang, r.status, r.catatan, r.bonus, r.tunjangan, r.overtime] },
];

export default function BackupRestoreSection() {
  const dbState = useDB();
  const fullFileInputRef = useRef<HTMLInputElement>(null);
  const monthlyFileInputRef = useRef<HTMLInputElement>(null);

  const [restoring, setRestoring] = useState(false);
  const [restoringMonthly, setRestoringMonthly] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{ count: number; size: string } | null>(null);

  const now = new Date();
  const [bulan, setBulan] = useState(String(now.getMonth() + 1));
  const [tahun, setTahun] = useState(String(now.getFullYear()));

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    dbState.penjualan.forEach((p: any) => { if (p.tanggal) years.add(Number(p.tanggal.slice(0, 4))); });
    dbState.produksi.forEach((p: any) => { if (p.tanggal) years.add(Number(p.tanggal.slice(0, 4))); });
    dbState.stokMov.forEach((m: any) => { if (m.tanggal) years.add(Number(m.tanggal.slice(0, 4))); });
    dbState.absensi.forEach((a: any) => { if (a.tanggal) years.add(Number(a.tanggal.slice(0, 4))); });
    years.add(now.getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [dbState.penjualan, dbState.produksi, dbState.stokMov, dbState.absensi]);

  const monthlyStats = useMemo(() => {
    const prefix = `${tahun}-${String(bulan).padStart(2, "0")}`;
    const penjualan = dbState.penjualan.filter((p: any) => p.tanggal?.startsWith(prefix)).length;
    const produksi = dbState.produksi.filter((p: any) => p.tanggal?.startsWith(prefix)).length;
    const stokMov = dbState.stokMov.filter((m: any) => m.tanggal?.startsWith(prefix)).length;
    const absensi = dbState.absensi.filter((a: any) => a.tanggal?.startsWith(prefix)).length;
    return { penjualan, produksi, stokMov, absensi, total: penjualan + produksi + stokMov + absensi };
  }, [dbState.penjualan, dbState.produksi, dbState.stokMov, dbState.absensi, bulan, tahun]);

  // ═══════════════════════════════════════════════════════════════════════════════
  // XLSX HELPER
  // ═══════════════════════════════════════════════════════════════════════════════
  function buildXlsx(sheets: { label: string; columns: string[]; rows: any[][] }[]): { blob: Blob; totalRows: number } {
    const wb = XLSX.utils.book_new();
    let totalRows = 0;

    for (const sheet of sheets) {
      if (sheet.rows.length === 0) continue;
      const wsData = [sheet.columns, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Auto-width columns
      const colWidths = sheet.columns.map((col, i) => {
        const maxLen = Math.max(col.length, ...sheet.rows.map((r) => String(r[i] ?? "").length));
        return { wch: Math.min(maxLen + 2, 40) };
      });
      ws["!cols"] = colWidths;

      XLSX.utils.book_append_sheet(wb, ws, sheet.label);
      totalRows += sheet.rows.length;
    }

    const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    return { blob: new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), totalRows };
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FULL BACKUP (XLSX)
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleFullBackup = () => {
    try {
      const sheets = FULL_SHEETS.map((def) => ({
        label: def.label,
        columns: def.columns,
        rows: (dbState as any)[def.key]?.map(def.mapper) ?? [],
      })).filter((s) => s.rows.length > 0);

      // Add Settings sheet
      const settings = getBubaSettings();
      const settingsRows = Object.entries(settings).map(([k, v]) => [k, String(v)]);
      sheets.push({ label: "Settings", columns: ["Key", "Value"], rows: settingsRows });

      const { blob, totalRows } = buildXlsx(sheets);
      const sizeKB = (blob.size / 1024).toFixed(1);

      const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
      downloadBlob(blob, `buba-backup-full-${ts}.xlsx`);

      setBackupInfo({ count: totalRows, size: `${sizeKB} KB` });
      toast.success(`Backup penuh berhasil! ${totalRows} records, ${sheets.length} sheet (${sizeKB} KB)`);
    } catch (err: any) {
      toast.error(`Backup gagal: ${err?.message || "Terjadi kesalahan"}`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // MONTHLY SESSION BACKUP (XLSX)
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleMonthlyBackup = () => {
    try {
      const prefix = `${tahun}-${String(bulan).padStart(2, "0")}`;

      const sheets = MONTHLY_SHEETS.map((def) => ({
        label: def.label,
        columns: def.columns,
        rows: (dbState as any)[def.key]
          ?.filter((r: any) => r.tanggal?.startsWith(prefix))
          .map(def.mapper) ?? [],
      })).filter((s) => s.rows.length > 0);

      if (sheets.length === 0) {
        toast.error(`Tidak ada data untuk ${MONTHS[Number(bulan) - 1]} ${tahun}`);
        return;
      }

      const { blob, totalRows } = buildXlsx(sheets);
      const sizeKB = (blob.size / 1024).toFixed(1);
      const monthName = MONTHS[Number(bulan) - 1].toLowerCase();
      downloadBlob(blob, `buba-sesi-${monthName}${tahun}.xlsx`);

      const breakdown = sheets.map((s) => `${s.rows.length} ${s.label.toLowerCase()}`).join(", ");
      toast.success(`Backup sesi ${MONTHS[Number(bulan) - 1]} ${tahun} berhasil! ${breakdown} (${sizeKB} KB)`);
    } catch (err: any) {
      toast.error(`Backup sesi gagal: ${err?.message || "Terjadi kesalahan"}`);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // FULL RESTORE (from XLSX or JSON)
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleFullRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const confirmed = window.confirm(
      "⚠️ RESTORE DATA PENUH\n\nIni akan mengganti SELURUH data saat ini dengan data dari file backup.\nData yang ada akan DIHAPUS terlebih dahulu.\n\nLanjutkan?"
    );
    if (!confirmed) return;

    setRestoring(true);
    try {
      let dataMap: Record<string, any[]> = {};
      let settings: ReturnType<typeof getBubaSettings> | undefined;

      if (file.name.endsWith(".json")) {
        // JSON backup format
        const text = await file.text();
        const backup: BackupData = JSON.parse(text);
        if (!backup.data) throw new Error("Format file backup tidak valid");
        dataMap = backup.data;
        if ("settings" in backup) settings = (backup as FullBackupData).settings;
      } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        // XLSX backup format
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });

        // Map sheet names back to keys
        const sheetNameToKey: Record<string, string> = {};
        FULL_SHEETS.forEach((def) => { sheetNameToKey[def.label] = def.key; });
        sheetNameToKey["Settings"] = "settings";

        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (json.length < 2) continue; // skip empty or header-only

          const key = sheetNameToKey[sheetName] || sheetName;
          const headers = json[0] as string[];
          const rows = json.slice(1).map((row) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });

          if (key === "settings") {
            // Parse settings
            const settingsObj: Record<string, any> = {};
            rows.forEach((r) => {
              const val = r["Value"];
              settingsObj[r["Key"]] = isNaN(Number(val)) ? val : Number(val);
            });
            // Convert booleans
            if (settingsObj["lockEnabled"] !== undefined) {
              settingsObj["lockEnabled"] = settingsObj["lockEnabled"] === "true" || settingsObj["lockEnabled"] === true;
            }
            settings = settingsObj as any;
          } else {
            dataMap[key] = rows;
          }
        }
      } else {
        toast.error("File harus berformat .json atau .xlsx");
        setRestoring(false);
        return;
      }

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

      // Step 2: Restore master data first
      toast.info("Memulihkan data...");
      if (dataMap.outlets?.length) await supabaseInsert("outlets", dataMap.outlets.map(mapOutlet));
      if (dataMap.produk?.length) await supabaseInsert("produk", dataMap.produk.map(mapProduk));
      if (dataMap.coa?.length) await supabaseInsert("coa", dataMap.coa.map(mapCoa));
      if (dataMap.bahan?.length) await supabaseInsert("bahan_baku", dataMap.bahan.map(mapBahan));
      if (dataMap.users?.length) await supabaseInsert("users", dataMap.users.map(mapUser));
      if (dataMap.karyawan?.length) await supabaseInsert("karyawan", dataMap.karyawan.map(mapKaryawan));
      // Transaction data
      if (dataMap.penjualan?.length) await supabaseInsert("penjualan", dataMap.penjualan.map(mapPenjualan));
      if (dataMap.produksi?.length) await supabaseInsert("produksi", dataMap.produksi.map(mapProduksi));
      if (dataMap.stokMov?.length) await supabaseInsert("stok_movement", dataMap.stokMov.map(mapStokMov));
      if (dataMap.absensi?.length) await supabaseInsert("absensi", dataMap.absensi.map(mapAbsensi));
      if (dataMap.permohonanStok?.length) await supabaseInsert("permohonan_stok", dataMap.permohonanStok.map(mapPermohonanStok));
      if (dataMap.jurnal?.length) await supabaseInsert("jurnal", dataMap.jurnal.map(mapJurnal));
      if (dataMap.kodeBantu?.length) await supabaseInsert("kode_bantu", dataMap.kodeBantu.map(mapKodeBantu));
      if (dataMap.hppProduk?.length) await supabaseInsert("hpp_produk", dataMap.hppProduk.map(mapHppProduk));
      if (dataMap.hppBahan?.length) await supabaseInsert("hpp_bahan", dataMap.hppBahan.map(mapHppBahan));
      if (dataMap.hppConsumable?.length) await supabaseInsert("hpp_consumable", dataMap.hppConsumable.map(mapHppConsumable));
      if (dataMap.logAktivitas?.length) await supabaseInsert("log_aktivitas", dataMap.logAktivitas.map(mapLogAktivitas));

      if (settings) {
        const { saveAppSettings } = await import("@/lib/store");
        saveAppSettings(settings);
      }

      await fetchFromSupabase();

      const totalRecords = Object.values(dataMap).reduce(
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
  // MONTHLY SESSION RESTORE (from XLSX or JSON)
  // ═══════════════════════════════════════════════════════════════════════════════
  const handleMonthlyRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setRestoringMonthly(true);
    try {
      let monthPrefix: string;
      let monthLabel: string;
      let penjualanRows: any[] = [];
      let produksiRows: any[] = [];
      let stokRows: any[] = [];
      let absensiRows: any[] = [];

      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        // XLSX monthly session format — try to detect month from filename or ask user
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });

        // Try to detect month from filename
        const fname = file.name.toLowerCase();
        let detectedMonth = -1;
        let detectedYear = -1;
        for (let i = 0; i < 12; i++) {
          const mName = MONTHS[i].toLowerCase();
          if (fname.includes(mName)) {
            detectedMonth = i + 1;
            const yearMatch = fname.match(/(\d{4})/);
            if (yearMatch) detectedYear = parseInt(yearMatch[1]);
            break;
          }
        }

        if (detectedMonth > 0 && detectedYear > 0) {
          monthPrefix = `${detectedYear}-${String(detectedMonth).padStart(2, "0")}`;
          monthLabel = `${MONTHS[detectedMonth - 1]} ${detectedYear}`;
        } else {
          // Ask user
          const selection = window.prompt(
            "📅 Tidak bisa mendeteksi bulan dari nama file.\nMasukkan bulan (1-12) dan tahun (contoh: 8,2026):"
          );
          if (!selection) { setRestoringMonthly(false); return; }
          const parts = selection.split(",").map((s) => parseInt(s.trim()));
          if (parts.length !== 2 || parts.some(isNaN)) {
            toast.error("Format salah. Gunakan: bulan,tahun (contoh: 8,2026)");
            setRestoringMonthly(false);
            return;
          }
          monthPrefix = `${parts[1]}-${String(parts[0]).padStart(2, "0")}`;
          monthLabel = `${MONTHS[parts[0] - 1]} ${parts[1]}`;
        }

        // Parse sheets
        const sheetNameToTable: Record<string, string> = {
          "Penjualan": "penjualan", "Produksi": "produksi",
          "Stok Movement": "stokMov", "Absensi": "absensi",
        };

        for (const sheetName of wb.SheetNames) {
          const table = sheetNameToTable[sheetName];
          if (!table) continue;
          const ws = wb.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (json.length < 2) continue;
          const headers = json[0] as string[];
          const rows = json.slice(1).map((row) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => { obj[h] = row[i]; });
            return obj;
          });
          if (table === "penjualan") penjualanRows = rows;
          else if (table === "produksi") produksiRows = rows;
          else if (table === "stokMov") stokRows = rows;
          else if (table === "absensi") absensiRows = rows;
        }

      } else if (file.name.endsWith(".json")) {
        const text = await file.text();
        const backup: BackupData = JSON.parse(text);

        const isMonthlySession = backup.type === "monthly-session" || (backup as MonthlySessionBackup).bulan;

        if (isMonthlySession) {
          const mb = backup as MonthlySessionBackup;
          monthPrefix = `${mb.tahun}-${String(mb.bulan).padStart(2, "0")}`;
          monthLabel = `${MONTHS[(mb.bulan || 1) - 1]} ${mb.tahun}`;
          penjualanRows = mb.data?.penjualan || [];
          produksiRows = mb.data?.produksi || [];
          stokRows = mb.data?.stokMov || [];
          absensiRows = mb.data?.absensi || [];
        } else {
          // Full backup JSON — extract by month
          const fb = backup as FullBackupData;
          const d = fb.data;

          const allDates = [
            ...(d.penjualan || []).map((p: any) => p.tanggal),
            ...(d.produksi || []).map((p: any) => p.tanggal),
            ...(d.stokMov || []).map((m: any) => m.tanggal),
            ...(d.absensi || []).map((a: any) => a.tanggal),
          ].filter(Boolean);

          const monthSet = new Set<string>();
          allDates.forEach((dt: string) => { if (dt?.length >= 7) monthSet.add(dt.slice(0, 7)); });
          const availableMonths = Array.from(monthSet).sort().reverse();

          if (availableMonths.length === 0) {
            throw new Error("Tidak ditemukan data dengan tanggal yang valid");
          }

          const monthOptions = availableMonths.map((m) => {
            const [y, mo] = m.split("-");
            return { key: m, label: `${MONTHS[parseInt(mo) - 1]} ${y}`, prefix: m };
          });

          const monthListStr = monthOptions.map((m, i) => `${i + 1}. ${m.label}`).join("\n");
          const selection = window.prompt(
            `📅 PILIH BULAN UNTUK RESTORE\n\nFile backup berisi data bulan:\n${monthListStr}\n\nMasukkan nomor (1-${monthOptions.length}):`
          );
          if (!selection) { setRestoringMonthly(false); return; }

          const idx = parseInt(selection) - 1;
          if (isNaN(idx) || idx < 0 || idx >= monthOptions.length) {
            toast.error("Nomor bulan tidak valid");
            setRestoringMonthly(false);
            return;
          }

          const chosen = monthOptions[idx];
          monthPrefix = chosen.prefix;
          monthLabel = chosen.label;
          penjualanRows = (d.penjualan || []).filter((p: any) => p.tanggal?.startsWith(chosen.prefix));
          produksiRows = (d.produksi || []).filter((p: any) => p.tanggal?.startsWith(chosen.prefix));
          stokRows = (d.stokMov || []).filter((m: any) => m.tanggal?.startsWith(chosen.prefix));
          absensiRows = (d.absensi || []).filter((a: any) => a.tanggal?.startsWith(chosen.prefix));
        }
      } else {
        toast.error("File harus berformat .xlsx atau .json");
        setRestoringMonthly(false);
        return;
      }

      // Confirmation
      const total = penjualanRows.length + produksiRows.length + stokRows.length + absensiRows.length;
      if (total === 0) {
        toast.error(`Tidak ada data untuk ${monthLabel} di file ini`);
        setRestoringMonthly(false);
        return;
      }

      const confirmed = window.confirm(
        `⚠️ RESTORE SESI BULANAN\n\n` +
        `Memulihkan data bulan ${monthLabel}:\n` +
        `• ${penjualanRows.length} Penjualan\n` +
        `• ${produksiRows.length} Produksi\n` +
        `• ${stokRows.length} Stok Movement\n` +
        `• ${absensiRows.length} Absensi\n\n` +
        `Data bulan ${monthLabel} yang ada akan DIHAPUS lalu diganti.\n` +
        `Data bulan lain TIDAK terpengaruh.\n\nLanjutkan?`
      );
      if (!confirmed) { setRestoringMonthly(false); return; }

      // Delete existing data for this month
      toast.info(`Menghapus data ${monthLabel}...`);
      await Promise.all([
        supabaseDeleteByMonth("penjualan", "tanggal", monthPrefix),
        supabaseDeleteByMonth("produksi", "tanggal", monthPrefix),
        supabaseDeleteByMonth("stok_movement", "tanggal", monthPrefix),
        supabaseDeleteByMonth("absensi", "tanggal", monthPrefix),
      ]);

      // Insert new data
      toast.info(`Memulihkan data ${monthLabel}...`);
      if (penjualanRows.length) await supabaseInsert("penjualan", penjualanRows.map(mapPenjualan));
      if (produksiRows.length) await supabaseInsert("produksi", produksiRows.map(mapProduksi));
      if (stokRows.length) await supabaseInsert("stok_movement", stokRows.map(mapStokMov));
      if (absensiRows.length) await supabaseInsert("absensi", absensiRows.map(mapAbsensi));

      await fetchFromSupabase();

      toast.success(`Restore sesi ${monthLabel} berhasil! ${total} records dipulihkan.`);
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
            File output: <code className="text-[10px] bg-muted px-1 rounded">.xlsx</code> (bisa dibuka di Excel/Google Sheets).
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Bulan</Label>
              <Select value={bulan} onValueChange={setBulan}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="bg-muted/30 rounded-lg p-2 text-[10px] space-y-0.5">
            <div className="font-semibold text-foreground">{MONTHS[Number(bulan) - 1]} {tahun}</div>
            <div className="text-muted-foreground">
              📊 {monthlyStats.penjualan} penjualan &bull; {monthlyStats.produksi} produksi &bull; {monthlyStats.stokMov} stok &bull; {monthlyStats.absensi} absensi
            </div>
            {monthlyStats.total === 0 && (
              <div className="text-amber-600">Tidak ada data untuk bulan ini</div>
            )}
          </div>

          <Button
            onClick={handleMonthlyBackup}
            disabled={monthlyStats.total === 0}
            className="w-full h-9 text-xs gradient-primary text-primary-foreground"
          >
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Download XLSX — {MONTHS[Number(bulan) - 1]} {tahun}
          </Button>

          <div className="border-t pt-3 mt-1">
            <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5 mb-2">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Hanya data <strong>Penjualan, Produksi, Stok, dan Absensi</strong> bulan yang dipilih akan diganti. Data bulan lain tidak terpengaruh.
              </span>
            </div>
            <input
              ref={monthlyFileInputRef}
              type="file"
              accept=".xlsx,.xls,.json"
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
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Memulihkan sesi bulanan...</>
              ) : (
                <><Upload className="mr-1.5 h-3.5 w-3.5" />Restore Sesi Bulanan dari File (.xlsx / .json)</>
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
            Ekspor seluruh data aplikasi ke file <code className="text-[10px] bg-muted px-1 rounded">.xlsx</code>.
            Setiap tabel menjadi sheet terpisah — bisa dibaca langsung di Excel atau Google Sheets.
          </p>
          <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2 space-y-0.5">
            <div>📦 Sheet yang dihasilkan:</div>
            <div className="ml-2">
              Outlet, Produk, COA, Bahan Baku, Karyawan, Users<br/>
              Penjualan, Produksi, Stok Movement, Absensi, Jurnal<br/>
              Permohonan Stok, Kode Bantu, HPP, Log Aktivitas, Settings
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
            <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
            Download Backup Penuh (.xlsx)
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
            Impor dari file backup <code className="text-[10px] bg-muted px-1 rounded">.xlsx</code> atau <code className="text-[10px] bg-muted px-1 rounded">.json</code>.
            <strong> Semua data</strong> saat ini akan diganti.
          </p>
          <div className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              <strong>Peringatan:</strong> Semua data akan dihapus. Gunakan Restore Sesi Bulanan jika hanya ingin mengembalikan data bulan tertentu.
            </span>
          </div>
          <input
            ref={fullFileInputRef}
            type="file"
            accept=".xlsx,.xls,.json"
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
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Memulihkan data penuh...</>
            ) : (
              <><Upload className="mr-1.5 h-3.5 w-3.5" />Pilih File & Restore Penuh (.xlsx / .json)</>
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
  const gte = `${prefix}-01`;
  const lt = prefix.slice(0, 4) === "12"
    ? `${Number(prefix.slice(0, 4)) + 1}-01-01`
    : `${prefix.slice(0, 4)}-${String(Number(prefix.slice(5, 7)) + 1).padStart(2, "0")}-01`;
  const { error } = await supabase.from(table).delete().gte(dateCol, gte).lt(dateCol, lt);
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
// MAP FUNCTIONS (restore: row object → Supabase columns)
// ═══════════════════════════════════════════════════════════════════════════════

function mapOutlet(r: any) {
  return { id: r.id, nama: r.nama, lokasi: r.lokasi };
}
function mapProduk(r: any) {
  return { id: r.id, nama: r.nama, harga: num(r.harga), satuan: r.satuan };
}
function mapCoa(r: any) {
  return { kode: r.kode, nama: r.nama, tipe: r.tipe, kategori: r.kategori };
}
function mapBahan(r: any) {
  return {
    id: r.id, kode: r.kode, nama: r.nama, satuan: r.satuan,
    stok_min: num(r.stok_min ?? r.stokMin), stok_awal: num(r.stok_awal ?? r.stokAwal),
    harga_beli: num(r.harga_beli ?? r.hargaBeli), konversi_gram: r.konversi_gram ?? r.konversiGram ?? null,
  };
}
function mapUser(r: any) {
  return {
    username: r.username, password: r.password, nama: r.nama,
    role: r.role, outlet_id: r.outlet_id ?? r.outletId ?? null,
    karyawan_id: r.karyawan_id ?? r.karyawanId ?? null,
  };
}
function mapKaryawan(r: any) {
  return {
    id: r.id, nama: r.nama, posisi: r.posisi, role: r.role || "outlet",
    outlet_id: r.outlet_id ?? r.outletId ?? null, gaji_pokok: num(r.gaji_pokok ?? r.gajiPokok),
    bonus_omset: num(r.bonus_omset ?? r.bonusOmset), bonus_ulasan: num(r.bonus_ulasan ?? r.bonusUlasan),
    bonus_oh: num(r.bonus_oh ?? r.bonusOH), tunjangan_harian: num(r.tunjangan_harian ?? r.tunjanganHarian),
    overtime_rate: num(r.overtime_rate ?? r.overtimeRate),
    jam_masuk: r.jam_masuk ?? r.jamMasuk ?? null, jam_pulang: r.jam_pulang ?? r.jamPulang ?? null,
  };
}
function mapPenjualan(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, outlet_id: r.outlet_id ?? r.outletId,
    produk_id: r.produk_id ?? r.produkId, qty: num(r.qty), harga: num(r.harga), total: num(r.total),
    sisa_gram: r.sisa_gram ?? r.sisaGram ?? null, variant: r.variant ?? null,
  };
}
function mapProduksi(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, produk_id: r.produk_id ?? r.produkId,
    qty_rencana: num(r.qty_rencana ?? r.qtyRencana), qty_realisasi: num(r.qty_realisasi ?? r.qtyRealisasi),
  };
}
function mapStokMov(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, bahan_id: r.bahan_id ?? r.bahanId,
    tipe: r.tipe, qty: num(r.qty), keterangan: r.keterangan,
    produksi_id: r.produksi_id ?? r.produksiId ?? null,
  };
}
function mapAbsensi(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, karyawan_id: r.karyawan_id ?? r.karyawanId,
    jam_masuk: r.jam_masuk ?? r.jamMasuk, jam_pulang: r.jam_pulang ?? r.jamPulang,
    status: r.status, catatan: r.catatan,
    bonus: num(r.bonus), tunjangan: num(r.tunjangan), overtime: num(r.overtime),
  };
}
function mapJurnal(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, ref: r.ref, keterangan: r.keterangan,
    kode_akun: r.kode_akun ?? r.kodeAkun, akun: r.akun, tipe: r.tipe,
    jumlah: num(r.jumlah), kategori: r.kategori, kode_bantu_id: r.kode_bantu_id ?? r.kodeBantuId ?? null,
  };
}
function mapPermohonanStok(r: any) {
  return {
    id: r.id, tanggal: r.tanggal, tanggal_kirim: r.tanggal_kirim ?? r.tanggalKirim,
    outlet_id: r.outlet_id ?? r.outletId, produk_id: r.produk_id ?? r.produkId,
    qty: num(r.qty), status: r.status, catatan: r.catatan,
    qty_rencana: num(r.qty_rencana ?? r.qtyRencana) || num(r.qty),
    catatan_rencana: r.catatan_rencana ?? r.catatanRencana ?? r.catatan ?? null,
  };
}
function mapKodeBantu(r: any) {
  return {
    id: r.id, kode: r.kode, kode_akun: r.kode_akun ?? r.kodeAkun, nama: r.nama,
    keterangan: r.keterangan ?? null, saldo_awal: num(r.saldo_awal ?? r.saldoAwal),
    created_at: r.created_at ?? r.createdAt ?? null,
  };
}
function mapHppProduk(r: any) {
  return {
    id: r.id, produk_id: r.produk_id ?? r.produkId, harga_jual: num(r.harga_jual ?? r.hargaJual),
    catatan: r.catatan ?? null, aktif: r.aktif !== "false" && r.aktif !== false,
    updated_at: r.updated_at ?? r.updatedAt ?? null,
  };
}
function mapHppBahan(r: any) {
  return {
    id: r.id, hpp_produk_id: r.hpp_produk_id ?? r.hppProdukId, nama_item: r.nama_item ?? r.namaItem,
    satuan: r.satuan, berat: num(r.berat), harga: num(r.harga),
    jadi: num(r.jadi), urutan: num(r.urutan),
  };
}
function mapHppConsumable(r: any) {
  return {
    id: r.id, hpp_produk_id: r.hpp_produk_id ?? r.hppProdukId, nama_item: r.nama_item ?? r.namaItem,
    satuan: r.satuan, berat: num(r.berat), harga: num(r.harga),
    jumlah: num(r.jumlah), urutan: num(r.urutan),
  };
}
function mapLogAktivitas(r: any) {
  return {
    id: r.id, created_at: r.created_at ?? r.createdAt, username: r.username,
    nama_user: r.nama_user ?? r.namaUser ?? null, aksi: r.aksi, modul: r.modul,
    record_id: r.record_id ?? r.recordId ?? null, detail: r.detail ?? null,
    nilai_lama: r.nilai_lama ?? r.nilaiLama ?? null, nilai_baru: r.nilai_baru ?? r.nilaiBaru ?? null,
  };
}

/** Safe number parse — handles string numbers from XLSX */
function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
