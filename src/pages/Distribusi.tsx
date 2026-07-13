import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { db, useDB, getBubaSettings } from "@/lib/store";
import { supabase } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/format";
import { ArrowRight, ArrowLeft, Check, Clock, AlertTriangle, RotateCcw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { BUBUR_BASE, formatDecimal, buburCalc, parseSplit, serializeSplit, parseVariants, getVariantNamesForDate, loadGridFromReqs, sumGrid } from "@/lib/produksi-utils";

export default function Distribusi() {
  const navigate = useNavigate();
  const dbState = useDB();
  const { user } = useAuth();
  const { produk = [], produksi = [], penjualan = [], bahan = [], permohonanStok = [], outlets = [], stokMov = [], jurnal = [] } = dbState;

  const [tanggal, setTanggal] = useState(todayISO());
  const hasUserModifiedGrids = useRef(false);

  useEffect(() => {
    hasUserModifiedGrids.current = false;
  }, [tanggal]);

  const [step, setStep] = useState(4);
  const [settings, setSettings] = useState(getBubaSettings());
  useEffect(() => {
    const handler = () => setSettings(getBubaSettings());
    window.addEventListener("buba_settings_changed", handler);
    return () => window.removeEventListener("buba_settings_changed", handler);
  }, []);

  const [step4OutletId, setStep4OutletId] = useState("");
  const [step5OutletId, setStep5OutletId] = useState("");

  useEffect(() => {
    if (outlets.length > 0) {
      if (!step4OutletId) setStep4OutletId(outlets[0].id);
      if (!step5OutletId) setStep5OutletId(outlets[0].id);
    }
  }, [outlets, step4OutletId, step5OutletId]);

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
  const [closingCycle, setClosingCycle] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const lastSyncedSalesRef = useRef<string>("");

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
      setDistGrid(dGrid);

      // Load actual cups from produksi table
      const dayProds = produksi.filter((p: any) => p.tanggal === tanggal);
      const newCups = { bubur_1: 0, bubur_2: 0, tim_1: 0, tim_2: 0, oatmeal: 0, puding: 0, abon: 0 };

      const buburProds = dayProds.filter((p: any) => p.produkId === "p-bubur");
      const timProds = dayProds.filter((p: any) => p.produkId === "p-nasitim");

      if (buburProds.length > 0) {
        newCups.bubur_1 = buburProds[0].qtyRealisasi;
        if (buburProds.length > 1) newCups.bubur_2 = buburProds[1].qtyRealisasi;
      }
      if (timProds.length > 0) {
        newCups.tim_1 = timProds[0].qtyRealisasi;
        if (timProds.length > 1) newCups.tim_2 = timProds[1].qtyRealisasi;
      }
      const oatmealProd = dayProds.find((p: any) => p.produkId === "p-oatmeal");
      if (oatmealProd) newCups.oatmeal = oatmealProd.qtyRealisasi;
      const pudingProd = dayProds.find((p: any) => p.produkId === "p-puding");
      if (pudingProd) newCups.puding = pudingProd.qtyRealisasi;
      const abonProd = dayProds.find((p: any) => p.produkId === "p-abon");
      if (abonProd) newCups.abon = abonProd.qtyRealisasi;

      setActualCups(newCups);

      // Load returGrid from penjualan
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => {
        rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
      });
      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = dGrid[o.id] || {};
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
              const totalSent = dSent + iSent;
              const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                rGrid[o.id][dField] = dReturCups * gramPerCup;
                rGrid[o.id][iField] = iReturCups * gramPerCup;
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

  const handleDistChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setDistGrid(prev => ({ ...prev, [outletId]: { ...prev[outletId], [field]: isNaN(val) ? 0 : val } }));
  };

  const handleReturChange = (outletId: string, field: string, val: number) => {
    hasUserModifiedGrids.current = true;
    setReturGrid(prev => ({ ...prev, [outletId]: { ...prev[outletId], [field]: isNaN(val) ? 0 : val } }));
  };

  const distTotals = useMemo(() => sumGrid(distGrid), [distGrid]);

  // STEP 4 Action
  const saveStep4 = async () => {
    if (distTotals.buburD > actualCups.bubur_1) {
      return toast.error(`Distribusi Bubur 1 (${bubur1Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburD} cup, Masak: ${actualCups.bubur_1} cup)`);
    }
    if (distTotals.buburI > actualCups.bubur_2) {
      return toast.error(`Distribusi Bubur 2 (${bubur2Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.buburI} cup, Masak: ${actualCups.bubur_2} cup)`);
    }
    if (distTotals.timD > actualCups.tim_1) {
      return toast.error(`Distribusi Nasi Tim 1 (${tim1Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timD} cup, Masak: ${actualCups.tim_1} cup)`);
    }
    if (distTotals.timI > actualCups.tim_2) {
      return toast.error(`Distribusi Nasi Tim 2 (${tim2Name}) melebihi hasil masak aktual! (Terdistribusi: ${distTotals.timI} cup, Masak: ${actualCups.tim_2} cup)`);
    }
    if (distTotals.oatmeal > actualCups.oatmeal) {
      return toast.error(`Distribusi Oatmeal melebihi hasil masak aktual! (Terdistribusi: ${distTotals.oatmeal} cup, Masak: ${actualCups.oatmeal} cup)`);
    }
    if (distTotals.puding > actualCups.puding) {
      return toast.error(`Distribusi Puding melebihi hasil masak aktual! (Terdistribusi: ${distTotals.puding} cup, Masak: ${actualCups.puding} cup)`);
    }
    if (distTotals.abon > actualCups.abon) {
      return toast.error(`Distribusi Abon melebihi hasil masak aktual! (Terdistribusi: ${distTotals.abon} pcs, Masak: ${actualCups.abon} pcs)`);
    }

    const dayReqs = permohonanStok.filter((r: any) => r.tanggalKirim === tanggal);
    await Promise.all(dayReqs.map(async (r: any) => {
      const outletAlloc = distGrid[r.outletId] || {};
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

      await db.updatePermohonanStok(r.id, { qty: sentQty, status: "Disetujui", catatan: notes });
    }));

    toast.success("Barang keluar (distribusi) berhasil dikirim ke outlet!");

    // Load returGrid from latest data
    const rGrid: Record<string, Record<string, number>> = {};
    outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

    const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
    if (existingSales.length > 0) {
      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        if (!sent) return;

        const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
          const totalSent = dSent + iSent;
          const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
          const totalRetur = Math.max(0, totalSent - sold);
          if (totalSent > 0) {
            rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent));
            rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField];
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
    setStep(5);
  };

  // STEP 5 Action
  const saveStep5 = async () => {
    if (closingCycle) return;
    setClosingCycle(true);

    try {
      const existingPenjualan = (penjualan || []).filter((p: any) => p.tanggal === tanggal);

      let totalSalesRevenue = 0;
      existingPenjualan.forEach((p: any) => { totalSalesRevenue += p.qty * p.harga; });

      // Recalculate returGrid from latest penjualan
      const freshReturGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => { freshReturGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

      if (existingPenjualan.length > 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;

          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const gramPerCup = baseId === "p-bubur" ? 118 : 108;
            const dRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === dField && p.sisaGram != null);
            const iRec = existingPenjualan.find((p: any) => p.outletId === o.id && p.produkId === baseId && p.variant === iField && p.sisaGram != null);
            if (dRec) {
              freshReturGrid[o.id][dField] = Math.min(dRec.sisaGram, dSent * gramPerCup);
            }
            if (iRec) {
              freshReturGrid[o.id][iField] = Math.min(iRec.sisaGram, iSent * gramPerCup);
            }
            if (!dRec && !iRec) {
              const totalSent = dSent + iSent;
              const sold = existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
              const totalRetur = Math.max(0, totalSent - sold);
              if (totalSent > 0) {
                const dReturCups = Math.round(totalRetur * (dSent / totalSent));
                const iReturCups = totalRetur - dReturCups;
                freshReturGrid[o.id][dField] = dReturCups * gramPerCup;
                freshReturGrid[o.id][iField] = iReturCups * gramPerCup;
              }
            }
          };

          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
          freshReturGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
          freshReturGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
          freshReturGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingPenjualan.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
        });
      }

      setReturGrid(freshReturGrid);
      lastSyncedSalesRef.current = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;

      // Auto-create penjualan if no data from outlet
      if (existingPenjualan.length === 0) {
        const penjualanBatch: any[] = [];
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;
          const ret = freshReturGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

          const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
          const buburRet = Math.floor(((ret.bubur_d || 0) + (ret.bubur_i || 0)) / 118);
          if (buburSent > 0) {
            const buburSold = Math.max(0, buburSent - Math.min(buburRet, buburSent));
            if (buburSold > 0) {
              const prod = produk.find((p: any) => p.id === "p-bubur");
              penjualanBatch.push({ tanggal, outletId: o.id, produkId: "p-bubur", qty: buburSold, harga: prod?.harga || 0 });
            }
          }

          const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
          const timRet = Math.floor(((ret.tim_d || 0) + (ret.tim_i || 0)) / 108);
          if (timSent > 0) {
            const timSold = Math.max(0, timSent - Math.min(timRet, timSent));
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

        for (const p of penjualanBatch) { await db.addPenjualan(p); }
        if (penjualanBatch.length > 0) {
          totalSalesRevenue = penjualanBatch.reduce((sum, p) => sum + p.qty * p.harga, 0);
        }
      }

      // Recovered ingredients
      const recoveredIngredients = { beras: 0, puding: 0, oat: 0, abon: 0, sayurHijau: 0, sayurBrokoli: 0, sayurPutih: 0 };

      outlets.forEach((o) => {
        const sent = distGrid[o.id] || {};
        const retur = freshReturGrid[o.id] || {};

        const processBubur = (dSent: number, iSent: number) => {
          [dSent, iSent].forEach((s, idx) => {
            const retField = idx === 0 ? retur.bubur_d ?? 0 : retur.bubur_i ?? 0;
            if (s > 0) {
              const actualRet = Math.min(retField, s);
              if (actualRet > 0) {
                recoveredIngredients.beras += buburCalc(actualRet, BUBUR_BASE.beras);
                recoveredIngredients.sayurHijau += buburCalc(actualRet, BUBUR_BASE.sayurHijau);
                recoveredIngredients.sayurBrokoli += buburCalc(actualRet, BUBUR_BASE.sayurBrokoli);
                recoveredIngredients.sayurPutih += buburCalc(actualRet, BUBUR_BASE.sayurPutih);
              }
            }
          });
        };
        const processTim = (dSent: number, iSent: number) => {
          [dSent, iSent].forEach((s, idx) => {
            const retField = idx === 0 ? retur.tim_d ?? 0 : retur.tim_i ?? 0;
            if (s > 0) {
              const actualRet = Math.min(retField, s);
              if (actualRet > 0) {
                recoveredIngredients.beras += actualRet * settings.berasTim;
                recoveredIngredients.sayurHijau += actualRet * settings.sayurHijauTim;
                recoveredIngredients.sayurBrokoli += actualRet * settings.sayurBrokoliTim;
                recoveredIngredients.sayurPutih += actualRet * settings.sayurPutihTim;
              }
            }
          });
        };

        processBubur(sent.bubur_d || 0, sent.bubur_i || 0);
        processTim(sent.tim_d || 0, sent.tim_i || 0);

        if (sent.oatmeal > 0) { const ar = Math.min(retur.oatmeal || 0, sent.oatmeal); if (ar > 0) recoveredIngredients.oat += ar * settings.oatmealCup; }
        if (sent.puding > 0) { const ar = Math.min(retur.puding || 0, sent.puding); if (ar > 0) recoveredIngredients.puding += ar * settings.pudingCup; }
        if (sent.abon > 0) { const ar = Math.min(retur.abon || 0, sent.abon); if (ar > 0) recoveredIngredients.abon += ar * settings.abonCup; }
      });

      // Jurnal
      if (totalSalesRevenue > 0) {
        const existingJurnal = (jurnal || []).filter((j: any) => j.tanggal === tanggal && j.ref === "OUT-SALES");
        for (const j of existingJurnal) { await supabase.from("jurnal").delete().eq("id", j.id); }
        await db.addJurnalBulk([
          { tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kodeAkun: "131000", akun: "Piutang usaha", tipe: "Debit", jumlah: totalSalesRevenue, kategori: "Aset" },
          { tanggal, ref: "OUT-SALES", keterangan: `Penjualan Outlet MPASI Tanggal ${tanggal}`, kodeAkun: "410000", akun: "Pendapatan Utama", tipe: "Kredit", jumlah: totalSalesRevenue, kategori: "Pendapatan" }
        ]);
      }

      // Stok retur movements
      const existingReturMov = (stokMov || []).filter((m: any) => m.tanggal === tanggal && m.tipe === "IN" && m.keterangan?.includes("Retur Bahan"));
      for (const m of existingReturMov) { await supabase.from("stok_movement").delete().eq("id", m.id); }

      const movPromises: Promise<any>[] = [];
      if (recoveredIngredients.beras > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-brs01", tipe: "IN", qty: Math.ceil(recoveredIngredients.beras / (bahan.find((x: any) => x.id === "b-brs01")?.konversiGram ?? 600)), keterangan: `Retur Bahan Baku (Pack) [${tanggal}]` }));
      if (recoveredIngredients.puding > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-pud01", tipe: "IN", qty: Math.ceil(recoveredIngredients.puding / (bahan.find((x: any) => x.id === "b-pud01")?.konversiGram ?? 130)), keterangan: `Retur Bahan Baku (sachet) [${tanggal}]` }));
      if (recoveredIngredients.oat > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-oat01", tipe: "IN", qty: Math.ceil(recoveredIngredients.oat / (bahan.find((x: any) => x.id === "b-oat01")?.konversiGram ?? 154)), keterangan: `Retur Bahan Baku (sachet) [${tanggal}]` }));
      if (recoveredIngredients.abon > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-ab01", tipe: "IN", qty: Math.ceil(recoveredIngredients.abon / (bahan.find((x: any) => x.id === "b-ab01")?.konversiGram ?? 10)), keterangan: `Retur Bahan Baku (pcs) [${tanggal}]` }));
      if (recoveredIngredients.sayurHijau > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sh01", tipe: "IN", qty: Math.ceil(recoveredIngredients.sayurHijau), keterangan: `Retur Bahan Baku (gr) [${tanggal}]` }));
      if (recoveredIngredients.sayurBrokoli > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sb01", tipe: "IN", qty: Math.ceil(recoveredIngredients.sayurBrokoli), keterangan: `Retur Bahan Baku (gr) [${tanggal}]` }));
      if (recoveredIngredients.sayurPutih > 1) movPromises.push(db.addStokMov({ tanggal, bahanId: "b-sp01", tipe: "IN", qty: Math.ceil(recoveredIngredients.sayurPutih), keterangan: `Retur Bahan Baku (gr) [${tanggal}]` }));

      if (movPromises.length > 0) { await Promise.all(movPromises); }

      toast.success("Siklus distribusi harian berhasil ditutup! Penjualan dari outlet & retur tercatat.");
      setStep(4);
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

      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;
          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) { rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent)); rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField]; }
          };
          calcRetur("p-bubur", "bubur_d", "bubur_i", sent.bubur_d || 0, sent.bubur_i || 0);
          calcRetur("p-nasitim", "tim_d", "tim_i", sent.tim_d || 0, sent.tim_i || 0);
          rGrid[o.id].oatmeal = Math.max(0, (sent.oatmeal || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-oatmeal").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].puding = Math.max(0, (sent.puding || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-puding").reduce((s: number, p: any) => s + p.qty, 0));
          rGrid[o.id].abon = Math.max(0, (sent.abon || 0) - existingSales.filter((p: any) => p.outletId === o.id && p.produkId === "p-abon").reduce((s: number, p: any) => s + p.qty, 0));
        });
      }
      setReturGrid(rGrid);
      lastSyncedSalesRef.current = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;
    } catch (err) { console.error("Auto-refresh returGrid failed:", err); }
    finally { setRefreshing(false); }
  }, [tanggal, outlets, penjualan, distGrid, refreshing]);

  useEffect(() => {
    window.addEventListener("buba_penjualan_saved", handleAutoRefresh);
    return () => window.removeEventListener("buba_penjualan_saved", handleAutoRefresh);
  }, [handleAutoRefresh]);

  const handleRefreshStep5 = async () => {
    setRefreshing(true);
    try {
      hasUserModifiedGrids.current = false;
      const rGrid: Record<string, Record<string, number>> = {};
      outlets.forEach(o => { rGrid[o.id] = { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 }; });

      const existingSales = penjualan.filter((p: any) => p.tanggal === tanggal);
      if (existingSales.length > 0) {
        outlets.forEach((o) => {
          const sent = distGrid[o.id] || {};
          if (!sent) return;
          const calcRetur = (baseId: string, dField: string, iField: string, dSent: number, iSent: number) => {
            const totalSent = dSent + iSent;
            const sold = existingSales.filter((p: any) => p.outletId === o.id && p.produkId === baseId).reduce((s: number, p: any) => s + p.qty, 0);
            const totalRetur = Math.max(0, totalSent - sold);
            if (totalSent > 0) { rGrid[o.id][dField] = Math.round(totalRetur * (dSent / totalSent)); rGrid[o.id][iField] = totalRetur - rGrid[o.id][dField]; }
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
      lastSyncedSalesRef.current = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.length;
      setRefreshing(false);
    }
  };

  const hasNewSalesData = useMemo(() => {
    const currentSig = penjualan.filter((p: any) => p.tanggal === tanggal).reduce((s: number, p: any) => s + p.qty, 0).toString() + "-" + penjualan.filter((p: any) => p.tanggal === tanggal).length;
    return currentSig !== lastSyncedSalesRef.current && lastSyncedSalesRef.current !== "";
  }, [penjualan, tanggal]);

  // ============ RENDER FUNCTIONS ============

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
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" onClick={() => { const idx = outlets.findIndex((o: any) => o.id === step4OutletId); if (idx > 0) setStep4OutletId(outlets[idx - 1].id); }} disabled={outlets.findIndex((o: any) => o.id === step4OutletId) <= 0} className="h-11 w-11">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Select value={step4OutletId} onValueChange={setStep4OutletId}>
                    <SelectTrigger className="h-11 font-semibold text-sm"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                    <SelectContent>
                      {outlets.map((o: any) => <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" onClick={() => { const idx = outlets.findIndex((o: any) => o.id === step4OutletId); if (idx < outlets.length - 1) setStep4OutletId(outlets[idx + 1].id); }} disabled={outlets.findIndex((o: any) => o.id === step4OutletId) >= outlets.length - 1} className="h-11 w-11">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {(() => {
              const row = distGrid[step4OutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
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
                      <Input type="number" min={0} value={(row as any)[item.field] || ""} onChange={(e) => handleDistChange(step4OutletId, item.field, parseInt(e.target.value))} className={`h-9 text-xs text-center ${item.colorClass} focus-visible:ring-amber-500 font-semibold`} placeholder="0" />
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
                      const isSelected = o.id === step4OutletId;
                      return (
                        <TableRow key={o.id} onClick={() => setStep4OutletId(o.id)} className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/30"}`}>
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
            <Button onClick={saveStep4} className="gradient-primary text-primary-foreground hover-lift h-10">
              <Check className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Konfirmasi Pengiriman & Lanjutkan</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderStep5() {
    return (
      <Card className="glass border-0 shadow-card">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Langkah 5: Retur & Penjualan Akhir Hari</CardTitle>
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
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pilih Outlet</Label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => { const idx = outlets.findIndex((o: any) => o.id === step5OutletId); if (idx > 0) setStep5OutletId(outlets[idx - 1].id); }} disabled={outlets.findIndex((o: any) => o.id === step5OutletId) <= 0} className="h-11 w-11">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Select value={step5OutletId} onValueChange={setStep5OutletId}>
                  <SelectTrigger className="h-11 font-semibold text-sm"><SelectValue placeholder="Pilih Outlet" /></SelectTrigger>
                  <SelectContent>
                    {outlets.map((o: any) => <SelectItem key={o.id} value={o.id} className="font-medium text-xs">{o.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="icon" onClick={() => { const idx = outlets.findIndex((o: any) => o.id === step5OutletId); if (idx < outlets.length - 1) setStep5OutletId(outlets[idx + 1].id); }} disabled={outlets.findIndex((o: any) => o.id === step5OutletId) >= outlets.length - 1} className="h-11 w-11">
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Retur Input Fields */}
          {(() => {
            const row = returGrid[step5OutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
            const sent = distGrid[step5OutletId] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };

            const returItems = [
              { field: "bubur_d", label: `Bubur ${bubur1Name}`, gramFactor: 118, sent: sent.bubur_d || 0, colorClass: "text-amber-600 border-amber-300/80" },
              { field: "bubur_i", label: `Bubur ${bubur2Name}`, gramFactor: 118, sent: sent.bubur_i || 0, colorClass: "text-blue-600 border-blue-300/80" },
              { field: "tim_d", label: `Tim ${tim1Name}`, gramFactor: 108, sent: sent.tim_d || 0, colorClass: "text-amber-600 border-amber-300/80" },
              { field: "tim_i", label: `Tim ${tim2Name}`, gramFactor: 108, sent: sent.tim_i || 0, colorClass: "text-blue-600 border-blue-300/80" },
              { field: "oatmeal", label: "Oatmeal", gramFactor: 100, sent: sent.oatmeal || 0, colorClass: "text-muted-foreground" },
              { field: "puding", label: "Puding", gramFactor: 80, sent: sent.puding || 0, colorClass: "text-muted-foreground" },
              { field: "abon", label: "Abon", gramFactor: 10, sent: sent.abon || 0, colorClass: "text-muted-foreground" },
            ];

            return (
              <div className="bg-muted/30 p-5 rounded-2xl border space-y-4 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {returItems.map((item) => {
                    const returVal = (row as any)[item.field] || 0;
                    const returCups = item.field === "abon" ? Math.floor(returVal / 10) : Math.floor(returVal / item.gramFactor);
                    const sold = Math.max(0, item.sent - Math.min(returCups, item.sent));
                    const isBuburTim = ["bubur_d", "bubur_i", "tim_d", "tim_i"].includes(item.field);
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
                            max={item.sent * item.gramFactor}
                            value={returVal || ""}
                            onChange={(e) => handleReturChange(step5OutletId, item.field, parseInt(e.target.value) || 0)}
                            className={`h-10 font-semibold ${item.colorClass}`}
                            placeholder="0"
                          />
                          {isBuburTim && (
                            <p className="text-[11px] text-emerald-600 font-medium mt-1">✨ {returCups} cup (@ {item.gramFactor}g)</p>
                          )}
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
                          <span>Retur: <strong className="text-foreground">{returCups} {unitLabel}</strong></span>
                          <span>Terjual: <strong className="text-primary">{sold} {unitLabel}</strong></span>
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
                      {["Bubur", "Tim", "Oatmeal", "Puding", "Abon"].map(h => <TableHead key={h} className="text-center font-bold text-xs">{h}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outlets.map((o: any) => {
                      const row = returGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
                      const sent = distGrid[o.id] || { bubur_d: 0, bubur_i: 0, tim_d: 0, tim_i: 0, oatmeal: 0, puding: 0, abon: 0 };
                      const isSelected = o.id === step5OutletId;

                      const calcSold = (sent: number, returCups: number) => Math.max(0, sent - Math.min(returCups, sent));

                      const buburRet = Math.floor(((row.bubur_d || 0) + (row.bubur_i || 0)) / 118);
                      const buburSent = (sent.bubur_d || 0) + (sent.bubur_i || 0);
                      const timRet = Math.floor(((row.tim_d || 0) + (row.tim_i || 0)) / 108);
                      const timSent = (sent.tim_d || 0) + (sent.tim_i || 0);
                      const oatRet = Math.floor((row.oatmeal || 0) / 100);
                      const oatSent = sent.oatmeal || 0;
                      const pudRet = Math.floor((row.puding || 0) / 80);
                      const pudSent = sent.puding || 0;
                      const abonRet = row.abon || 0; // returGrid stores pcs directly for abon
                      const abonSent = sent.abon || 0;

                      return (
                        <TableRow key={o.id} onClick={() => setStep5OutletId(o.id)} className={`cursor-pointer transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/30"}`}>
                          <TableCell className="font-semibold py-3">{o.nama}</TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive">{buburRet}</span> / <span className="text-primary font-semibold">{calcSold(buburSent, buburRet)}</span>
                            <div className="text-[9px] text-muted-foreground">ret/terj</div>
                          </TableCell>
                          <TableCell className="text-center py-2.5 text-xs">
                            <span className="text-destructive">{timRet}</span> / <span className="text-primary font-semibold">{calcSold(timSent, timRet)}</span>
                            <div className="text-[9px] text-muted-foreground">ret/terj</div>
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

          <div className="flex justify-between items-center border-t pt-6">
            <Button variant="outline" onClick={() => setStep(4)} className="h-10">
              <ArrowLeft className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Kembali</span>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefreshStep5} disabled={refreshing} className="h-10">
                <RotateCcw className={`h-4 w-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Muat Ulang
              </Button>
              <Button onClick={saveStep5} disabled={closingCycle} className="gradient-primary text-primary-foreground hover-lift h-10">
                <Check className="h-4 w-4 md:mr-2" /><span className="hidden md:inline">Selesaikan & Tutup Siklus</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ============ MAIN RENDER ============
  const distSteps = [
    { num: 4, label: "Distribusi" },
    { num: 5, label: "Retur & Penjualan" },
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
              <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className="h-10 font-semibold" />
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
      {step === 4 && renderStep4()}
      {step === 5 && renderStep5()}
    </div>
  );
}
