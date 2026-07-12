import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
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
  sayurBrokoliBubur: number;
  sayurPutihBubur: number;
  
  // Nasi Tim
  berasTim: number;
  dagingTim: number;
  airTim: number;
  sayurHijauTim: number;
  sayurBrokoliTim: number;
  sayurPutihTim: number;

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
// LEVEL 1 — BASE RATIO (per 100gr BERAS)
//   Menentukan komposisi bahan relatif terhadap 100gr beras.
//   Rasio: Beras : Daging : Air : S.Hijau : S.Brokoli : S.Putih
//
//   Bubur    → 100 : 5 : 700 : 8 : 5 : 1.5
//   Nasi Tim → 100 : 4 : 600 : 8 : 5 : 1.5
//
//   Artinya: setiap 100gr beras BUTUH 5gr daging, 700ml air, 8gr SH, 5gr SB, 1.5gr SP.
//
// LEVEL 2 — PER CUP (Nilai yang disimpan di settings ini)
//   Hasil konversi dari Level 1 dengan membagi sesuai jumlah cup per 100gr beras.
//
//   Bubur    → 100gr beras = 6 cup   → nilai per cup = (nilai per 100gr) ÷ 6
//   Nasi Tim → 100gr beras = 5 cup   → nilai per cup = (nilai per 100gr) ÷ 5
//
//   Contoh: berasBubur per cup = 100 ÷ 6 = 16.67 gr
//           dagingBubur per cup = 5 ÷ 6 = 0.83 gr
//           airBubur per cup    = 700 ÷ 6 = 116.67 ml
// =============================================================================

export const DEFAULT_SETTINGS: BubaSettings = {
  // --- BUBUR ---
  // Base ratio (per 100gr beras): 100 : 5 : 700 : 8 : 5 : 1.5
  // Per 100gr beras = 6 cup → nilai per cup = nilai per 100gr ÷ 6
  berasBubur: 16.67,           // 100 ÷ 6 = 16 2/3
  dagingBubur: 0.83,          // 5 ÷ 6 = 0.833...
  airBubur: 116.67,           // 700 ÷ 6 = 116 2/3
  sayurHijauBubur: 1.33,      // 8 ÷ 6 = 4/3 = 1.333...
  sayurBrokoliBubur: 0.83,    // 5 ÷ 6 = 0.833...
  sayurPutihBubur: 0.25,      // 1.5 ÷ 6 = 0.25
  
  // --- NASI TIM ---
  // Base ratio (per 100gr beras): 100 : 4 : 600 : 8 : 5 : 1.5
  // Per 100gr beras = 5 cup → nilai per cup = nilai per 100gr ÷ 5
  berasTim: 20.00,              // 100 ÷ 5 = 20
  dagingTim: 0.80,             // 4 ÷ 5 = 0.8
  airTim: 120.00,              // 600 ÷ 5 = 120
  sayurHijauTim: 1.60,         // 8 ÷ 5 = 1.6
  sayurBrokoliTim: 1.00,       // 5 ÷ 5 = 1.0
  sayurPutihTim: 0.30,         // 1.5 ÷ 5 = 0.3

  oatmealCup: 25.71,
  pudingCup: 13.00,
  abonCup: 10.00,

  lockDeadlineTime: "11:00",
  lockEnabled: false,
};

export function getBubaSettings(): BubaSettings {
  const saved = localStorage.getItem("buba_settings");
  if (!saved) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
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

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Helper: fetch a single table and return { data, error }. Never throws.
async function safeFetch(table: string) {
  try {
    const res = await supabase.from(table).select("*");
    if (res.error) {
      console.warn(`safeFetch(${table}):`, res.error);
      return { data: null, error: res.error };
    }
    return { data: res.data, error: null };
  } catch (err) {
    console.warn(`safeFetch(${table}) exception:`, err);
    return { data: null, error: err };
  }
}

// Fetch all tables from Supabase and update state cache.
// Each table is fetched independently — one failure does NOT block others.
export async function fetchFromSupabase() {
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
    safeFetch("penjualan"),
    safeFetch("produksi"),
    safeFetch("jurnal"),
    safeFetch("coa"),
    safeFetch("bahan_baku"),
    safeFetch("stok_movement"),
    safeFetch("karyawan"),
    safeFetch("absensi"),
    safeFetch("permohonan_stok"),
    safeFetch("users")
  ]);

  state = {
    outlets: outletsRes.data || [],
    produk: produkRes.data || [],
    penjualan: (penjualanRes.data || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      outletId: p.outlet_id,
      produkId: p.produk_id,
      qty: p.qty,
      harga: p.harga,
      total: Number(p.total),
      sisaGram: p.sisa_gram ?? undefined
    })),
    produksi: (produksiRes.data || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      produkId: p.produk_id,
      qtyRencana: p.qty_rencana,
      qtyRealisasi: p.qty_realisasi
    })),
    jurnal: (jurnalRes.data || []).map((j: any) => ({
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
    coa: coaRes.data || [],
    bahan: (bahanRes.data || []).map((b: any) => ({
      id: b.id,
      kode: b.kode,
      nama: b.nama,
      satuan: b.satuan,
      stokMin: b.stok_min,
      stokAwal: b.stok_awal,
      hargaBeli: Number(b.harga_beli),
      konversiGram: b.konversi_gram ?? undefined
    })),
    stokMov: (stokMovRes.data || []).map((m: any) => ({
      id: m.id,
      tanggal: m.tanggal,
      bahanId: m.bahan_id,
      tipe: m.tipe,
      qty: m.qty,
      keterangan: m.keterangan,
      produksiId: m.produksi_id
    })),
    karyawan: (karyawanRes.data || []).map((k: any) => {
      // Find linked user account for role, username, password
      const linkedUser = (usersRes.data || []).find((u: any) => u.karyawan_id === k.id);
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
    absensi: (absensiRes.data || []).map((a: any) => ({
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
    permohonanStok: (permohonanRes.data || []).map((p: any) => ({
      id: p.id,
      tanggal: p.tanggal,
      tanggalKirim: p.tanggal_kirim,
      outletId: p.outlet_id,
      produkId: p.produk_id,
      qty: p.qty,
      status: p.status,
      catatan: p.catatan
    })),
    users: (usersRes.data || []).map((u: any) => ({
      username: u.username,
      password: u.password,
      nama: u.nama,
      role: u.username === "produksi" ? "produksi" : u.role,
      outletId: u.outlet_id,
      karyawanId: u.karyawan_id
    })),
    settings: getBubaSettings()
  };
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

  async addPenjualan(p: Omit<Penjualan, "id" | "total"> & { sisaGram?: number }) {
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
      sisa_gram: p.sisaGram ?? null
    }]);
    if (error) throw error;
    await fetchFromSupabase();
  },
  async addPenjualanBulk(items: (Omit<Penjualan, "id" | "total"> & { sisaGram?: number })[]) {
    const records = items.map((p) => ({
      id: uid(),
      tanggal: p.tanggal,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      harga: p.harga,
      total: p.qty * p.harga,
      sisa_gram: p.sisaGram ?? null
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

  async addProduksi(p: Omit<Produksi, "id">) {
    const id = uid();
    await supabase.from("produksi").insert([{
      id,
      tanggal: p.tanggal,
      produk_id: p.produkId,
      qty_rencana: p.qtyRencana,
      qty_realisasi: p.qtyRealisasi
    }]);
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
    await supabase.from("produksi").insert(records);
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
    await supabase.from("produksi").delete().eq("id", id);
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
    await supabase.from("bahan_baku").insert([{
      id,
      kode: b.kode,
      nama: b.nama,
      satuan: b.satuan,
      stok_min: b.stokMin,
      stok_awal: b.stokAwal,
      harga_beli: b.hargaBeli,
      konversi_gram: b.konversiGram ?? null
    }]);
    fetchFromSupabase();
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
    await supabase.from("bahan_baku").update(mapped).eq("id", id);
    fetchFromSupabase();
  },
  async deleteBahan(id: string) {
    await supabase.from("bahan_baku").delete().eq("id", id);
    fetchFromSupabase();
  },

  async addStokMov(m: Omit<StokMovement, "id">) {
    const id = uid();
    await supabase.from("stok_movement").insert([{
      id,
      tanggal: m.tanggal,
      bahan_id: m.bahanId,
      tipe: m.tipe,
      qty: m.qty,
      keterangan: m.keterangan,
      produksi_id: m.produksiId
    }]);
    fetchFromSupabase();
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
    // Delete associated user account first, then karyawan
    const { error: errU } = await supabase.from("users").delete().eq("karyawan_id", id);
    if (errU) throw errU;
    const { error: errK } = await supabase.from("karyawan").delete().eq("id", id);
    if (errK) throw errK;
    await fetchFromSupabase();
  },

  async addAbsensi(a: Omit<Absensi, "id">) {
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
    await supabase.from("permohonan_stok").insert([{
      id,
      tanggal: p.tanggal,
      tanggal_kirim: p.tanggalKirim,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      status: "Pending",
      catatan: p.catatan
    }]);
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
      catatan: p.catatan
    }));
    await supabase.from("permohonan_stok").insert(records);
    fetchFromSupabase();
  },
  async updatePermohonanStokStatus(id: string, status: PermohonanStokStatus) {
    await supabase.from("permohonan_stok").update({ status }).eq("id", id);
    fetchFromSupabase();
  },
  async updatePermohonanStok(id: string, p: Partial<PermohonanStok>) {
    const mapped: any = {};
    if (p.tanggal !== undefined) mapped.tanggal = p.tanggal;
    if (p.tanggalKirim !== undefined) mapped.tanggal_kirim = p.tanggalKirim;
    if (p.qty !== undefined) mapped.qty = p.qty;
    if (p.status !== undefined) mapped.status = p.status;
    if (p.catatan !== undefined) mapped.catatan = p.catatan;
    await supabase.from("permohonan_stok").update(mapped).eq("id", id);
    fetchFromSupabase();
  },
  async deletePermohonanStok(id: string) {
    await supabase.from("permohonan_stok").delete().eq("id", id);
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
    await supabase.from("users").delete().eq("username", username);
    fetchFromSupabase();
  },

  async reset() {
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

export function saldoBahan(bahanId: string, state_?: DB): number {
  const s = state_ ?? state;
  const b = s.bahan.find((x) => x.id === bahanId);
  if (!b) return 0;
  let saldo = b.stokAwal;
  for (const m of s.stokMov) {
    if (m.bahanId !== bahanId) continue;
    saldo += m.tipe === "IN" ? m.qty : -m.qty;
  }
  return saldo;
}
