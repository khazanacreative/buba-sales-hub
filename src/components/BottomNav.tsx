import { LayoutDashboard, ShoppingCart, Factory, FileBarChart, BookOpen, Settings, Warehouse, UserCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

const allItems = [
  { title: "Home", url: "/", icon: LayoutDashboard, admin: false },
  { title: "Jual", url: "/penjualan", icon: ShoppingCart, admin: false },
  { title: "Produksi", url: "/produksi", icon: Factory, admin: false },
  { title: "Stok", url: "/stok", icon: Warehouse, admin: false },
  { title: "Absen", url: "/absensi", icon: UserCheck, admin: false },
  { title: "Laporan", url: "/laporan", icon: FileBarChart, admin: false },
  { title: "Keuangan", url: "/keuangan", icon: BookOpen, admin: true },
  { title: "Master", url: "/master", icon: Settings, admin: true },
];

interface Props {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin = false }: Props) {
  const items = allItems.filter((i) => isAdmin || !i.admin);
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong border-t border-border/50"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul
        className="flex overflow-x-auto no-scrollbar"
      >
        {items.map((item) => (
          <li key={item.title} className="flex-1 min-w-[64px]">
            <NavLink
              to={item.url}
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
                  <span>{item.title}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
