import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mrydrongthbximtflbps.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1yeWRyb25ndGhieGltdGZsYnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTg0ODEsImV4cCI6MjA5NzM3NDQ4MX0.fD09-tBBXi9o37AOB8sgMUhrDG7sSNmyeriZq1VG1Cg";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Testing call to standard sql execution functions...");
  
  const testRPCs = ["exec_sql", "run_sql", "query_sql", "execute", "sql"];
  for (const name of testRPCs) {
    const { data, error } = await supabase.rpc(name, { query: "SELECT 1" });
    if (error) {
      console.log(`RPC ${name} failed:`, error.message);
    } else {
      console.log(`RPC ${name} SUCCESS! Result:`, data);
    }
  }
}

main();
