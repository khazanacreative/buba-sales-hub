import { useState } from "react";
import { db } from "@/lib/store";
import { Produk, HppConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2, Calculator, DollarSign, Search } from "lucide-react";
import { toast } from "sonner";
import { rupiah } from "@/lib/format";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

/**
 * HPP Config Section - Master Data untuk perhitungan HPP per produk.
 *
 * Akun COA target (otomatis dipakai Laporan HPP untuk jurnal):
 *   540000 HPP                (header)
 *   541000 HPP Bahan Utama    ← hppBahanPerCup
 *   542000 HPP Pendukung      ← hppPackagingPerCup
 *   543000 OH                 ← hppOhPerCup
 *   520001 GAJI               ← biayaTenagaKerjaPerCup
 *   570000 BEBAN LAIN-LAIN    ← biayaLainPerCup
 */
export function HppConfigSection({ produk, hppConfig }: { produk: Produk[]; hppConfig: HppConfig[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HppConfig | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{
    produkId: string;
    hppBahanPerCup: number;
    hppPackagingPerCup: number;
    hppOhPerCup: number;
    biayaTenagaKerjaPerCup: number;
    biayaLainPerCup: number;
    marginPersen: number;
    aktif: boolean;
  }>({
    produkId: "",
    hppBahanPerCup: 0,
    hppPackagingPerCup: 0,
    hppOhPerCup: 0,
    biayaTenagaKerjaPerCup: 0,
    biayaLainPerCup: 0,
    marginPersen: 30,
    aktif: true,
  });

  // Filter & sort config list with search
  const sortedConfigs = [...hppConfig].sort((a, b) => {
    const pa = produk.find((p) => p.id === a.produkId)?.nama ?? "";
    const pb = produk.find((p) => p.id === b.produkId)?.nama ?? "";
    return pa.localeCompare(pb);
  });
  const filteredConfigs = sortedConfigs.filter((c) => {
    if (!search) return true;
    const produkName = produk.find((p) => p.id === c.produkId)?.nama ?? "";
    return produkName.toLowerCase().includes(search.toLowerCase());
  });

  // Produk yang BELUM punya config
  const produkWithoutConfig = produk.filter((p) => !hppConfig.some((c) => c.produkId === p.id));

  const resetForm = () => {
    setForm({
      produkId: "",
      hppBahanPerCup: 0,
      hppPackagingPerCup: 0,
      hppOhPerCup: 0,
      biayaTenagaKerjaPerCup: 0,
      biayaLainPerCup: 0,
      marginPersen: 30,
      aktif: true,
    });
  };

  const openAdd = () => {
    setEditing(null);
    resetForm();
    setOpen(true);
  };

  const openEdit = (c: HppConfig) => {
    setEditing(c);
    setForm({
      produkId: c.produkId,
      hppBahanPerCup: c.hppBahanPerCup,
      hppPackagingPerCup: c.hppPackagingPerCup,
      hppOhPerCup: c.hppOhPerCup,
      biayaTenagaKerjaPerCup: c.biayaTenagaKerjaPerCup,
      biayaLainPerCup: c.biayaLainPerCup,
      marginPersen: c.marginPersen,
      aktif: c.aktif,
    });
    setOpen(true);
  };

  const totalPerCup = form.hppBahanPerCup + form.hppPackagingPerCup + form.hppOhPerCup + form.biayaTenagaKerjaPerCup + form.biayaLainPerCup;

  const handleSave = async () => {
    if (!form.produkId) return toast.error("Pilih produk terlebih dahulu");
    if (totalPerCup < 0) return toast.error("HPP tidak boleh negatif");
    try {
      if (editing) {
        await db.updateHppConfig(editing.id, form);
        toast.success("Konfigurasi HPP diperbarui");
      } else {
        // Check duplicate
        if (hppConfig.some((c) => c.produkId === form.produkId)) {
          return toast.error("Produk ini sudah punya konfigurasi HPP");
        }
        await db.addHppConfig(form);
        toast.success("Konfigurasi HPP ditambahkan");
      }
      setOpen(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan konfigurasi HPP");
    }
  };

  const handleDelete = async (c: HppConfig) => {
    const produkName = produk.find((p) => p.id === c.produkId)?.nama ?? c.produkId;
    if (!confirm(`Hapus konfigurasi HPP untuk ${produkName}?`)) return;
    try {
      await db.deleteHppConfig(c.id);
      toast.success("Konfigurasi HPP dihapus");
    } catch (err: any) {
      toast.error(err?.message || "Gagal menghapus konfigurasi");
    }
  };

  return (
    <div className="space-y-3">
      <Card className="border shadow-sm bg-primary/5">
        <CardContent className="p-3">
          <p className="text-xs text-muted-foreground">
            <strong>Master Data HPP</strong> digunakan oleh Laporan HPP untuk menghitung
            harga pokok penjualan otomatis. Setiap produk punya 1 konfigurasi dengan komponen:
            <span className="font-mono"> Bahan (541000) </span> +
            <span className="font-mono"> Packaging (542000) </span> +
            <span className="font-mono"> OH (543000) </span> +
            <span className="font-mono"> TK (520001) </span> +
            <span className="font-mono"> Lain (570000) </span>
            per cup.
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
        <Button onClick={openAdd} disabled={produkWithoutConfig.length === 0} size="sm" className="h-9">
          <Plus className="h-3.5 w-3.5 mr-1" />
          Tambah HPP
        </Button>
      </div>

      {produkWithoutConfig.length > 0 && (
        <p className="text-[10px] text-amber-600">
          {produkWithoutConfig.length} produk belum dikonfigurasi: {produkWithoutConfig.map((p) => p.nama).join(", ")}
        </p>
      )}

      <div className="space-y-2">
        {filteredConfigs.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 text-sm">
            {hppConfig.length === 0 ? "Belum ada konfigurasi HPP. Klik Tambah HPP untuk mulai." : "Tidak ada hasil pencarian."}
          </div>
        ) : (
          filteredConfigs.map((c) => {
            const produkName = produk.find((p) => p.id === c.produkId)?.nama ?? c.produkId;
            const totalPerCup = c.hppBahanPerCup + c.hppPackagingPerCup + c.hppOhPerCup + c.biayaTenagaKerjaPerCup + c.biayaLainPerCup;
            return (
              <div key={c.id} className={`rounded-lg border p-3 text-sm space-y-1 ${!c.aktif ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calculator className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold">{produkName}</span>
                    {!c.aktif && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">non-aktif</span>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5 text-primary" />
                    </Button>
                    <ConfirmDeleteButton
                      className="h-7 w-7"
                      onConfirm={() => handleDelete(c)}
                      title="Hapus Konfigurasi HPP"
                      description={`Hapus HPP untuk ${produkName}?`}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px] text-muted-foreground">
                  <div><span className="font-mono">541000</span><div className="font-semibold text-foreground">{rupiah(c.hppBahanPerCup)}</div></div>
                  <div><span className="font-mono">542000</span><div className="font-semibold text-foreground">{rupiah(c.hppPackagingPerCup)}</div></div>
                  <div><span className="font-mono">543000</span><div className="font-semibold text-foreground">{rupiah(c.hppOhPerCup)}</div></div>
                  <div><span className="font-mono">520001</span><div className="font-semibold text-foreground">{rupiah(c.biayaTenagaKerjaPerCup)}</div></div>
                  <div><span className="font-mono">570000</span><div className="font-semibold text-foreground">{rupiah(c.biayaLainPerCup)}</div></div>
                </div>
                <div className="flex items-center justify-between border-t pt-2 mt-1">
                  <div className="text-xs text-muted-foreground">
                    Margin: <span className="font-semibold text-foreground">{c.marginPersen}%</span>
                  </div>
                  <div className="text-xs font-bold text-primary flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    HPP/Cup: {rupiah(totalPerCup)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit" : "Tambah"} Konfigurasi HPP</DialogTitle>
            <DialogDescription>
              Atur komponen biaya per cup untuk produk ini. Total HPP = Bahan + Packaging + OH + TK + Lain.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Produk *</Label>
              <select
                className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                value={form.produkId}
                onChange={(e) => setForm({ ...form, produkId: e.target.value })}
                disabled={!!editing}
              >
                <option value="">-- Pilih Produk --</option>
                {editing
                  ? produk.filter((p) => p.id === editing.produkId).map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))
                  : produkWithoutConfig.map((p) => (
                      <option key={p.id} value={p.id}>{p.nama}</option>
                    ))
                }
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-[10px]">HPP Bahan / Cup <span className="font-mono text-muted-foreground">(541000)</span></Label>
                <Input type="number" min={0} value={form.hppBahanPerCup} onChange={(e) => setForm({ ...form, hppBahanPerCup: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">HPP Packaging / Cup <span className="font-mono text-muted-foreground">(542000)</span></Label>
                <Input type="number" min={0} value={form.hppPackagingPerCup} onChange={(e) => setForm({ ...form, hppPackagingPerCup: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">HPP OH / Cup <span className="font-mono text-muted-foreground">(543000)</span></Label>
                <Input type="number" min={0} value={form.hppOhPerCup} onChange={(e) => setForm({ ...form, hppOhPerCup: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">Biaya TK / Cup <span className="font-mono text-muted-foreground">(520001)</span></Label>
                <Input type="number" min={0} value={form.biayaTenagaKerjaPerCup} onChange={(e) => setForm({ ...form, biayaTenagaKerjaPerCup: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">Biaya Lain / Cup <span className="font-mono text-muted-foreground">(570000)</span></Label>
                <Input type="number" min={0} value={form.biayaLainPerCup} onChange={(e) => setForm({ ...form, biayaLainPerCup: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px]">Target Margin (%)</Label>
                <Input type="number" min={0} max={100} step="0.1" value={form.marginPersen} onChange={(e) => setForm({ ...form, marginPersen: Number(e.target.value) })} />
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Total HPP per Cup:</div>
              <div className="text-lg font-bold text-primary">{rupiah(totalPerCup)}</div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="hpp-aktif"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                className="h-4 w-4 rounded"
              />
              <Label htmlFor="hpp-aktif" className="cursor-pointer">Aktif (digunakan di Laporan HPP)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); resetForm(); }}>Batal</Button>
            <Button onClick={handleSave}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
