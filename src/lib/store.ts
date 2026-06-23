import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";
import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, BahanBaku, StokMovement, Karyawan, Absensi, PermohonanStok, PermohonanStokStatus, UserAccount } from "./types";
import { SEED_OUTLETS, SEED_PRODUK, SEED_COA, SEED_BAHAN, SEED_KARYAWAN, SEED_JURNAL, SEED_USERS } from "./seed";

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

// Fetch all tables from Supabase and update state cache
export async function fetchFromSupabase() {
  try {
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
      supabase.from("outlets").select("*"),
      supabase.from("produk").select("*"),
      supabase.from("penjualan").select("*"),
      supabase.from("produksi").select("*"),
      supabase.from("jurnal").select("*"),
      supabase.from("coa").select("*"),
      supabase.from("bahan_baku").select("*"),
      supabase.from("stok_movement").select("*"),
      supabase.from("karyawan").select("*"),
      supabase.from("absensi").select("*"),
      supabase.from("permohonan_stok").select("*"),
      supabase.from("users").select("*")
    ]);

    state = {
      outlets: outletsRes.data || [],
      produk: produkRes.data || [],
      penjualan: penjualanRes.data || [],
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
        hargaBeli: Number(b.harga_beli)
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
      karyawan: (karyawanRes.data || []).map((k: any) => ({
        id: k.id,
        nama: k.nama,
        posisi: k.posisi,
        outletId: k.outlet_id,
        gajiPokok: Number(k.gaji_pokok),
        bonusOmset: Number(k.bonus_omset),
        bonusUlasan: Number(k.bonus_ulasan)
      })),
      absensi: (absensiRes.data || []).map((a: any) => ({
        id: a.id,
        tanggal: a.tanggal,
        karyawanId: a.karyawan_id,
        jamMasuk: a.jam_masuk,
        jamPulang: a.jam_pulang,
        status: a.status,
        catatan: a.catatan
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
        outletId: u.outlet_id
      }))
    };
    notify();
  } catch (err) {
    console.error("Failed to fetch data from Supabase:", err);
  }
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

  async addPenjualan(p: Omit<Penjualan, "id" | "total">) {
    const total = p.qty * p.harga;
    const id = uid();
    await supabase.from("penjualan").insert([{
      id,
      tanggal: p.tanggal,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      harga: p.harga,
      total
    }]);
    fetchFromSupabase();
  },
  async addPenjualanBulk(items: Omit<Penjualan, "id" | "total">[]) {
    const records = items.map((p) => ({
      id: uid(),
      tanggal: p.tanggal,
      outlet_id: p.outletId,
      produk_id: p.produkId,
      qty: p.qty,
      harga: p.harga,
      total: p.qty * p.harga
    }));
    await supabase.from("penjualan").insert(records);
    fetchFromSupabase();
  },
  async deletePenjualan(id: string) {
    await supabase.from("penjualan").delete().eq("id", id);
    fetchFromSupabase();
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
      harga_beli: b.hargaBeli
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

  async addKaryawan(k: Omit<Karyawan, "id">) {
    const id = uid();
    await supabase.from("karyawan").insert([{
      id,
      nama: k.nama,
      posisi: k.posisi,
      outlet_id: k.outletId,
      gaji_pokok: k.gajiPokok,
      bonus_omset: k.bonusOmset,
      bonus_ulasan: k.bonusUlasan
    }]);
    fetchFromSupabase();
  },
  async updateKaryawan(id: string, k: Partial<Karyawan>) {
    const mapped: any = {};
    if (k.nama !== undefined) mapped.nama = k.nama;
    if (k.posisi !== undefined) mapped.posisi = k.posisi;
    if (k.outletId !== undefined) mapped.outlet_id = k.outletId;
    if (k.gajiPokok !== undefined) mapped.gaji_pokok = k.gajiPokok;
    if (k.bonusOmset !== undefined) mapped.bonus_omset = k.bonusOmset;
    if (k.bonusUlasan !== undefined) mapped.bonus_ulasan = k.bonusUlasan;
    await supabase.from("karyawan").update(mapped).eq("id", id);
    fetchFromSupabase();
  },
  async deleteKaryawan(id: string) {
    await supabase.from("karyawan").delete().eq("id", id);
    fetchFromSupabase();
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
      catatan: a.catatan
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
      
      // Seed users
      const seedUsers = [
        { username: "admin", password: "admin123", nama: "Administrator", role: "admin", outlet_id: null },
        { username: "khazana", password: "Fazana@10", nama: "Super Admin", role: "admin", outlet_id: null },
        { username: "produksi", password: "produksi123", nama: "Kepala Produksi", role: "admin", outlet_id: null },
        ...SEED_OUTLETS.map((o) => ({
          username: o.nama.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
          password: "buba123",
          nama: o.nama,
          role: "outlet",
          outlet_id: o.id
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
        harga_beli: b.hargaBeli
      }));
      await supabase.from("bahan_baku").insert(seedBahanMapped);
      
      const seedKaryawanMapped = SEED_KARYAWAN.map((k) => ({
        id: k.id,
        nama: k.nama,
        posisi: k.posisi,
        outlet_id: k.outletId,
        gaji_pokok: k.gajiPokok,
        bonus_omset: k.bonusOmset,
        bonus_ulasan: k.bonusUlasan
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
