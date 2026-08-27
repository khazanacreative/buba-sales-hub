import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
import { DEFAULT_LOCK_DEADLINE } from "./produksi-utils";
import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, BahanBaku, StokMovement, Karyawan, Absensi, PermohonanStok, PermohonanStokStatus, UserAccount } from "./types";
import { SEED_OUTLETS, SEED_PRODUK, SEED_COA, SEED_BAHAN, SEED_KARYAWAN, SEED_JURNAL, SEED_USERS } from "./seed";

// =============================================================================
// SETTINGS — Didefinisikan SEBELUM initial() untuk menghindari TDZ error
// =============================================================================
export interface BubaSettings {
  // Bubur
  berasBubur: number;
  dagingBubur: number;
  airBubur: number;
  sayurHijauBubur: number;
  sayurBuahBubur: number;
  sayurProteinBubur: number;
  
  // Nasi Tim
  berasTim: number;
  dagingTim: number;
  airTim: number;
  sayurHijauTim: number;
  sayurBuahTim: number;
  sayurProteinTim: number;

  // Lainnya
  oatmealCup: number;
  pudingCup: number;
  abonCup: number;

  // Penguncian
  lockDeadlineTime: string;
  lockEnabled: boolean;
}

// =============================================================================
// PERBANDINGAN BAHAN BUBUR & NASI TIM
// =============================================================================
//
// Ada DUA level perbandingan yang perlu dibedakan:
//
// LEVEL 1 — BASE RATIO (per 100g BERAS)
//   Menentukan komposisi bahan relatif terhadap 100g beras.
//   Rasio: Beras : Daging : Air : S.Hijau : Buah : Protein
//
//   Bubur    → 100 : 5 : 700 : 8 : 5 : 1.5
//   Nasi Tim → 100 : 4 : 600 : 8 : 5 : 1.5
//
//   Artinya: setiap 100g beras BUTUH 5g daging, 700ml air, 8g SH, 5g SB (Sayur Buah), 1.5g SP (Sayur Protein).
//
// LEVEL 2 — PER CUP (Nilai yang disimpan di settings ini)
//   Hasil konversi dari Level 1 dengan membagi sesuai jumlah cup per 100gr beras.
//
//   Bubur    → 100g beras = 6 cup   → nilai per cup = (nilai per 100g) ÷ 6
//   Nasi Tim → 100g beras = 5 cup   → nilai per cup = (nilai per 100g) ÷ 5
//
//   Contoh: berasBubur per cup = 100 ÷ 6 = 16.67 g
//           dagingBubur per cup = 5 ÷ 6 = 0.83 g
//           airBubur per cup    = 700 ÷ 6 = 116.67 ml
// =============================================================================

export const DEFAULT_SETTINGS: BubaSettings = {
  // --- BUBUR ---
  // Base ratio (per 100g beras): 100 : 5 : 700 : 8 : 5 : 1.5
  // Per 100g beras = 6 cup → nilai per cup = nilai per 100g ÷ 6
  berasBubur: 16.67,           // 100 ÷ 6 = 16 2/3
  dagingBubur: 0.83,          // 5 ÷ 6 = 0.833...
  airBubur: 116.67,           // 700 ÷ 6 = 116 2/3
  sayurHijauBubur: 1.33,      // 8 ÷ 6 = 4/3 = 1.333...
  sayurBuahBubur: 0.83,       // 5 ÷ 6 = 0.833...
  sayurProteinBubur: 0.25,    // 1.5 ÷ 6 = 0.25
  
  // --- NASI TIM ---
  // Base ratio (per 100g beras): 100 : 4 : 600 : 8 : 5 : 1.5
  // Per 100g beras = 5 cup → nilai per cup = nilai per 100g ÷ 5
  berasTim: 20.00,              // 100 ÷ 5 = 20
  dagingTim: 0.80,             // 4 ÷ 5 = 0.8
  airTim: 120.00,              // 600 ÷ 5 = 120
  sayurHijauTim: 1.60,         // 8 ÷ 5 = 1.6
  sayurBuahTim: 1.00,          // 5 ÷ 5 = 1.0
  sayurProteinTim: 0.30,       // 1.5 ÷ 5 = 0.3

  oatmealCup: 25.71,
  pudingCup: 13.00,
  abonCup: 10.00,

  lockDeadlineTime: DEFAULT_LOCK_DEADLINE,
  lockEnabled: false,
};

// Map old setting names to new names for backward compatibility
export function migrateBubaSettings(saved: Record<string, any>): Record<string, any> {
  const oldToNew: Record<string, string> = {
    sayurBrokoliBubur: "sayurBuahBubur",
    sayurBrokoliTim: "sayurBuahTim",
    sayurPutihBubur: "sayurProteinBubur",
    sayurPutihTim: "sayurProteinTim"
  };
  const migrated: Record<string, any> = {};
  for (const [key, val] of Object.entries(saved)) {
    const newKey = oldToNew[key] || key;
    migrated[newKey] = val;
  }
  return migrated;
}

export function getBubaSettings(): BubaSettings {
  const saved = localStorage.getItem("buba_settings");
  if (!saved) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(saved);
    const migrated = migrateBubaSettings(parsed);
    return { ...DEFAULT_SETTINGS, ...migrated };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveBubaSettings(s: BubaSettings) {
  localStorage.setItem("buba_settings", JSON.stringify(s));
  window.dispatchEvent(new Event("buba_settings_changed"));
}

// Simpan settings + update state global agar komponen reaktif via useDB()
export function saveAppSettings(s: BubaSettings) {
  // Simpan ke localStorage (backward compat)
  localStorage.setItem("buba_settings", JSON.stringify(s));
  window.dispatchEvent(new Event("buba_settings_changed"));
  // Update state global agar reaktif via useDB() — langsung notifikasi semua komponen
  state.settings = s;
  notify();
}

// =============================================================================
// STATE GLOBAL
// =============================================================================

interface DB {
  outlets: Outlet[];
  produk: Produk[];
  penjualan: Penjualan[];
  produksi: Produksi[];
  jurnal: Jurnal[];
  coa: AkunCOA[];
  bahan: BahanBaku[];
  stokMov: StokMovement[];
  karyawan: Karyawan[];
  absensi: Absensi[];
  permohonanStok: PermohonanStok[];
  users: UserAccount[];
  settings: BubaSettings;
}

const initial = (): DB => ({
  outlets: SEED_OUTLETS,
  produk: SEED_PRODUK,
  penjualan: [],
  produksi: [],
  jurnal: [],
  coa: SEED_COA,
  bahan: SEED_BAHAN,
  stokMov: [],
  karyawan: SEED_KARYAWAN,
  absensi: [],
  permohonanStok: [],
  users: SEED_USERS,
  settings: getBubaSettings(),
});

let state: DB = initial();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => state;

/** Return the latest store state snapshot (bypasses React render cycle). */
export function getDB(): DB {
  return state;
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Helper: fetch a single table and return { data, error }. Never throws.
// Supabase default select returns max 1000 rows. This function paginates
// automatically when the result hits the limit, ensuring ALL records are loaded.
const SUPABASE_PAGE_SIZE = 1000;

/** Build a Supabase query with optional date range filter. */
function buildQuery(table: string, dateCol?: string, from?: string, to?: string) {
  let q = supabase.from(table).select("*");
  if (dateCol && from) q = q.gte(dateCol, from);
  if (dateCol && to) q = q.lte(dateCol, to);
  return q;
}

async function safeFetch(table: string) {
  try {
    const first = await buildQuery(table).range(0, SUPABASE_PAGE_SIZE - 1);
    if (first.error) {
      console.warn(`safeFetch(${table}):`, first.error);
      return { data: null, error: first.error };
    }
    // If fewer than PAGE_SIZE rows returned, we have everything
    if (!first.data || first.data.length < SUPABASE_PAGE_SIZE) {
      return { data: first.data, error: null };
    }
    // Paginate: fetch remaining pages
    let allData = [...first.data];
    let offset = SUPABASE_PAGE_SIZE;
    while (true) {
      const page = await buildQuery(table).range(offset, offset + SUPABASE_PAGE_SIZE - 1);
      if (page.error || !page.data || page.data.length === 0) break;
      allData = allData.concat(page.data);
      if (page.data.length < SUPABASE_PAGE_SIZE) break;
      offset += SUPABASE_PAGE_SIZE;
    }
    return { data: allData, error: null };
  } catch (err) {
    console.warn(`safeFetch(${table}) exception:`, err);
    return { data: null, error: err };
  }
}

/** Fetch with date range filter + pagination. Used for large tables (penjualan,
 *  permohonan_stok, etc.) to avoid loading all historical data at once. */
async function safeFetchFiltered(table: string, dateCol: string, from: string, to: string) {
  try {
    const first = await buildQuery(table, dateCol, from, to).range(0, SUPABASE_PAGE_SIZE - 1);
    if (first.error) {
      console.warn(`safeFetchFiltered(${table}):`, first.error);
      return { data: null, error: first.error };
    }
    if (!first.data || first.data.length < SUPABASE_PAGE_SIZE) {
      return { data: first.data, error: null };
    }
    let allData = [...first.data];
    let offset = SUPABASE_PAGE_SIZE;
    while (true) {
      const page = await buildQuery(table, dateCol, from, to).range(offset, offset + SUPABASE_PAGE_SIZE - 1);
      if (page.error || !page.data || page.data.length === 0) break;
      allData = allData.concat(page.data);
      if (page.data.length < SUPABASE_PAGE_SIZE) break;
      offset += SUPABASE_PAGE_SIZE;
    }
    return { data: allData, error: null };
  } catch (err) {
    console.warn(`safeFetchFiltered(${table}) exception:`, err);
    return { data: null, error: err };
  }
}

// Date helpers (inline to avoid circular import with format.ts)
const _todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const _daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const _plusDaysISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Date range for production flows — ±3 days from today covers
// Langkah 1-5 (planning, distribution, returns) with margin.
const PRODUCTION_RANGE = () => ({ from: _daysAgoISO(3), to: _plusDaysISO(1) });

// Large tables that benefit from date filtering to avoid 1000-row limit.
// Columns: penjualan → tanggal, permohonan_stok → tanggal_kirim,
// stok_movement → tanggal, produksi → tanggal, jurnal → tanggal, absensi → tanggal
const DATE_FILTERED_TABLES: Record<string, string> = {
  penjualan: "tanggal",
  permohonan_stok: "tanggal_kirim",
  stok_movement: "tanggal",
  produksi: "tanggal",
  jurnal: "tanggal",
  absensi: "tanggal",
};

/** Parse mapped state from raw Supabase data. Extracted for reuse. */
function mapState(raw: Record<string, any[]>, usersData: any[]) {
  return {
    outlets: raw.outlets || [],
    produk: raw.produk || [],
    penjualan: (raw.penjualan || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      outletId: p.outlet_id,
      produkId: p.produk_id,
      qty: p.qty,
      harga: p.harga,
      total: Number(p.total),
      sisaGram: p.sisa_gram === null ? undefined : p.sisa_gram,
      variant: p.variant === null ? undefined : p.variant
    })),
    produksi: (raw.produksi || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      produkId: p.produk_id,
      qtyRencana: p.qty_rencana,
      qtyRealisasi: p.qty_realisasi
    })),
    jurnal: (raw.jurnal || []).map((j: any) => ({
      id: j.id,
      tanggal: j.tanggal,
      ref: j.ref,
      keterangan: j.keterangan,
      kodeAkun: j.kode_akun,
      akun: j.akun,
      tipe: j.tipe,
      jumlah: Number(j.jumlah),
      kategori: j.kategori
    })),
    coa: raw.coa || [],
    bahan: (raw.bahan || []).map((b: any) => ({
      id: b.id,
      kode: b.kode,
      nama: b.nama,
      satuan: b.satuan,
      stokMin: b.stok_min,
      stokAwal: b.stok_awal,
      hargaBeli: Number(b.harga_beli),
      konversiGram: b.konversi_gram ?? undefined
    })),
    stokMov: (raw.stokMov || []).map((m: any) => ({
      id: m.id,
      tanggal: m.tanggal,
      bahanId: m.bahan_id,
      tipe: m.tipe,
      qty: m.qty,
      keterangan: m.keterangan,
      produksiId: m.produksi_id
    })),
    karyawan: (raw.karyawan || []).map((k: any) => {
      const linkedUser = (usersData || []).find((u: any) => u.karyawan_id === k.id);
      return {
        id: k.id,
        nama: k.nama,
        posisi: k.posisi,
        role: k.role || linkedUser?.role || "outlet",
        outletId: k.outlet_id,
        gajiPokok: Number(k.gaji_pokok),
        bonusOmset: Number(k.bonus_omset),
        bonusUlasan: Number(k.bonus_ulasan),
        bonusOH: Number(k.bonus_oh ?? 0),
        tunjanganHarian: k.tunjangan_harian ? Number(k.tunjangan_harian) : 0,
        overtimeRate: k.overtime_rate ? Number(k.overtime_rate) : 0,
        jamMasuk: k.jam_masuk || undefined,
        jamPulang: k.jam_pulang || undefined,
        username: linkedUser?.username || undefined,
        password: linkedUser?.password || undefined
      };
    }),
    absensi: (raw.absensi || []).map((a: any) => ({
      id: a.id,
      tanggal: a.tanggal,
      karyawanId: a.karyawan_id,
      jamMasuk: a.jam_masuk,
      jamPulang: a.jam_pulang,
      status: a.status,
      catatan: a.catatan,
      bonus: a.bonus ? Number(a.bonus) : 0,
      tunjangan: a.tunjangan ? Number(a.tunjangan) : 0,
      overtime: a.overtime ? Number(a.overtime) : 0
    })),
    permohonanStok: (raw.permohonanStok || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      tanggalKirim: p.tanggal_kirim,
      outletId: p.outlet_id,
      produkId: p.produk_id,
      qty: p.qty,
      status: p.status,
      catatan: p.catatan,
      qtyRencana: p.qty_rencana != null ? p.qty_rencana : p.qty,
      catatanRencana: p.catatan_rencana || p.catatan || undefined
    })),
    users: (raw.users || []).map((u: any) => ({
      username: u.username,
      password: u.password,
      nama: u.nama,
      role: u.username === "produksi" ? "produksi" : u.role,
      outletId: u.outlet_id,
      karyawanId: u.karyawan_id
    })),
    settings: getBubaSettings()
  };
}

// Fetch all tables from Supabase and update state cache.
// Large tables (penjualan, permohonan_stok, stok_movement, etc.) are filtered
// by date range to stay under Supabase's 1000-row default limit.
// Small reference tables (outlets, produk, coa, etc.) are fetched in full.
export async function fetchFromSupabase() {
  const range = PRODUCTION_RANGE();
  const [
    outletsRes,
    produkRes,
    penjualanRes,
    produksiRes,
    jurnalRes,
    coaRes,
    bahanRes,
    stokMovRes,
    karyawanRes,
    absensiRes,
    permohonanRes,
    usersRes
  ] = await Promise.all([
    safeFetch("outlets"),
    safeFetch("produk"),
    safeFetchFiltered("penjualan", "tanggal", range.from, range.to),
    safeFetchFiltered("produksi", "tanggal", range.from, range.to),
    safeFetchFiltered("jurnal", "tanggal", range.from, range.to),
    safeFetch("coa"),
    safeFetch("bahan_baku"),
    safeFetchFiltered("stok_movement", "tanggal", range.from, range.to),
    safeFetch("karyawan"),
    safeFetchFiltered("absensi", "tanggal", range.from, range.to),
    safeFetchFiltered("permohonan_stok", "tanggal_kirim", range.from, range.to),
    safeFetch("users")
  ]);

  state = mapState({
    outlets: outletsRes.data,
    produk: produkRes.data,
    penjualan: penjualanRes.data,
    produksi: produksiRes.data,
    jurnal: jurnalRes.data,
    coa: coaRes.data,
    bahan: bahanRes.data,
    stokMov: stokMovRes.data,
    karyawan: karyawanRes.data,
    absensi: absensiRes.data,
    permohonanStok: permohonanRes.data,
    users: usersRes.data
  }, usersRes.data || []);
  notify();
}

// Fetch historical data for a specific date range. Used by Laporan, Keuangan,
// StokGudang, and Absensi pages when the user selects a range outside the
// default production range (±3 days). Merges fetched data into state without
// losing recent data already loaded.
export async function fetchHistoricalData(from: string, to: string) {
  const [
    penjualanRes,
    produksiRes,
    jurnalRes,
    stokMovRes,
    absensiRes,
    permohonanRes
  ] = await Promise.all([
    safeFetchFiltered("penjualan", "tanggal", from, to),
    safeFetchFiltered("produksi", "tanggal", from, to),
    safeFetchFiltered("jurnal", "tanggal", from, to),
    safeFetchFiltered("stok_movement", "tanggal", from, to),
    safeFetchFiltered("absensi", "tanggal", from, to),
    safeFetchFiltered("permohonan_stok", "tanggal_kirim", from, to)
  ]);

  // Merge: keep existing records, add/update with historical ones
  const mergeById = <T extends { id: string }>(existing: T[], fresh: T[]): T[] => {
    const map = new Map(existing.map(r => [r.id, r]));
    (fresh || []).forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  };

  const raw = {
    outlets: state.outlets,
    produk: state.produk,
    penjualan: mergeById(state.penjualan, (penjualanRes.data || []).map((p: any) => ({
      id: p.id, tanggal: p.tanggal, outletId: p.outlet_id, produkId: p.produk_id,
      qty: p.qty, harga: p.harga, total: Number(p.total),
      sisaGram: p.sisa_gram === null ? undefined : p.sisa_gram,
      variant: p.variant === null ? undefined : p.variant
    }))),
    produksi: mergeById(state.produksi, (produksiRes.data || []).map((p: any) => ({
      id: p.id, tanggal: p.tanggal, produkId: p.produk_id,
      qtyRencana: p.qty_rencana, qtyRealisasi: p.qty_realisasi
    }))),
    jurnal: mergeById(state.jurnal, (jurnalRes.data || []).map((j: any) => ({
      id: j.id, tanggal: j.tanggal, ref: j.ref, keterangan: j.keterangan,
      kodeAkun: j.kode_akun, akun: j.akun, tipe: j.tipe,
      jumlah: Number(j.jumlah), kategori: j.kategori
    }))),
    coa: state.coa,
    bahan: state.bahan,
    stokMov: mergeById(state.stokMov, (stokMovRes.data || []).map((m: any) => ({
      id: m.id, tanggal: m.tanggal, bahanId: m.bahan_id, tipe: m.tipe,
      qty: m.qty, keterangan: m.keterangan, produksiId: m.produksi_id
    }))),
    karyawan: state.karyawan,
    absensi: mergeById(state.absensi, (absensiRes.data || []).map((a: any) => ({
      id: a.id, tanggal: a.tanggal, karyawanId: a.karyawan_id,
      jamMasuk: a.jam_masuk, jamPulang: a.jam_pulang, status: a.status,
      catatan: a.catatan, bonus: a.bonus ? Number(a.bonus) : 0,
      tunjangan: a.tunjangan ? Number(a.tunjangan) : 0, overtime: a.overtime ? Number(a.overtime) : 0
    }))),
    permohonanStok: mergeById(state.permohonanStok, (permohonanRes.data || []).map((p: any) => ({
      id: p.id, tanggal: p.tanggal, tanggalKirim: p.tanggal_kirim,
      outletId: p.outlet_id, produkId: p.produk_id, qty: p.qty, status: p.status,
      catatan: p.catatan,
      qtyRencana: p.qty_rencana != null ? p.qty_rencana : p.qty,
      catatanRencana: p.catatan_rencana || p.catatan || undefined
    }))),
    users: state.users,
    settings: state.settings
  };

  state = raw;
  notify();
}

// Initial fetch when module loads
fetchFromSupabase();

// Setup Supabase Real-time listener for database sync
supabase
  .channel("db-realtime-channel")
  .on("postgres_changes", { event: "*", schema: "public" }, () => {
    fetchFromSupabase();
  })
  .subscribe();

// Periodic polling fallback (every 30s) in case Realtime connection drops
setInterval(() => {
  fetchFromSupabase();
}, 30_000);

const uid = () => Math.random().toString(36).slice(2, 10);

// =============================================================================
// AUTO-BACKUP SEBELUM OPERASI HAPUS
// =============================================================================

/**
 * Backup otomatis sebelum operasi hapus data.
 * Menyimpan ke localStorage + trigger download file JSON.
 * Dipanggil di deleteKaryawan, deleteUser, dan reset.
 */
async function preDeleteBackup(reason: string) {
  try {
    console.log(`[auto-backup] Memulai backup sebelum hapus: ${reason}`);

    // Fetch semua data dari Supabase
    const tables = [
      "outlets", "produk", "coa", "bahan_baku", "karyawan", "users",
      "jurnal", "penjualan", "produksi", "stok_movement", "absensi", "permohonan_stok"
    ];
    const backup: Record<string, any[]> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select("*");
      backup[table] = data || [];
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const payload = {
      _meta: {
        createdAt: new Date().toISOString(),
        reason,
        source: "auto-backup pre-delete",
        tables,
        totalRecords: tables.reduce((sum, t) => sum + (backup[t]?.length || 0), 0)
      },
      ...backup
    };

    // Simpan ke localStorage (max 5 backup terakhir)
    const STORAGE_KEY = "buba_auto_backups";
    let existing: any[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch { /* ignore */ }
    existing.push({ key: `backup-${timestamp}`, data: payload, reason });
    if (existing.length > 5) existing = existing.slice(-5);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));

    // Trigger download file JSON
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auto-backup-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(`[auto-backup] ✅ Backup berhasil: auto-backup-${timestamp}.json`);
  } catch (err) {
    console.error("[auto-backup] ⚠️ Backup gagal, operasi tetap dilanjutkan:", err);
    // Jangan block operasi hapus jika backup gagal
  }
}

export const db = {
  async addOutlet(o: Omit<Outlet, "id">) {
    const id = uid();
    await supabase.from("outlets").insert([{ ...o, id }]);
    fetchFromSupabase();
  },
  async updateOutlet(id: string, o: Partial<Outlet>) {
    await supabase.from("outlets").update(o).eq("id", id);
    fetchFromSupabase();
  },
  async deleteOutlet(id: string) {
    await supabase.from("outlets").delete().eq("id", id);
    fetchFromSupabase();
  },

  async addProduk(p: Omit<Produk, "id">) {
    const id = uid();
    await supabase.from("produk").insert([{ ...p, id }]);
    fetchFromSupabase();
  },
  async updateProduk(id: string, p: Partial<Produk>) {
    await supabase.from("produk").update(p).eq("id", id);
    fetchFromSupabase();
  },
  async deleteProduk(id: string) {
    await supabase.from("produk").delete().eq("id", id);
    fetchFromSupabase();
  },

  async addPenjualan(p: Omit<Penjualan, "id" | "total"> & { sisaGram?: number; variant?: string }) {
    const total = p.qty * p.harga;
    const id = uid();
    const { error } = await supabase.from("penjualan").insert([{
      id,
      tanggal: p.tanggal,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      harga: p.harga,
      total,
      sisa_gram: p.sisaGram ?? null,
      variant: p.variant ?? null
    }]);
    if (error) throw error;
    await fetchFromSupabase();
  },
  async addPenjualanBulk(items: (Omit<Penjualan, "id" | "total"> & { sisaGram?: number; variant?: string })[]) {
    const records = items.map((p) => ({
      id: uid(),
      tanggal: p.tanggal,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      harga: p.harga,
      total: p.qty * p.harga,
      sisa_gram: p.sisaGram ?? null,
      variant: p.variant ?? null
    }));
    const { error } = await supabase.from("penjualan").insert(records);
    if (error) throw error;
    await fetchFromSupabase();
  },
  async deletePenjualan(id: string) {
    const { error } = await supabase.from("penjualan").delete().eq("id", id);
    if (error) throw error;
    await fetchFromSupabase();
  },
  /**
   * Replace ALL penjualan for an outlet+tanggal+baseId in one shot.
   * Deletes existing records, then inserts new variant records.
   * Only calls fetchFromSupabase() ONCE at the end (avoids stale-closure race).
   */
  async replacePenjualanForOutlet(
    outletId: string,
    tanggal: string,
    baseId: string,
    variants: { subId: string; qty: number; harga: number; sisaGram?: number }[]
  ) {
    // Delete ALL existing for this outlet+tanggal+baseId
    const { error: delErr } = await supabase
      .from("penjualan")
      .delete()
      .eq("outlet_id", outletId)
      .eq("tanggal", tanggal)
      .eq("produk_id", baseId);
    if (delErr) throw delErr;
    // Insert new variant records
    if (variants.length > 0) {
      const records = variants.map((v) => ({
        id: uid(),
        tanggal,
        outlet_id: outletId,
        produk_id: baseId,
        qty: v.qty,
        harga: v.harga,
        total: v.qty * v.harga,
        sisa_gram: v.sisaGram ?? null,
        variant: v.subId,
      }));
      const { error: insErr } = await supabase.from("penjualan").insert(records);
      if (insErr) throw insErr;
    }
  },

  async addProduksi(p: Omit<Produksi, "id">) {
    const id = uid();
    const { error } = await supabase.from("produksi").insert([{
      id,
      tanggal: p.tanggal,
      produk_id: p.produkId,
      qty_rencana: p.qtyRencana,
      qty_realisasi: p.qtyRealisasi
    }]);
    if (error) throw error;
    fetchFromSupabase();
  },
  async addProduksiBulk(items: Omit<Produksi, "id">[]) {
    const records = items.map((p) => ({
      id: uid(),
      tanggal: p.tanggal,
      produk_id: p.produkId,
      qty_rencana: p.qtyRencana,
      qty_realisasi: p.qtyRealisasi
    }));
    const { error } = await supabase.from("produksi").insert(records);
    if (error) throw error;
    fetchFromSupabase();
  },
  async updateProduksi(id: string, p: Partial<Produksi>) {
    const mapped: any = {};
    if (p.tanggal !== undefined) mapped.tanggal = p.tanggal;
    if (p.produkId !== undefined) mapped.produk_id = p.produkId;
    if (p.qtyRencana !== undefined) mapped.qty_rencana = p.qtyRencana;
    if (p.qtyRealisasi !== undefined) mapped.qty_realisasi = p.qtyRealisasi;
    await supabase.from("produksi").update(mapped).eq("id", id);
    fetchFromSupabase();
  },
  async deleteProduksi(id: string) {
    const { error } = await supabase.from("produksi").delete().eq("id", id);
    if (error) throw error;
    fetchFromSupabase();
  },

  async addJurnal(j: Omit<Jurnal, "id">) {
    const id = uid();
    await supabase.from("jurnal").insert([{
      id,
      tanggal: j.tanggal,
      ref: j.ref,
      keterangan: j.keterangan,
      kode_akun: j.kodeAkun,
      akun: j.akun,
      tipe: j.tipe,
      jumlah: j.jumlah,
      kategori: j.kategori
    }]);
    fetchFromSupabase();
  },
  async addJurnalBulk(items: Omit<Jurnal, "id">[]) {
    const records = items.map((j) => ({
      id: uid(),
      tanggal: j.tanggal,
      ref: j.ref,
      keterangan: j.keterangan,
      kode_akun: j.kodeAkun,
      akun: j.akun,
      tipe: j.tipe,
      jumlah: j.jumlah,
      kategori: j.kategori
    }));
    await supabase.from("jurnal").insert(records);
    fetchFromSupabase();
  },
  async deleteJurnal(id: string) {
    await supabase.from("jurnal").delete().eq("id", id);
    fetchFromSupabase();
  },

  async addBahan(b: Omit<BahanBaku, "id">) {
    const id = uid();
    const { error } = await supabase.from("bahan_baku").insert([{
      id,
      kode: b.kode,
      nama: b.nama,
      satuan: b.satuan,
      stok_min: b.stokMin,
      stok_awal: b.stokAwal,
      harga_beli: b.hargaBeli,
      konversi_gram: b.konversiGram ?? null
    }]);
    if (error) {
      console.error(`addBahan error (kode=${b.kode}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async updateBahan(id: string, b: Partial<BahanBaku>) {
    const mapped: any = {};
    if (b.kode !== undefined) mapped.kode = b.kode;
    if (b.nama !== undefined) mapped.nama = b.nama;
    if (b.satuan !== undefined) mapped.satuan = b.satuan;
    if (b.stokMin !== undefined) mapped.stok_min = b.stokMin;
    if (b.stokAwal !== undefined) mapped.stok_awal = b.stokAwal;
    if (b.hargaBeli !== undefined) mapped.harga_beli = b.hargaBeli;
    if (b.konversiGram !== undefined) mapped.konversi_gram = b.konversiGram;
    const { error } = await supabase.from("bahan_baku").update(mapped).eq("id", id);
    if (error) {
      console.error(`updateBahan error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteBahan(id: string) {
    const { error } = await supabase.from("bahan_baku").delete().eq("id", id);
    if (error) {
      console.error(`deleteBahan error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },

  async addStokMov(m: Omit<StokMovement, "id">) {
    const id = uid();
    const { error } = await supabase.from("stok_movement").insert([{
      id,
      tanggal: m.tanggal,
      bahan_id: m.bahanId,
      tipe: m.tipe,
      qty: m.qty,
      keterangan: m.keterangan,
      produksi_id: m.produksiId
    }]);
    if (error) {
      console.error(`addStokMov error (bahan=${m.bahanId}, qty=${m.qty}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteStokMov(id: string) {
    await supabase.from("stok_movement").delete().eq("id", id);
    fetchFromSupabase();
  },

  async addKaryawan(k: Omit<Karyawan, "id">, userAccount: { username: string; password: string; role: string }) {
    // Check for duplicate username in DB first
    const { data: existing } = await supabase
      .from("users")
      .select("username")
      .eq("username", userAccount.username)
      .maybeSingle();
    if (existing) {
      throw new Error("Username sudah terdaftar di database");
    }

    const id = uid();
    const role = k.role || userAccount.role || "outlet";

    const { error: errK } = await supabase.from("karyawan").insert([{
      id,
      nama: k.nama,
      posisi: k.posisi,
      role,
      outlet_id: k.outletId,
      gaji_pokok: k.gajiPokok,
      bonus_omset: k.bonusOmset,
      bonus_ulasan: k.bonusUlasan,
      bonus_oh: k.bonusOH ?? 0,
      tunjangan_harian: k.tunjanganHarian ?? 0,
      overtime_rate: k.overtimeRate ?? 0,
      jam_masuk: k.jamMasuk ?? null,
      jam_pulang: k.jamPulang ?? null
    }]);
    if (errK) throw errK;

    // Always create linked user account
    const { error: errU } = await supabase.from("users").insert([{
      username: userAccount.username,
      password: userAccount.password,
      nama: k.nama,
      role,
      outlet_id: k.outletId ?? null,
      karyawan_id: id
    }]);
    if (errU) {
      // Rollback: delete the karyawan if user insert fails
      await supabase.from("karyawan").delete().eq("id", id);
      throw errU;
    }

    await fetchFromSupabase();
  },
  async updateKaryawan(id: string, k: Partial<Karyawan>, newPassword?: string) {
    // Check username uniqueness if username is being changed
    if (k.username) {
      const { data: existing } = await supabase
        .from("users")
        .select("username, karyawan_id")
        .eq("username", k.username)
        .maybeSingle();
      if (existing && existing.karyawan_id !== id) {
        throw new Error("Username sudah digunakan oleh karyawan lain");
      }
    }

    const mapped: any = {};
    if (k.nama !== undefined) mapped.nama = k.nama;
    if (k.posisi !== undefined) mapped.posisi = k.posisi;
    if (k.role !== undefined) mapped.role = k.role;
    if (k.outletId !== undefined) mapped.outlet_id = k.outletId;
    if (k.gajiPokok !== undefined) mapped.gaji_pokok = k.gajiPokok;
    if (k.bonusOmset !== undefined) mapped.bonus_omset = k.bonusOmset;
    if (k.bonusUlasan !== undefined) mapped.bonus_ulasan = k.bonusUlasan;
    if (k.bonusOH !== undefined) mapped.bonus_oh = k.bonusOH;
    if (k.tunjanganHarian !== undefined) mapped.tunjangan_harian = k.tunjanganHarian;
    if (k.overtimeRate !== undefined) mapped.overtime_rate = k.overtimeRate;
    if (k.jamMasuk !== undefined) mapped.jam_masuk = k.jamMasuk;
    if (k.jamPulang !== undefined) mapped.jam_pulang = k.jamPulang;
    await supabase.from("karyawan").update(mapped).eq("id", id);
    
    // Check if linked user account exists, then update or create
    const { data: linkedUser } = await supabase
      .from("users")
      .select("username")
      .eq("karyawan_id", id)
      .maybeSingle();
    
    const username = k.username || linkedUser?.username;
    const password = newPassword;
    
    if (linkedUser) {
      // Update existing user account
      const userMapped: any = {};
      if (k.nama !== undefined) userMapped.nama = k.nama;
      if (k.role !== undefined) userMapped.role = k.role;
      if (k.username !== undefined) userMapped.username = k.username;
      if (password !== undefined) userMapped.password = password;
      if (Object.keys(userMapped).length > 0) {
        await supabase.from("users").update(userMapped).eq("karyawan_id", id);
      }
    } else if (username && password) {
      // Create new user account for legacy karyawan
      const { error: err } = await supabase.from("users").insert([{
        username,
        password,
        nama: k.nama || "",
        role: k.role || "outlet",
        outlet_id: k.outletId ?? null,
        karyawan_id: id
      }]);
      if (err) throw err;
    }
    await fetchFromSupabase();
  },
  async deleteKaryawan(id: string) {
    // Auto-backup sebelum hapus karyawan (+ user terkait)
    await preDeleteBackup(`deleteKaryawan(${id})`);
    // Delete associated user account first, then karyawan
    const { error: errU } = await supabase.from("users").delete().eq("karyawan_id", id);
    if (errU) throw errU;
    const { error: errK } = await supabase.from("karyawan").delete().eq("id", id);
    if (errK) throw errK;
    await fetchFromSupabase();
  },

  async addAbsensi(a: Omit<Absensi, "id">) {
    // Idempoten: hapus dulu absensi lama utk (tanggal, karyawan) yg sama agar TIDAK double input.
    // Data lama otomatis tertimpa (re-save = replace) — konsisten dgn pola fix OH abon.
    // Catatan: UI GPS menjamin tombol "Absen Masuk" hanya muncul saat belum ada record hari ini
    // (todayRecord), jadi delete+insert ini tidak menghapus data bonus/tunjangan yg diinput admin.
    const { error: delErr } = await supabase
      .from("absensi")
      .delete()
      .eq("tanggal", a.tanggal)
      .eq("karyawan_id", a.karyawanId);
    if (delErr) {
      console.error(`addAbsensi delete lama error (tanggal=${a.tanggal}, karyawan=${a.karyawanId}):`, delErr);
      throw delErr; // jangan lanjut insert agar tidak terjadi duplikat saat delete gagal
    }

    const id = uid();
    await supabase.from("absensi").insert([{
      id,
      tanggal: a.tanggal,
      karyawan_id: a.karyawanId,
      jam_masuk: a.jamMasuk,
      jam_pulang: a.jamPulang,
      status: a.status,
      catatan: a.catatan,
      bonus: a.bonus ?? 0,
      tunjangan: a.tunjangan ?? 0,
      overtime: a.overtime ?? 0
    }]);
    fetchFromSupabase();
  },
  async deleteAbsensi(id: string) {
    await supabase.from("absensi").delete().eq("id", id);
    fetchFromSupabase();
  },
  async updateAbsensi(id: string, a: Partial<Absensi>) {
    const mapped: any = {};
    if (a.tanggal !== undefined) mapped.tanggal = a.tanggal;
    if (a.karyawanId !== undefined) mapped.karyawan_id = a.karyawanId;
    if (a.jamMasuk !== undefined) mapped.jam_masuk = a.jamMasuk;
    if (a.jamPulang !== undefined) mapped.jam_pulang = a.jamPulang;
    if (a.status !== undefined) mapped.status = a.status;
    if (a.catatan !== undefined) mapped.catatan = a.catatan;
    if (a.bonus !== undefined) mapped.bonus = a.bonus;
    if (a.tunjangan !== undefined) mapped.tunjangan = a.tunjangan;
    if (a.overtime !== undefined) mapped.overtime = a.overtime;
    await supabase.from("absensi").update(mapped).eq("id", id);
    fetchFromSupabase();
  },

  async addPermohonanStok(p: Omit<PermohonanStok, "id" | "status">) {
    const id = uid();
    const { error } = await supabase.from("permohonan_stok").insert([{
      id,
      tanggal: p.tanggal,
      tanggal_kirim: p.tanggalKirim,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      status: "Pending",
      catatan: p.catatan,
      qty_rencana: p.qtyRencana != null ? p.qtyRencana : p.qty,
      catatan_rencana: p.catatanRencana || p.catatan || null
    }]);
    if (error) throw error;
    fetchFromSupabase();
  },
  async addPermohonanStokBulk(items: Omit<PermohonanStok, "id" | "status">[]) {
    const records = items.map((p) => ({
      id: uid(),
      tanggal: p.tanggal,
      tanggal_kirim: p.tanggalKirim,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      status: "Pending",
      catatan: p.catatan,
      qty_rencana: p.qtyRencana != null ? p.qtyRencana : p.qty,
      catatan_rencana: p.catatanRencana || p.catatan || null
    }));
    const { error } = await supabase.from("permohonan_stok").insert(records);
    if (error) throw error;
    fetchFromSupabase();
  },
  async updatePermohonanStokStatus(id: string, status: PermohonanStokStatus) {
    const { error } = await supabase.from("permohonan_stok").update({ status }).eq("id", id);
    if (error) throw error;
    fetchFromSupabase();
  },
  async updatePermohonanStok(id: string, p: Partial<PermohonanStok>) {
    const mapped: any = {};
    if (p.tanggal !== undefined) mapped.tanggal = p.tanggal;
    if (p.tanggalKirim !== undefined) mapped.tanggal_kirim = p.tanggalKirim;
    if (p.qty !== undefined) mapped.qty = p.qty;
    if (p.status !== undefined) mapped.status = p.status;
    if (p.catatan !== undefined) mapped.catatan = p.catatan;
    if (p.qtyRencana !== undefined) mapped.qty_rencana = p.qtyRencana;
    if (p.catatanRencana !== undefined) mapped.catatan_rencana = p.catatanRencana;
    const { error } = await supabase.from("permohonan_stok").update(mapped).eq("id", id);
    if (error) throw error;
    fetchFromSupabase();
  },
  async deletePermohonanStok(id: string) {
    const { error } = await supabase.from("permohonan_stok").delete().eq("id", id);
    if (error) throw error;
    fetchFromSupabase();
  },
  async addUser(u: UserAccount) {
    await supabase.from("users").insert([{
      username: u.username,
      password: u.password,
      nama: u.nama,
      role: u.role,
      outlet_id: u.outletId === "none" || !u.outletId ? null : u.outletId
    }]);
    fetchFromSupabase();
  },
  async updateUser(username: string, u: Partial<UserAccount>) {
    const mapped: any = {};
    if (u.password !== undefined) mapped.password = u.password;
    if (u.nama !== undefined) mapped.nama = u.nama;
    if (u.role !== undefined) mapped.role = u.role;
    if (u.outletId !== undefined) mapped.outlet_id = u.outletId === "none" || !u.outletId ? null : u.outletId;
    await supabase.from("users").update(mapped).eq("username", username);
    fetchFromSupabase();
  },
  async deleteUser(username: string) {
    // Auto-backup sebelum hapus user
    await preDeleteBackup(`deleteUser(${username})`);
    await supabase.from("users").delete().eq("username", username);
    fetchFromSupabase();
  },

  async reset() {
    // Auto-backup sebelum reset semua data
    await preDeleteBackup("reset-all-data");
    try {
      await Promise.all([
        supabase.from("penjualan").delete().neq("id", ""),
        supabase.from("produksi").delete().neq("id", ""),
        supabase.from("jurnal").delete().neq("id", ""),
        supabase.from("stok_movement").delete().neq("id", ""),
        supabase.from("absensi").delete().neq("id", ""),
        supabase.from("permohonan_stok").delete().neq("id", ""),
        supabase.from("karyawan").delete().neq("id", ""),
        supabase.from("users").delete().neq("username", ""),
        supabase.from("produk").delete().neq("id", ""),
        supabase.from("outlets").delete().neq("id", ""),
        supabase.from("coa").delete().neq("kode", ""),
        supabase.from("bahan_baku").delete().neq("id", "")
      ]);

      // re-seed
      await supabase.from("outlets").insert(SEED_OUTLETS);
      await supabase.from("produk").insert(SEED_PRODUK);
      
      // Seed users (including karyawan_id link)
      const seedUsers = [
        { username: "admin", password: "admin123", nama: "Administrator", role: "admin", outlet_id: null, karyawan_id: null },
        { username: "khazana", password: "Fazana@10", nama: "Super Admin", role: "admin", outlet_id: null, karyawan_id: null },
        { username: "produksi", password: "produksi123", nama: "Kepala Produksi", role: "admin", outlet_id: null, karyawan_id: "k-produksi" },
        ...SEED_OUTLETS.map((o) => ({
          username: o.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          password: "buba123",
          nama: o.nama,
          role: "outlet",
          outlet_id: o.id,
          karyawan_id: `k-${o.id}-1`
        }))
      ];
      await supabase.from("users").insert(seedUsers);
      
      const seedCoaMapped = SEED_COA.map((c) => ({
        kode: c.kode,
        nama: c.nama,
        tipe: c.tipe,
        kategori: c.kategori
      }));
      await supabase.from("coa").insert(seedCoaMapped);
      
      const seedBahanMapped = SEED_BAHAN.map((b) => ({
        id: b.id,
        kode: b.kode,
        nama: b.nama,
        satuan: b.satuan,
        stok_min: b.stokMin,
        stok_awal: b.stokAwal,
        harga_beli: b.hargaBeli,
        konversi_gram: b.konversiGram ?? null
      }));
      await supabase.from("bahan_baku").insert(seedBahanMapped);
      
      const seedKaryawanMapped = SEED_KARYAWAN.map((k) => ({
        id: k.id,
        nama: k.nama,
        posisi: k.posisi,
        role: k.role || "outlet",
        outlet_id: k.outletId,
        gaji_pokok: k.gajiPokok,
        bonus_omset: k.bonusOmset,
        bonus_ulasan: k.bonusUlasan,
        bonus_oh: k.bonusOH ?? 0,
        tunjangan_harian: k.tunjanganHarian ?? 0,
        overtime_rate: k.overtimeRate ?? 0,
        jam_masuk: k.jamMasuk ?? null,
        jam_pulang: k.jamPulang ?? null
      }));
      await supabase.from("karyawan").insert(seedKaryawanMapped);

      const seedJurnalMapped = SEED_JURNAL.map((j) => ({
        id: j.id,
        tanggal: j.tanggal,
        ref: j.ref,
        keterangan: j.keterangan,
        kode_akun: j.kodeAkun,
        akun: j.akun,
        tipe: j.tipe,
        jumlah: j.jumlah,
        kategori: j.kategori
      }));
      await supabase.from("jurnal").insert(seedJurnalMapped);
      
      fetchFromSupabase();
    } catch (err) {
      console.error("Failed to reset database:", err);
    }
  }
};

// Bahan yang punya konversiGram tapi tetap dihitung dalam satuan utuh (pcs/sachet),
// karena produksi selalu menghabiskan per satuan utuh, tidak pernah ada sisa gram.
export const GRAM_EXCLUDED_BAHAN = new Set(["b-pud01", "b-oat01"]);

export function saldoBahan(bahanId: string, state_?: DB): number {
  const s = state_ ?? state;
  const b = s.bahan.find((x) => x.id === bahanId);
  if (!b) return 0;
  const kg = b.konversiGram && b.konversiGram > 0 && !GRAM_EXCLUDED_BAHAN.has(bahanId) ? b.konversiGram : null;
  if (kg) {
    // Gram-based: stok awal dalam gram, movement dalam gram
    let saldo = b.stokAwal * kg;
    for (const m of s.stokMov) {
      if (m.bahanId !== bahanId) continue;
      saldo += m.tipe === "IN" ? m.qty : -m.qty;
    }
    return saldo;
  } else {
    // Unit-based: tanpa konversi gram (cup, tutup, dll, dan oat/puding)
    let saldo = b.stokAwal;
    for (const m of s.stokMov) {
      if (m.bahanId !== bahanId) continue;
      saldo += m.tipe === "IN" ? m.qty : -m.qty;
    }
    return saldo;
  }
}
