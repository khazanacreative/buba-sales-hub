import { useEffect, useRef } from "react";
import { fetchHistoricalData } from "@/lib/store";
import { todayISO, DateRange } from "@/lib/format";

/**
 * Auto-fetch historical data when a DateRange extends beyond the
 * default loaded range (±7 days from today).
 *
 * Features:
 * - Debounce: waits 500ms after last range change before fetching
 * - Cache: tracks fetched ranges, skips if already loaded
 * - Cleanup: aborts previous fetch if range changes mid-fetch
 */
export function useAutoHistoricalFetch(range: DateRange) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRangesRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clear previous debounce timer
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!range.from && !range.to) return;

    const from = range.from || todayISO();
    const to = range.to || todayISO();

    // Calculate the default loaded range (±7 days)
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const fmt = (d: Date) =>
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10);
    const loadedFrom = fmt(sevenDaysAgo);
    const loadedTo = fmt(tomorrow);

    // If range is within loaded data, no need to fetch
    if (from >= loadedFrom && to <= loadedTo) return;

    // Calculate what needs to be fetched (extend to cover the gap)
    const fetchFrom = from < loadedFrom ? from : loadedFrom;
    const fetchTo = to > loadedTo ? to : loadedTo;

    // Check cache: have we already fetched this exact range?
    const cacheKey = `${fetchFrom}|${fetchTo}`;
    if (fetchedRangesRef.current.includes(cacheKey)) return;

    // Debounce: wait 500ms after last range change
    timerRef.current = setTimeout(() => {
      // Abort any previous in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }

      fetchedRangesRef.current.push(cacheKey);

      fetchHistoricalData(fetchFrom, fetchTo).catch((err) => {
        // Remove from cache on error so it can be retried
        fetchedRangesRef.current = fetchedRangesRef.current.filter(
          (k) => k !== cacheKey
        );
        console.warn("Historical fetch failed:", err);
      });
    }, 500);

    // Cleanup: clear timer on unmount or range change
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [range.from, range.to]);
}
