import { useState, useMemo } from "react";
import { db } from "@/lib/store";
import { Produk, HppProduk, HppBahan, HppConsumable } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { rupiah } from "@/lib/format";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

/**
 * HPP Config Section - Master Data Perhitungan HPP per Produk (3-tabel)
 *
 * Struktur:
 *  - HppProduk (header 1 row per produk): hargaJual, catatan, aktif
 *  - HppBahan (detail bahan baku): namaItem, satuan, berat, harga, jadi
 *    HPP Bahan = (berat × harga) / jadi
 *  - HppConsumable (detail consumable): namaItem, satuan, berat, harga, jumlah
 *    HPP Consumable = jumlah × harga
 *  - HPP Final = Σ HPP Bahan + Σ HPP Consumable
 *  - GPM = (hargaJual - HPP Final) / hargaJual × 100
 *
 * ON DELETE CASCADE: hapus HppProduk → otomatis hapus semua hpp_bahan & hpp_consumable terkait
 */
export function HppConfigSection({
  produk,
  hppProduk,
  hppBahan,
  hppConsumable,
}: {
  produk: Produk[];
  hppProduk: HppProduk[];
  hppBahan: HppBahan[];
  hppConsumable: HppConsumable[];
}) {
  const [editingProduk, setEditingProduk] = useState<HppProduk | null>(null);
  const [addProdukOpen, setAddProdukOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Form state untuk edit/add produk
  const [formProduk, setFormProduk] = useState<{
    produkId: string;
    hargaJual: number;
    catatan: string;
    aktif: boolean;
  }>({
    produkId: "",
    hargaJual: 0,
    catatan: "",
    aktif: true,
  });

  // List produk yang sudah punya HPP
  const produkWithHpp = useMemo(() => {
    const set = new Set(hppProduk.map((p) => p.produkId));
    return produk.filter((p) => set.has(p.id));
  }, [produk, hppProduk]);

  // Filter by search
  const filteredProduk = useMemo(() => {
    if (!search) return produkWithHpp;
    const q = search.toLowerCase();
    return produkWithHpp.filter((p) => p.nama.toLowerCase().includes(q));
  }, [produkWithHpp, search]);

  // Produk yang belum punya HPP
  const produkWithoutHpp = useMemo(() => {
    const set = new Set(hppProduk.map((p) => p.produkId));
    return produk.filter((p) => !set.has(p.id));
  }, [produk, hppProduk]);

  // Helper: ambil bahan & consumable untuk hppProdukId
  const getBahanFor = (hppProdukId: string) =>
    hppBahan.filter((b) => b.hppProdukId === hppProdukId).sort((a, b) => a.urutan - b.urutan);
  const getConsumableFor = (hppProdukId: string) =>
    hppConsumable.filter((c) => c.hppProdukId === hppProdukId).sort((a, b) => a.urutan - b.urutan);

  // Hitung HPP Final per produk
  const calcHppFinal = (hppProdukId: string) => {
    const totalBahan = getBahanFor(hppProdukId).reduce(
      (s, b) => s + (b.jadi > 0 ? (b.berat * b.harga) / b.jadi : 0),
      0
    );
    const totalConsumable = getConsumableFor(hppProdukId).reduce(
      (s, c) => s + c.jumlah * c.harga,
      0
    );
    return totalBahan + totalConsumable;
  };

  const handleOpenAdd = () => {
    setEditingProduk(null);
    setFormProduk({ produkId: "", hargaJual: 0, catatan: "", aktif: true });
    setAddProdukOpen(true);
  };

  const handleOpenEdit = (h: HppProduk) => {
    setEditingProduk(h);
    setFormProduk({
      produkId: h.produkId,
      hargaJual: h.hargaJual,
      catatan: h.catatan ?? "",
      aktif: h.aktif,
    });
    setAddProdukOpen(true);
  };

  const handleSaveProduk = async () => {
    if (!formProduk.produkId) return toast.error("Pilih produk terlebih dahulu");
    if (formProduk.hargaJual <= 0) return toast.error("Harga jual harus > 0");
    try {
      if (editingProduk) {
        await db.updateHppProduk(editingProduk.id, {
          hargaJual: formProduk.hargaJual,
          catatan: formProduk.catatan || undefined,
          aktif: formProduk.aktif,
        });
        toast.success("HPP diperbarui");
      } else {
        await db.addHppProduk({
          produkId: formProduk.produkId,
          hargaJual: formProduk.hargaJual,
          catatan: formProduk.catatan || undefined,
          aktif: formProduk.aktif,
        });
        toast.success("HPP ditambahkan");
      }
      setAddProdukOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan HPP");
    }
  };

  const handleDeleteProduk = async (h: HppProduk) => {
    const produkObj = produk.find((p) => p.id === h.produkId);
    const namaProduk = produkObj?.nama ?? h.produkId;
    if (!confirm(`Hapus HPP untuk ${namaProduk}? Semua Bahan & Consumable terkait akan ikut terhapus (CASCADE).`)) return;
    try {
      await db.deleteHppProduk(h.id);
      toast.success(`HPP ${namaProduk} dihapus`);
    } catch (err: any) {
      toast.error(err?.message || "Gagal hapus");
    }
  };

  return (
    <div className="space-y-3">
      <Card className="border shadow-sm bg-primary/5">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Master Data HPP</strong> (3-tabel: header + bahan + consumable). HPP Final = Σ HPP Bahan + Σ HPP Consumable. GPM = (Harga − HPP) / Harga × 100%.
            {produkWithoutHpp.length > 0 && (
              <span className="block mt-1 text-amber-600">
                {produkWithoutHpp.length} produk belum dikonfigurasi: {produkWithoutHpp.map((p) => p.nama).join(", ")}
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Cari produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-7 h-9"
          />
        </div>
        <Button onClick={handleOpenAdd} disabled={produkWithoutHpp.length === 0} size="sm" className="h-9">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Tambah HPP
        </Button>
      </div>

      {filteredProduk.length === 0 ? (
        <div className="text-center text-muted-foreground py-6 text-sm">
          {hppProduk.length === 0
            ? "Belum ada konfigurasi HPP. Klik Tambah HPP untuk mulai."
            : "Tidak ada hasil pencarian."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProduk.map((p) => {
            const h = hppProduk.find((x) => x.produkId === p.id);
            if (!h) return null;
            const bahan = getBahanFor(h.id);
            const consumable = getConsumableFor(h.id);
            const totalBahan = bahan.reduce((s, b) => s + (b.jadi > 0 ? (b.berat * b.harga) / b.jadi : 0), 0);
            const totalConsumable = consumable.reduce((s, c) => s + c.jumlah * c.harga, 0);
            const hppFinal = totalBahan + totalConsumable;
            const gpm = h.hargaJual > 0 ? ((h.hargaJual - hppFinal) / h.hargaJual) * 100 : 0;

            return (
              <div
                key={p.id}
                className="rounded-lg border p-3 text-sm space-y-2 bg-card"
              >
                {/* Header per produk */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{p.nama}</span>
                    {!h.aktif && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">non-aktif</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => handleOpenEdit(h)}>
                      Edit Header
                    </Button>
                    <ConfirmDeleteButton
                      className="h-7"
                      onConfirm={() => handleDeleteProduk(h)}
                      title={`Hapus HPP ${p.nama}?`}
                      description="Semua Bahan & Consumable terkait akan ikut terhapus (CASCADE)."
                    />
                  </div>
                </div>

                {/* Table ringkasan: HPP Final, Harga, GPM */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="rounded border p-2 bg-muted/30">
                    <div className="text-muted-foreground">Total Bahan Baku</div>
                    <div className="font-semibold">{rupiah(totalBahan)}</div>
                  </div>
                  <div className="rounded border p-2 bg-muted/30">
                    <div className="text-muted-foreground">Total Consumable</div>
                    <div className="font-semibold">{rupiah(totalConsumable)}</div>
                  </div>
                  <div className="rounded border p-2 bg-muted/30">
                    <div className="text-muted-foreground">Harga Jual</div>
                    <div className="font-semibold">{rupiah(h.hargaJual)}</div>
                  </div>
                  <div className="rounded border p-2 bg-primary/10">
                    <div className="text-muted-foreground">HPP Final + GPM</div>
                    <div className="font-bold text-primary">{rupiah(hppFinal)}</div>
                    <div className={`text-[10px] ${gpm >= 30 ? "text-success" : gpm >= 0 ? "text-amber-600" : "text-destructive"}`}>
                      GPM: {gpm.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Detail Bahan Baku */}
                <BahanTable hppProdukId={h.id} bahan={bahan} />

                {/* Detail Consumable */}
                <ConsumableTable hppProdukId={h.id} consumable={consumable} />
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Header Dialog */}
      <Dialog open={addProdukOpen} onOpenChange={setAddProdukOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduk ? "Edit" : "Tambah"} Konfigurasi HPP per Produk</DialogTitle>
            <DialogDescription>
              Set harga jual & aktif/tidak. Bahan & Consumable ditambahkan di detail card setelah ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Produk *</Label>
              <select
                className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                value={formProduk.produkId}
                onChange={(e) => setFormProduk({ ...formProduk, produkId: e.target.value })}
                disabled={!!editingProduk}
              >
                <option value="">-- Pilih Produk --</option>
                {editingProduk
                  ? produk.filter((p) => p.id === editingProduk.produkId).map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))
                  : produkWithoutHpp.map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))
                }
              </select>
            </div>
            <div className="space-y-2">
              <Label>Harga Jual *</Label>
              <Input
                type="number"
                min={0}
                value={formProduk.hargaJual}
                onChange={(e) => setFormProduk({ ...formProduk, hargaJual: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan (opsional)</Label>
              <Input
                value={formProduk.catatan}
                onChange={(e) => setFormProduk({ ...formProduk, catatan: e.target.value })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hpp-aktif"
                checked={formProduk.aktif}
                onChange={(e) => setFormProduk({ ...formProduk, aktif: e.target.checked })}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="hpp-aktif" className="cursor-pointer">Aktif (digunakan di Laporan HPP)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddProdukOpen(false)}>Batal</Button>
            <Button onClick={handleSaveProduk}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============== BAHAN BAKU TABLE (dengan inline edit/tambah) ==============
function BahanTable({ hppProdukId, bahan }: { hppProdukId: string; bahan: HppBahan[] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    namaItem: "",
    satuan: "g",
    berat: 0,
    harga: 0,
    jadi: 0,
  });

  const handleAdd = async () => {
    if (!form.namaItem.trim()) return toast.error("Nama item wajib diisi");
    if (form.jadi <= 0) return toast.error("Jumlah jadi harus > 0");
    try {
      await db.addHppBahan({
        hppProdukId,
        namaItem: form.namaItem.trim(),
        satuan: form.satuan,
        berat: form.berat,
        harga: form.harga,
        jadi: form.jadi,
        urutan: bahan.length + 1,
      });
      toast.success("Bahan ditambahkan");
      setForm({ namaItem: "", satuan: "g", berat: 0, harga: 0, jadi: 0 });
      setAdding(false);
    } catch (err: any) {
      toast.error(err?.message || "Gagal tambah bahan");
    }
  };

  const handleDelete = async (b: HppBahan) => {
    if (!confirm(`Hapus bahan ${b.namaItem}?`)) return;
    try {
      await db.deleteHppBahan(b.id);
      toast.success("Bahan dihapus");
    } catch (err: any) {
      toast.error(err?.message || "Gagal hapus");
    }
  };

  const totalBahan = bahan.reduce((s, b) => s + (b.jadi > 0 ? (b.berat * b.harga) / b.jadi : 0), 0);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          BAHAN BAKU ({bahan.length} item)
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAdding(!adding)}>
          {adding ? "Batal" : "+ Tambah Bahan"}
        </Button>
      </div>

      {adding && (
        <div className="rounded border p-2 bg-muted/20 grid grid-cols-2 md:grid-cols-5 gap-1 text-xs">
          <Input
            placeholder="Nama (cth: Beras)"
            value={form.namaItem}
            onChange={(e) => setForm({ ...form, namaItem: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Satuan"
            value={form.satuan}
            onChange={(e) => setForm({ ...form, satuan: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Berat (g)"
            value={form.berat || ""}
            onChange={(e) => setForm({ ...form, berat: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Harga (Rp)"
            value={form.harga || ""}
            onChange={(e) => setForm({ ...form, harga: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Jadi (cup)"
            value={form.jadi || ""}
            onChange={(e) => setForm({ ...form, jadi: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <div className="md:col-span-5 flex justify-end">
            <Button size="sm" className="h-7" onClick={handleAdd}>
              <Plus className="h-3 w-3 mr-1" /> Simpan Bahan
            </Button>
          </div>
        </div>
      )}

      {bahan.length > 0 ? (
        <div className="rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-2 py-1">Item</th>
                <th className="text-left px-2 py-1">Satuan</th>
                <th className="text-right px-2 py-1">Berat</th>
                <th className="text-right px-2 py-1">Harga</th>
                <th className="text-right px-2 py-1">Jadi</th>
                <th className="text-right px-2 py-1">HPP</th>
                <th className="text-right px-2 py-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {bahan.map((b) => {
                const hpp = b.jadi > 0 ? (b.berat * b.harga) / b.jadi : 0;
                return (
                  <tr key={b.id} className="border-t hover:bg-muted/20">
                    <td className="px-2 py-1 font-medium">{b.namaItem}</td>
                    <td className="px-2 py-1">{b.satuan}</td>
                    <td className="px-2 py-1 text-right">{b.berat.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right">{rupiah(b.harga)}</td>
                    <td className="px-2 py-1 text-right">{b.jadi.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right font-semibold">{rupiah(hpp)}</td>
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => handleDelete(b)}
                        className="text-destructive hover:bg-destructive/10 rounded p-1"
                        title="Hapus"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/30 font-semibold">
                <td colSpan={5} className="px-2 py-1 text-right">TOTAL BAHAN BAKU:</td>
                <td className="px-2 py-1 text-right">{rupiah(totalBahan)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        !adding && <div className="text-xs text-muted-foreground italic px-2">Belum ada bahan baku.</div>
      )}
    </div>
  );
}

// ============== CONSUMABLE TABLE (dengan inline edit/tambah) ==============
function ConsumableTable({ hppProdukId, consumable }: { hppProdukId: string; consumable: HppConsumable[] }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    namaItem: "",
    satuan: "pcs",
    berat: 0,
    harga: 0,
    jumlah: 0,
  });

  const handleAdd = async () => {
    if (!form.namaItem.trim()) return toast.error("Nama item wajib diisi");
    if (form.jumlah <= 0) return toast.error("Jumlah harus > 0");
    try {
      await db.addHppConsumable({
        hppProdukId,
        namaItem: form.namaItem.trim(),
        satuan: form.satuan,
        berat: form.berat,
        harga: form.harga,
        jumlah: form.jumlah,
        urutan: consumable.length + 1,
      });
      toast.success("Consumable ditambahkan");
      setForm({ namaItem: "", satuan: "pcs", berat: 0, harga: 0, jumlah: 0 });
      setAdding(false);
    } catch (err: any) {
      toast.error(err?.message || "Gagal tambah consumable");
    }
  };

  const handleDelete = async (c: HppConsumable) => {
    if (!confirm(`Hapus consumable ${c.namaItem}?`)) return;
    try {
      await db.deleteHppConsumable(c.id);
      toast.success("Consumable dihapus");
    } catch (err: any) {
      toast.error(err?.message || "Gagal hapus");
    }
  };

  const totalConsumable = consumable.reduce((s, c) => s + c.jumlah * c.harga, 0);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          CONSUMABLE ({consumable.length} item)
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAdding(!adding)}>
          {adding ? "Batal" : "+ Tambah Consumable"}
        </Button>
      </div>

      {adding && (
        <div className="rounded border p-2 bg-muted/20 grid grid-cols-2 md:grid-cols-5 gap-1 text-xs">
          <Input
            placeholder="Nama (cth: Cup)"
            value={form.namaItem}
            onChange={(e) => setForm({ ...form, namaItem: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            placeholder="Satuan"
            value={form.satuan}
            onChange={(e) => setForm({ ...form, satuan: e.target.value })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Berat (g)"
            value={form.berat || ""}
            onChange={(e) => setForm({ ...form, berat: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Harga (Rp)"
            value={form.harga || ""}
            onChange={(e) => setForm({ ...form, harga: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <Input
            type="number"
            placeholder="Jumlah (pcs)"
            value={form.jumlah || ""}
            onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
            className="h-8 text-xs"
          />
          <div className="md:col-span-5 flex justify-end">
            <Button size="sm" className="h-7" onClick={handleAdd}>
              <Plus className="h-3 w-3 mr-1" /> Simpan Consumable
            </Button>
          </div>
        </div>
      )}

      {consumable.length > 0 ? (
        <div className="rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-2 py-1">Item</th>
                <th className="text-left px-2 py-1">Satuan</th>
                <th className="text-right px-2 py-1">Berat</th>
                <th className="text-right px-2 py-1">Harga</th>
                <th className="text-right px-2 py-1">Jumlah</th>
                <th className="text-right px-2 py-1">HPP</th>
                <th className="text-right px-2 py-1 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {consumable.map((c) => {
                const hpp = c.jumlah * c.harga;
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/20">
                    <td className="px-2 py-1 font-medium">{c.namaItem}</td>
                    <td className="px-2 py-1">{c.satuan}</td>
                    <td className="px-2 py-1 text-right">{c.berat.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right">{rupiah(c.harga)}</td>
                    <td className="px-2 py-1 text-right">{c.jumlah.toLocaleString("id-ID")}</td>
                    <td className="px-2 py-1 text-right font-semibold">{rupiah(hpp)}</td>
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => handleDelete(c)}
                        className="text-destructive hover:bg-destructive/10 rounded p-1"
                        title="Hapus"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/30 font-semibold">
                <td colSpan={5} className="px-2 py-1 text-right">TOTAL CONSUMABLE:</td>
                <td className="px-2 py-1 text-right">{rupiah(totalConsumable)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        !adding && <div className="text-xs text-muted-foreground italic px-2">Belum ada consumable.</div>
      )}
    </div>
  );
}
