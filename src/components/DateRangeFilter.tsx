import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarRange, X } from "lucide-react";
import { DateRange } from "@/lib/format";
import { format, parseISO } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { DateRange as RDPRange } from "react-day-picker";

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
  className?: string;
}

const toISO = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : undefined);
const fromISO = (s?: string) => (s ? parseISO(s) : undefined);
const fmt = (s?: string) => (s ? format(parseISO(s), "dd MMM yy", { locale: idLocale }) : "Pilih");

export function DateRangeFilter({ value, onChange, className }: Props) {
  const isMobile = useIsMobile();
  const clear = () => onChange({});
  const has = value.from || value.to;

  const selected: RDPRange | undefined =
    value.from || value.to
      ? { from: fromISO(value.from), to: fromISO(value.to) }
      : undefined;

  const handleSelect = (r: RDPRange | undefined) => {
    onChange({ from: toISO(r?.from), to: toISO(r?.to) });
  };

  const label = !value.from && !value.to
    ? "Pilih rentang tanggal"
    : `${fmt(value.from)} → ${fmt(value.to)}`;

  return (
    <div
      className={cn(
        "flex w-full sm:w-auto sm:inline-flex items-center gap-1.5 rounded-xl border bg-card/60 backdrop-blur px-2 py-1.5 shadow-sm min-w-0",
        className
      )}
    >
      <CalendarRange className="h-4 w-4 text-primary shrink-0" />

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2 flex-1 sm:flex-none sm:w-[230px] justify-start font-normal text-xs sm:text-sm truncate",
              !has && "text-muted-foreground"
            )}
          >
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0 z-50">
          <Calendar
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={isMobile ? 1 : 2}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {has && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={clear}
          aria-label="Reset filter tanggal"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
