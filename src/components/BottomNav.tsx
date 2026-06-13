import { useState, useRef, useEffect } from "react";
import { LayoutDashboard, ShoppingCart, FileBarChart, Warehouse, UserCheck, ChevronUp, FileText } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

interface Props {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin = false }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = isAdmin
    ? [
        {
          title: "Logistik",
          icon: Warehouse,
          subItems: [
            { title: "Stok Gudang", url: "/stok" },
            { title: "Produksi", url: "/produksi", admin: true },
          ]
        },
        { title: "Home", url: "/", icon: LayoutDashboard },
        { title: "Absensi", url: "/absensi", icon: UserCheck },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        {
          title: "Laporan",
          icon: FileBarChart,
          subItems: [
            { title: "Laporan Utama", url: "/laporan" },
            { title: "Keuangan", url: "/keuangan", admin: true },
          ]
        },
      ]
    : [
        { title: "Home", url: "/", icon: LayoutDashboard },
        { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
        { title: "Absensi", url: "/absensi", icon: UserCheck },
        { title: "Slip Gaji", url: "/slip-gaji", icon: FileText },
        { title: "Logistik", url: "/stok", icon: Warehouse },
      ];

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
    return subItems.filter((sub) => !sub.admin || isAdmin);
  };

  return (
    <div ref={containerRef}>
      {/* Dropdown menus */}
      {items.map((item) => {
        if (!item.subItems) return null;
        const filteredSubItems = getFilteredSubItems(item.subItems);
        if (filteredSubItems.length === 0 || activeDropdown !== item.title) return null;

        return (
          <div
            key={`dropdown-${item.title}`}
            className="md:hidden fixed bottom-[68px] left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-[320px] bg-background/95 backdrop-blur-md border border-border/80 rounded-2xl shadow-lg p-2 animate-in fade-in-50 slide-in-from-bottom-5 duration-200"
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
