import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing Supabase environment variables! Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file or hosting provider settings."
  );
}

// Use placeholder credentials if actual variables are missing to prevent initialization crash
const url = supabaseUrl || "https://mrydrongthbximtflbps.supabase.co";
const key = supabaseAnonKey || "placeholder-key-please-set-env-variables";

export const supabase = createClient(url, key);
