import React, { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
import { DEFAULT_LOCK_DEADLINE } from "./produksi-utils";
import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, BahanBaku, StokMovement, Karyawan, Absensi, PermohonanStok, PermohonanStokStatus, UserAccount, KodeBantu, HppProduk, HppBahan, HppConsumable, LogAktivitas } from "./types";
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
  kodeBantu: KodeBantu[];
  hppProduk: HppProduk[];
  hppBahan: HppBahan[];
  hppConsumable: HppConsumable[];
  logAktivitas: LogAktivitas[];
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
  kodeBantu: [],
  hppProduk: [],
  hppBahan: [],
  hppConsumable: [],
  logAktivitas: [],
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

// === HISTORICAL LOADING STATE ===
// Lightweight reactive flag so pages can show a loading indicator while
// fetchHistoricalData is in progress (without adding to the DB interface).
let _historicalLoading = false;
const _histListeners = new Set<() => void>();

function setHistoricalLoading(v: boolean) {
  _historicalLoading = v;
  _histListeners.forEach(l => l());
}

/** Check if a historical data fetch is currently in progress. */
export function isHistoricalLoading() { return _historicalLoading; }

/** Subscribe to historical loading state changes. Returns unsubscribe fn. */
export function onHistoricalLoadingChange(l: () => void) {
  _histListeners.add(l);
  return () => { _histListeners.delete(l); };
}

/** React hook for historical loading state. */
export function useHistoricalLoading() {
  return useSyncExternalStore(
    (cb) => onHistoricalLoadingChange(cb),
    () => _historicalLoading,
    () => _historicalLoading
  );
}

// Helper: fetch a single table and return { data, error }. Never throws.
// Supabase default select returns max 1000 rows. This function paginates
// automatically when the result hits the limit, ensuring ALL records are loaded.
const SUPABASE_PAGE_SIZE = 1000;

// ── Retry logic with exponential backoff ─────────────────────────────────────
// Protects against transient Supabase failures (PostgREST unhealthy, connection
// pool exhausted, etc.). If all retries fail, returns { data: null, error }.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s, 2s, 4s

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Determines if an error is retryable (transient). */
function isRetryable(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || err.code || "").toLowerCase();
  // PostgREST schema cache / connection errors
  if (msg.includes("pgrst002") || msg.includes("pgrst000") || msg.includes("pgrst001")) return true;
  // HTTP 503 / 502 / 504 (service unavailable / gateway timeout)
  if (err.status === 503 || err.status === 502 || err.status === 504) return true;
  // Network / timeout errors
  if (msg.includes("timeout") || msg.includes("network") || msg.includes("fetch") || msg.includes("econnrefused")) return true;
  return false;
}

/** Retry wrapper with exponential backoff. Only retries on transient errors. */
async function retryWithBackoff<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES && isRetryable(err)) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[retry] ${label} attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${err.message || err}. Retrying in ${delay}ms...`);
        await sleep(delay);
      } else {
        break;
      }
    }
  }
  throw lastError;
}

// ── Connection status tracking ───────────────────────────────────────────────
// Exposed via useConnectionStatus() hook so UI can show a banner when DB is down.
let _connectionOk = true;
let _lastError: string | null = null;
let _downSince: number | null = null;
const _connListeners = new Set<() => void>();

function setConnectionStatus(ok: boolean, error?: string) {
  const changed = _connectionOk !== ok;
  _connectionOk = ok;
  _lastError = ok ? null : (error || null);
  if (!ok && !_downSince) _downSince = Date.now();
  if (ok) _downSince = null;
  if (changed) _connListeners.forEach((l) => l());
}

export function useConnectionStatus() {
  const [status, setStatus] = React.useState({ ok: _connectionOk, error: _lastError, downSince: _downSince });
  React.useEffect(() => {
    const handler = () => setStatus({ ok: _connectionOk, error: _lastError, downSince: _downSince });
    _connListeners.add(handler);
    return () => { _connListeners.delete(handler); };
  }, []);
  return status;
}

/** Seconds since DB went down (null if currently up). */
export function useConnectionDownSeconds(): number | null {
  const [secs, setSecs] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!_downSince) { setSecs(null); return; }
    const id = setInterval(() => setSecs(_downSince ? Math.floor((Date.now() - _downSince) / 1000) : null), 1000);
    return () => clearInterval(id);
  }, [_connectionOk]);
  return secs;
}

// ── Column selection: fetch only columns the app actually uses ──────────────
// Reduces network payload and Postgres I/O vs select("*").
const TABLE_COLUMNS: Record<string, string> = {
  outlets:          "id, nama, lokasi",
  produk:           "id, nama, harga, satuan",
  penjualan:        "id, tanggal, outlet_id, produk_id, qty, harga, total, sisa_gram, variant",
  produksi:         "id, tanggal, produk_id, qty_rencana, qty_realisasi",
  jurnal:           "id, tanggal, ref, keterangan, kode_akun, akun, tipe, jumlah, kategori, kode_bantu_id",
  coa:              "kode, nama, tipe, kategori",
  bahan_baku:       "id, kode, nama, satuan, stok_min, stok_awal, harga_beli, konversi_gram",
  stok_movement:    "id, tanggal, bahan_id, tipe, qty, keterangan, produksi_id",
  karyawan:         "id, nama, posisi, role, outlet_id, gaji_pokok, bonus_omset, bonus_ulasan, bonus_oh, tunjangan_harian, overtime_rate, jam_masuk, jam_pulang",
  absensi:          "id, tanggal, karyawan_id, jam_masuk, jam_pulang, status, catatan, bonus, tunjangan, overtime",
  permohonan_stok:  "id, tanggal, tanggal_kirim, outlet_id, produk_id, qty, status, catatan, qty_rencana, catatan_rencana",
  users:            "username, password, nama, role, outlet_id, karyawan_id",
  kode_bantu:       "id, kode, kode_akun, nama, keterangan, saldo_awal, created_at",
  hpp_produk:       "id, produk_id, harga_jual, catatan, aktif, updated_at",
  hpp_bahan:        "id, hpp_produk_id, nama_item, satuan, berat, harga, jadi, urutan",
  hpp_consumable:   "id, hpp_produk_id, nama_item, satuan, berat, harga, jumlah, urutan",
  log_aktivitas:    "id, created_at, username, nama_user, aksi, modul, record_id, detail, nilai_lama, nilai_baru",
};

/** Build a Supabase query with optional date range filter. */
function buildQuery(table: string, dateCol?: string, from?: string, to?: string) {
  const cols = TABLE_COLUMNS[table] || "*";
  let q = supabase.from(table).select(cols);
  if (dateCol && from) q = q.gte(dateCol, from);
  if (dateCol && to) q = q.lte(dateCol, to);
  return q;
}

async function safeFetch(table: string) {
  try {
    return await retryWithBackoff(async () => {
      const first = await buildQuery(table).range(0, SUPABASE_PAGE_SIZE - 1);
      if (first.error) throw first.error;
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
    }, `safeFetch(${table})`);
  } catch (err: any) {
    console.warn(`safeFetch(${table}) failed after retries:`, err?.message || err);
    return { data: null, error: err };
  }
}

/** Fetch with date range filter + pagination. Used for large tables (penjualan,
 *  permohonan_stok, etc.) to avoid loading all historical data at once. */
async function safeFetchFiltered(table: string, dateCol: string, from: string, to: string) {
  try {
    return await retryWithBackoff(async () => {
      const first = await buildQuery(table, dateCol, from, to).range(0, SUPABASE_PAGE_SIZE - 1);
      if (first.error) throw first.error;
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
    }, `safeFetchFiltered(${table})`);
  } catch (err: any) {
    console.warn(`safeFetchFiltered(${table}) failed after retries:`, err?.message || err);
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

// Date range for production flows — ±7 days from today covers
// Langkah 1-5 (planning, distribution, returns) + 1 week history.
// With ~15-20 records/day per table, this stays well under 1000-row limit.
const PRODUCTION_RANGE = () => ({ from: _daysAgoISO(7), to: _plusDaysISO(1) });

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
     jurnal: (() => {
       // O(n+m) lookup via Map instead of O(n*m) find()
       const coaByKode = new Map<string, any>();
       (raw.coa || []).forEach((c: any) => coaByKode.set(c.kode, c));
       return (raw.jurnal || []).map((j: any) => {
         const coaMatch = coaByKode.get(j.kode_akun);
         const kodeAkun = j.kode_akun ?? coaMatch?.kode ?? "";
         const akun = j.akun ?? coaMatch?.nama ?? "(Akun tidak dikenal)";
         const kategori = j.kategori ?? coaMatch?.kategori ?? "";
         return {
           id: j.id,
           tanggal: j.tanggal,
           ref: j.ref,
           keterangan: j.keterangan ?? "",
           kodeAkun,
           akun,
           tipe: j.tipe,
           jumlah: Number(j.jumlah),
           kategori,
           kodeBantuId: j.kode_bantu_id === null ? undefined : j.kode_bantu_id
         };
       });
     })(),
    kodeBantu: (raw.kodeBantu || []).map((k: any) => ({
      id: k.id,
      kode: k.kode,
      kodeAkun: k.kode_akun,
      nama: k.nama,
      keterangan: k.keterangan === null ? undefined : k.keterangan,
      saldoAwal: k.saldo_awal ?? 0,
      createdAt: k.created_at
    })),
    hppProduk: (raw.hppProduk || []).map((h: any) => ({
      id: h.id,
      produkId: h.produk_id,
      hargaJual: Number(h.harga_jual),
      catatan: h.catatan === null ? undefined : h.catatan,
      aktif: !!h.aktif,
      updatedAt: h.updated_at
    })),
    hppBahan: (raw.hppBahan || []).map((b: any) => ({
      id: b.id,
      hppProdukId: b.hpp_produk_id,
      namaItem: b.nama_item,
      satuan: b.satuan,
      berat: Number(b.berat),
      harga: Number(b.harga),
      jadi: Number(b.jadi),
      urutan: Number(b.urutan)
    })),
    hppConsumable: (raw.hppConsumable || []).map((c: any) => ({
      id: c.id,
      hppProdukId: c.hpp_produk_id,
      namaItem: c.nama_item,
      satuan: c.satuan,
      berat: Number(c.berat),
      harga: Number(c.harga),
      jumlah: Number(c.jumlah),
      urutan: Number(c.urutan)
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
    karyawan: (() => {
      // O(n+m) lookup via Map instead of O(n*m) find()
      const userByKaryawanId = new Map<string, any>();
      (usersData || []).forEach((u: any) => {
        if (u.karyawan_id) userByKaryawanId.set(u.karyawan_id, u);
      });
      return (raw.karyawan || []).map((k: any) => {
        const linkedUser = userByKaryawanId.get(k.id);
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
      });
    })(),
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
    logAktivitas: (raw.logAktivitas || []).map((l: any) => ({
      id: l.id,
      createdAt: l.created_at,
      username: l.username,
      namaUser: l.nama_user === null ? undefined : l.nama_user,
      aksi: l.aksi,
      modul: l.modul,
      recordId: l.record_id === null ? undefined : l.record_id,
      detail: l.detail === null ? undefined : l.detail,
      nilaiLama: l.nilai_lama === null ? undefined : l.nilai_lama,
      nilaiBaru: l.nilai_baru === null ? undefined : l.nilai_baru
    })),
    settings: getBubaSettings()
  };
}

// Fetch all tables from Supabase and update state cache.
// Large tables (penjualan, permohonan_stok, stok_movement, etc.) are filtered
// by date range to stay under Supabase's 1000-row default limit.
// Small reference tables (outlets, produk, coa, etc.) are fetched in full.
export async function fetchFromSupabase() {
  // Skip polling/realtime refresh while historical data is being fetched
  // to prevent race condition that overwrites historical data
  if (_historicalLoading) return;
  try {
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
    usersRes,
    kodeBantuRes,
    hppProdukRes,
    hppBahanRes,
    hppConsumableRes,
    logAktivitasRes
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
    safeFetch("users"),
    safeFetch("kode_bantu"),
    safeFetch("hpp_produk"),
    safeFetch("hpp_bahan"),
    safeFetch("hpp_consumable"),
    safeFetch("log_aktivitas")
  ]);

  // Merge with existing state to preserve historical data already loaded
  // by fetchHistoricalData. Only overwrite with fresh production-range data;
  // historical records outside the range stay in state.
  const mergeById = <T extends { id: string }>(existing: T[], fresh: T[]): T[] => {
    const map = new Map(existing.map(r => [r.id, r]));
    (fresh || []).forEach(r => map.set(r.id, r));
    return Array.from(map.values());
  };

  const raw = mapState({
    outlets: outletsRes.data,
    produk: produkRes.data,
    penjualan: mergeById(state.penjualan, penjualanRes.data || []),
    produksi: mergeById(state.produksi, produksiRes.data || []),
    jurnal: mergeById(state.jurnal, jurnalRes.data || []),
    coa: coaRes.data,
    bahan: bahanRes.data,
    stokMov: mergeById(state.stokMov, stokMovRes.data || []),
    karyawan: karyawanRes.data,
    absensi: mergeById(state.absensi, absensiRes.data || []),
    permohonanStok: mergeById(state.permohonanStok, permohonanRes.data || []),
    users: usersRes.data,
    kodeBantu: kodeBantuRes.data || [],
    hppProduk: hppProdukRes.data || [],
    hppBahan: hppBahanRes.data || [],
    hppConsumable: hppConsumableRes.data || [],
    logAktivitas: (logAktivitasRes.data || []).map((l: any) => ({
      id: l.id,
      createdAt: l.created_at,
      username: l.username,
      namaUser: l.nama_user === null ? undefined : l.nama_user,
      aksi: l.aksi,
      modul: l.modul,
      recordId: l.record_id === null ? undefined : l.record_id,
      detail: l.detail === null ? undefined : l.detail,
      nilaiLama: l.nilai_lama === null ? undefined : l.nilai_lama,
      nilaiBaru: l.nilai_baru === null ? undefined : l.nilai_baru
    }))
  }, usersRes.data || []);
  state = raw;
  notify();
  setConnectionStatus(true);
  } catch (err: any) {
    // All retries exhausted — mark connection as down
    console.error("[store] fetchFromSupabase failed:", err?.message || err);
    setConnectionStatus(false, err?.message || String(err));
  }
}

// Fetch historical data for a specific date range. Used by Laporan, Keuangan,
// StokGudang, and Absensi pages when the user selects a range outside the
// default production range (±3 days). Merges fetched data into state without
// losing recent data already loaded.
export async function fetchHistoricalData(from: string, to: string) {
  setHistoricalLoading(true);
  try {
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
      jumlah: Number(j.jumlah), kategori: j.kategori,
      kodeBantuId: j.kode_bantu_id === null ? undefined : j.kode_bantu_id
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
    kodeBantu: state.kodeBantu,
    hppProduk: state.hppProduk,
    hppBahan: state.hppBahan,
    hppConsumable: state.hppConsumable,
    settings: state.settings
  };

  state = raw;
  notify();
  setConnectionStatus(true);
  } catch (err: any) {
    console.error("[store] fetchHistoricalData failed:", err?.message || err);
    setConnectionStatus(false, err?.message || String(err));
  } finally {
    setHistoricalLoading(false);
  }
}

// ── Debounced fetch: prevents rapid-fire realtime/polling from overwhelming DB ─
let _fetchTimer: ReturnType<typeof setTimeout> | null = null;
let _fetchPending = false;
const DEBOUNCE_MS = 2000; // coalesce multiple events within 2s into one fetch

function debouncedFetch() {
  if (_fetchPending) return; // already scheduled
  _fetchPending = true;
  _fetchTimer = setTimeout(() => {
    _fetchPending = false;
    _fetchTimer = null;
    fetchFromSupabase();
  }, DEBOUNCE_MS);
}

// Initial fetch when module loads
fetchFromSupabase();

// Setup Supabase Real-time listener for database sync (debounced)
supabase
  .channel("db-realtime-channel")
  .on("postgres_changes", { event: "*", schema: "public" }, () => {
    debouncedFetch();
  })
  .subscribe();

// Periodic polling fallback (every 60s) in case Realtime connection drops
setInterval(() => {
  fetchFromSupabase();
}, 60_000);

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
    logActivity({ aksi: 'CREATE', modul: 'Outlet', recordId: id, detail: `Outlet "${o.nama}" ditambahkan`, nilaiBaru: o });
  },
  async updateOutlet(id: string, o: Partial<Outlet>) {
    const old = state.outlets.find((x) => x.id === id);
    await supabase.from("outlets").update(o).eq("id", id);
    fetchFromSupabase();
    logActivity({ aksi: 'UPDATE', modul: 'Outlet', recordId: id, detail: `Outlet "${o.nama || old?.nama}" diperbarui`, nilaiLama: old, nilaiBaru: o });
  },
  async deleteOutlet(id: string) {
    const old = state.outlets.find((x) => x.id === id);
    await supabase.from("outlets").delete().eq("id", id);
    fetchFromSupabase();
    logActivity({ aksi: 'DELETE', modul: 'Outlet', recordId: id, detail: `Outlet "${old?.nama}" dihapus`, nilaiLama: old });
  },

  async addProduk(p: Omit<Produk, "id">) {
    const id = uid();
    await supabase.from("produk").insert([{ ...p, id }]);
    fetchFromSupabase();
    logActivity({ aksi: 'CREATE', modul: 'Produk', recordId: id, detail: `Produk "${p.nama}" ditambahkan`, nilaiBaru: p });
  },
  async updateProduk(id: string, p: Partial<Produk>) {
    const old = state.produk.find((x) => x.id === id);
    await supabase.from("produk").update(p).eq("id", id);
    fetchFromSupabase();
    logActivity({ aksi: 'UPDATE', modul: 'Produk', recordId: id, detail: `Produk "${p.nama || old?.nama}" diperbarui`, nilaiLama: old, nilaiBaru: p });
  },
  async deleteProduk(id: string) {
    const old = state.produk.find((x) => x.id === id);
    await supabase.from("produk").delete().eq("id", id);
    fetchFromSupabase();
    logActivity({ aksi: 'DELETE', modul: 'Produk', recordId: id, detail: `Produk "${old?.nama}" dihapus`, nilaiLama: old });
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
      kategori: j.kategori,
      kode_bantu_id: j.kodeBantuId ?? null
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
      kategori: j.kategori,
      kode_bantu_id: j.kodeBantuId ?? null
    }));
    await supabase.from("jurnal").insert(records);
    fetchFromSupabase();
  },
  async deleteJurnal(id: string) {
    await supabase.from("jurnal").delete().eq("id", id);
    fetchFromSupabase();
  },
  async updateJurnal(id: string, j: Partial<Omit<Jurnal, "id">>) {
    const mapped: any = {};
    if (j.tanggal !== undefined) mapped.tanggal = j.tanggal;
    if (j.ref !== undefined) mapped.ref = j.ref;
    if (j.keterangan !== undefined) mapped.keterangan = j.keterangan;
    if (j.kodeAkun !== undefined) mapped.kode_akun = j.kodeAkun;
    if (j.akun !== undefined) mapped.akun = j.akun;
    if (j.tipe !== undefined) mapped.tipe = j.tipe;
    if (j.jumlah !== undefined) mapped.jumlah = j.jumlah;
    if (j.kategori !== undefined) mapped.kategori = j.kategori;
    if (j.kodeBantuId !== undefined) mapped.kode_bantu_id = j.kodeBantuId ?? null;
    await supabase.from("jurnal").update(mapped).eq("id", id);
    fetchFromSupabase();
  },

  // ==================== KODE BANTU CRUD ====================
  // Generate next available code for given prefix ("H-" or "C-")
  generateKodeBantuNext(prefix: "H" | "C"): string {
    const existing = state.kodeBantu
      .filter((k) => k.kode.startsWith(prefix + "-"))
      .map((k) => {
        const m = k.kode.match(new RegExp(`^${prefix}-(\\d+)$`));
        return m ? parseInt(m[1], 10) : 0;
      });
    const maxN = existing.length > 0 ? Math.max(...existing) : 0;
    return `${prefix}-${String(maxN + 1).padStart(3, "0")}`;
  },
  async addKodeBantu(k: Omit<KodeBantu, "id" | "createdAt"> & { id?: string }) {
    const id = k.id ?? uid();
    const { error } = await supabase.from("kode_bantu").insert([{
      id,
      kode: k.kode,
      kode_akun: k.kodeAkun,
      nama: k.nama,
      keterangan: k.keterangan ?? null,
      saldo_awal: k.saldoAwal ?? 0
    }]);
    if (error) {
      console.error(`addKodeBantu error (kode=${k.kode}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async updateKodeBantu(id: string, k: Partial<Omit<KodeBantu, "id" | "createdAt">>) {
    const mapped: any = {};
    if (k.kode !== undefined) mapped.kode = k.kode;
    if (k.kodeAkun !== undefined) mapped.kode_akun = k.kodeAkun;
    if (k.nama !== undefined) mapped.nama = k.nama;
    if (k.keterangan !== undefined) mapped.keterangan = k.keterangan ?? null;
    if (k.saldoAwal !== undefined) mapped.saldo_awal = k.saldoAwal;
    const { error } = await supabase.from("kode_bantu").update(mapped).eq("id", id);
    if (error) {
      console.error(`updateKodeBantu error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteKodeBantu(id: string) {
    // Set jurnal.kode_bantu_id = NULL via FK ON DELETE SET NULL, then delete kode_bantu
    const { error } = await supabase.from("kode_bantu").delete().eq("id", id);
    if (error) {
      console.error(`deleteKodeBantu error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },

  // ==================== HPP PRODUK CRUD (Header 1 row per produk) ====================
  // Tambah/get/update/delete HppProduk (header dengan hargaJual)
  // Note: Auto-cascade ke hpp_bahan & hpp_consumable via FK ON DELETE CASCADE
  async addHppProduk(p: Omit<HppProduk, "id" | "updatedAt"> & { id?: string }) {
    const id = p.id ?? uid();
    const { error } = await supabase.from("hpp_produk").insert([{
      id,
      produk_id: p.produkId,
      harga_jual: p.hargaJual,
      catatan: p.catatan ?? null,
      aktif: p.aktif
    }]);
    if (error) {
      console.error(`addHppProduk error (produk=${p.produkId}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async updateHppProduk(id: string, p: Partial<Omit<HppProduk, "id" | "updatedAt">>) {
    const mapped: any = {};
    if (p.produkId !== undefined) mapped.produk_id = p.produkId;
    if (p.hargaJual !== undefined) mapped.harga_jual = p.hargaJual;
    if (p.catatan !== undefined) mapped.catatan = p.catatan ?? null;
    if (p.aktif !== undefined) mapped.aktif = p.aktif;
    const { error } = await supabase.from("hpp_produk").update(mapped).eq("id", id);
    if (error) {
      console.error(`updateHppProduk error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteHppProduk(id: string) {
    // ON DELETE CASCADE di FK hpp_bahan.hpp_produk_id & hpp_consumable.hpp_produk_id
    // akan otomatis hapus semua bahan & consumable terkait.
    const { error } = await supabase.from("hpp_produk").delete().eq("id", id);
    if (error) {
      console.error(`deleteHppProduk error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },

  // ==================== HPP BAHAN CRUD (Detail Bahan Baku) ====================
  // Tambah/update/delete HppBahan. HPP = (berat × harga) / jadi (auto-calc di UI)
  async addHppBahan(b: Omit<HppBahan, "id"> & { id?: string }) {
    const id = b.id ?? uid();
    const { error } = await supabase.from("hpp_bahan").insert([{
      id,
      hpp_produk_id: b.hppProdukId,
      nama_item: b.namaItem,
      satuan: b.satuan,
      berat: b.berat,
      harga: b.harga,
      jadi: b.jadi,
      urutan: b.urutan
    }]);
    if (error) {
      console.error(`addHppBahan error (hppProdukId=${b.hppProdukId}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async updateHppBahan(id: string, b: Partial<Omit<HppBahan, "id">>) {
    const mapped: any = {};
    if (b.hppProdukId !== undefined) mapped.hpp_produk_id = b.hppProdukId;
    if (b.namaItem !== undefined) mapped.nama_item = b.namaItem;
    if (b.satuan !== undefined) mapped.satuan = b.satuan;
    if (b.berat !== undefined) mapped.berat = b.berat;
    if (b.harga !== undefined) mapped.harga = b.harga;
    if (b.jadi !== undefined) mapped.jadi = b.jadi;
    if (b.urutan !== undefined) mapped.urutan = b.urutan;
    const { error } = await supabase.from("hpp_bahan").update(mapped).eq("id", id);
    if (error) {
      console.error(`updateHppBahan error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteHppBahan(id: string) {
    const { error } = await supabase.from("hpp_bahan").delete().eq("id", id);
    if (error) {
      console.error(`deleteHppBahan error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },

  // ==================== HPP CONSUMABLE CRUD (Detail Packaging) ====================
  // Tambah/update/delete HppConsumable. HPP = jumlah × harga (auto-calc di UI)
  async addHppConsumable(c: Omit<HppConsumable, "id"> & { id?: string }) {
    const id = c.id ?? uid();
    const { error } = await supabase.from("hpp_consumable").insert([{
      id,
      hpp_produk_id: c.hppProdukId,
      nama_item: c.namaItem,
      satuan: c.satuan,
      berat: c.berat,
      harga: c.harga,
      jumlah: c.jumlah,
      urutan: c.urutan
    }]);
    if (error) {
      console.error(`addHppConsumable error (hppProdukId=${c.hppProdukId}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async updateHppConsumable(id: string, c: Partial<Omit<HppConsumable, "id">>) {
    const mapped: any = {};
    if (c.hppProdukId !== undefined) mapped.hpp_produk_id = c.hppProdukId;
    if (c.namaItem !== undefined) mapped.nama_item = c.namaItem;
    if (c.satuan !== undefined) mapped.satuan = c.satuan;
    if (c.berat !== undefined) mapped.berat = c.berat;
    if (c.harga !== undefined) mapped.harga = c.harga;
    if (c.jumlah !== undefined) mapped.jumlah = c.jumlah;
    if (c.urutan !== undefined) mapped.urutan = c.urutan;
    const { error } = await supabase.from("hpp_consumable").update(mapped).eq("id", id);
    if (error) {
      console.error(`updateHppConsumable error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
  },
  async deleteHppConsumable(id: string) {
    const { error } = await supabase.from("hpp_consumable").delete().eq("id", id);
    if (error) {
      console.error(`deleteHppConsumable error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
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
    logActivity({ aksi: 'CREATE', modul: 'BahanBaku', recordId: id, detail: `Bahan "${b.kode} — ${b.nama}" ditambahkan`, nilaiBaru: b });
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
    logActivity({ aksi: 'UPDATE', modul: 'BahanBaku', recordId: id, detail: `Bahan "${b.nama || state.bahan.find((x) => x.id === id)?.nama}" diperbarui`, nilaiBaru: b });
  },
  async deleteBahan(id: string) {
    const old = state.bahan.find((x) => x.id === id);
    const { error } = await supabase.from("bahan_baku").delete().eq("id", id);
    if (error) {
      console.error(`deleteBahan error (id=${id}):`, error);
      throw error;
    }
    await fetchFromSupabase();
    logActivity({ aksi: 'DELETE', modul: 'BahanBaku', recordId: id, detail: `Bahan "${old?.kode} — ${old?.nama}" dihapus`, nilaiLama: old });
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
    const old = state.karyawan.find((x) => x.id === id);
    // Auto-backup sebelum hapus karyawan (+ user terkait)
    await preDeleteBackup(`deleteKaryawan(${id})`);
    // Delete associated user account first, then karyawan
    const { error: errU } = await supabase.from("users").delete().eq("karyawan_id", id);
    if (errU) throw errU;
    const { error: errK } = await supabase.from("karyawan").delete().eq("id", id);
    if (errK) throw errK;
    await fetchFromSupabase();
    logActivity({ aksi: 'DELETE', modul: 'Karyawan', recordId: id, detail: `Karyawan "${old?.nama}" dihapus`, nilaiLama: old });
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
    logActivity({ aksi: 'CREATE', modul: 'User', detail: `Akun "${u.username}" (${u.nama}) ditambahkan`, nilaiBaru: { username: u.username, nama: u.nama, role: u.role } });
  },
  async updateUser(username: string, u: Partial<UserAccount>) {
    const old = state.users.find((x) => x.username === username);
    const mapped: any = {};
    if (u.password !== undefined) mapped.password = u.password;
    if (u.nama !== undefined) mapped.nama = u.nama;
    if (u.role !== undefined) mapped.role = u.role;
    if (u.outletId !== undefined) mapped.outlet_id = u.outletId === "none" || !u.outletId ? null : u.outletId;
    await supabase.from("users").update(mapped).eq("username", username);
    fetchFromSupabase();
    logActivity({ aksi: 'UPDATE', modul: 'User', detail: `Akun "${username}" diperbarui`, nilaiLama: old ? { username: old.username, nama: old.nama, role: old.role } : undefined, nilaiBaru: { username, nama: u.nama, role: u.role } });
  },
  async deleteUser(username: string) {
    const old = state.users.find((x) => x.username === username);
    // Auto-backup sebelum hapus user
    await preDeleteBackup(`deleteUser(${username})`);
    await supabase.from("users").delete().eq("username", username);
    fetchFromSupabase();
    logActivity({ aksi: 'DELETE', modul: 'User', detail: `Akun "${username}" dihapus`, nilaiLama: old ? { username: old.username, nama: old.nama, role: old.role } : undefined });
  },

  // ==================== LOG AKTIVITAS ====================
  async addLogAktivitas(log: Omit<LogAktivitas, 'id' | 'createdAt'>) {
    const id = uid();
    const { error } = await supabase.from("log_aktivitas").insert([{
      id,
      username: log.username,
      nama_user: log.namaUser ?? null,
      aksi: log.aksi,
      modul: log.modul,
      record_id: log.recordId ?? null,
      detail: log.detail ?? null,
      nilai_lama: log.nilaiLama ?? null,
      nilai_baru: log.nilaiBaru ?? null
    }]);
    if (error) {
      console.warn("[log] Failed to write activity log:", error.message);
    }
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

/**
 * Log aktivitas ke database. Dipanggil setelah operasi CRUD untuk audit trail.
 * Tidak melempar error — log failure hanya dicatat di console.
 *
 * @example
 * await logActivity({ aksi: 'CREATE', modul: 'Outlet', detail: 'Outlet Baru ditambahkan', nilaiBaru: { nama: 'MCA' } });
 */
export async function logActivity(params: {
  aksi: 'CREATE' | 'UPDATE' | 'DELETE';
  modul: string;
  recordId?: string;
  detail?: string;
  nilaiLama?: Record<string, any>;
  nilaiBaru?: Record<string, any>;
}) {
  try {
    // Ambil username dari auth state (via localStorage)
    let username = 'system';
    let namaUser = 'System';
    try {
      const authRaw = localStorage.getItem('buba_auth');
      if (authRaw) {
        const auth = JSON.parse(authRaw);
        if (auth?.user?.username) username = auth.user.username;
        if (auth?.user?.nama) namaUser = auth.user.nama;
      }
    } catch { /* ignore */ }

    await db.addLogAktivitas({
      username,
      namaUser,
      aksi: params.aksi,
      modul: params.modul,
      recordId: params.recordId,
      detail: params.detail,
      nilaiLama: params.nilaiLama ? JSON.stringify(params.nilaiLama) : undefined,
      nilaiBaru: params.nilaiBaru ? JSON.stringify(params.nilaiBaru) : undefined
    });
  } catch (err) {
    console.warn('[logActivity] Failed:', err);
  }
}

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
