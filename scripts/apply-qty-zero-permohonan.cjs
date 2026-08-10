// Terapkan migrasi: izinkan qty=0 pada permohonan_stok (distribusi berbeda dari rencana).
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) env[match[1]] = (match[2] || "").replace(/^["']|["']$/g, "");
});

const supabase = createClient(
  env["VITE_SUPABASE_URL"],
  env["VITE_SUPABASE_SERVICE_ROLE_KEY"]
);

const MIGRATION_SQL = `
ALTER TABLE permohonan_stok DROP CONSTRAINT IF EXISTS permohonan_stok_qty_check;
ALTER TABLE permohonan_stok ADD CONSTRAINT permohonan_stok_qty_check CHECK (qty >= 0);
`;

async function main() {
  const { error } = await supabase.rpc("exec_sql", { sql_text: MIGRATION_SQL });
  if (error) {
    console.log("Migrasi gagal:", error.message);
    process.exit(1);
  }
  console.log("✅ Migrasi diterapkan (permohonan_stok qty >= 0)");

  // Verifikasi: dump definisi constraint terbaru
  const DUMP_SQL = `
DROP TABLE IF EXISTS _diag_checks;
CREATE TABLE _diag_checks AS
SELECT
  c.conrelid::regclass::text AS tbl,
  c.conname AS name,
  pg_get_constraintdef(c.oid) AS def
FROM pg_constraint c
WHERE c.conrelid IN ('permohonan_stok'::regclass)
ORDER BY name;
NOTIFY pgrst, 'reload schema';
`;
  await supabase.rpc("exec_sql", { sql_text: DUMP_SQL });
  await new Promise((r) => setTimeout(r, 1500));
  const { data } = await supabase.from("_diag_checks").select("*");
  console.log("=== CONSTRAINT permohonan_stok ===");
  console.log(JSON.stringify(data, null, 2));
  await supabase.rpc("exec_sql", { sql_text: "DROP TABLE IF EXISTS _diag_checks; NOTIFY pgrst, 'reload schema';" });

  // Uji langsung (aman): simpan nilai asli → update qty=0 → kembalikan ke nilai asli.
  const { data: rec } = await supabase.from("permohonan_stok").select("id, qty").limit(1);
  if (rec && rec.length > 0) {
    const originalQty = rec[0].qty;
    const { error: updErr } = await supabase
      .from("permohonan_stok")
      .update({ qty: 0 })
      .eq("id", rec[0].id);
    if (updErr) {
      console.log("⚠️ Update qty=0 masih gagal:", updErr.message);
    } else {
      console.log("✅ Update qty=0 berhasil di record", rec[0].id, "(dikembalikan ke", originalQty, ")");
      await supabase.from("permohonan_stok").update({ qty: originalQty }).eq("id", rec[0].id);
    }
  } else {
    console.log("ℹ️ Tidak ada record permohonan_stok untuk diuji update qty=0");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
