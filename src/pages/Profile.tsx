import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useDB } from "@/lib/store";
import { LogOut, User, ShieldAlert, Store, ShieldCheck, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Profile() {
  const { user, logout } = useAuth();
  const { outlets } = useDB();

  if (!user) return null;

  const userOutlet = outlets.find((o) => o.id === user.outletId);

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "Administrator";
      case "produksi":
        return "Kepala Produksi";
      case "outlet":
        return "Staff Outlet";
      default:
        return role;
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "admin":
        return <ShieldAlert className="h-5 w-5 text-red-500" />;
      case "produksi":
        return <ShieldCheck className="h-5 w-5 text-amber-500" />;
      case "outlet":
        return <Store className="h-5 w-5 text-emerald-500" />;
      default:
        return <User className="h-5 w-5" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "produksi":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "outlet":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-6 max-w-xl mx-auto py-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gradient">Profil Saya</h1>
        <p className="text-sm text-muted-foreground">Informasi detail akun Anda di Buba Healthy</p>
      </div>

      <Card className="glass border-0 shadow-card overflow-hidden relative">
        {/* Visual premium background glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 rounded-full bg-accent/10 blur-2xl pointer-events-none" />

        <CardHeader className="text-center pb-2 border-b border-border/40 relative">
          <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-tr from-primary to-accent p-0.5 shadow-md flex items-center justify-center mb-4">
            <div className="h-full w-full rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-primary dark:text-accent font-black text-2xl shadow-inner">
              {user.nama.charAt(0).toUpperCase()}
            </div>
          </div>
          <CardTitle className="text-xl font-bold">{user.nama}</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">@{user.username}</p>
          <div className="flex justify-center mt-3">
            <Badge variant="outline" className={`gap-1.5 px-3 py-1 font-bold text-xs uppercase tracking-wider ${getRoleBadgeColor(user.role)}`}>
              {getRoleIcon(user.role)}
              {getRoleLabel(user.role)}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between py-2 border-b border-border/20 text-sm">
              <span className="text-muted-foreground font-medium">Username</span>
              <span className="font-semibold text-foreground">{user.username}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/20 text-sm">
              <span className="text-muted-foreground font-medium">Hak Akses</span>
              <span className="font-semibold text-foreground capitalize">{user.role}</span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border/20 text-sm">
              <span className="text-muted-foreground font-medium">Penugasan / Lokasi</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                {user.role === "outlet" && userOutlet ? (
                  <span>{userOutlet.nama}</span>
                ) : (
                  <span>Dapur Utama (Pusat)</span>
                )}
              </span>
            </div>
          </div>

          <div className="pt-4">
            <Button
              onClick={logout}
              variant="destructive"
              className="w-full h-12 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold shadow-md hover-lift gap-2"
            >
              <LogOut className="h-4 w-4" /> Keluar dari Sistem
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
