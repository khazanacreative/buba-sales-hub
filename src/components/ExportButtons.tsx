import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/export";

interface Props {
  filename: string;
  title: string;
  headers: string[];
  /** Rows for PDF — array of primitive cells in same order as headers */
  rows: (string | number)[][];
  /** Optional richer rows for Excel (objects). Falls back to building from headers+rows. */
  excelRows?: Record<string, any>[];
  size?: "sm" | "default";
}

export function ExportButtons({ filename, title, headers, rows, excelRows, size = "sm" }: Props) {
  const handleExcel = () => {
    const data =
      excelRows ??
      rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
    exportToExcel(filename, title.slice(0, 31), data);
  };
  const handlePDF = () => exportToPDF(filename, title, headers, rows);

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size={size} variant="outline" onClick={handleExcel} className="hover-lift">
        <FileSpreadsheet className="h-4 w-4 mr-1.5 text-success" />
        Excel
      </Button>
      <Button type="button" size={size} variant="outline" onClick={handlePDF} className="hover-lift">
        <FileText className="h-4 w-4 mr-1.5 text-destructive" />
        PDF
      </Button>
    </div>
  );
}
