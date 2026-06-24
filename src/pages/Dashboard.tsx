import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDB } from "@/lib/store";
import { rupiah, todayISO, monthKey, DateRange, inRange, daysAgoISO } from "@/lib/format";
import { ShoppingCart, TrendingUp, ChefHat, Store } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Dashboard() {
  const { penjualan, produksi, outlets, produk } = useDB();
  const { user } = useAuth();
  const today = todayISO();
  const m = monthKey(today);
  const [range, setRange] = useState<DateRange>({ from: daysAgoISO(13), to: today });

  // Scope penjualan by user role
  const scopedPenjualan = useMemo(
    () => (user?.role === "outlet" ? penjualan.filter((p) => p.outletId === user.outletId) : penjualan),
    [penjualan, user]
  );

  const totalToday = scopedPenjualan.filter((p) => p.tanggal === today).reduce((s, p) => s + p.total, 0);
  const totalMonth = scopedPenjualan.filter((p) => monthKey(p.tanggal) === m).reduce((s, p) => s + p.total, 0);
  const qtyToday = scopedPenjualan.filter((p) => p.tanggal === today).reduce((s, p) => s + p.qty, 0);
  const planToday = produksi.filter((p) => p.tanggal === today).reduce((s, p) => s + p.qtyRencana, 0);

  // Tren by range
  const days = useMemo(() => {
    const start = range.from ?? daysAgoISO(13);
    const end = range.to ?? today;
    const result: { tanggal: string; omzet: number }[] = [];
    const cur = new Date(start);
    const last = new Date(end);
    while (cur <= last) {
      const iso = cur.toISOString().slice(0, 10);
      result.push({
        tanggal: iso.slice(5),
        omzet: scopedPenjualan.filter((p) => p.tanggal === iso).reduce((s, p) => s + p.total, 0),
      });
      cur.setDate(cur.getDate() + 1);
    }
    return result.slice(-31);
  }, [scopedPenjualan, range, today]);

  const perOutlet = outlets.map((o) => ({
    nama: o.nama,
    omzet: penjualan.filter((p) => p.outletId === o.id && inRange(p.tanggal, range)).reduce((s, p) => s + p.total, 0),
  })).sort((a, b) => b.omzet - a.omzet).slice(0, 7);

  const stats = [
    { label: "Penjualan Hari Ini", value: rupiah(totalToday), icon: ShoppingCart, sub: `${qtyToday} cup terjual` },
    { label: "Penjualan Bulan Ini", value: rupiah(totalMonth), icon: TrendingUp, sub: m },
    { label: "Rencana Produksi Hari Ini", value: `${planToday}`, icon: ChefHat, sub: "porsi" },
    { label: user?.role === "outlet" ? "Outlet Anda" : "Outlet Aktif", value: user?.role === "outlet" ? user.nama : `${outlets.length}`, icon: Store, sub: `${produk.length} produk` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Dashboard</h1>
          <p className="text-muted-foreground">Ringkasan operasional Buba Healthy</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="glass hover-lift border-0 shadow-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{s.label}</div>
                  <div className="text-2xl font-bold mt-1">{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.sub}</div>
                </div>
                <div className="h-11 w-11 rounded-2xl gradient-primary flex items-center justify-center shadow-soft">
                  <s.icon className="h-5 w-5 text-primary-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 glass border-0 shadow-card">
          <CardHeader><CardTitle>Tren Penjualan</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="tanggal" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => rupiah(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Line type="monotone" dataKey="omzet" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="glass border-0 shadow-card">
          <CardHeader><CardTitle>Top Outlet (Periode)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perOutlet} layout="vertical" margin={{ top: 10, right: 15, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="nama" type="category" width={90} fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <Tooltip formatter={(v: number) => rupiah(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Bar dataKey="omzet" fill="hsl(var(--primary))" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="glass border-0 shadow-card">
        <CardHeader><CardTitle>Produksi vs Penjualan Hari Ini</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={produk.map((pr) => ({
                nama: pr.nama,
                produksi: produksi.filter((p) => p.tanggal === today && p.produkId === pr.id).reduce((s, p) => s + p.qtyRencana, 0),
                penjualan: scopedPenjualan.filter((p) => p.tanggal === today && p.produkId === pr.id).reduce((s, p) => s + p.qty, 0),
              }))}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="nama" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
              <Legend />
              <Bar dataKey="produksi" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
              <Bar dataKey="penjualan" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
