import { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { LogIn, Eye, EyeOff, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.jpg";

export default function Login() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username.trim(), password);
    if (success) {
      toast.success("Login berhasil");
      nav("/", { replace: true });
    } else {
      toast.error("Username atau password salah");
    }
  };

  return (
    <div className="min-h-screen ambient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link
          to="/welcome"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Kembali ke beranda
        </Link>

        <Card className="glass-strong border-0 shadow-soft">
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <img src={logo} alt="Buba Healthy" className="h-12 w-12 rounded-xl object-cover bg-white shadow-soft" />
              <div className="leading-tight">
                <div className="font-bold text-lg text-gradient">Buba Healthy</div>
                <div className="text-xs text-muted-foreground">Sistem Penjualan MPASI</div>
              </div>
            </div>
            <h2 className="text-2xl font-bold mb-1">Masuk ke akun Anda</h2>
            <p className="text-sm text-muted-foreground mb-6">Gunakan kredensial admin atau outlet.</p>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin atau nama-outlet"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full gradient-primary text-primary-foreground hover-lift">
                <LogIn className="mr-2 h-4 w-4" /> Masuk
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
