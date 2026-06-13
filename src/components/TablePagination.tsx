import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function TablePagination({ page, totalPages, total, pageSize, onChange }: Props) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build compact page list
  const pages: (number | "...")[] = [];
  const push = (n: number | "...") => pages.push(n);
  const window = 1;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) push(i);
    else if (pages[pages.length - 1] !== "...") push("...");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t bg-muted/20">
      <div className="text-xs text-muted-foreground">
        {start}-{end} dari {total}
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(1)} disabled={page === 1}>
          <ChevronsLeft className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(page - 1)} disabled={page === 1}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              size="sm"
              variant={p === page ? "default" : "ghost"}
              className={`h-7 min-w-[28px] px-2 text-xs ${p === page ? "gradient-primary text-primary-foreground" : ""}`}
              onClick={() => onChange(p)}
            >
              {p}
            </Button>
          )
        )}
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(page + 1)} disabled={page === totalPages}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onChange(totalPages)} disabled={page === totalPages}>
          <ChevronsRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
