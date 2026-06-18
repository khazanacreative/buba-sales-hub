import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { UserAccount } from "./types";
import { supabase } from "./supabaseClient";

const KEY = "buba-auth-v1";

interface AuthCtx {
  user: UserAccount | null;
  login: (username: string, password: string) => Promise<boolean>;
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

  const [users, setUsers] = useState<UserAccount[]>([]);

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  // Load all users for login helper
  useEffect(() => {
    async function fetchUsers() {
      try {
        const { data, error } = await supabase.from("users").select("*");
        if (data && !error) {
          setUsers(data);
        }
      } catch (err) {
        console.error("Error loading users from Supabase:", err);
      }
    }
    fetchUsers();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", username.toLowerCase())
        .eq("password", password)
        .maybeSingle();

      if (data && !error) {
        setUser(data);
        return true;
      }
    } catch (err) {
      console.error("Login request failed:", err);
    }
    return false;
  };

  const logout = () => setUser(null);

  return <Ctx.Provider value={{ user, login, logout, users }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
