import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, saldoBahan } from "@/lib/store";
import { todayISO, DateRange, inRange, rupiah } from "@/lib/format";
import { Plus, Trash2, AlertTriangle, CheckCircle2, Check, X, Clock, ArrowRight, ArrowLeft, ClipboardList, Send, RotateCcw, ShoppingBag, Calculator } from "lucide-react";
import { toast } from "sonner";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { ImportExcelButton } from "@/components/ImportExcelButton";
import { ExportButtons } from "@/components/ExportButtons";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { AkunKategori } from "@/lib/types";

// === SUBCOMPONENT: ADMIN VIEW FOR APPROVING REQUESTS ===
function AdminPermohonanStok({ dbState }: { dbState: any }) {
  const { permohonanStok = [], outlets = [], produk = [] } = dbState;

  const [range, setRange] = useState<DateRange>({
    from: todayISO().slice(0, 7) + "-01", // awal bulan ini
    to: todayISO()
  });
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");

  const filteredRequests = useMemo(() => {
    return (permohonanStok || []).filter((r: any) => {
      const matchDate = inRange(r.tanggalKirim, range);
      const matchOutlet = selectedOutletId === "all" || r.outletId === selectedOutletId;
      return matchDate && matchOutlet;
    });
  }, [permohonanStok, range, selectedOutletId]);

  const sortedRequests = useMemo(() => {
    return [...filteredRequests].sort((a: any, b: any) => {
      if (a.status === "Pending" && b.status !== "Pending") return -1;
      if (a.status !== "Pending" && b.status === "Pending") return 1;
      return b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id);
    });
  }, [filteredRequests]);

  const productTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredRequests.forEach((r: any) => {
      totals[r.produkId] = (totals[r.produkId] || 0) + r.qty;
    });
    return totals;
  }, [filteredRequests]);

  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(sortedRequests, 10);

  return (
    <Card className="glass border-0 shadow-card">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Daftar Permohonan Stok Outlet</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Kelola dan setujui permintaan stok produk dari outlet</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <DateRangeFilter value={range} onChange={setRange} />
          <Select value={selectedOutletId} onValueChange={setSelectedOutletId}>
            <SelectTrigger className="w-[180px] h-10"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Outlet</SelectItem>
              {outlets.map((o: any) => (
                <SelectItem key={o.id} value={o.id}>{o.nama}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Permohonan per Produk Summary */}
        <div className="flex flex-wrap gap-3 bg-muted/40 p-4 rounded-2xl border">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-full">
            Total Permohonan per Produk (Tanggal Kirim: {range.from ?? "-"} s/d {range.to ?? "-"}):
          </div>
          {produk.map((p: any) => {
            const qty = productTotals[p.id] || 0;
            return (
              <div key={p.id} className="bg-card px-3 py-2 rounded-xl border shadow-sm flex items-center gap-2">
                <span className="font-semibold text-xs text-muted-foreground">{p.nama}:</span>
                <span className="font-bold text-sm text-primary">{qty} {p.satuan}</span>
              </div>
            );
          })}
        </div>
        <div className="rounded-2xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Outlet</TableHead>
                  <TableHead>Tgl Request</TableHead>
                  <TableHead>Tgl Kirim</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[180px] text-center">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Belum ada permohonan stok dari outlet
                    </TableCell>
                  </TableRow>
                )}
                {paged.map((r: any) => {
                  const outlet = outlets.find((o: any) => o.id === r.outletId);
                  const prod = produk.find((p: any) => p.id === r.produkId);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-semibold">{outlet?.nama ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{r.tanggal}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.tanggalKirim}</TableCell>
                      <TableCell className="whitespace-nowrap">{prod?.nama ?? "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{r.qty} cup</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={r.catatan}>{r.catatan || "-"}</TableCell>
                      <TableCell>
                        {r.status === "Pending" && (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                            <Clock className="h-3 w-3" /> Pending
                          </Badge>
                        )}
                        {r.status === "Disetujui" && (
                          <Badge className="bg-success text-success-foreground gap-1">
                            <Check className="h-3 w-3" /> Disetujui
                          </Badge>
                        )}
                        {r.status === "Ditolak" && (
                          <Badge variant="destructive" className="gap-1">
                            <X className="h-3 w-3" /> Ditolak
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {r.status === "Pending" ? (
                          <div className="flex justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-success/35 text-success hover:bg-success/10 hover:text-success hover:border-success/60 font-semibold"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Disetujui");
                                toast.success(`Permohonan stok dari ${outlet?.nama} disetujui`);
                              }}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" /> Setujui
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-destructive/35 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/60 font-semibold"
                              onClick={() => {
                                db.updatePermohonanStokStatus(r.id, "Ditolak");
                                toast.error(`Permohonan stok dari ${outlet?.nama} ditolak`);
                              }}
                            >
                              <X className="h-3.5 w-3.5 mr-1" /> Tolak
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
        <TablePagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
      </CardContent>
    </Card>
  );
}

// === MAIN COMPONENT ===
export default function Produksi() {
  const dbState = useDB();
  const { user } = useAuth();
  const { produk = [], produksi = [], penjualan = [], bahan = [], permohonanStok = [], outlets = [], stokMov = [] } = dbState;

  const [tanggal, setTanggal] = useState(todayISO());
  const [bubur1Variant, setBubur1Variant] = useState("b-ay01"); // default AYAM
  const [bubur2Variant, setBubur2Variant] = useState("b-sl01"); // default SALMON
  const [tim1Variant, setTim1Variant] = useState("b-ay01"); // default AYAM
  const [tim2Variant, setTim2Variant] = useState("b-sl01"); // default SALMON
  
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState("siklus"); // siklus, permohonan, riwayat
  const [range, setRange] = useState<DateRange>({});

  const [step1OutletId, setStep1OutletId] = useState("");
  const [step4OutletId, setStep4OutletId] = useState("");
  const [step5OutletId, setStep5OutletId] = useState("");

  useEffect(() => {
    if (outlets.length > 0) {
      if (!step1OutletId) setStep1OutletId(outlets[0].id);
      if (!step4OutletId) setStep4OutletId(outlets[0].id);
      if (!step5OutletId) setStep5OutletId(outlets[0].id);
    }
  }, [outlets, step1OutletId, step4OutletId, step5OutletId]);

  const pendingCount = useMemo(() => {
    return permohonanStok.filter((r: any) => r.status === "Pending").length;
  }, [permohonanStok]);

  const filtered = useMemo(() => {
    return (produksi || []).filter((p: any) => {
      return inRange(p.tanggal, range);
    });
  }, [produksi, range]);

  const onImport = (rows: any[]) => {
    const items = rows
      .map((r) => {
        const p = produk.find((x) => x.nama.toLowerCase() === String(r.Produk ?? r.produk ?? "").toLowerCase());
        const tgl = String(r.Tanggal ?? r.tanggal ?? "").slice(0, 10);
        const qtyRencana = Number(r.Rencana ?? r.rencana ?? r.QtyRencana ?? r.qty_rencana ?? 0);
        const qtyRealisasi = Number(r.Realisasi ?? r.realisasi ?? r.QtyRealisasi ?? r.qty_realisasi ?? 0);
        if (!p || !tgl || (qtyRencana <= 0 && qtyRealisasi <= 0)) return null;
        return {
          tanggal: tgl,
          produkId: p.id,
          qtyRencana,
          qtyRealisasi
        };
      })
      .filter(Boolean) as any[];
    if (!items.length) {
      return toast.error("Tidak ada data valid (kolom: Tanggal, Produk, Rencana, Realisasi)");
    }
    db.addProduksiBulk(items);
    toast.success(`${items.length} riwayat produksi berhasil di-import`);
  };
  
  const menuOptions = useMemo(() => {
    return (bahan || []).filter(b => [
      "b-ay01", "b-dg01", "b-ck01", // meats
      "b-sl01", "b-tn01", "b-tg01", "b-gr01", "b-kk01", "b-dr01" // fish
    ].includes(b.id));
  }, [bahan]);

  const bubur1Name = useMemo(() => {
    return (bahan || []).find(x => x.id === bubur1Variant)?.nama ?? "Daging";
  }, [bubur1Variant, bahan]);

  const bubur2Name = useMemo(() => {
    return (bahan || []).find(x => x.id === bubur2Variant)?.nama ?? "Ikan";
  }, [bubur2Variant, bahan]);

  const tim1Name = useMemo(() => {
    return (bahan || []).find(x => x.id === tim1Variant)?.nama ?? "Daging";
  }, [tim1Variant, bahan]);

  const tim2Name = useMemo(() => {
    return (bahan || []).find(x => x.id === tim2Variant)?.nama ?? "Ikan";
  }, [tim2Variant, bahan]);

  // STEP 1 STATES
  const [planGrid, setPlanGrid] = useState<Record<string, Record<string, number>>>({});
  const [searchOutlet, setSearchOutlet] = useState("");

  // STEP 3 STATES
  const [actualGrams, setActualGrams] = useState({
    bubur: 0,
    tim: 0,
    oatmeal: 0,
    puding: 0,
    abon: 0,
    sayur: 0
  });
  const [actualCups, setActualCups] = useState({
    bubur: 0,
    tim: 0,
    oatmeal: 0,
    puding: 0,
    abon: 0,
    sayur: 0
  });

  // STEP 4 STATES
  const [distGrid, setDistGrid] = useState<Record<string, Record<string, number>>>({});

  // STEP 5 STATES
  const [returGrid, setReturGrid] = useState<Record<string, Record<string, number>>>({});

  // Parse [D:X, I:Y] split from catatan
  const parseSplit = (catatan: string) => {
    const match = catatan?.match(/D:(\d+),I:(\d+)/);
    if (match) {
      return { d: Number(match[1]), i: Number(match[2]) };
    }
    return { d: 0, i: 0 };
  };

  const serializeSplit = (d: number, i: number, originalCatatan = "") => {
    const cleanCat = originalCatatan.replace(/\[D:\d+,I:\d+\]\s*/, "");
    return `[D:${d},I:${i}] ${cleanCat}`.trim();
  };

  // Load plan for date
  const loadPlanForDate = (dateStr: string) => {
    const grid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      grid[o.id] = {
        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
        oatmeal: 0, puding: 0, abon: 0, sayur: 0
      };
    });

    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === dateStr);
    dayReqs.forEach((r: any) => {
      if (!grid[r.outletId]) return;
      const split = parseSplit(r.catatan || "");
      if (r.produkId === "p-bubur") {
        grid[r.outletId].bubur_d = split.d || r.qty;
        grid[r.outletId].bubur_i = split.i || 0;
      } else if (r.produkId === "p-nasitim") {
        grid[r.outletId].tim_d = split.d || r.qty;
        grid[r.outletId].tim_i = split.i || 0;
      } else if (r.produkId === "p-oatmeal") {
        grid[r.outletId].oatmeal = r.qty;
      } else if (r.produkId === "p-puding") {
        grid[r.outletId].puding = r.qty;
      } else if (r.produkId === "p-abon") {
        grid[r.outletId].abon = r.qty;
      } else if (r.produkId === "p-sayur") {
        grid[r.outletId].sayur = r.qty;
      }
    });
    setPlanGrid(grid);
  };

  // Synchronize grids on date change
  useEffect(() => {
    if (tanggal && outlets.length > 0) {
      loadPlanForDate(tanggal);

      // Load Step 3
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);
      const newActualGrams = { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
      const newActualCups = { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
      dayProds.forEach((p: any) => {
        let key = "";
        let factor = 1;
        if (p.produkId === "p-bubur") { key = "bubur"; factor = 118; }
        else if (p.produkId === "p-nasitim") { key = "tim"; factor = 108; }
        else if (p.produkId === "p-oatmeal") { key = "oatmeal"; factor = 100; }
        else if (p.produkId === "p-puding") { key = "puding"; factor = 80; }
        else if (p.produkId === "p-abon") { key = "abon"; factor = 10; }
        else if (p.produkId === "p-sayur") { key = "sayur"; factor = 100; }

        if (key) {
          newActualCups[key as keyof typeof newActualCups] = p.qtyRealisasi;
          newActualGrams[key as keyof typeof newActualGrams] = p.qtyRealisasi * factor;
        }
      });
      setActualGrams(newActualGrams);
      setActualCups(newActualCups);

      // Load Step 4
      const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
      const dGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        dGrid[o.id] = { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
      });
      dayReqs.forEach((r: any) => {
        if (!dGrid[r.outletId]) return;
        let key = "";
        if (r.produkId === "p-bubur") key = "bubur";
        else if (r.produkId === "p-nasitim") key = "tim";
        else if (r.produkId === "p-oatmeal") key = "oatmeal";
        else if (r.produkId === "p-puding") key = "puding";
        else if (r.produkId === "p-abon") key = "abon";
        else if (r.produkId === "p-sayur") key = "sayur";

        if (key) {
          dGrid[r.outletId][key] = r.qty;
        }
      });
      setDistGrid(dGrid);
    }
  }, [tanggal, permohonanStok, produksi, outlets]);

  const handlePlanChange = (outletId: string, field: string, val: number) => {
    setPlanGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleDistChange = (outletId: string, field: string, val: number) => {
    setDistGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleReturChange = (outletId: string, field: string, val: number) => {
    setReturGrid(prev => ({
      ...prev,
      [outletId]: {
        ...prev[outletId],
        [field]: isNaN(val) ? 0 : val
      }
    }));
  };

  const handleGramsChange = (prod: string, grams: number) => {
    setActualGrams(prev => ({ ...prev, [prod]: grams }));
    let factor = 1;
    if (prod === "bubur") factor = 118;
    else if (prod === "tim") factor = 108;
    else if (prod === "puding") factor = 80;
    else if (prod === "oatmeal") factor = 100;
    else if (prod === "abon") factor = 10;
    else if (prod === "sayur") factor = 100;

    const cups = Math.floor(grams / factor);
    setActualCups(prev => ({ ...prev, [prod]: cups }));
  };

  const handleCupsChange = (prod: string, cups: number) => {
    setActualCups(prev => ({ ...prev, [prod]: cups }));
  };

  // STEP 1 Action: Save pre-production target plans
  const saveStep1 = async () => {
    const existing = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
    if (existing.length > 0) {
      await Promise.all(existing.map((r: any) => db.deletePermohonanStok(r.id)));
    }

    const batch: any[] = [];
    Object.entries(planGrid).forEach(([outletId, vals]) => {
      const totalBubur = (vals.bubur_d || 0) + (vals.bubur_i || 0);
      if (totalBubur > 0) {
        batch.push({
          tanggal: todayISO(),
          tanggalKirim: tanggal,
          outletId,
          produkId: "p-bubur",
          qty: totalBubur,
          catatan: serializeSplit(vals.bubur_d || 0, vals.bubur_i || 0)
        });
      }

      const totalTim = (vals.tim_d || 0) + (vals.tim_i || 0);
      if (totalTim > 0) {
        batch.push({
          tanggal: todayISO(),
          tanggalKirim: tanggal,
          outletId,
          produkId: "p-nasitim",
          qty: totalTim,
          catatan: serializeSplit(vals.tim_d || 0, vals.tim_i || 0)
        });
      }

      if (vals.oatmeal > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-oatmeal", qty: vals.oatmeal, catatan: "" });
      }
      if (vals.puding > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-puding", qty: vals.puding, catatan: "" });
      }
      if (vals.abon > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-abon", qty: vals.abon, catatan: "" });
      }
      if (vals.sayur > 0) {
        batch.push({ tanggal: todayISO(), tanggalKirim: tanggal, outletId, produkId: "p-sayur", qty: vals.sayur, catatan: "" });
      }
    });

    if (batch.length === 0) {
      return toast.error("Masukkan minimal 1 porsi rencana produksi");
    }

    await db.addPermohonanStokBulk(batch);
    toast.success("Rencana Pra-Produksi berhasil disimpan!");
    setStep(2);
  };

  // STEP 2 CALCULATIONS & ACTION
  const totals = useMemo(() => {
    let buburD = 0, buburI = 0, timD = 0, timI = 0;
    let oatmeal = 0, puding = 0, abon = 0, sayur = 0;

    Object.values(planGrid).forEach(v => {
      buburD += v.bubur_d || 0;
      buburI += v.bubur_i || 0;
      timD += v.tim_d || 0;
      timI += v.tim_i || 0;
      oatmeal += v.oatmeal || 0;
      puding += v.puding || 0;
      abon += v.abon || 0;
      sayur += v.sayur || 0;
    });

    const totalBubur = buburD + buburI;
    const totalTim = timD + timI;

    return {
      buburD, buburI, totalBubur,
      timD, timI, totalTim,
      oatmeal, puding, abon, sayur
    };
  }, [planGrid]);

  const materialReqs = useMemo(() => {
    const reqs: { bahanId: string; kode: string; nama: string; qty: number; satuan: string }[] = [];

    const berasQty = Math.round((totals.totalBubur * 16.67) + (totals.totalTim * 20.00));
    if (berasQty > 0) reqs.push({ bahanId: "b-brs01", kode: "BRS01", nama: "BERAS", qty: berasQty, satuan: "gram" });

    const pudingQty = Math.round(totals.puding * 13.00);
    if (pudingQty > 0) reqs.push({ bahanId: "b-pud01", kode: "PUD01", nama: "PUDING", qty: pudingQty, satuan: "gram" });

    const oatQty = Math.round(totals.oatmeal * 25.71);
    if (oatQty > 0) reqs.push({ bahanId: "b-oat01", kode: "OAT01", nama: "OAT", qty: oatQty, satuan: "gram" });

    const abonQty = Math.round(totals.abon * 10.00);
    if (abonQty > 0) reqs.push({ bahanId: "b-ab01", kode: "AB01", nama: "ABON", qty: abonQty, satuan: "gram" });

    const variantReqs: Record<string, number> = {};

    if (totals.buburD > 0 && bubur1Variant) {
      variantReqs[bubur1Variant] = (variantReqs[bubur1Variant] || 0) + Math.ceil(totals.buburD / 10);
    }
    if (totals.buburI > 0 && bubur2Variant) {
      variantReqs[bubur2Variant] = (variantReqs[bubur2Variant] || 0) + Math.ceil(totals.buburI / 10);
    }
    if (totals.timD > 0 && tim1Variant) {
      variantReqs[tim1Variant] = (variantReqs[tim1Variant] || 0) + Math.ceil(totals.timD / 10);
    }
    if (totals.timI > 0 && tim2Variant) {
      variantReqs[tim2Variant] = (variantReqs[tim2Variant] || 0) + Math.ceil(totals.timI / 10);
    }

    Object.entries(variantReqs).forEach(([variantId, qtySachets]) => {
      const b = bahan.find(x => x.id === variantId);
      if (b) {
        reqs.push({ bahanId: b.id, kode: b.kode, nama: b.nama, qty: qtySachets, satuan: b.satuan });
      }
    });

    const cupBuburQty = totals.totalBubur + totals.totalTim + totals.sayur;
    if (cupBuburQty > 0) reqs.push({ bahanId: "b-cb01", kode: "CB01", nama: "CUP BUBUR", qty: cupBuburQty, satuan: "biji" });

    const tutupQty = totals.totalBubur + totals.totalTim + totals.sayur + totals.puding;
    if (tutupQty > 0) reqs.push({ bahanId: "b-ttp01", kode: "TTP01", nama: "TUTUP", qty: tutupQty, satuan: "biji" });

    const sendokQty = totals.totalBubur + totals.totalTim + totals.oatmeal + totals.puding;
    if (sendokQty > 0) reqs.push({ bahanId: "b-sen01", kode: "SEN01", nama: "SENDOK", qty: sendokQty, satuan: "pcs" });

    if (totals.oatmeal > 0) reqs.push({ bahanId: "b-cupoat1", kode: "CUPOAT1", nama: "CUP OAT", qty: totals.oatmeal, satuan: "biji" });
    if (totals.puding > 0) reqs.push({ bahanId: "b-cuppud01", kode: "CUPPUD01", nama: "CUP PUDING", qty: totals.puding, satuan: "biji" });

    return reqs;
  }, [totals, bubur1Variant, bubur2Variant, tim1Variant, tim2Variant, bahan]);

  const isWarehouseRequested = useMemo(() => {
    return stokMov.some((m: any) => m.tanggal === tanggal && m.tipe === "OUT" && m.keterangan?.includes("Pemakaian Produksi"));
  }, [stokMov, tanggal]);

  const requestWarehouse = async () => {
    if (isWarehouseRequested) return toast.error("Bahan baku untuk tanggal ini sudah dipotong dari gudang!");

    await Promise.all(materialReqs.map(r => {
      return db.addStokMov({
        tanggal,
        bahanId: r.bahanId,
        tipe: "OUT",
        qty: r.qty,
        keterangan: `Pemakaian Produksi [${tanggal}]`
      });
    }));

    toast.success("Bahan baku berhasil dipotong dari stok gudang!");
    setStep(3);
  };

  // STEP 3 Action
  const saveStep3 = async () => {
    const existing = produksi.filter((p: any) => p.tanggal === tanggal);
    if (existing.length > 0) {
      await Promise.all(existing.map((p: any) => db.deleteProduksi(p.id)));
    }

    const batch = [
      { tanggal, produkId: "p-bubur", qtyRencana: totals.totalBubur, qtyRealisasi: actualCups.bubur },
      { tanggal, produkId: "p-nasitim", qtyRencana: totals.totalTim, qtyRealisasi: actualCups.tim },
      { tanggal, produkId: "p-oatmeal", qtyRencana: totals.oatmeal, qtyRealisasi: actualCups.oatmeal },
      { tanggal, produkId: "p-puding", qtyRencana: totals.puding, qtyRealisasi: actualCups.puding },
      { tanggal, produkId: "p-abon", qtyRencana: totals.abon, qtyRealisasi: actualCups.abon },
      { tanggal, produkId: "p-sayur", qtyRencana: totals.sayur, qtyRealisasi: actualCups.sayur },
    ];

    await db.addProduksiBulk(batch);
    toast.success("Hasil Produksi Aktual berhasil disimpan!");
    initDistribution();
    setStep(4);
  };

  const initDistribution = () => {
    const grid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      const plan = planGrid[o.id] || {};
      grid[o.id] = {
        bubur: (plan.bubur_d || 0) + (plan.bubur_i || 0),
        tim: (plan.tim_d || 0) + (plan.tim_i || 0),
        oatmeal: plan.oatmeal || 0,
        puding: plan.puding || 0,
        abon: plan.abon || 0,
        sayur: plan.sayur || 0
      };
    });
    setDistGrid(grid);
  };

  // STEP 4 Action
  const saveStep4 = async () => {
    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
    await Promise.all(dayReqs.map(async (r: any) => {
      const outletAlloc = distGrid[r.outletId];
      if (!outletAlloc) return;

      let sentQty = 0;
      if (r.produkId === "p-bubur") sentQty = outletAlloc.bubur || 0;
      else if (r.produkId === "p-nasitim") sentQty = outletAlloc.tim || 0;
      else if (r.produkId === "p-oatmeal") sentQty = outletAlloc.oatmeal || 0;
      else if (r.produkId === "p-puding") sentQty = outletAlloc.puding || 0;
      else if (r.produkId === "p-abon") sentQty = outletAlloc.abon || 0;
      else if (r.produkId === "p-sayur") sentQty = outletAlloc.sayur || 0;

      await db.updatePermohonanStok(r.id, {
        qty: sentQty,
        status: "Disetujui"
      });
    }));

    toast.success("Barang keluar (distribusi) berhasil dikirim ke outlet!");
    
    // Initialize returGrid to 0
    const rGrid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => {
      rGrid[o.id] = { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
    });
    setReturGrid(rGrid);
    setStep(5);
  };

  // STEP 5 Action
  const saveStep5 = async () => {
    const salesToPost: any[] = [];
    let totalSalesRevenue = 0;

    const recoveredIngredients = {
      beras: 0,
      puding: 0,
      oat: 0,
      abon: 0
    };

    // Calculate sales and return ingredients directly from local distGrid and returGrid states
    const productKeys = ["bubur", "tim", "oatmeal", "puding", "abon", "sayur"] as const;
    const dbProductIds: Record<string, string> = {
      bubur: "p-bubur",
      tim: "p-nasitim",
      oatmeal: "p-oatmeal",
      puding: "p-puding",
      abon: "p-abon",
      sayur: "p-sayur"
    };

    outlets.forEach((o) => {
      const sent = distGrid[o.id] || {};
      const retur = returGrid[o.id] || {};

      productKeys.forEach((key) => {
        const sentQty = sent[key] || 0;
        const returQty = retur[key] || 0;

        if (sentQty > 0) {
          const actualRetur = Math.min(returQty, sentQty);
          const terjual = sentQty - actualRetur;

          const dbProductId = dbProductIds[key];
          const prod = produk.find(p => p.id === dbProductId);
          const harga = prod?.harga || 0;

          if (terjual > 0) {
            salesToPost.push({
              tanggal,
              outletId: o.id,
              produkId: dbProductId,
              qty: terjual,
              harga: harga
            });
            totalSalesRevenue += terjual * harga;
          }

          if (actualRetur > 0) {
            if (dbProductId === "p-bubur") {
              recoveredIngredients.beras += actualRetur * 16.67;
            } else if (dbProductId === "p-nasitim") {
              recoveredIngredients.beras += actualRetur * 20.00;
            } else if (dbProductId === "p-puding") {
              recoveredIngredients.puding += actualRetur * 13.00;
            } else if (dbProductId === "p-oatmeal") {
              recoveredIngredients.oat += actualRetur * 25.71;
            } else if (dbProductId === "p-abon") {
              recoveredIngredients.abon += actualRetur * 10.00;
            }
          }
        }
      });
    });

    if (salesToPost.length > 0) {
      await db.addPenjualanBulk(salesToPost);
    }

    if (totalSalesRevenue > 0) {
      await db.addJurnalBulk([
        {
          tanggal,
          ref: "OUT-SALES",
          keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`,
          kodeAkun: "131000",
          akun: "Piutang usaha",
          tipe: "Debit",
          jumlah: totalSalesRevenue,
          kategori: "Aset"
        },
        {
          tanggal,
          ref: "OUT-SALES",
          keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`,
          kodeAkun: "410000",
          akun: "Pendapatan Utama",
          tipe: "Kredit",
          jumlah: totalSalesRevenue,
          kategori: "Pendapatan"
        }
      ]);
    }

    const movPromises: Promise<any>[] = [];
    if (recoveredIngredients.beras > 0) {
      movPromises.push(db.addStokMov({
        tanggal, bahanId: "b-brs01", tipe: "IN", qty: Math.round(recoveredIngredients.beras), keterangan: "Retur Bahan Baku (Gram)"
      }));
    }
    if (recoveredIngredients.puding > 0) {
      movPromises.push(db.addStokMov({
        tanggal, bahanId: "b-pud01", tipe: "IN", qty: Math.round(recoveredIngredients.puding), keterangan: "Retur Bahan Baku (Gram)"
      }));
    }
    if (recoveredIngredients.oat > 0) {
      movPromises.push(db.addStokMov({
        tanggal, bahanId: "b-oat01", tipe: "IN", qty: Math.round(recoveredIngredients.oat), keterangan: "Retur Bahan Baku (Gram)"
      }));
    }
    if (recoveredIngredients.abon > 0) {
      movPromises.push(db.addStokMov({
        tanggal, bahanId: "b-ab01", tipe: "IN", qty: Math.round(recoveredIngredients.abon), keterangan: "Retur Bahan Baku (Gram)"
      }));
    }

    if (movPromises.length > 0) {
      await Promise.all(movPromises);
    }

    toast.success("Siklus produksi harian berhasil ditutup! Penjualan dan retur tercatat.");
    setStep(1);
  };

  const filteredOutlets = useMemo(() => {
    return outlets.filter(o => o.nama.toLowerCase().includes(searchOutlet.toLowerCase()));
  }, [outlets, searchOutlet]);

  function renderStep1() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 1: Rencana Pra-Produksi</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah untuk mengisi rencana target produksi, ringkasan seluruh outlet akan muncul di tabel bawah.</p>
          </div>
          <Input
            placeholder="Cari outlet di tabel..."
            value={searchOutlet}
            onChange={(e) => setSearchOutlet(e.target.value)}
            className="w-full sm:w-[220px] h-9 text-xs"
          />
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step1OutletId);
                      if (idx > 0) setStep1OutletId(outlets[idx - 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step1OutletId) <= 0}
                    className="h-11 w-11"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step1OutletId} onValueChange={setStep1OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm">
                      <SelectValue placeholder="Pilih Outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => (
                        <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step1OutletId);
                      if (idx < outlets.length - 1) setStep1OutletId(outlets[idx + 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step1OutletId) >= outlets.length - 1}
                    className="h-11 w-11"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Input fields laid out as a row (grid that fits as one row on large screen, wraps on mobile) */}
            {(() => {
              const row = planGrid[step1OutletId] || {
                bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                oatmeal: 0, puding: 0, abon: 0, sayur: 0
              };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-1">
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Bubur ${bubur1Name}`}>B. {bubur1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.bubur_d || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "bubur_d", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Bubur ${bubur2Name}`}>B. {bubur2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.bubur_i || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "bubur_i", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate" title={`Tim ${tim1Name}`}>T. {tim1Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.tim_d || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "tim_d", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate" title={`Tim ${tim2Name}`}>T. {tim2Name}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.tim_i || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "tim_i", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.oatmeal || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.puding || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.abon || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Sayur</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sayur || ""}
                      onChange={(e) => handlePlanChange(step1OutletId, "sayur", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Rencana Seluruh Outlet (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="min-w-[150px] font-bold">Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Bubur {bubur1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5 font-semibold">Tim {tim1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5 font-semibold">Tim {tim2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs">Oatmeal</TableHead>
                      <TableHead className="text-center font-bold text-xs">Puding</TableHead>
                      <TableHead className="text-center font-bold text-xs">Abon</TableHead>
                      <TableHead className="text-center font-bold text-xs">Sayur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOutlets.map((o) => {
                      const row = planGrid[o.id] || {
                        bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0,
                        oatmeal: 0, puding: 0, abon: 0, sayur: 0
                      };
                      const isSelected = o.id === step1OutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setStep1OutletId(o.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" 
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold py-3 flex items-center gap-1.5 whitespace-nowrap">
                            {o.nama}
                            {isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center font-semibold text-xs">{row.bubur_d || 0}</TableCell>
                          <TableCell className="bg-blue-500/5 text-center font-semibold text-xs">{row.bubur_i || 0}</TableCell>
                          <TableCell className="bg-amber-500/5 text-center font-semibold text-xs">{row.tim_d || 0}</TableCell>
                          <TableCell className="bg-blue-500/5 text-center font-semibold text-xs">{row.tim_i || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.oatmeal || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.puding || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.abon || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.sayur || 0}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveStep1} className="gradient-primary text-primary-foreground hover-lift">
              Simpan & Lanjutkan ke Bahan Baku <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep2() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 2: Request & Potong Bahan Baku</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Review kebutuhan gramasi bahan baku dan potong otomatis dari gudang utama</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-2xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Bahan Baku</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead className="text-right">Kebutuhan Produksi</TableHead>
                  <TableHead className="text-right">Stok Gudang Saat Ini</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialReqs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Tidak ada bahan baku yang dibutuhkan. Silakan isi rencana pra-produksi di Langkah 1.
                    </TableCell>
                  </TableRow>
                )}
                {materialReqs.map((r) => {
                  const saldo = saldoBahan(r.bahanId, dbState);
                  const isSufficient = saldo >= r.qty;
                  return (
                    <TableRow key={r.bahanId}>
                      <TableCell className="font-semibold">{r.nama}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.kode}</TableCell>
                      <TableCell className="text-right font-bold">{r.qty} {r.satuan}</TableCell>
                      <TableCell className="text-right">{saldo} {r.satuan}</TableCell>
                      <TableCell className="text-center">
                        {isSufficient ? (
                          <Badge className="bg-success text-success-foreground">Aman</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> Kurang {r.qty - saldo}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={() => setStep(1)} className="h-10">
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Langkah 1
            </Button>
            {isWarehouseRequested ? (
              <div className="flex items-center gap-2">
                <Badge className="bg-success text-success-foreground h-10 px-4 text-xs font-semibold gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Bahan Baku Sudah Dipotong Dari Gudang
                </Badge>
                <Button onClick={() => setStep(3)} className="h-10 gradient-primary text-primary-foreground">
                  Lanjutkan <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                onClick={requestWarehouse}
                disabled={materialReqs.length === 0}
                className="gradient-primary text-primary-foreground hover-lift h-10"
              >
                <Send className="mr-2 h-4 w-4" /> Potong Stok Gudang & Lanjutkan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep3() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 3: Realisasi Masak / Pasca Produksi</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Input berat matang hasil masak (gram) untuk dikonversi otomatis ke jumlah cup stok awal</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[
              { id: "bubur", label: `Bubur (${bubur1Name} & ${bubur2Name})`, unitWeight: 118, targetCups: totals.totalBubur },
              { id: "tim", label: `Nasi Tim (${tim1Name} & ${tim2Name})`, unitWeight: 108, targetCups: totals.totalTim },
              { id: "oatmeal", label: "Oatmeal", unitWeight: 100, targetCups: totals.oatmeal },
              { id: "puding", label: "Puding", unitWeight: 80, targetCups: totals.puding },
              { id: "abon", label: "Abon", unitWeight: 10, targetCups: totals.abon },
              { id: "sayur", label: "Sayur", unitWeight: 100, targetCups: totals.sayur }
            ].map((p) => {
              const grams = actualGrams[p.id as keyof typeof actualGrams] || 0;
              const cups = actualCups[p.id as keyof typeof actualCups] || 0;
              return (
                <div key={p.id} className="p-4 rounded-2xl border bg-card/40 space-y-4">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-sm">{p.label}</span>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Target: {p.targetCups} cup
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Berat Matang (Gram)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={grams || ""}
                        onChange={(e) => handleGramsChange(p.id, parseInt(e.target.value))}
                        className="h-10"
                        placeholder="Contoh: 11800"
                      />
                      <span className="text-xs text-muted-foreground font-semibold">g</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Konversi Cup (Aktual)</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={cups || ""}
                        onChange={(e) => handleCupsChange(p.id, parseInt(e.target.value))}
                        className="h-10 font-bold text-primary border-primary/40 focus-visible:ring-primary"
                      />
                      <span className="text-xs text-muted-foreground">cup</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground block italic">
                      Disarankan: {Math.floor(grams / p.unitWeight)} cup (@ {p.unitWeight}g)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(2)} className="h-10">
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
            <Button onClick={saveStep3} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="mr-2 h-4 w-4" /> Simpan Hasil Aktual & Lanjutkan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep4() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 4: Barang Keluar & Alokasi Outlet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah untuk mengisi kuantitas cup yang dikirim, ringkasan pengiriman akan muncul di tabel bawah.</p>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border text-xs">
            <span className="font-bold text-muted-foreground">Status Masak (Actual/Target):</span>
            <span className="font-semibold text-primary">
              B: {actualCups.bubur}/{totals.totalBubur} · T: {actualCups.tim}/{totals.totalTim}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step4OutletId);
                      if (idx > 0) setStep4OutletId(outlets[idx - 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step4OutletId) <= 0}
                    className="h-11 w-11"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step4OutletId} onValueChange={setStep4OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm">
                      <SelectValue placeholder="Pilih Outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => (
                        <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step4OutletId);
                      if (idx < outlets.length - 1) setStep4OutletId(outlets[idx + 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step4OutletId) >= outlets.length - 1}
                    className="h-11 w-11"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Input fields laid out as a row */}
            {(() => {
              const row = distGrid[step4OutletId] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate">Bubur (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.bubur || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "bubur", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300/80 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate">Nasi Tim (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.tim || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "tim", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300/80 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.oatmeal || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.puding || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.abon || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Sayur (Cup)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={row.sayur || ""}
                      onChange={(e) => handleDistChange(step4OutletId, "sayur", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Distribusi Pengiriman (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-semibold text-xs text-amber-600 bg-amber-500/5">Bubur (Cup)</TableHead>
                      <TableHead className="text-center font-semibold text-xs text-blue-600 bg-blue-500/5">Nasi Tim (Cup)</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal (Cup)</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding (Cup)</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon (Cup)</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Sayur (Cup)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o) => {
                      const row = distGrid[o.id] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
                      const isSelected = o.id === step4OutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setStep4OutletId(o.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" 
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold py-3 flex items-center gap-1.5 whitespace-nowrap">
                            {o.nama}
                            {isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center font-semibold text-xs">{row.bubur || 0}</TableCell>
                          <TableCell className="bg-blue-500/5 text-center font-semibold text-xs">{row.tim || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.oatmeal || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.puding || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.abon || 0}</TableCell>
                          <TableCell className="text-center font-medium text-xs">{row.sayur || 0}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(3)} className="h-10">
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
            <Button onClick={saveStep4} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="mr-2 h-4 w-4" /> Konfirmasi Pengiriman & Lanjutkan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  function renderStep5() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle>Langkah 5: Retur & Penjualan Akhir Hari</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah untuk mengisi sisa cup tidak terjual (retur), penjualan akan dihitung otomatis.</p>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Dropdown Selector & Row Form */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step5OutletId);
                      if (idx > 0) setStep5OutletId(outlets[idx - 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step5OutletId) <= 0}
                    className="h-11 w-11"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step5OutletId} onValueChange={setStep5OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm">
                      <SelectValue placeholder="Pilih Outlet" />
                    </SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => (
                        <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const idx = outlets.findIndex(o => o.id === step5OutletId);
                      if (idx < outlets.length - 1) setStep5OutletId(outlets[idx + 1].id);
                    }}
                    disabled={outlets.findIndex(o => o.id === step5OutletId) >= outlets.length - 1}
                    className="h-11 w-11"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Input fields laid out as a row with maximum constraints based on sent qty */}
            {(() => {
              const row = returGrid[step5OutletId] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
              const sent = distGrid[step5OutletId] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                  <div className="space-y-1 bg-blue-500/5 p-2.5 rounded-xl border border-blue-300/30">
                    <Label className="text-[10px] font-bold text-blue-600 block truncate">Bubur Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.bubur}
                      value={row.bubur || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "bubur", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-blue-300 focus-visible:ring-blue-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.bubur}</span>
                  </div>
                  <div className="space-y-1 bg-amber-500/5 p-2.5 rounded-xl border border-amber-300/30">
                    <Label className="text-[10px] font-bold text-amber-600 block truncate">Tim Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.tim}
                      value={row.tim || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "tim", parseInt(e.target.value))}
                      className="h-9 text-xs text-center border-amber-300 focus-visible:ring-amber-500 font-semibold"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.tim}</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Oatmeal Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.oatmeal}
                      value={row.oatmeal || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "oatmeal", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.oatmeal}</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Puding Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.puding}
                      value={row.puding || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "puding", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.puding}</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Abon Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.abon}
                      value={row.abon || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "abon", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.abon}</span>
                  </div>
                  <div className="space-y-1 bg-card p-2.5 rounded-xl border">
                    <Label className="text-[10px] font-bold text-muted-foreground block truncate">Sayur Retur</Label>
                    <Input
                      type="number"
                      min={0}
                      max={sent.sayur}
                      value={row.sayur || ""}
                      onChange={(e) => handleReturChange(step5OutletId, "sayur", parseInt(e.target.value))}
                      className="h-9 text-xs text-center font-medium"
                      placeholder="0"
                    />
                    <span className="text-[10px] text-muted-foreground block text-center mt-0.5">Dikirim: {sent.sayur}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Consolidated Table at the Bottom */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Retur & Estimasi Terjual (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-semibold text-xs text-blue-600 bg-blue-500/5">Bubur Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs text-amber-600 bg-amber-500/5">Tim Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon Retur/Kirim</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Sayur Retur/Kirim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o) => {
                      const row = returGrid[o.id] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
                      const sent = distGrid[o.id] || { bubur: 0, tim: 0, oatmeal: 0, puding: 0, abon: 0, sayur: 0 };
                      const isSelected = o.id === step5OutletId;
                      return (
                        <TableRow 
                          key={o.id}
                          onClick={() => setStep5OutletId(o.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected 
                              ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" 
                              : "hover:bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{o.nama}</span>
                              {isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="bg-blue-500/5 text-center font-semibold text-xs">
                            <span className="text-destructive">{row.bubur || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.bubur}</span>
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center font-semibold text-xs">
                            <span className="text-destructive">{row.tim || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.tim}</span>
                          </TableCell>
                          <TableCell className="text-center font-medium text-xs">
                            <span className="text-destructive">{row.oatmeal || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.oatmeal}</span>
                          </TableCell>
                          <TableCell className="text-center font-medium text-xs">
                            <span className="text-destructive">{row.puding || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.puding}</span>
                          </TableCell>
                          <TableCell className="text-center font-medium text-xs">
                            <span className="text-destructive">{row.abon || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.abon}</span>
                          </TableCell>
                          <TableCell className="text-center font-medium text-xs">
                            <span className="text-destructive">{row.sayur || 0}</span>
                            <span className="text-muted-foreground/60">/{sent.sayur}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(4)} className="h-10">
              <ArrowLeft className="mr-2 h-4 w-4" /> Kembali
            </Button>
            <Button onClick={saveStep5} className="gradient-success text-white hover-lift h-10 font-bold">
              <ShoppingBag className="mr-2 h-4 w-4" /> Selesaikan & Posting Penjualan / Retur
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderSiklusView() {
    return (
      <div className="space-y-6">
        {/* Configuration Card */}
        <Card className="glass border-0 shadow-card bg-card/60 backdrop-blur-lg">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="space-y-1 w-full md:w-1/3">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-primary" /> Tanggal Produksi
                  </Label>
                  <Input
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="h-10 rounded-xl font-medium border-primary/20 focus-visible:ring-primary text-sm shadow-sm"
                  />
                </div>
                <div className="text-xs text-muted-foreground italic text-right hidden md:block">
                  Pilih varian menu harian secara independen untuk Bubur 1, Bubur 2, Tim 1, dan Tim 2
                </div>
              </div>

              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4 pt-4 border-t border-muted/50">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">B1</Badge>
                    Bubur 1
                  </Label>
                  <Select value={bubur1Variant} onValueChange={setBubur1Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-amber-300/80 focus:ring-amber-500 bg-amber-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20">B2</Badge>
                    Bubur 2
                  </Label>
                  <Select value={bubur2Variant} onValueChange={setBubur2Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-blue-300/80 focus:ring-blue-500 bg-blue-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/20">T1</Badge>
                    Tim 1
                  </Label>
                  <Select value={tim1Variant} onValueChange={setTim1Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-amber-300/80 focus:ring-amber-500 bg-amber-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center font-bold text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20">T2</Badge>
                    Tim 2
                  </Label>
                  <Select value={tim2Variant} onValueChange={setTim2Variant}>
                    <SelectTrigger className="h-10 rounded-xl border-blue-300/80 focus:ring-blue-500 bg-blue-500/5 font-semibold text-xs">
                      <SelectValue placeholder="Pilih Menu" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {menuOptions.map(b => (
                        <SelectItem key={b.id} value={b.id} className="font-medium text-xs">{b.nama}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stepper Wizard Header */}
        <div className="bg-card/45 backdrop-blur-md rounded-2xl border p-4 shadow-soft">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <span className="font-bold text-sm">Siklus Harian</span>
              <span className="text-xs text-muted-foreground">|</span>
              <span className="text-xs font-medium text-muted-foreground">Konversi resep otomatis, alokasi gudang, dan pencatatan retur/jurnal otomatis</span>
            </div>
          </div>
          
          <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t">
            {[
              { num: 1, label: "Pra-Produksi" },
              { num: 2, label: "Request Bahan" },
              { num: 3, label: "Aktual Masak" },
              { num: 4, label: "Distribusi" },
              { num: 5, label: "Retur & Penjualan" }
            ].map((s) => {
              const isActive = step === s.num;
              const isPast = step > s.num;
              return (
                <button
                  key={s.num}
                  onClick={() => setStep(s.num)}
                  className={`flex flex-col items-center p-2 rounded-xl transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : isPast
                      ? "text-success hover:bg-success/5"
                      : "text-muted-foreground hover:bg-muted/10"
                  }`}
                >
                  <span className="text-xs font-bold flex items-center gap-1">
                    {isPast ? <Check className="h-3 w-3" /> : <span>{s.num}</span>}
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* STEP CONTENT */}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
      </div>
    );
  }

  const isKapro = user?.role === "produksi";

  if (isKapro) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gradient">Siklus Produksi Harian</h1>
          <p className="text-sm text-muted-foreground">Kelola siklus harian dari perencanaan pra-produksi hingga retur sore hari</p>
        </div>
        {renderSiklusView()}
      </div>
    );
  }

  // Admin View has tab options
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Produksi & Permohonan</h1>
        <p className="text-sm text-muted-foreground">Rencana produksi harian, permohonan outlet, dan riwayat produksi</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <TabsList className="grid w-full max-w-[600px] grid-cols-3 bg-muted/50 p-1 rounded-xl">
            <TabsTrigger value="siklus" className="rounded-lg font-semibold">Siklus Produksi Harian</TabsTrigger>
            <TabsTrigger value="permohonan" className="rounded-lg font-semibold relative">
              Permohonan Outlet
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow animate-pulse">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="riwayat" className="rounded-lg font-semibold">Riwayat Produksi</TabsTrigger>
          </TabsList>
          {activeTab === "riwayat" && (
            <div className="flex items-center gap-2">
              <ImportExcelButton onData={onImport} />
            </div>
          )}
        </div>

        <TabsContent value="siklus" className="space-y-6 mt-0">
          {renderSiklusView()}
        </TabsContent>

        <TabsContent value="permohonan" className="mt-0">
          <AdminPermohonanStok dbState={dbState} />
        </TabsContent>

        <TabsContent value="riwayat" className="space-y-6 mt-0">
          <Card className="glass border-0 shadow-card">
            <CardHeader>
              <CardTitle>Riwayat Produksi (Excel-aligned)</CardTitle>
              <div className="flex flex-wrap gap-2 pt-2 items-center">
                <DateRangeFilter value={range} onChange={setRange} />
                <div className="w-full sm:w-auto sm:ml-auto">
                  <ExportButtons
                    filename="produksi"
                    title="Riwayat Produksi"
                    headers={["Tanggal", "Produk", "Rencana", "Realisasi"]}
                    rows={filtered.map((p) => [
                      p.tanggal,
                      produk.find((x) => x.id === p.produkId)?.nama ?? "-",
                      p.qtyRencana,
                      p.qtyRealisasi,
                    ])}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProduksiTable filtered={filtered} produk={produk} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// === SUBCOMPONENT: TABLE FOR RENDER ===
function ProduksiTable({ filtered, produk }: any) {
  const { paged, page, setPage, totalPages, total, pageSize } = usePagination(filtered, 10);
  return (
    <div className="rounded-2xl border overflow-hidden max-w-full">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tgl</TableHead>
              <TableHead>Produk</TableHead>
              <TableHead className="text-right">Rencana (porsi)</TableHead>
              <TableHead className="text-right">Realisasi (porsi)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Belum ada produksi</TableCell></TableRow>
            )}
            {paged.map((p: any) => {
              const pr = produk.find((x: any) => x.id === p.produkId);
              const ok = p.qtyRealisasi >= p.qtyRencana;
              return (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{p.tanggal}</TableCell>
                  <TableCell className="whitespace-nowrap font-medium">{pr?.nama ?? "-"}</TableCell>
                  <TableCell className="text-right">{p.qtyRencana}</TableCell>
                  <TableCell className="text-right font-semibold">{p.qtyRealisasi}</TableCell>
                  <TableCell>
                    {ok
                      ? <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Tercapai</Badge>
                      : <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 gap-1"><AlertTriangle className="h-3 w-3" />Kurang</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => db.deleteProduksi(p.id)}>
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
