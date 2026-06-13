import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { Outlet } from "react-router-dom";
import logo from "@/assets/logo.jpg";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck, Store } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full ambient-bg">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b border-border/40 glass sticky top-0 z-20 px-3 gap-3">
            <div className="flex md:hidden items-center gap-2">
              <img src={logo} alt="Buba Healthy" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-bold text-gradient">Buba Healthy</span>
            </div>
            <div className="hidden sm:block ml-2 text-sm text-muted-foreground truncate">
              Sistem Informasi Penjualan MPASI
            </div>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2.5 h-10 px-3 bg-transparent border-border/60 hover:bg-accent/10 hover:border-accent/50 hover:text-foreground rounded-full"
                  >
                    <div className="h-7 w-7 rounded-full bg-transparent border-2 border-primary/60 flex items-center justify-center text-primary text-xs font-bold">
                      {user?.nama.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden sm:block text-left leading-tight">
                      <div className="text-sm font-medium">{user?.nama}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {isAdmin ? <ShieldCheck className="h-3 w-3" /> : <Store className="h-3 w-3" />}
                        {isAdmin ? "Admin" : "Outlet"}
                      </div>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium">{user?.nama}</div>
                    <div className="text-xs text-muted-foreground font-normal">@{user?.username}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive">
                    <LogOut className="h-4 w-4 mr-2" />
                    Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 p-3 md:p-6 max-w-[1600px] w-full mx-auto pb-24 md:pb-6 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
        <BottomNav isAdmin={isAdmin} />
      </div>
    </SidebarProvider>
  );
}
