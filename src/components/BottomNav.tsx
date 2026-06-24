import { useState, useRef, useEffect, useMemo } from "react";
import { LayoutDashboard, ShoppingCart, FileBarChart, Warehouse, UserCheck, ChevronUp, FileText, ChefHat, User } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useDB, db } from "@/lib/store";
import { todayISO } from "@/lib/format";
import { toast } from "sonner";

export function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { absensi = [] } = useDB();

  const todayRecord = useMemo(() => {
    if (!user) return null;
    const kid = user.role === "produksi" ? "k-produksi" : (user.role === "outlet" ? `k-${user.outletId}-1` : null);
    if (!kid) return null;
    return absensi.find((a: any) => a.tanggal === todayISO() && a.karyawanId === kid);
  }, [absensi, user]);

  const isClockedIn = todayRecord && todayRecord.status === "Hadir" && !todayRecord.jamPulang;

  const currentTime = () => {
    const w = new Date();
    return `${String(w.getHours()).padStart(2, "0")}:${String(w.getMinutes()).padStart(2, "0")}`;
  };

  const items = (() => {
    if (user?.role === "admin") {
      return [
        { title: "Dashboard", url: "/", icon: LayoutDashboard },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        { title: "Absensi", url: "/absensi", icon: UserCheck, highlighted: true },
        {
          title: "Logistik",
          icon: Warehouse,
          subItems: [
            { title: "Stok Gudang", url: "/stok" },
            { title: "Produksi", url: "/produksi" },
          ]
        },
        {
          title: "Laporan",
          icon: FileBarChart,
          subItems: [
            { title: "Laporan Utama", url: "/laporan" },
            { title: "Keuangan", url: "/keuangan" },
          ]
        },
      ];
    } else if (user?.role === "produksi") {
      return [
        { title: "Home", url: "/", icon: LayoutDashboard },
        { title: "Stok", url: "/stok", icon: Warehouse },
        { title: "Produksi", url: "/produksi", icon: ChefHat, highlighted: true },
        { title: "Absen", url: "/absensi", icon: UserCheck },
        { title: "Profile", url: "/profile", icon: User },
      ];
    } else { // outlet
      return [
        { title: "Home", url: "/", icon: LayoutDashboard },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        { title: "Absen", url: "/absensi", icon: UserCheck, highlighted: true },
        { title: "Stok", url: "/stok", icon: Warehouse },
        { title: "Profile", url: "/profile", icon: User },
      ];
    }
  })();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close dropdown on route change
  useEffect(() => {
    setActiveDropdown(null);
  }, [location.pathname]);

  const getFilteredSubItems = (subItems?: any[]) => {
    if (!subItems) return [];
    return subItems;
  };

  return (
    <div ref={containerRef}>
      {/* Dropdown menus */}
      {items.map((item) => {
        if (!item.subItems) return null;
        const filteredSubItems = getFilteredSubItems(item.subItems);
        if (filteredSubItems.length === 0) return null;

        const isOpen = activeDropdown === item.title;

        return (
          <div
            key={`dropdown-${item.title}`}
            style={{
              bottom: "calc(52px + env(safe-area-inset-bottom))"
            }}
            className={`md:hidden fixed left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-[320px] bg-background/95 backdrop-blur-md border border-border/80 border-b-0 rounded-t-2xl shadow-[0_-12px_30px_rgba(0,0,0,0.12)] p-2 pb-5 transition-all duration-300 ease-out ${
              isOpen
                ? "translate-y-0 opacity-100"
                : "translate-y-full opacity-0 pointer-events-none"
            }`}
          >
            <div className="text-[10px] font-bold text-muted-foreground uppercase px-3 py-1.5 border-b border-border/50 mb-1">
              Pilih Menu {item.title}
            </div>
            <div className="flex flex-col gap-1">
              {filteredSubItems.map((sub) => {
                const isSubActive = location.pathname === sub.url;
                return (
                  <button
                    key={sub.url}
                    onClick={() => {
                      navigate(sub.url);
                      setActiveDropdown(null);
                    }}
                    className={`flex items-center justify-between w-full px-3 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                      isSubActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span>{sub.title}</span>
                    {isSubActive && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex justify-around items-center">
          {items.map((item) => {
            const hasSub = !!item.subItems;
            const filteredSubItems = getFilteredSubItems(item.subItems);
            
            // If it has sub-items but only one of them is accessible for the current user,
            // we treat it as a direct link, rather than showing a dropdown.
            const treatAsDirectLink = !hasSub || filteredSubItems.length === 1;

            if (!treatAsDirectLink) {
              const isDropdownOpen = activeDropdown === item.title;
              const isActive = filteredSubItems.some((sub) => location.pathname === sub.url);
              return (
                <li key={item.title} className="flex-1 min-w-[64px]">
                  <button
                    type="button"
                    onClick={() => setActiveDropdown(isDropdownOpen ? null : item.title)}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2 w-full text-[10px] font-medium transition-all ${
                      isActive || isDropdownOpen ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div
                      className={`h-9 w-9 flex items-center justify-center rounded-2xl transition-all ${
                        isActive || isDropdownOpen ? "gradient-primary text-primary-foreground shadow-soft scale-105" : ""
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className="flex items-center gap-0.5">
                      {item.title}
                      <ChevronUp className={`h-3 w-3 transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                </li>
              );
            }

            const targetUrl = hasSub ? filteredSubItems[0].url : item.url!;
            let displayTitle = item.title;
            if (item.title === "Logistik" && hasSub && filteredSubItems.length === 1) {
              displayTitle = "Stok";
            } else if (item.title === "Laporan" && hasSub && filteredSubItems.length === 1) {
              displayTitle = "Laporan";
            }

            if (item.highlighted) {
              const isAbsenMenu = item.url === "/absensi";
              const isActive = location.pathname === targetUrl;
              
              let bgClass = "";
              let textClass = "";
              
              if (isAbsenMenu && user?.role === "outlet") {
                if (isClockedIn) {
                  bgClass = "bg-red-500 border border-transparent text-white hover:bg-red-600 shadow-[0_4px_12px_rgba(239,68,68,0.3)]";
                  textClass = "text-red-500 font-bold";
                } else {
                  bgClass = "bg-emerald-600 border border-transparent text-white hover:bg-emerald-700 shadow-[0_4px_12px_rgba(5,150,105,0.3)]";
                  textClass = "text-emerald-600 font-bold";
                }
              } else {
                if (isActive) {
                  bgClass = "gradient-primary border border-transparent text-primary-foreground shadow-soft scale-105";
                  textClass = "text-primary font-bold";
                } else {
                  bgClass = "bg-transparent border border-muted-foreground/35 text-muted-foreground hover:text-foreground";
                  textClass = "text-muted-foreground";
                }
              }

              const handleMiddleButtonClick = () => {
                if (isAbsenMenu && user?.role === "outlet" && isClockedIn) {
                  const confirmCheckOut = window.confirm("Apakah Anda yakin ingin melakukan Absen Pulang (Keluar)?");
                  if (confirmCheckOut) {
                    db.updateAbsensi(todayRecord.id, {
                      jamPulang: currentTime(),
                      catatan: todayRecord.catatan ? `${todayRecord.catatan}. Pulang via Bottom Nav` : "Pulang via Bottom Nav"
                    });
                    toast.success("Berhasil Absen Pulang!");
                  }
                }
                navigate(targetUrl);
              };

              return (
                <li key={item.title} className="flex-1 min-w-[64px] flex justify-center z-10">
                  <button
                    type="button"
                    onClick={handleMiddleButtonClick}
                    className="flex flex-col items-center justify-center gap-0.5 py-1 w-full"
                  >
                    <div
                      className={`h-12 w-12 flex items-center justify-center rounded-full transition-all relative -top-2.5 ${bgClass}`}
                    >
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className={`text-[10px] mt-1 transition-colors ${textClass}`}>
                      {displayTitle}
                    </span>
                  </button>
                </li>
              );
            }

            return (
              <li key={item.title} className="flex-1 min-w-[64px]">
                <NavLink
                  to={targetUrl}
                  end
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all ${
                      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div
                        className={`h-9 w-9 flex items-center justify-center rounded-2xl transition-all ${
                          isActive ? "gradient-primary text-primary-foreground shadow-soft scale-105" : ""
                        }`}
                      >
                        <item.icon className="h-5 w-5" />
                      </div>
                      <span>{displayTitle}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
