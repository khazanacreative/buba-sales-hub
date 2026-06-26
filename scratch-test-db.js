import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mrydrongthbximtflbps.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWRyb25ndGhieGltdGZsYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTg0ODEsImV4cCI6MjA5NzM3NDQ4MX0.fD09-tBBXi9o37AOB8sgMUhrDG7sSNmyeriZq1VG1Cg";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Testing inserting a row with new columns...");
  const tempId = "test_" + Math.random().toString(36).slice(2, 10);
  
  const { data: insertData, error: insertError } = await supabase.from("absensi").insert([{
    id: tempId,
    tanggal: "2026-06-26",
    karyawan_id: "k-produksi",
    jam_masuk: "07:30",
    jam_pulang: "15:00",
    status: "Hadir",
    catatan: "Test insert untuk verifikasi kolom baru",
    bonus: 25000,
    tunjangan: 15000,
    overtime: 2
  }]);

  if (insertError) {
    console.error("FAIL: Error inserting row:", insertError);
  } else {
    console.log("SUCCESS: Row inserted successfully!");
    
    // Read it back
    const { data: selectData, error: selectError } = await supabase.from("absensi").select("*").eq("id", tempId);
    if (selectError) {
      console.error("Error selecting row:", selectError);
    } else {
      console.log("Fetched Row:", selectData);
    }

    // Clean up
    const { error: deleteError } = await supabase.from("absensi").delete().eq("id", tempId);
    if (deleteError) {
      console.error("Error cleaning up:", deleteError);
    } else {
      console.log("SUCCESS: Cleaned up test row!");
    }
  }
}

main();
