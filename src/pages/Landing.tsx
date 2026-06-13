import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, Factory, FileBarChart, BookOpen, LogIn, ArrowRight,
  Sparkles, ShieldCheck, Smartphone,
} from "lucide-react";
import logo from "@/assets/logo.jpg";

const features = [
  { icon: ShoppingCart, title: "Input Penjualan", desc: "Catat transaksi cup harian per outlet, langsung total otomatis." },
  { icon: Factory, title: "Rencana Produksi", desc: "Plan vs realisasi vs penjualan — stok aman, no waste." },
  { icon: FileBarChart, title: "Laporan Otomatis", desc: "Rekap harian, mingguan, bulanan. Export Excel sekali klik." },
  { icon: BookOpen, title: "Jurnal & Neraca", desc: "Pembukuan sederhana: jurnal umum, neraca, laba rugi." },
];

const stats = [
  { k: "17", v: "Outlet aktif" },
  { k: "6", v: "Produk MPASI" },
  { k: "100%", v: "Offline ready" },
];

export default function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen ambient-bg">
      {/* Nav */}
      <header className="sticky top-0 z-30 glass border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Buba Healthy" className="h-9 w-9 rounded-xl object-cover bg-white shadow-soft" />
            <div className="leading-tight">
              <div className="font-bold text-sm">Buba Healthy</div>
              <div className="text-[10px] text-muted-foreground">Sistem Penjualan MPASI</div>
            </div>
          </div>
          <Button asChild size="sm" className="gradient-primary text-primary-foreground hover-lift">
            <Link to="/login"><LogIn className="mr-1.5 h-4 w-4" />Masuk</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-10 pb-12 md:pt-20 md:pb-20 grid md:grid-cols-2 gap-10 items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 text-accent-foreground text-xs font-medium border border-accent/30">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Dashboard operasional MPASI
          </div>
          <h1 className="text-4xl md:text-5xl font-bold leading-[1.1]">
            Pantau penjualan, produksi & keuangan{" "}
            <span className="text-gradient">17 outlet</span> dalam satu dasbor.
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-md">
            Input cepat di outlet, rekap otomatis untuk owner. Tanpa setup rumit, jalan langsung di browser & HP.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg" className="gradient-primary text-primary-foreground hover-lift">
              <Link to="/login">Mulai Sekarang <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="hover-lift">
              <a href="#fitur">Lihat Fitur</a>
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-4 max-w-md">
            {stats.map((s) => (
              <div key={s.v} className="glass rounded-2xl p-3 text-center hover-lift">
                <div className="text-xl md:text-2xl font-bold text-primary">{s.k}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mock dashboard preview */}
        <div className="relative">
          <div className="absolute -inset-4 gradient-primary rounded-3xl opacity-20 blur-2xl" />
          <div className="relative glass-strong rounded-3xl p-4 shadow-soft border border-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <div className="h-2 w-2 rounded-full bg-warning" />
              <div className="h-2 w-2 rounded-full bg-success" />
              <div className="ml-auto text-[10px] text-muted-foreground">buba-healthy.app</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: "Penjualan Hari Ini", v: "Rp 1.245K" },
                { l: "Cup Terjual", v: "284" },
                { l: "Outlet Aktif", v: "17" },
                { l: "Stok Aman", v: "94%" },
              ].map((c) => (
                <div key={c.l} className="rounded-2xl bg-card border p-3">
                  <div className="text-[10px] text-muted-foreground">{c.l}</div>
                  <div className="text-lg font-bold text-primary mt-0.5">{c.v}</div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-card border p-3">
              <div className="text-xs text-muted-foreground mb-2">Tren Penjualan</div>
              <div className="flex items-end gap-1 h-20">
                {[40, 65, 50, 80, 70, 90, 75, 95, 60, 85, 100, 78].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-md gradient-primary opacity-90"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-bold">
            Fitur <span className="text-gradient">lengkap</span> untuk operasional harian
          </h2>
          <p className="text-muted-foreground mt-2 text-sm md:text-base">
            Dirancang untuk admin & outlet — sederhana di-input, kaya di-laporkan.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f) => (
            <div key={f.title} className="glass rounded-2xl p-5 hover-lift border border-border/50">
              <div className="h-11 w-11 rounded-2xl gradient-primary flex items-center justify-center shadow-soft mb-3">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="font-semibold mb-1">{f.title}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="glass-strong rounded-3xl p-6 md:p-10 grid md:grid-cols-3 gap-6 border border-border/50">
          {[
            { icon: ShieldCheck, t: "Role admin & outlet", d: "Hak akses terpisah, outlet hanya melihat datanya." },
            { icon: Smartphone, t: "Mobile friendly", d: "Bottom nav untuk input cepat di outlet." },
            { icon: Sparkles, t: "Import Excel", d: "Migrasi data lama tinggal upload .xlsx." },
          ].map((c) => (
            <div key={c.t} className="flex gap-3">
              <div className="h-10 w-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center shrink-0">
                <c.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold">{c.t}</div>
                <div className="text-sm text-muted-foreground">{c.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 pb-16 md:pb-24 text-center">
        <h3 className="text-2xl md:text-3xl font-bold mb-3">Siap mulai?</h3>
        <p className="text-muted-foreground mb-5">Masuk dengan akun admin atau outlet Anda.</p>
        <Button asChild size="lg" className="gradient-primary text-primary-foreground hover-lift">
          <Link to="/login">Masuk ke Dashboard <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Buba Healthy · Sistem Informasi Penjualan MPASI
      </footer>
    </div>
  );
}
