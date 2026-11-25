// Owner's Home (0032): clients the team flagged with "Needs the owner", or that were logged
// as doing worse while VIP or top tier. Stays until the owner taps Resolved.

import Link from "next/link";
import { resolveEscalation } from "@/app/actions";
import type { Escalation } from "@/lib/data-source";
import { formatDate } from "@/lib/format";

export function NeedsYou({ items }: { items: Escalation[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-3 rounded-3xl border border-amber/40 bg-amber/8 p-3.5" aria-labelledby="needs-you-h">
      <h2 id="needs-you-h" className="text-sm font-semibold text-amber">
        Needs you · {items.length}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {items.slice(0, 8).map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              {e.slug ? (
                <Link href={`/clients/${e.slug}`} className="block truncate text-sm font-semibold hover:underline">
                  {e.name}
                </Link>
              ) : (
                <span className="block truncate text-sm font-semibold">{e.name}</span>
              )}
              <span className="block text-[11px] text-muted">
                {e.reason} · {e.automatic ? "automatic" : "flagged by the team"} · {formatDate(e.at.slice(0, 10))}
              </span>
            </span>
            <form action={resolveEscalation}>
              <input type="hidden" name="id" value={e.id} />
              <button type="submit" className="pressable min-h-10 shrink-0 rounded-xl border border-line px-3 text-xs font-semibold">
                Resolved
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
