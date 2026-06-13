export const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n || 0);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const monthKey = (iso: string) => iso.slice(0, 7);

export interface DateRange {
  from?: string;
  to?: string;
}

export const inRange = (iso: string, r: DateRange) => {
  if (r.from && iso < r.from) return false;
  if (r.to && iso > r.to) return false;
  return true;
};

export const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
