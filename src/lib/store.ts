import { useSyncExternalStore } from "react";
import { Outlet, Produk, Penjualan, Produksi, Jurnal, AkunCOA, BahanBaku, StokMovement, Karyawan, Absensi, PermohonanStok, PermohonanStokStatus } from "./types";
import { SEED_OUTLETS, SEED_PRODUK, SEED_PENJUALAN, SEED_PRODUKSI, SEED_JURNAL, SEED_COA, SEED_BAHAN, SEED_KARYAWAN } from "./seed";

const KEY = "buba-healthy-data-v3";

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
}

const seedPermohonan = (): PermohonanStok[] => {
  const o = SEED_OUTLETS[0];
  const p1 = SEED_PRODUK[0];
  const p2 = SEED_PRODUK[1];
  if (!o || !p1) return [];
  return [
    {
      id: "req-1",
      tanggal: "2026-06-12",
      tanggalKirim: "2026-06-13",
      outletId: o.id,
      produkId: p1.id,
      qty: 30,
      status: "Pending",
      catatan: "Mohon dikirim pagi sebelum jam 7"
    },
    {
      id: "req-2",
      tanggal: "2026-06-11",
      tanggalKirim: "2026-06-12",
      outletId: o.id,
      produkId: p2?.id || p1.id,
      qty: 25,
      status: "Disetujui",
      catatan: "Stok untuk hari Jumat"
    }
  ];
};

const initial = (): DB => ({
  outlets: SEED_OUTLETS,
  produk: SEED_PRODUK,
  penjualan: SEED_PENJUALAN,
  produksi: SEED_PRODUKSI,
  jurnal: SEED_JURNAL,
  coa: SEED_COA,
  bahan: SEED_BAHAN,
  stokMov: [],
  karyawan: SEED_KARYAWAN,
  absensi: [],
  permohonanStok: seedPermohonan(),
});

let state: DB = load();
const listeners = new Set<() => void>();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const init = initial();
      return {
        outlets: parsed.outlets || init.outlets,
        produk: parsed.produk || init.produk,
        penjualan: parsed.penjualan || init.penjualan,
        produksi: parsed.produksi || init.produksi,
        jurnal: parsed.jurnal || init.jurnal,
        coa: parsed.coa || init.coa,
        bahan: parsed.bahan || init.bahan,
        stokMov: parsed.stokMov || init.stokMov,
        karyawan: parsed.karyawan || init.karyawan,
        absensi: parsed.absensi || init.absensi,
        permohonanStok: parsed.permohonanStok || init.permohonanStok
      };
    }
  } catch {}
  return initial();
}
function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
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

const uid = () => Math.random().toString(36).slice(2, 10);

export const db = {
  addOutlet(o: Omit<Outlet, "id">) { state = { ...state, outlets: [...state.outlets, { ...o, id: uid() }] }; persist(); },
  updateOutlet(id: string, o: Partial<Outlet>) { state = { ...state, outlets: state.outlets.map((x) => (x.id === id ? { ...x, ...o } : x)) }; persist(); },
  deleteOutlet(id: string) { state = { ...state, outlets: state.outlets.filter((x) => x.id !== id) }; persist(); },

  addProduk(p: Omit<Produk, "id">) { state = { ...state, produk: [...state.produk, { ...p, id: uid() }] }; persist(); },
  updateProduk(id: string, p: Partial<Produk>) { state = { ...state, produk: state.produk.map((x) => (x.id === id ? { ...x, ...p } : x)) }; persist(); },
  deleteProduk(id: string) { state = { ...state, produk: state.produk.filter((x) => x.id !== id) }; persist(); },

  addPenjualan(p: Omit<Penjualan, "id" | "total">) {
    const total = p.qty * p.harga;
    state = { ...state, penjualan: [...state.penjualan, { ...p, total, id: uid() }] };
    persist();
  },
  addPenjualanBulk(items: Omit<Penjualan, "id" | "total">[]) {
    const newItems = items.map((p) => ({ ...p, total: p.qty * p.harga, id: uid() }));
    state = { ...state, penjualan: [...state.penjualan, ...newItems] };
    persist();
  },
  deletePenjualan(id: string) { state = { ...state, penjualan: state.penjualan.filter((x) => x.id !== id) }; persist(); },

  addProduksi(p: Omit<Produksi, "id">) { state = { ...state, produksi: [...state.produksi, { ...p, id: uid() }] }; persist(); },
  addProduksiBulk(items: Omit<Produksi, "id">[]) {
    const newItems = items.map((p) => ({ ...p, id: uid() }));
    state = { ...state, produksi: [...state.produksi, ...newItems] };
    persist();
  },
  updateProduksi(id: string, p: Partial<Produksi>) { state = { ...state, produksi: state.produksi.map((x) => (x.id === id ? { ...x, ...p } : x)) }; persist(); },
  deleteProduksi(id: string) { state = { ...state, produksi: state.produksi.filter((x) => x.id !== id) }; persist(); },

  addJurnal(j: Omit<Jurnal, "id">) { state = { ...state, jurnal: [...state.jurnal, { ...j, id: uid() }] }; persist(); },
  addJurnalBulk(items: Omit<Jurnal, "id">[]) {
    const newItems = items.map((j) => ({ ...j, id: uid() }));
    state = { ...state, jurnal: [...state.jurnal, ...newItems] };
    persist();
  },
  deleteJurnal(id: string) { state = { ...state, jurnal: state.jurnal.filter((x) => x.id !== id) }; persist(); },

  // === Bahan Baku ===
  addBahan(b: Omit<BahanBaku, "id">) { state = { ...state, bahan: [...state.bahan, { ...b, id: uid() }] }; persist(); },
  updateBahan(id: string, b: Partial<BahanBaku>) { state = { ...state, bahan: state.bahan.map((x) => (x.id === id ? { ...x, ...b } : x)) }; persist(); },
  deleteBahan(id: string) { state = { ...state, bahan: state.bahan.filter((x) => x.id !== id) }; persist(); },

  // === Stok Movement ===
  addStokMov(m: Omit<StokMovement, "id">) { state = { ...state, stokMov: [...state.stokMov, { ...m, id: uid() }] }; persist(); },
  deleteStokMov(id: string) { state = { ...state, stokMov: state.stokMov.filter((x) => x.id !== id) }; persist(); },

  // === Karyawan ===
  addKaryawan(k: Omit<Karyawan, "id">) { state = { ...state, karyawan: [...state.karyawan, { ...k, id: uid() }] }; persist(); },
  updateKaryawan(id: string, k: Partial<Karyawan>) { state = { ...state, karyawan: state.karyawan.map((x) => (x.id === id ? { ...x, ...k } : x)) }; persist(); },
  deleteKaryawan(id: string) { state = { ...state, karyawan: state.karyawan.filter((x) => x.id !== id) }; persist(); },

  // === Absensi ===
  addAbsensi(a: Omit<Absensi, "id">) { state = { ...state, absensi: [...state.absensi, { ...a, id: uid() }] }; persist(); },
  deleteAbsensi(id: string) { state = { ...state, absensi: state.absensi.filter((x) => x.id !== id) }; persist(); },

  // === Permohonan Stok ===
  addPermohonanStok(p: Omit<PermohonanStok, "id" | "status">) {
    state = {
      ...state,
      permohonanStok: [...(state.permohonanStok || []), { ...p, status: "Pending", id: uid() }]
    };
    persist();
  },
  updatePermohonanStokStatus(id: string, status: PermohonanStokStatus) {
    state = {
      ...state,
      permohonanStok: (state.permohonanStok || []).map((x) => (x.id === id ? { ...x, status } : x))
    };
    persist();
  },
  deletePermohonanStok(id: string) {
    state = {
      ...state,
      permohonanStok: (state.permohonanStok || []).filter((x) => x.id !== id)
    };
    persist();
  },

  reset() { state = initial(); persist(); },
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
