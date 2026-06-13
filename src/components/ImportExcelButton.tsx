import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useRef } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

interface Props {
  onData: (rows: any[]) => void;
  label?: string;
  size?: "sm" | "default";
}

export function ImportExcelButton({ onData, label = "Import Excel", size = "sm" }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });
      onData(rows);
    } catch (err) {
      console.error(err);
      toast.error("Gagal membaca file Excel");
    } finally {
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <input ref={ref} type="file" accept=".xlsx,.xls" onChange={handle} className="hidden" />
      <Button type="button" variant="outline" size={size} onClick={() => ref.current?.click()} className="hover-lift">
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </Button>
    </>
  );
}
