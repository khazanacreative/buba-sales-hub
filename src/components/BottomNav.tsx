import { LayoutDashboard, ShoppingCart, FileBarChart, Warehouse, UserCheck } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { title: "Home", url: "/", icon: LayoutDashboard },
  { title: "Penjualan", url: "/penjualan", icon: ShoppingCart },
  { title: "Laporan", url: "/laporan", icon: FileBarChart },
  { title: "Logistik", url: "/stok", icon: Warehouse },
  { title: "Absensi", url: "/absensi", icon: UserCheck },
];

interface Props {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin = false }: Props) {
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
