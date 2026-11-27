// Reading more than one page of rows from Supabase. Pure: it only calls the function it's given.
//
// Why: Supabase answers any request with at most "Max rows" rows (Settings → API; 1,000 by
// default), whatever .limit() asks for. A read that asks for 5,000 rows silently gets 1,000,
// and if it is sorted oldest first, the NEWEST rows are the ones missing (SEO Watcher
// rankings, work order status history, GoHighLevel counts). readAllRows asks for the total
// first, then reads the rest in pages of whatever size the server actually sends.
//
// The query passed in MUST be sorted by something unique (add the primary key as the last
// .order()), or rows can repeat or go missing between pages.

/** Rows asked for per request. Matches Supabase's default "Max rows". */
export const PAGE_ROWS = 1000;

/** Pages read at the same time (keeps the database calm). */
const PARALLEL_PAGES = 4;

export interface RowPage<T> {
  data: T[] | null;
  error: unknown;
  count?: number | null;
}

/**
 * The [from, to] row ranges (inclusive, like Supabase's .range()) still to read after a first
 * page of `firstLen` rows, when the query has `total` rows and we want at most `max`.
 * `firstLen` is the real page size the server sent (it may be smaller than we asked for).
 */
export function remainingRanges(total: number, firstLen: number, max: number): [number, number][] {
  const want = Math.min(total, max);
  if (firstLen <= 0 || firstLen >= want) return [];
  const out: [number, number][] = [];
  for (let from = firstLen; from < want; from += firstLen) out.push([from, Math.min(from + firstLen, want) - 1]);
  return out;
}

/**
 * Every row of a query, up to `max`. `page(from, to, withCount)` must build the same sorted
 * query each time, with `.range(from, to)`, and ask for an exact count when `withCount` is true:
 *
 *   readAllRows((from, to, withCount) =>
 *     db.from("t").select("a, b", { count: withCount ? "exact" : undefined }).order("a").order("id").range(from, to), 20000)
 *
 * Returns the first error it meets (with no rows), so callers keep their "table missing" checks.
 */
export async function readAllRows<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<RowPage<T>>,
  max: number,
  size: number = PAGE_ROWS,
): Promise<{ data: T[]; error: unknown }> {
  const first = await page(0, Math.max(1, Math.min(size, max)) - 1, true);
  if (first.error) return { data: [], error: first.error };
  const rows = [...(first.data ?? [])];
  const total = typeof first.count === "number" ? first.count : rows.length;
  const rest = remainingRanges(total, rows.length, max);
  for (let i = 0; i < rest.length; i += PARALLEL_PAGES) {
    const batch = await Promise.all(rest.slice(i, i + PARALLEL_PAGES).map(([from, to]) => page(from, to, false)));
    for (const p of batch) {
      if (p.error) return { data: [], error: p.error };
      rows.push(...(p.data ?? []));
    }
  }
  return { data: rows.slice(0, max), error: null };
}
