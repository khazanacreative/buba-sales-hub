import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
envContent.split(/\r?\n/).forEach((line) => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || "";
    if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"')
      value = value.substring(1, value.length - 1);
    env[match[1]] = value;
  }
});

const supabase = createClient(
  env["VITE_SUPABASE_URL"],
  env["VITE_SUPABASE_SERVICE_ROLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"]
);

const TARGET_DATE = "2026-08-27";
const PROD_IDS = ["p-bubur", "p-nasitim", "p-oatmeal", "p-puding", "p-abon"];
const uid = () => Math.random().toString(36).slice(2, 10);

async function main() {
  const { data: outlets } = await supabase.from("outlets").select("id, nama").eq("nama", "Sugihwaras");
  const outlet = outlets?.[0];
  if (!outlet) { console.error("Outlet Sugihwaras tidak ditemukan"); process.exit(1); }

  console.log(`Fixing Sugihwaras (${outlet.id}) untuk ${TARGET_DATE}\n`);

  const { data: recs } = await supabase.from("permohonan_stok")
    .select("id, produk_id, status, qty")
    .eq("outlet_id", outlet.id)
    .eq("tanggal_kirim", TARGET_DATE)
    .in("produk_id", PROD_IDS);

  const existingMap = new Map((recs || []).map((r: any) => [r.produk_id, r]));
  console.log(`Record existing: ${(recs || []).length}`);
  (recs || []).forEach((r: any) => console.log(`  ${r.produk_id}: qty=${r.qty} status=${r.status}`));

  // Get reference from other outlets
  const { data: refs } = await supabase.from("permohonan_stok")
    .select("produk_id, qty, catatan")
    .eq("tanggal_kirim", TARGET_DATE)
    .eq("status", "Disetujui")
    .neq("outlet_id", outlet.id)
    .in("produk_id", PROD_IDS);
  const refMap = new Map<string, any>();
  (refs || []).forEach((r: any) => { if (!refMap.has(r.produk_id)) refMap.set(r.produk_id, r); });

  let fixed = 0;
  let created = 0;

  for (const prodId of PROD_IDS) {
    const rec = existingMap.get(prodId);
    if (rec) {
      if (rec.status !== "Disetujui") {
        const { error } = await supabase.from("permohonan_stok").update({ status: "Disetujui" }).eq("id", rec.id);
        if (error) console.error(`  ❌ ${prodId}: ${error.message}`);
        else { console.log(`  ✅ ${prodId}: Pending → Disetujui`); fixed++; }
      } else {
        console.log(`  ✅ ${prodId}: sudah Disetujui`);
      }
    } else {
      const ref = refMap.get(prodId);
      const { error } = await supabase.from("permohonan_stok").insert([{
        id: uid(), tanggal: TARGET_DATE, tanggal_kirim: TARGET_DATE,
        outlet_id: outlet.id, produk_id: prodId,
        qty: ref?.qty || 0, qty_rencana: ref?.qty || 0,
        status: "Disetujui", catatan: ref?.catatan || "", catatan_rencana: ref?.catatan || ""
      }]);
      if (error) console.error(`  ❌ ${prodId}: ${error.message}`);
      else { console.log(`  ✅ ${prodId}: dibuat baru (Disetujui)`); created++; }
    }
  }

  console.log(`\nSelesai: ${fixed} diupdate, ${created} dibuat baru.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
