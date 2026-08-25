import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, getDB, fetchFromSupabase, saldoBahan, getBubaSettings, GRAM_EXCLUDED_BAHAN } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { DateInput } from "@/components/DateInput";
import { todayISO, rupiah } from "@/lib/format";
import { ArrowLeft, Check, Clock, AlertTriangle, RotateCcw, LockOpen, Banknote } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ArrowNav } from "@/components/ArrowNav";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { BUBUR_BASE, formatDecimal, buburCalc, parseSplit, serializeSplit, parseVariants, getVariantNamesForDate, loadGridFromReqs, loadRencanaGrid, sumGrid, matchVariantRecords, scaleGridToActual, clampGridToActual, sisaGramToCups, resolveFreshReturGrid, hitungTerjualOh, BUBUR_GRAM_PEMBULATAN, TIM_GRAM_PEMBULATAN, CYCLE_JURNAL_REFS, hitungOHValue, nilaiPemotonganTanggal, hitungHPPValue, hitungOmzetHarian, loadOmzetSplitCache, saveOmzetSplitCache, calcKemasanKebutuhan, KEMASAN_BAHAN, type OutletGrid } from "@/lib/produksi-utils";

export default function Distribusi() {
  const navigate = useNavigate();
  const dbState = useDB();
  const { user } = useAuth();
  const { produk = [], produksi = [], penjualan = [], bahan = [], permohonanStok = [], outlets = [], stokMov = [], jurnal = [] } = dbState;

  const [tanggal, setTanggal] = useState(todayISO());
  const hasUserModifiedGrids = useRef(false);
  // Tandai saat admin mengedit input retur Langkah 4 secara manual — nilai itu
  // WAJIB dihormati saat tutup siklus (tidak boleh dihitung ulang dari penjualan).
  const hasManualReturEdits = useRef(false);

  useEffect(() => {
    hasUserModifiedGrids.current = false;
    hasManualReturEdits.current = false;
  }, [tanggal]);

  const [step, setStep] = useState(3);
  const [settings, setSettings] = useState(getBubaSettings());
  useEffect(() => {
    const handler = () => setSettings(getBubaSettings());
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);

  const [distOutletId, setDistOutletId] = useState("");
  const [returOutletId, setReturOutletId] = useState("");

  useEffect(() => {
    if (outlets.length > 0) {
      if (!distOutletId) setDistOutletId(outlets[0].id);
      if (!returOutletId) setReturOutletId(outlets[0].id);
    }
  }, [outlets, distOutletId, returOutletId]);

  // Variant names from catatan
  const variantNames = useMemo(() => {
    return getVariantNamesForDate(permohonanStok, tanggal);
  }, [permohonanStok, tanggal]);

  const bubur1Name = variantNames.bubur1;
  const bubur2Name = variantNames.bubur2;
  const tim1Name = variantNames.tim1;
  const tim2Name = variantNames.tim2;

  // STEP 4 STATES
  const [distGrid, setDistGrid] = useState<Record<string, Record<string, number>>>({});

  // STEP 5 STATES
  const [returGrid, setReturGrid] = useState<Record<string, Record<string, number>>>({});
  // Porsi omzet yang diterima TUNAI (Kas Rupiah 110000); sisanya otomatis Bank
  // (transfer, 120000). Sumber kebenaran setelah siklus ditutup = jurnal OUT-SALES
  // (baris Debit 110000/120000); sebelum ditutup memakai cache localStorage.
  const [omzetKas, setOmzetKas] = useState(0);
  const omzetSplitLoadedRef = useRef<string>("");
  useEffect(() => {
    if (omzetSplitLoadedRef.current === tanggal) return; // muat sekali per tanggal
    omzetSplitLoadedRef.current = tanggal;
    const closed = (jurnal || []).filter((j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES");
    const kasDebit = closed.filter((j: any) => j.tipe === "Debit" && j.kodeAkun === "110000").reduce((s: number, j: any) => s + j.jumlah, 0);
    const bankDebit = closed.filter((j: any) => j.tipe === "Debit" && j.kodeAkun === "120000").reduce((s: number, j: any) => s + j.jumlah, 0);
    if (kasDebit > 0 || bankDebit > 0) {
      setOmzetKas(kasDebit);
    } else {
      setOmzetKas(loadOmzetSplitCache(tanggal) ?? 0);
    }
  }, [tanggal]);

  // Total omzet harian (live) — identik dgn logika saveStep4; dipakai untuk
  // menampilkan total & membatasi input porsi kas/bank di Langkah 4.
  const omzetTotal = useMemo(() => hitungOmzetHarian({
    penjualan, tanggal, outlets, distGrid, returGrid, produk
  }), [penjualan, tanggal, outlets, distGrid, returGrid, produk]);

  const [closingCycle, setClosingCycle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Buka siklus (khusus admin) — dialog konfirmasi + status proses
  const [bukaSiklusOpen, setBukaSiklusOpen] = useState(false);
  const [bukaSiklusLoading, setBukaSiklusLoading] = useState(false);
  const lastSyncedSalesRef = useRef<string>("");
  // Ref untuk selalu akses penjualan terbaru — mencegah stale closure
  const penjualanRef = useRef(penjualan);
  penjualanRef.current = penjualan;

  // Actual cups from produksi table
  const [actualCups, setActualCups] = useState({
    bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0,
    oatmeal: 0, puding: 0, abon: 0
  });

  // Load grids and actual cups from DB
  useEffect(() => {
    if (hasUserModifiedGrids.current) return;
    if (tanggal && outlets.length > 0) {
      // Load distGrid from permohonanStok
      const dGrid = loadGridFromReqs(outlets, permohonanStok, tanggal);

      // Load actual cups from produksi table — petakan varian D/I berdasarkan
      // qty_rencana (rencana D vs rencana I), bukan posisi array [0]/[1].
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);
      const newCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

      // Rencana D/I dari qty_rencana + catatan_rencana (Langkah 1) — dipakai untuk
      // memetakan record produksi D/I berdasarkan qty_rencana. qty/catatan aktual
      // (setelah Langkah 3 disimpan) TIDAK dipakai sebagai acuan rencana.
      const rencanaGrid = loadRencanaGrid(outlets, permohonanStok, tanggal);
      const planBuburD = Object.values(rencanaGrid).reduce((s: number, v: any) => s + (v.bubur_d || 0), 0);
      const planBuburI = Object.values(rencanaGrid).reduce((s: number, v: any) => s + (v.bubur_i || 0), 0);
      const planTimD = Object.values(rencanaGrid).reduce((s: number, v: any) => s + (v.tim_d || 0), 0);
      const planTimI = Object.values(rencanaGrid).reduce((s: number, v: any) => s + (v.tim_i || 0), 0);

      const buburProds = dayProds.filter((p: any) => p.produkId === "p-bubur");
      const timProds = dayProds.filter((p: any) => p.produkId === "p-nasitim");
      const buburMap = matchVariantRecords(buburProds, planBuburD, planBuburI);
      if (buburMap.rec1) newCups.bubur_1 = buburMap.rec1.qtyRealisasi;
      if (buburMap.rec2) newCups.bubur_2 = buburMap.rec2.qtyRealisasi;
      const timMap = matchVariantRecords(timProds, planTimD, planTimI);
      if (timMap.rec1) newCups.tim_1 = timMap.rec1.qtyRealisasi;
      if (timMap.rec2) newCups.tim_2 = timMap.rec2.qtyRealisasi;
      const oatmealProd = dayProds.find((p: any) => p.produkId === "p-oatmeal");
      if (oatmealProd) newCups.oatmeal = oatmealProd.qtyRealisasi;
      const pudingProd = dayProds.find((p: any) => p.produkId === "p-puding");
      if (pudingProd) newCups.puding = pudingProd.qtyRealisasi;
      const abonProd = dayProds.find((p: any) => p.produkId === "p-abon");
      if (abonProd) newCups.abon = abonProd.qtyRealisasi;

      // Jika belum ada data realisasi (Step 3 belum disimpan), gunakan rencana
      // dari grid sebagai acuan aktual agar distribusi tidak dianggap 0 & terblokir.
      if (dayProds.length === 0) {
        newCups.bubur_1 = planBuburD;
        newCups.bubur_2 = planBuburI;
        newCups.tim_1 = planTimD;
        newCups.tim_2 = planTimI;
        newCups.oatmeal = Object.values(dGrid).reduce((s: number, v: any) => s + (v.oatmeal || 0), 0);
        newCups.puding = Object.values(dGrid).reduce((s: number, v: any) => s + (v.puding || 0), 0);
        newCups.abon = Object.values(dGrid).reduce((s: number, v: any) => s + (v.abon || 0), 0);
      }

      setActualCups(newCups);

      // Distribusi mengacu realisasi pasca produksi (bukan rencana): jika permohonan
      // belum disetujui/dikirim, grid masih berisi angka rencana → skala proporsional
      // ke hasil masak aktual agar validasi tidak memblokir distribusi yang valid.
      if (!permohonanStok.some((r: any) => r.tanggalKirim === tanggal && r.status === "Disetujui")) {
        const scaled = scaleGridToActual(dGrid, newCups);
        Object.keys(scaled).forEach((k) => { dGrid[k] = { ...scaled[k] }; });
      }
      setDistGrid(dGrid);

      // Load returGrid from penjualan
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });
      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = dGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const outletProdRecords = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId);
              if (outletProdRecords.length > 0) {
                const totalSent = dSent + iSent;
                const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
                const totalRetur = Math.max(0, totalSent - sold);
                if (totalSent > 0) {
                  const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                  const iReturCups = totalRetur - dReturCups;
                  rGrid[o.id][dField] = dReturCups * gramPerCup;
                  rGrid[o.id][iField] = iReturCups * gramPerCup;
                }
              }
            }
          };

          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
        });
      }
      setReturGrid(rGrid);
      lastSyncedSalesRef.current = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.length;
    }
  }, [tanggal, outlets, penjualan, produksi, permohonanStok]);

  // === RETUR-ONLY SYNC — terblokir hasManualReturEdits (editan admin dihormati)
  // Selalu hitung ulang dari loadGridFromReqs (permohonanStok terbaru) + penjualan
  // terbaru dari getDB() — tidak bergantung pada distGrid state yang bisa stale.
  useEffect(() => {
    if (!tanggal || outlets.length === 0) return;
    // Jangan overwrite returGrid jika admin sudah manual edit — editan dihormati
    // sampai save (saveStep4) atau ganti tanggal.
    if (hasManualReturEdits.current) return;
    const freshPenjualan = getDB().penjualan;
    const existingSales = freshPenjualan.filter((p: any) => p.tanggal === tanggal);
    if (existingSales.length === 0) return;
    // Selalu load fresh dari permohonanStok — tidak bergantung distGrid state
    // yang bisa stale (belum ter-update dari setDistGrid sebelumnya, atau terblokir
    // hasUserModifiedGrids).
    const freshDistGrid = loadGridFromReqs(outlets, permohonanStok, tanggal);
    const rGrid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });
    outlets.forEach((o) => {
      const sent = freshDistGrid[o.id] || {};
      if (!sent) return;
      const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
        const gramPerCup = baseId === "p-bubur" ? 118 : 108;
        const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
        const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
        if (dRec) rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
        if (iRec) rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
        if (!dRec && !iRec) {
          const outletProdRecords = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId);
          if (outletProdRecords.length > 0) {
            const totalSent = dSent + iSent;
            const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) {
              const dReturCups = Math.round(totalRetur * (dSent / totalSent));
              const iReturCups = totalRetur - dReturCups;
              rGrid[o.id][dField] = dReturCups * gramPerCup;
              rGrid[o.id][iField] = iReturCups * gramPerCup;
            }
          }
        }
      };
      calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
      calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
      rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
      rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
      rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
    });
    setReturGrid(rGrid);
    lastSyncedSalesRef.current = freshPenjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + freshPenjualan.filter((p: any) => p.tanggal === tanggal).length;
  }, [tanggal, outlets, penjualan, permohonanStok]);

  const handleDistChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setDistGrid(prev => ({ ...prev, [outletId]: { ...prev[outletId], [field]: isNaN(val) ? 0 : Math.max(0, val) } }));
  };

  const handleReturChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    hasManualReturEdits.current = true;
    setReturGrid(prev => ({ ...prev, [outletId]: { ...prev[outletId], [field]: isNaN(val) ? 0 : Math.max(0, val) } }));
  };

  const distTotals = useMemo(() => sumGrid(distGrid as OutletGrid), [distGrid]);

  // STEP 3 Action (Distribusi)
  const saveStep3 = async () => {
    // Jika hasil masak aktual (realisasi) lebih kecil dari rencana, jangan
    // hard-block — sesuaikan otomatis (clamp proporsional per outlet) agar
    // distribusi tetap terkirim & stok awal di outlet bisa diinput OH.
    const clamped = clampGridToActual(distGrid, actualCups);
    const overTotals: string[] = [];
    if (distTotals.buburD > actualCups.bubur_1) overTotals.push(`Bubur 1 (${bubur1Name}): ${distTotals.buburD} cup`);
    if (distTotals.buburI > actualCups.bubur_2) overTotals.push(`Bubur 2 (${bubur2Name}): ${distTotals.buburI} cup`);
    if (distTotals.timD > actualCups.tim_1) overTotals.push(`Nasi Tim 1 (${tim1Name}): ${distTotals.timD} cup`);
    if (distTotals.timI > actualCups.tim_2) overTotals.push(`Nasi Tim 2 (${tim2Name}): ${distTotals.timI} cup`);
    if (distTotals.oatmeal > actualCups.oatmeal) overTotals.push(`Oatmeal: ${distTotals.oatmeal} cup`);
    if (distTotals.puding > actualCups.puding) overTotals.push(`Puding: ${distTotals.puding} cup`);
    if (distTotals.abon > actualCups.abon) overTotals.push(`Abon: ${distTotals.abon} pcs`);

    const grid = overTotals.length > 0 ? clamped : distGrid;
    if (overTotals.length > 0) {
      setDistGrid(grid);
      toast.warning(
        `Hasil masak aktual lebih kecil dari rencana untuk: ${overTotals.join(", ")}. ` +
        `Jumlah distribusi disesuaikan otomatis ke hasil masak aktual agar stok awal tetap terkirim ke outlet.`
      );
    }

    // Kebutuhan kemasan (cup & tutup Puding/Oatmeal) mengikuti JUMLAH PASCA
    // PRODUKSI = total distribusi FINAL (grid setelah clamp) yang dikirim ke
    // outlet — sama dgn halaman Produksi (aktual masak = total distribusi).
    // Bahan baku TIDAK ikut menyesuaikan: sudah dipotong di Langkah 2 dari
    // rencana; luberan/penyusutan hanya memengaruhi kemasan.
    // Kemasan BUBUR & NASI TIM (CUP BUBUR & TUTUP, stok sama) TIDAK dipotong di
    // sini — stoknya berkurang lewat permohonan/retur perlengkapan outlet.
    const finalTotals = sumGrid(grid as OutletGrid);
    const packagingReqs = calcKemasanKebutuhan({ puding: finalTotals.puding, oatmeal: finalTotals.oatmeal });

    // Hanya record produksi (p-*) — request/retur perlengkapan (b-*) jangan
    // diubah status/qty-nya oleh simpanan distribusi.
    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal && r.produkId?.startsWith("p-"));
    await Promise.all(dayReqs.map(async (r: any) => {
      const outletAlloc = grid[r.outletId] || {};
      let sentQty = 0;
      let notes = r.catatan || "";

      if (r.produkId === "p-bubur") {
        sentQty = (outletAlloc.bubur_d || 0) + (outletAlloc.bubur_i || 0);
        const existingVariants = parseVariants(r.catatan || "");
        const bv1 = existingVariants.v1 || bubur1Name;
        const bv2 = existingVariants.v2 || bubur2Name;
        notes = serializeSplit(outletAlloc.bubur_d || 0, outletAlloc.bubur_i || 0, r.catatan, bv1, bv2);
      } else if (r.produkId === "p-nasitim") {
        sentQty = (outletAlloc.tim_d || 0) + (outletAlloc.tim_i || 0);
        const existingVariants = parseVariants(r.catatan || "");
        const tv1 = existingVariants.v1 || tim1Name;
        const tv2 = existingVariants.v2 || tim2Name;
        notes = serializeSplit(outletAlloc.tim_d || 0, outletAlloc.tim_i || 0, r.catatan, tv1, tv2);
      } else if (r.produkId === "p-oatmeal") {
        sentQty = outletAlloc.oatmeal || 0;
      } else if (r.produkId === "p-puding") {
        sentQty = outletAlloc.puding || 0;
      } else if (r.produkId === "p-abon") {
        sentQty = outletAlloc.abon || 0;
      }

      // qty & catatan di-update ke DISTRIBUSI AKTUAL; qty_rencana & catatan_rencana
      // (rencana Langkah 1) tidak ikut ditimpa.
      await db.updatePermohonanStok(r.id, { qty: sentQty, status: "Disetujui", catatan: notes });
    }));

    // === PEMOTONGAN KEMASAN (CUP & TUTUP) SESUAI HASIL AKTUAL ===
    // Bahan baku sudah dipotong di Langkah 2 (halaman Produksi) langsung dari
    // rencana dan TIDAK terpengaruh hasil produksi. Kemasan dihitung ulang dari
    // cup aktual — karena hasil bisa menyusut (kebutuhan berkurang) atau meluber
    // (kebutuhan bertambah).
    const kemasanLabel = `Pemakaian Kemasan [${tanggal}]`;
    const existingKemasan = (stokMov || []).filter(
      (m: any) => m.tipe === "OUT" && m.keterangan === kemasanLabel
    );
    for (const m of existingKemasan) {
      await db.deleteStokMov(m.id);
    }
    // Bersihkan potongan kemasan FORMAT LAMA (versi sebelumnya mencampur cup &
    // tutup ke label "Pemakaian Produksi [...]") agar tanggal lama yang diproses
    // ulang tidak terpotong dobel (rencana lama + aktual baru).
    const kemasanIds = new Set(KEMASAN_BAHAN.map((k) => k.bahanId));
    const staleKemasan = (stokMov || []).filter(
      (m: any) =>
        m.tipe === "OUT" &&
        kemasanIds.has(m.bahanId) &&
        m.keterangan?.startsWith("Pemakaian Produksi [") &&
        m.keterangan.includes(tanggal)
    );
    for (const m of staleKemasan) {
      await db.deleteStokMov(m.id);
    }
    const shortItems: string[] = [];
    for (const k of packagingReqs) {
      const saldo = saldoBahan(k.bahanId, dbState);
      if (saldo < k.qty) {
        shortItems.push(`${k.nama}: butuh ${k.qty} pcs, stok ${Math.max(0, Math.round(saldo))} pcs`);
      }
      await db.addStokMov({
        tanggal: todayISO(),
        bahanId: k.bahanId,
        tipe: "OUT",
        qty: k.qty,
        keterangan: kemasanLabel
      });
    }

    if (packagingReqs.length > 0 && shortItems.length > 0) {
      toast.warning(
        `Kemasan dipotong sesuai hasil aktual, namun stok gudang kurang untuk: ${shortItems.join("; ")}. ` +
        `Pemotongan tetap dicatat (stok dapat minus).`
      );
    }

    toast.success("Barang keluar (distribusi) berhasil dikirim ke outlet!");

    // Load returGrid from latest data
    const rGrid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

    const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
    if (existingSales.length > 0) {
      outlets.forEach((o) => {
        const sent = grid[o.id] || {};
        if (!sent) return;

        const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
          const gramPerCup = baseId === "p-bubur" ? 118 : 108;
          const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
          const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
          if (dRec) {
            rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
          }
          if (iRec) {
            rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
          }
          if (!dRec && !iRec) {
            const outletProdRecords = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId);
            if (outletProdRecords.length > 0) {
              const totalSent = dSent + iSent;
              const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }
          }
        };

        calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
        calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
        rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
        rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
        rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
      });
    }

    setReturGrid(rGrid);
    hasUserModifiedGrids.current = false;
    hasManualReturEdits.current = false;
    setStep(4);
  };

  // Siklus dianggap TERTUTUP bila ada jurnal OUT-SALES untuk tanggal ini
  const isCycleClosed = useMemo(() => {
    return (jurnal || []).some((j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES");
  }, [jurnal, tanggal]);

  // Buka siklus (KHUSUS ADMIN): hapus jurnal OUT-SALES & stok IN retur/OH abon untuk tanggal ini.
  // Data penjualan TIDAK dihapus — tetap bisa diedit ulang; tutup siklus lagi setelah selesai.
  const handleBukaSiklus = async () => {
    if (user?.role !== "admin") {
      toast.error("Hanya akun admin yang dapat membuka siklus");
      return;
    }
    if (closingCycle || bukaSiklusLoading) return; // cegah proses ganda
    setBukaSiklusOpen(false);
    setBukaSiklusLoading(true);
    try {
      const outSales = (jurnal || []).filter((j: any) => j.tanggal === tanggal && CYCLE_JURNAL_REFS.has(j.ref));
      for (const j of outSales) {
        await supabase.from("jurnal").delete().eq("id", j.id);
      }
      const returMovs = (stokMov || []).filter(
        (m: any) =>
          m.tanggal === tanggal &&
          m.tipe === "IN" &&
          (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon"))
      );
      for (const m of returMovs) {
        await supabase.from("stok_movement").delete().eq("id", m.id);
      }
      // Hapus penjualan auto-created (tanpa variant/sisaGram) yang dibuat
      // oleh saveStep4 saat siklus ditutup sebelum outlet menginput sisa.
      const stalePenjualan = (penjualan || []).filter(
        (p: any) => p.tanggal === tanggal && (!p.variant || p.sisaGram == null)
      );
      for (const p of stalePenjualan) {
        await supabase.from("penjualan").delete().eq("id", p.id);
      }
      const deletedCount = outSales.length + returMovs.length + stalePenjualan.length;
      // Lepas guard edit manual SEBELUM fetch agar grid di-reload dari data
      // terbaru DB & auto-sync penjualan dari outlet kembali aktif.
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      await fetchFromSupabase();
      const parts: string[] = [];
      if (outSales.length + returMovs.length > 0) parts.push(`${outSales.length + returMovs.length} record jurnal/stok`);
      if (stalePenjualan.length > 0) parts.push(`${stalePenjualan.length} penjualan auto`);
      if (parts.length > 0) {
        toast.success(`Siklus ${tanggal} dibuka (${parts.join(', ')} dihapus) — penjualan bisa diedit ulang`);
      } else {
        toast.info(`Tidak ada jurnal/retur siklus untuk ${tanggal} — siklus sudah terbuka`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("Buka siklus error:", err);
      toast.error(`Gagal membuka siklus: ${errMsg}`);
    } finally {
      setBukaSiklusLoading(false);
    }
  };

  // STEP 5 Action
  // STEP 4 Action (Retur & Penjualan — tutup siklus)
  const saveStep4 = async () => {
    if (closingCycle) return;
    setClosingCycle(true);

    try {
      const existingPenjualan = (penjualan || []).filter((p: any) => p.tanggal === tanggal);

      // Retur grid yang dipakai untuk perhitungan OH — hormati edit manual admin
      // (returGrid state), selain itu hitung ulang dari penjualan terbaru outlet
      // agar stok retur tidak memakai data basi.
      const freshReturGrid = resolveFreshReturGrid({
        outlets,
        returGrid,
        distGrid,
        existingPenjualan,
        hasManualReturEdits: hasManualReturEdits.current
      });

      setReturGrid(freshReturGrid);
      lastSyncedSalesRef.current = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;

      // Auto-create penjualan if no data from outlet. Batch HANYA DIHITUNG
      // dulu (belum ditulis) agar revenue final sudah diketahui SEBELUM guard
      // omzet — tanggal tanpa omzet tidak menulis apa pun (penjualan, jurnal,
      // maupun movement RUSAK/OH).
      const penjualanBatch: any[] = [];
      if (existingPenjualan.length === 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;
          const ret = freshReturGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          if (buburSent > 0) {
            // Terjual = distribusi − sisaOH (cup), sisaOH = sisaGramToCups
            const buburRetCups = sisaGramToCups((ret.bubur_d || 0) + (ret.bubur_i || 0), BUBUR_GRAM_PEMBULATAN);
            const buburSold = Math.max(0, buburSent - Math.min(buburRetCups, buburSent));
            if (buburSold > 0) {
              const prod = produk.find((p: any) => p.id === "p-bubur");
              penjualanBatch.push({ tanggal, outletId: o.id, produkId: "p-bubur", qty: buburSold, harga: prod?.harga || 0 });
            }
          }

          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          if (timSent > 0) {
            const timRetCups = sisaGramToCups((ret.tim_d || 0) + (ret.tim_i || 0), TIM_GRAM_PEMBULATAN);
            const timSold = Math.max(0, timSent - Math.min(timRetCups, timSent));
            if (timSold > 0) {
              const prod = produk.find((p: any) => p.id === "p-nasitim");
              penjualanBatch.push({ tanggal, outletId: o.id, produkId: "p-nasitim", qty: timSold, harga: prod?.harga || 0 });
            }
          }

          const addSold = (baseId: string, subSent: number, subRetur: number) => {
            if (subSent <= 0) return;
            const sold = Math.max(0, subSent - Math.min(subRetur, subSent));
            if (sold <= 0) return;
            const prod = produk.find((p: any) => p.id === baseId);
            penjualanBatch.push({ tanggal, outletId: o.id, produkId: baseId, qty: sold, harga: prod?.harga || 0 });
          };

          addSold("p-oatmeal", sent.oatmeal || 0, ret.oatmeal || 0);
          addSold("p-puding", sent.puding || 0, ret.puding || 0);
          addSold("p-abon", sent.abon || 0, ret.abon || 0);
        });
      }
      // Total omzet final = Σ qty × harga penjualan outlet; bila belum ada data
      // outlet, dihitung dari distribusi − retur (auto-create penjualan). Memakai
      // helper yang sama dgn tampilan Langkah 4 agar angka tidak pernah berbeda.
      const totalSalesRevenue = hitungOmzetHarian({
        penjualan, tanggal, outlets, distGrid, returGrid: freshReturGrid, produk
      });

      // Jika tidak ada omzet → jurnal OUT-SALES tidak dibuat → siklus TIDAK
      // dianggap tertutup. Guard diletakkan SEBELUM penulisan apa pun (penjualan,
      // jurnal, & movement RUSAK/OH) — tanggal tanpa omzet tidak boleh memotong
      // stok atau merusak bahan; tombol Buka Siklus pun tidak akan muncul.
      if (totalSalesRevenue <= 0) {
        toast.warning(
          `Tidak ada omzet penjualan untuk tanggal ${tanggal} — siklus TIDAK ditutup (jurnal OUT-SALES tidak dibuat, tombol Buka Siklus tidak muncul). Isi rencana produksi & distribusi atau data penjualan outlet terlebih dahulu.`
        );
        return;
      }

      // Guard omzet lolos → tulis penjualan auto-create (bila ada)
      for (const p of penjualanBatch) { await db.addPenjualan(p); }

      // Hitung OH (sisa tidak terjual di outlet) per bahan baku.
      // Aturan baru: OH Bubur/Nasi Tim/Puding/Oatmeal → otomatis RUSAK (bahan
      // baku sudah terpotong saat Langkah 2 & tidak dikembalikan); OH Abon →
      // kembali ke stok gudang (bisa dijual lagi).
      const ohRusak = { beras: 0, puding: 0, oat: 0, sayurHijau: 0, sayurBuah: 0, sayurProtein: 0 };
      let abonKembali = 0;
      // Kemasan OH (sisa tidak terjual) — cup & tutup Puding/Oatmeal ikut RUSAK:
      // Puding → CUP PUDING & PLASTIK SELER; Oatmeal → CUP OAT & TUTUP OAT.
      // (Cup & tutup BUBUR & NASI TIM tidak ikut — via retur perlengkapan outlet.)
      const kemasanRusak = { puding: 0, oatmeal: 0 };

      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        const retur = freshReturGrid[o.id] || {};

        const processBubur = (dSent: number, iSent: number) => {
          [dSent, iSent].forEach((s, idx) => {
            const retField = idx === 0 ? retur.bubur_d ?? 0 : retur.bubur_i ?? 0;
            if (s > 0) {
              // retur dalam gram → konversi ke cup (118 gr/cup) aturan OH 50g agar sejalan dgn Produksi
              const actualRet = Math.min(sisaGramToCups(retField || 0, 118), s);
              if (actualRet > 0) {
                ohRusak.beras += buburCalc(actualRet, BUBUR_BASE.beras);
                ohRusak.sayurHijau += buburCalc(actualRet, BUBUR_BASE.sayurHijau);
                ohRusak.sayurBuah += buburCalc(actualRet, BUBUR_BASE.sayurBuah);
                ohRusak.sayurProtein += buburCalc(actualRet, BUBUR_BASE.sayurProtein);
              }
            }
          });
        };
        const processTim = (dSent: number, iSent: number) => {
          [dSent, iSent].forEach((s, idx) => {
            const retField = idx === 0 ? retur.tim_d ?? 0 : retur.tim_i ?? 0;
            if (s > 0) {
              // retur dalam gram → konversi ke cup (108 gr/cup) aturan OH 50g agar sejalan dgn Produksi
              const actualRet = Math.min(sisaGramToCups(retField || 0, 108), s);
              if (actualRet > 0) {
                ohRusak.beras += actualRet * settings.berasTim;
                ohRusak.sayurHijau += actualRet * settings.sayurHijauTim;
                ohRusak.sayurBuah += actualRet * settings.sayurBuahTim;
                ohRusak.sayurProtein += actualRet * settings.sayurProteinTim;
              }
            }
          });
        };

        processBubur(sent.bubur_d || 0, sent.bubur_i || 0);
        processTim(sent.tim_d || 0, sent.tim_i || 0);

        if (sent.oatmeal > 0) { const ar = Math.min(retur.oatmeal || 0, sent.oatmeal); if (ar > 0) { ohRusak.oat += ar * settings.oatmealCup; kemasanRusak.oatmeal += ar; } }
        if (sent.puding > 0) { const ar = Math.min(retur.puding || 0, sent.puding); if (ar > 0) { ohRusak.puding += ar * settings.pudingCup; kemasanRusak.puding += ar; } }
        if (sent.abon > 0) { const ar = Math.min(retur.abon || 0, sent.abon); if (ar > 0) abonKembali += ar * settings.abonCup; }
      });

      // Jurnal — alur keuangan (spec):
      //   Omset → Jurnal Utama: Pendapatan Utama (K) 410000 → LR; Jurnal Bantu:
      //           Kas Rupiah (D) 110000 → Neraca.
      //   OH    → Jurnal Utama: OH (D) 543000 → LR; Jurnal Bantu: Persediaan (K)
      //           140000 → Neraca (Dr OH Cr Persediaan).
      //   HPP   → Jurnal Utama: HPP (D) 541000 → LR; Jurnal Bantu: Persediaan (K)
      //           140000 → Neraca (Dr HPP Cr Persediaan).
      if (totalSalesRevenue > 0) {
        // Hapus jurnal lama (semua ref siklus), lalu buat ulang (update revenue)
        const existingJurnal = (jurnal || []).filter((j: any) => j.tanggal === tanggal && CYCLE_JURNAL_REFS.has(j.ref));
        for (const j of existingJurnal) { await supabase.from("jurnal").delete().eq("id", j.id); }

        // OH = nilai bahan baku + kemasan yang rusak (sisa tidak terjual)
        const ohValue = hitungOHValue(ohRusak, kemasanRusak, bahan, GRAM_EXCLUDED_BAHAN);
        // HPP = nilai pemotongan bahan baku (Pemakaian Produksi/Kemasan) − OH rusak
        const pemotonganValue = nilaiPemotonganTanggal(stokMov, tanggal, bahan, GRAM_EXCLUDED_BAHAN);
        const hppValue = hitungHPPValue(pemotonganValue, ohValue);

        // Porsi omzet TUNAI (Kas Rupiah 110000) vs TRANSFER (Bank 120000) —
        // admin memasukkan porsi kas di Langkah 4; bank = total − kas. Cache
        // disimpan agar nilai tidak hilang bila siklus dibuka & ditutup lagi.
        const kas = Math.max(0, Math.min(omzetKas, totalSalesRevenue));
        const bank = totalSalesRevenue - kas;
        saveOmzetSplitCache(tanggal, kas);

        const jurnalRows: any[] = [];
        if (kas > 0) {
          jurnalRows.push({ tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kodeAkun: "110000", akun: "Kas Rupiah", tipe: "Debit", jumlah: kas, kategori: "Aset" });
        }
        if (bank > 0) {
          jurnalRows.push({ tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kodeAkun: "120000", akun: "Bank", tipe: "Debit", jumlah: bank, kategori: "Aset" });
        }
        jurnalRows.push({ tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kodeAkun: "410000", akun: "Pendapatan Utama", tipe: "Kredit", jumlah: totalSalesRevenue, kategori: "Pendapatan" });
        if (ohValue > 0) {
          jurnalRows.push(
            { tanggal, ref: "OUT-OH", keterangan: `OH (sisa tidak terjual) Tanggal ${tanggal}`, kodeAkun: "543000", akun: "OH", tipe: "Debit", jumlah: ohValue, kategori: "Beban" },
            { tanggal, ref: "OUT-OH", keterangan: `OH (sisa tidak terjual) Tanggal ${tanggal}`, kodeAkun: "140000", akun: "Persediaan", tipe: "Kredit", jumlah: ohValue, kategori: "Aset" }
          );
        }
        if (hppValue > 0) {
          jurnalRows.push(
            { tanggal, ref: "OUT-HPP", keterangan: `HPP (bahan baku terjual) Tanggal ${tanggal}`, kodeAkun: "541000", akun: "HPP Bahan Utama", tipe: "Debit", jumlah: hppValue, kategori: "Beban" },
            { tanggal, ref: "OUT-HPP", keterangan: `HPP (bahan baku terjual) Tanggal ${tanggal}`, kodeAkun: "140000", akun: "Persediaan", tipe: "Kredit", jumlah: hppValue, kategori: "Aset" }
          );
        }
        await db.addJurnalBulk(jurnalRows);
      }

      // Bersihkan movement lama agar re-save tidak dobel:
      //  - OUT "RUSAK:OH" (pencatatan OH rusak versi sekarang)
      //  - IN "Retur Bahan" / "OH abon" (retur bahan lama & OH abon dari outlet)
      const existingOhRusakMov = (stokMov || []).filter((m: any) => m.tanggal === tanggal && m.tipe === "OUT" && m.keterangan?.startsWith("RUSAK:OH"));
      for (const m of existingOhRusakMov) { await supabase.from("stok_movement").delete().eq("id", m.id); }
      const existingReturMov = (stokMov || []).filter((m: any) => m.tanggal === tanggal && m.tipe === "IN" && (m.keterangan?.includes("Retur Bahan") || m.keterangan?.includes("OH abon")));
      for (const m of existingReturMov) { await supabase.from("stok_movement").delete().eq("id", m.id); }

      // Stok movements hasil OH (sisa tidak terjual di outlet):
      //  - OH Bubur/Nasi Tim/Puding/Oatmeal → RUSAK (OUT). Bahan baku sudah
      //    terpotong saat Langkah 2 (sesuai rencana) & TIDAK dikembalikan.
      //  - OH Abon → KEMBALI ke stok gudang (IN) — bisa dijual lagi besok.
      const movPromises: Promise<any>[] = [];
      if (ohRusak.beras > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-brs01", tipe: "OUT", qty: Math.ceil(ohRusak.beras), keterangan: `RUSAK:OH Beras (sisa Bubur/Tim) (${Math.ceil(ohRusak.beras)} gr) [${tanggal}]` }));
      if (ohRusak.puding > 1) {
        const pudingBahanRetur = bahan.find((x: any) => x.id === "b-pud01");
        const pudingKonvRetur = pudingBahanRetur?.konversiGram || 130;
        const qtyPuding = Math.ceil(ohRusak.puding / pudingKonvRetur);
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-pud01", tipe: "OUT", qty: qtyPuding, keterangan: `RUSAK:OH Puding (sisa) (${qtyPuding} pcs) [${tanggal}]` }));
      }
      if (ohRusak.oat > 1) {
        const oatBahanRetur = bahan.find((x: any) => x.id === "b-oat01");
        const oatKonvRetur = oatBahanRetur?.konversiGram || 180;
        const qtyOat = Math.ceil(ohRusak.oat / oatKonvRetur);
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-oat01", tipe: "OUT", qty: qtyOat, keterangan: `RUSAK:OH Oatmeal (sisa) (${qtyOat} pcs) [${tanggal}]` }));
      }
      if (abonKembali > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-ab01", tipe: "IN", qty: Math.ceil(abonKembali), keterangan: `Retur Bahan Baku (g) [${tanggal}]` }));
      if (ohRusak.sayurHijau > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sh01", tipe: "OUT", qty: Math.ceil(ohRusak.sayurHijau), keterangan: `RUSAK:OH Sayur Hijau (sisa) (${Math.ceil(ohRusak.sayurHijau)} gr) [${tanggal}]` }));
      if (ohRusak.sayurBuah > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sb01", tipe: "OUT", qty: Math.ceil(ohRusak.sayurBuah), keterangan: `RUSAK:OH Sayur Buah (sisa) (${Math.ceil(ohRusak.sayurBuah)} gr) [${tanggal}]` }));
      if (ohRusak.sayurProtein > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sp01", tipe: "OUT", qty: Math.ceil(ohRusak.sayurProtein), keterangan: `RUSAK:OH Sayur Protein (sisa) (${Math.ceil(ohRusak.sayurProtein)} gr) [${tanggal}]` }));

      // Kemasan OH → RUSAK (OUT) — cup & tutup produk yang tidak laku:
      // Puding (CUP PUDING & PLASTIK SELER) & Oatmeal (CUP OAT & TUTUP OAT).
      // Cup & tutup BUBUR & NASI TIM tidak ikut (via retur perlengkapan outlet).
      if (kemasanRusak.puding > 0) {
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-cuppud01", tipe: "OUT", qty: kemasanRusak.puding, keterangan: `RUSAK:OH Cup Puding (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]` }));
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-plas01", tipe: "OUT", qty: kemasanRusak.puding, keterangan: `RUSAK:OH Plastik Seler (sisa) (${kemasanRusak.puding} pcs) [${tanggal}]` }));
      }
      if (kemasanRusak.oatmeal > 0) {
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-cupoat1", tipe: "OUT", qty: kemasanRusak.oatmeal, keterangan: `RUSAK:OH Cup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]` }));
        movPromises.push(db.addStokMov({ tanggal, bahanId: "b-ttoat01", tipe: "OUT", qty: kemasanRusak.oatmeal, keterangan: `RUSAK:OH Tutup Oat (sisa) (${kemasanRusak.oatmeal} pcs) [${tanggal}]` }));
      }

      if (movPromises.length > 0) { await Promise.all(movPromises); }

      toast.success("Siklus distribusi harian ditutup! Penjualan outlet tercatat — OH (sisa) otomatis rusak & OH abon kembali ke stok.");
      // Siklus sudah ditutup — lepas guard edit manual agar sesi berikutnya
      // (Buka Siklus lagi / ganti tanggal) grid di-reload dari data terbaru DB.
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      setStep(3);
    } catch (err) {
      toast.error("Gagal menutup siklus distribusi");
      console.error(err);
    } finally {
      setClosingCycle(false);
    }
  };

  // Auto-refresh returGrid
  const handleAutoRefresh = useCallback(async () => {
    if (refreshing || !tanggal || outlets.length === 0) return;
    setRefreshing(true);
    try {
      hasUserModifiedGrids.current = false;
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

      // Fetch fresh data from Supabase, then read latest store snapshot
      // — prevents stale closure when outlet saves before React re-renders
      await fetchFromSupabase();
      const freshPenjualan = getDB().penjualan;
      const freshPermohonan = getDB().permohonanStok;
      const existingSales = freshPenjualan.filter((p: any) => p.tanggal === tanggal);
      // Selalu load fresh dari permohonanStok — tidak bergantung distGrid state
      const freshDistGrid = loadGridFromReqs(outlets, freshPermohonan, tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = freshDistGrid[o.id] || {};
          if (!sent) return;
          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            if (iRec) rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            if (!dRec && !iRec) {
              const outletProdRecords = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId);
              if (outletProdRecords.length > 0) {
                const totalSent = dSent + iSent;
                const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
                const totalRetur = Math.max(0, totalSent - sold);
                if (totalSent > 0) {
                  const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                  const iReturCups = totalRetur - dReturCups;
                  rGrid[o.id][dField] = dReturCups * gramPerCup;
                  rGrid[o.id][iField] = iReturCups * gramPerCup;
                }
              }
            }
          };
          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
        });
      }
      setReturGrid(rGrid);
      lastSyncedSalesRef.current = freshPenjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + freshPenjualan.filter((p: any) => p.tanggal === tanggal).length;
    } catch (err) { console.error("Auto-refresh returGrid failed:", err); }
    finally { setRefreshing(false); }
  }, [tanggal, outlets, refreshing]);

  useEffect(() => {
    window.addEventListener("buba_penjualan_saved", handleAutoRefresh);
    return () => window.removeEventListener("buba_penjualan_saved", handleAutoRefresh);
  }, [handleAutoRefresh]);

  const handleRefreshStep5 = async () => {
    setRefreshing(true);
    try {
      hasUserModifiedGrids.current = false;
      hasManualReturEdits.current = false;
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

      // Fetch fresh data from Supabase, then read latest store snapshot
      // — prevents stale closure when outlet saves before React re-renders
      await fetchFromSupabase();
      const freshPenjualan = getDB().penjualan;
      const freshPermohonan = getDB().permohonanStok;
      const existingSales = freshPenjualan.filter((p: any) => p.tanggal === tanggal);
      // Selalu load fresh dari permohonanStok — tidak bergantung distGrid state
      const freshDistGrid = loadGridFromReqs(outlets, freshPermohonan, tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = freshDistGrid[o.id] || {};
          if (!sent) return;
          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingSales.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) rGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            if (iRec) rGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            if (!dRec && !iRec) {
              const outletProdRecords = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId);
              if (outletProdRecords.length > 0) {
                const totalSent = dSent + iSent;
                const sold = outletProdRecords.reduce((s: number, p: any) => s + p.qty, 0);
                const totalRetur = Math.max(0, totalSent - sold);
                if (totalSent > 0) {
                  const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                  const iReturCups = totalRetur - dReturCups;
                  rGrid[o.id][dField] = dReturCups * gramPerCup;
                  rGrid[o.id][iField] = iReturCups * gramPerCup;
                }
              }
            }
          };
          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
        });
      }
      setReturGrid(rGrid);
      toast.success("Data penjualan dari outlet berhasil dimuat ulang!");
    } catch (err) {
      toast.error("Gagal memuat ulang data penjualan");
      console.error(err);
    } finally {
      const syncPenjualan = getDB().penjualan;
      lastSyncedSalesRef.current = syncPenjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + syncPenjualan.length;
      setRefreshing(false);
    }
  };

  const hasNewSalesData = useMemo(() => {
    const currentSig = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;
    return currentSig !== lastSyncedSalesRef.current && lastSyncedSalesRef.current !== "";
  }, [penjualan, tanggal]);

  // ============ RENDER FUNCTIONS ============

  function renderStep3() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 3: Distribusi & Alokasi Outlet</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Pilih outlet di bawah untuk mengisi kuantitas cup yang dikirim, ringkasan pengiriman akan muncul di tabel bawah.</p>
          </div>
          <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-xl border text-xs">
            <span className="font-bold text-muted-foreground">Status Masak (Actual/Target):</span>
            <span className="font-semibold text-primary">
              B: {actualCups.bubur_1 + actualCups.bubur_2}/{distTotals.buburD + distTotals.buburI} · T: {actualCups.tim_1 + actualCups.tim_2}/{distTotals.timD + distTotals.timI}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Sisa Hasil Masak */}
          <div className="bg-muted/15 p-4 rounded-2xl border border-dashed space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Sisa Hasil Masak (Belum Didistribusikan)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
              {[
                { label: `B. ${bubur1Name}`, actual: actualCups.bubur_1, dist: distTotals.buburD, color: "text-amber-600" },
                { label: `B. ${bubur2Name}`, actual: actualCups.bubur_2, dist: distTotals.buburI, color: "text-blue-600" },
                { label: `T. ${tim1Name}`, actual: actualCups.tim_1, dist: distTotals.timD, color: "text-amber-600" },
                { label: `T. ${tim2Name}`, actual: actualCups.tim_2, dist: distTotals.timI, color: "text-blue-600" },
                { label: "Oatmeal", actual: actualCups.oatmeal, dist: distTotals.oatmeal, color: "text-muted-foreground" },
                { label: "Puding", actual: actualCups.puding, dist: distTotals.puding, color: "text-muted-foreground" },
                { label: "Abon", actual: actualCups.abon, dist: distTotals.abon, color: "text-muted-foreground" },
              ].map((item) => (
                <div key={item.label} className="space-y-1 bg-card p-2.5 rounded-xl border shadow-sm">
                  <span className={`text-[10px] font-bold ${item.color} block truncate`}>{item.label}</span>
                  <span className={`text-sm font-bold block ${item.actual - item.dist < 0 ? "text-destructive animate-pulse" : "text-foreground"}`}>
                    {item.actual - item.dist} <span className="text-[10px] font-normal text-muted-foreground">/ {item.actual}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Dropdown & Input Fields */}
          <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1.5 flex-1 min-w-[200px]">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
                <ArrowNav
                  size="lg"
                  onPrev={() => { const idx = outlets.findIndex((o: any) => o.id === distOutletId); if (idx > 0) setDistOutletId(outlets[idx - 1].id); }}
                  onNext={() => { const idx = outlets.findIndex((o: any) => o.id === distOutletId); if (idx < outlets.length - 1) setDistOutletId(outlets[idx + 1].id); }}
                  disabledPrev={outlets.findIndex((o: any) => o.id === distOutletId) <= 0}
                  disabledNext={outlets.findIndex((o: any) => o.id === distOutletId) >= outlets.length - 1}
                  prevLabel="Outlet sebelumnya"
                  nextLabel="Outlet berikutnya"
                >
                  <Select value={distOutletId} onValueChange={setDistOutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </ArrowNav>
              </div>
            </div>

            {(() => {
              const row = distGrid[distOutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-1">
                  {[
                    { field: "bubur_d", label: `B. ${bubur1Name}`, bgClass: "bg-amber-500/5 border-amber-300/30", colorClass: "text-amber-600 border-amber-300/80", unitWeight: 118 },
                    { field: "bubur_i", label: `B. ${bubur2Name}`, bgClass: "bg-blue-500/5 border-blue-300/30", colorClass: "text-blue-600 border-blue-300/80", unitWeight: 118 },
                    { field: "tim_d", label: `T. ${tim1Name}`, bgClass: "bg-amber-500/5 border-amber-300/30", colorClass: "text-amber-600 border-amber-300/80", unitWeight: 108 },
                    { field: "tim_i", label: `T. ${tim2Name}`, bgClass: "bg-blue-500/5 border-blue-300/30", colorClass: "text-blue-600 border-blue-300/80", unitWeight: 108 },
                    { field: "oatmeal", label: "Oatmeal", bgClass: "bg-card border", colorClass: "text-muted-foreground", unitWeight: 100 },
                    { field: "puding", label: "Puding", bgClass: "bg-card border", colorClass: "text-muted-foreground", unitWeight: 80 },
                    { field: "abon", label: "Abon", bgClass: "bg-card border", colorClass: "text-muted-foreground", unitWeight: 10 },
                  ].map((item) => (
                    <div key={item.field} className={`space-y-1 p-2.5 rounded-xl ${item.bgClass}`}>
                      <Label className={`text-[10px] font-bold ${item.colorClass} block truncate`}>{item.label}</Label>
                      <Input type="number" min={0} value={(row as any)[item.field] || ""} onChange={(e) => handleDistChange(distOutletId, item.field, parseInt(e.target.value))} className={`h-9 text-xs text-center ${item.colorClass} focus-visible:ring-amber-500 font-semibold`} placeholder="0" />
                      <span className="text-[9px] text-muted-foreground/80 block text-center mt-1">({((row as any)[item.field] || 0) * item.unitWeight} g)</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Summary Table */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Distribusi Pengiriman (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Bubur {bubur1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Bubur {bubur2Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-amber-600 bg-amber-500/5">Tim {tim1Name}</TableHead>
                      <TableHead className="text-center font-bold text-xs text-blue-600 bg-blue-500/5">Tim {tim2Name}</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Oatmeal</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Puding</TableHead>
                      <TableHead className="text-center font-semibold text-xs">Abon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o: any) => {
                      const row = distGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
                      const isSelected = o.id === distOutletId;
                      return (
                        <TableRow key={o.id} onClick={() => setDistOutletId(o.id)} className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/30"}`}>
                          <TableCell className="font-semibold py-3 flex items-center gap-1.5 whitespace-nowrap">
                            {o.nama}{isSelected && <Badge className="text-[9px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20" variant="outline">Edit</Badge>}
                          </TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2.5"><div className="font-semibold text-xs">{row.bubur_d || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.bubur_d || 0) * 118} g</div></TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2.5"><div className="font-semibold text-xs">{row.bubur_i || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.bubur_i || 0) * 118} g</div></TableCell>
                          <TableCell className="bg-amber-500/5 text-center py-2.5"><div className="font-semibold text-xs">{row.tim_d || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.tim_d || 0) * 108} g</div></TableCell>
                          <TableCell className="bg-blue-500/5 text-center py-2.5"><div className="font-semibold text-xs">{row.tim_i || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.tim_i || 0) * 108} g</div></TableCell>
                          <TableCell className="text-center py-2.5 font-medium"><div className="text-xs">{row.oatmeal || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.oatmeal || 0) * 100} g</div></TableCell>
                          <TableCell className="text-center py-2.5 font-medium"><div className="text-xs">{row.puding || 0} cup</div><div className="text-[9px] text-muted-foreground">{(row.puding || 0) * 80} g</div></TableCell>
                          <TableCell className="text-center py-2.5 font-medium"><div className="text-xs">{row.abon || 0} pcs</div><div className="text-[9px] text-muted-foreground">{(row.abon || 0) * 10} g</div></TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => navigate("/produksi")} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Kembali ke Produksi</span>
            </Button>
            <Button onClick={saveStep3} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Konfirmasi Pengiriman & Lanjutkan</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep4() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 4: Retur & Penjualan Akhir Hari</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Input retur (sisa tidak terjual) per menu per outlet. Bubur & Nasi Tim dalam <strong>gram</strong>, Oatmeal & Puding dalam <strong>cup</strong>, Abon dalam <strong>pcs</strong>.
            </p>
          </div>
          {hasNewSalesData && (
            <div className="flex items-center gap-2 bg-amber-500/10 p-2 px-3 rounded-xl border border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-600">Data penjualan baru tersedia!</span>
              <Button size="sm" variant="outline" onClick={handleRefreshStep5} disabled={refreshing} className="h-8 text-xs gap-1">
                <RotateCcw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Muat Ulang
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Outlet Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>                <ArrowNav
                  size="lg"
                  onPrev={() => { const idx = outlets.findIndex((o: any) => o.id === returOutletId); if (idx > 0) setReturOutletId(outlets[idx - 1].id); }}
                  onNext={() => { const idx = outlets.findIndex((o: any) => o.id === returOutletId); if (idx < outlets.length - 1) setReturOutletId(outlets[idx + 1].id); }}
                  disabledPrev={outlets.findIndex((o: any) => o.id === returOutletId) <= 0}
                  disabledNext={outlets.findIndex((o: any) => o.id === returOutletId) >= outlets.length - 1}
                  prevLabel="Outlet sebelumnya"
                  nextLabel="Outlet berikutnya"
                >
                  <Select value={returOutletId} onValueChange={setReturOutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </ArrowNav>
            </div>
          </div>

          {/* Retur Input Fields */}
          {(() => {
            const row = returGrid[returOutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
            const sent = distGrid[returOutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

            const returItems = [
              { field: "bubur_d", label: `Bubur ${bubur1Name}`, gramFactor: 118, roundGram: BUBUR_GRAM_PEMBULATAN, sent: sent.bubur_d || 0, colorClass: "text-amber-600 border-amber-300/80" },
              { field: "bubur_i", label: `Bubur ${bubur2Name}`, gramFactor: 118, roundGram: BUBUR_GRAM_PEMBULATAN, sent: sent.bubur_i || 0, colorClass: "text-blue-600 border-blue-300/80" },
              { field: "tim_d", label: `Tim ${tim1Name}`, gramFactor: 108, roundGram: TIM_GRAM_PEMBULATAN, sent: sent.tim_d || 0, colorClass: "text-amber-600 border-amber-300/80" },
              { field: "tim_i", label: `Tim ${tim2Name}`, gramFactor: 108, roundGram: TIM_GRAM_PEMBULATAN, sent: sent.tim_i || 0, colorClass: "text-blue-600 border-blue-300/80" },
              { field: "oatmeal", label: "Oatmeal", gramFactor: 100, roundGram: 100, sent: sent.oatmeal || 0, colorClass: "text-muted-foreground" },
              { field: "puding", label: "Puding", gramFactor: 80, roundGram: 80, sent: sent.puding || 0, colorClass: "text-muted-foreground" },
              { field: "abon", label: "Abon", gramFactor: 10, roundGram: 10, sent: sent.abon || 0, colorClass: "text-muted-foreground" },
            ];

            return (
              <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {returItems.map((item) => {
                    const returVal = (row as any)[item.field] || 0;
                    const isBuburTim = ["bubur_d", "bubur_i", "tim_d", "tim_i"].includes(item.field);
                    // returGrid: Bubur/Tim dalam gram, Oatmeal/Puding dalam cup, Abon dalam pcs.
                    // Pembulatan sisa OH bubur/tim: floor(gram ÷ gpc) + (frac > 0.5 ? 1 : 0)
                    const returCups = isBuburTim ? sisaGramToCups(returVal, item.roundGram) : returVal;
                    const sold = Math.max(0, item.sent - Math.min(returCups, item.sent));
                    const unitLabel = item.field === "abon" ? "pcs" : "cup";

                    return (
                      <div key={item.field} className="p-4 rounded-2xl border bg-card/40 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm">{item.label}</span>
                          <Badge variant="outline" className="text-[10px]">Dikirim: {item.sent} {unitLabel}</Badge>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Retur ({isBuburTim ? "gram" : unitLabel})</Label>
                          <Input
                            type="number"
                            min={0}
                            max={isBuburTim ? item.sent * item.gramFactor : item.sent}
                            value={returVal || ""}
                            onChange={(e) => handleReturChange(returOutletId, item.field, parseInt(e.target.value) || 0)}
                            className={`h-10 font-semibold ${item.colorClass}`}
                            placeholder="0"
                          />
                          {isBuburTim && (
                            <p className="text-[11px] text-emerald-600 font-medium mt-1">✨ {returCups} cup (@ {item.roundGram}g)</p>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                          {isBuburTim ? (
                            <>
                              <span>Retur: <strong className="text-foreground">{returVal}g</strong> <span className="text-muted-foreground">= {returCups} cup</span></span>
                              <span>Terjual: <strong className="text-primary">{sold} cup</strong></span>
                            </>
                          ) : (
                            <>
                              <span>Retur: <strong className="text-foreground">{returCups} {unitLabel}</strong></span>
                              <span>Terjual: <strong className="text-primary">{sold} {unitLabel}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Summary Table */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">Ringkasan Retur & Penjualan (Klik baris untuk edit)</Label>
            <div className="rounded-2xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Outlet</TableHead>
                      {["Bubur (g)", "Tim (g)", "Oatmeal", "Puding", "Abon"].map(h => <TableHead key={h} className="text-center font-bold text-xs">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o: any) => {
                      const row = returGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
                      const sent = distGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
                      const isSelected = o.id === returOutletId;

                      const calcSold = (sent: number, returCups: number) => Math.max(0, sent - Math.min(returCups, sent));

                      const buburGram = (row.bubur_d || 0) + (row.bubur_i || 0);
                      const buburRet = sisaGramToCups(buburGram, BUBUR_GRAM_PEMBULATAN);
                      const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
                      const buburTerjual = calcSold(buburSent, buburRet);
                      const timGram = (row.tim_d || 0) + (row.tim_i || 0);
                      const timRet = sisaGramToCups(timGram, TIM_GRAM_PEMBULATAN);
                      const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
                      const timTerjual = calcSold(timSent, timRet);
                      const oatRet = row.oatmeal || 0; // returGrid menyimpan Oatmeal dalam cup
                      const oatSent = sent.oatmeal || 0;
                      const pudRet = row.puding || 0; // returGrid menyimpan Puding dalam cup
                      const pudSent = sent.puding || 0;
                      const abonRet = row.abon || 0; // returGrid stores pcs directly for abon
                      const abonSent = sent.abon || 0;

                      return (
                        <TableRow key={o.id} onClick={() => setReturOutletId(o.id)} className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/30"}`}>
                          <TableCell className="font-semibold py-3">{o.nama}</TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive font-semibold">{buburGram}g</span>
                            <span className="text-muted-foreground"> = {buburRet} cup</span>
                            <div className="text-[9px] text-primary font-semibold">terjual {buburTerjual} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive font-semibold">{timGram}g</span>
                            <span className="text-muted-foreground"> = {timRet} cup</span>
                            <div className="text-[9px] text-primary font-semibold">terjual {timTerjual} cup</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive">{oatRet}</span> / <span className="text-primary font-semibold">{calcSold(oatSent, oatRet)}</span>
                          </TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive">{pudRet}</span> / <span className="text-primary font-semibold">{calcSold(pudSent, pudRet)}</span>
                          </TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive">{abonRet}</span> / <span className="text-primary font-semibold">{calcSold(abonSent, abonRet)}</span>
                            <div className="text-[9px] text-muted-foreground">ret/terj</div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Pembayaran Omzet — Kas Rupiah (cash) vs Bank (transfer) */}
          <div className="bg-card border rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Banknote className="h-3.5 w-3.5" /> Pembayaran Omzet
              </h4>
              <div className="text-xs text-muted-foreground">
                Total Omzet: <span className="font-bold text-primary">{rupiah(omzetTotal)}</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Kas Rupiah (Cash)</Label>
                <Input
                  type="number"
                  min={0}
                  max={omzetTotal}
                  disabled={omzetTotal <= 0}
                  value={omzetKas || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, omzetTotal));
                    setOmzetKas(v);
                    saveOmzetSplitCache(tanggal, v);
                  }}
                  className="h-9 text-sm font-semibold text-center"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">Diterima tunai → jurnal Kas Rupiah (110000) di Neraca</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Bank (Transfer)</Label>
                <Input
                  type="number"
                  min={0}
                  max={omzetTotal}
                  disabled={omzetTotal <= 0}
                  value={Math.max(0, omzetTotal - omzetKas) || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(parseInt(e.target.value) || 0, omzetTotal));
                    setOmzetKas(omzetTotal - v);
                    saveOmzetSplitCache(tanggal, omzetTotal - v);
                  }}
                  className="h-9 text-sm font-semibold text-center"
                  placeholder="0"
                />
                <p className="text-[10px] text-muted-foreground">Transfer → jurnal Bank (120000) di Neraca</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(3)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Kembali</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefreshStep5} disabled={refreshing} className="h-10">
                <RotateCcw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Muat Ulang
              </Button>
              {user?.role === "admin" && isCycleClosed && (
                <Button
                  variant="outline"
                  onClick={() => setBukaSiklusOpen(true)}
                  disabled={closingCycle || bukaSiklusLoading}
                  className="h-10 border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                >
                  <LockOpen className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">{bukaSiklusLoading ? "Membuka..." : "Buka Siklus"}</span>
                </Button>
              )}
              <Button onClick={saveStep4} disabled={closingCycle || bukaSiklusLoading} className="gradient-primary text-primary-foreground hover-lift h-10">
                <Check className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Selesaikan & Tutup Siklus</span>
              </Button>
            </div>
          </div>

          {/* Konfirmasi Buka Siklus — khusus admin */}
          <AlertDialog open={bukaSiklusOpen} onOpenChange={setBukaSiklusOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <LockOpen className="h-5 w-5 text-amber-500" />
                  Buka Siklus {tanggal}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Ini akan menghapus <strong>jurnal siklus (OUT-SALES/OH/HPP)</strong> dan <strong>stok retur/OH abon</strong> untuk tanggal {tanggal}.
                  Data penjualan <strong>tetap aman</strong> dan bisa diedit ulang. Setelah selesai memperbaiki data, tutup siklus lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleBukaSiklus}>Ya, Buka Siklus</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    );
  }

  // ============ MAIN RENDER ============
  const distSteps = [
    { num: 3, label: "Distribusi" },
    { num: 4, label: "Retur & Penjualan" },
  ];

  return (
    <div className="space-y-6">
      {/* Configuration Card — Date + Variant Names */}
      <Card className="glass border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Tanggal Distribusi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Tanggal</Label>
              <DateInput value={tanggal} onChange={setTanggal} className="font-semibold" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">Bubur 1</Label>
              <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center text-xs font-semibold text-amber-600">{bubur1Name}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-blue-600 uppercase tracking-wider">Bubur 2</Label>
              <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center text-xs font-semibold text-blue-600">{bubur2Name}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-amber-600 uppercase tracking-wider">Tim 1</Label>
              <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center text-xs font-semibold text-amber-600">{tim1Name}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-blue-600 uppercase tracking-wider">Tim 2</Label>
              <div className="h-10 px-3 rounded-lg border bg-muted/20 flex items-center text-xs font-semibold text-blue-600">{tim2Name}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stepper */}
      <div className="hidden md:flex items-center justify-center gap-0 bg-card rounded-2xl border shadow-sm p-1.5">
        {distSteps.map((s) => (
          <button
            key={s.num}
            onClick={() => s.num <= step && setStep(s.num)}
            disabled={s.num > step}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition-all ${
              step === s.num
                ? "gradient-primary text-primary-foreground shadow-soft scale-105"
                : step > s.num
                ? "bg-success/10 text-success hover:bg-success/20 cursor-pointer"
                : "text-muted-foreground cursor-default"
            }`}
          >
            <span className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold ${
              step === s.num ? "bg-white/20" : step > s.num ? "bg-success text-success-foreground" : "bg-muted"
            }`}>
              {step > s.num ? <Check className="h-3.5 w-3.5" /> : s.num}
            </span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>
      <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-2">
        {distSteps.map((s) => (
          <button
            key={s.num}
            onClick={() => s.num <= step && setStep(s.num)}
            disabled={s.num > step}
            className={`whitespace-nowrap px-4 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
              step === s.num ? "gradient-primary text-primary-foreground shadow-soft" : step > s.num ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}
          >{s.num}. {s.label}</button>
        ))}
      </div>

      {/* Step Content */}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </div>
  );
}
