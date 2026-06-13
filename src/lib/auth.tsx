import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { SEED_USERS } from "./seed";
import { UserAccount } from "./types";

const KEY = "buba-auth-v1";

interface AuthCtx {
  user: UserAccount | null;
  login: (username: string, password: string) => boolean;
  logout: () => void;
  users: UserAccount[];
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  const login = (username: string, password: string) => {
    const u = SEED_USERS.find(
      (x) => x.username.toLowerCase() === username.toLowerCase() && x.password === password
    );
    if (u) {
      setUser(u);
      return true;
    }
    return false;
  };
  const logout = () => setUser(null);

  return <Ctx.Provider value={{ user, login, logout, users: SEED_USERS }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
