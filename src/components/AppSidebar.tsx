import { LayoutDashboard, ShoppingCart, Factory, FileBarChart, BookOpen, Settings, ChevronsLeft, ChevronsRight, Warehouse, UserCheck, FileText } from "lucide-react";
import { NavLink } from "react-router-dom";
import logo from "@/assets/logo.jpg";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const items = isAdmin
    ? [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Absensi", url: "/absensi", icon: UserCheck },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        { title: "Produksi", url: "/produksi", icon: Factory },
        { title: "Stok Gudang", url: "/stok", icon: Warehouse },
        { title: "Laporan", url: "/laporan", icon: FileBarChart },
        { title: "Keuangan", url: "/keuangan", icon: BookOpen },
        { title: "Master Data", url: "/master", icon: Settings },
      ]
    : [
        { title: "Home", url: "/", icon: LayoutDashboard },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        { title: "Absensi", url: "/absensi", icon: UserCheck },
        { title: "Slip Gaji", url: "/slip-gaji", icon: FileText },
        { title: "Logistik", url: "/stok", icon: Warehouse },
      ];

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* Custom gradient overlay over sidebar */}
      <div
        className="absolute inset-0 pointer-events-none opacity-90"
        style={{
          background:
            "linear-gradient(180deg, hsl(142 72% 22%) 0%, hsl(142 72% 26%) 50%, hsl(142 60% 20%) 100%)",
        }}
      />

      {/* Geometric decorative graphics — clipped within sidebar bounds */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.07]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="sb-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0H0V24" fill="none" stroke="hsl(95 80% 70%)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sb-grid)" />
        </svg>
        {!collapsed && (
          <>
            <div className="absolute top-1/4 -left-6 w-24 h-24 rotate-45 border-2 border-accent/20 rounded-2xl" />
            <div className="absolute bottom-1/3 -right-8 w-32 h-32 rotate-12 border border-accent/15 rounded-full" />
            <div className="absolute top-2/3 left-4 w-3 h-3 rounded-full bg-accent/40" />
            <div className="absolute top-[45%] right-6 w-2 h-2 rounded-full bg-accent/50" />
          </>
        )}
        {/* Lime accent glow */}
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-30 blur-3xl"
             style={{ background: "hsl(95 70% 55%)" }} />
        <div className="absolute bottom-20 left-0 w-24 h-24 rounded-full opacity-20 blur-3xl"
             style={{ background: "hsl(95 80% 50%)" }} />
      </div>

      <SidebarHeader className="relative border-b border-white/10 p-3">
        <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
          <div className="h-10 w-10 shrink-0 rounded-xl bg-white p-0.5 shadow-soft ring-2 ring-accent/40">
            <img src={logo} alt="Buba Healthy logo" className="h-full w-full rounded-lg object-contain" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0 flex-1">
              <div className="font-bold text-white truncate">Buba Healthy</div>
              <div className="text-[10px] text-white/70 truncate">Sistem Penjualan MPASI</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="relative">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-white/60 text-[10px] uppercase tracking-wider">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title} className="my-1">
                  <SidebarMenuButton
                    asChild
                    tooltip={collapsed ? item.title : undefined}
                    className="h-auto min-h-[3.25rem] p-0 overflow-visible bg-transparent hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent"
                  >
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        `relative flex items-center gap-3 w-full h-full ${collapsed ? "justify-center px-3 py-3" : "pl-5 pr-5 py-3"} rounded-xl transition-all ${
                          isActive
                            ? "bg-gradient-to-r from-accent/45 via-accent/25 to-accent/10 text-accent font-semibold shadow-soft border border-accent/50 backdrop-blur-sm"
                            : "text-white hover:bg-white/10 hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-accent" : "text-white"}`} />
                          {!collapsed && <span className={`text-sm leading-snug ${isActive ? "text-accent" : "text-white"}`}>{item.title}</span>}
                        </>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="relative border-t border-white/10 p-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={`w-full ${collapsed ? "justify-center px-0" : "justify-end"} gap-2 text-white/80 hover:text-white hover:bg-white/10`}
          aria-label={collapsed ? "Perbesar sidebar" : "Minimize sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <>
              <span className="text-xs">Minimize</span>
              <ChevronsLeft className="h-4 w-4" />
            </>
          )}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
