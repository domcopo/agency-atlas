// VA requests (0033). Owner/managers: waiting requests with Approve / Turn down. A VA: their
// own recent requests and what happened to them.

import Link from "next/link";
import { decideVaRequest } from "@/app/actions";
import type { VaRequest } from "@/lib/data-source";
import { cn, formatDate } from "@/lib/format";
import { STATUS_REASONS } from "@/lib/journey";

const WORD = { active: "bring back", paused: "pause", canceled: "mark lost" } as const;
const reasonLabel = (r: string) => STATUS_REASONS.find(([k]) => k === r)?.[1] ?? null;

export function VaRequests({ items, canDecide }: { items: VaRequest[]; canDecide: boolean }) {
  if (!items.length) return null;
  return (
    <section className="mb-3 rounded-3xl border border-violet/30 bg-violet/8 p-3.5" aria-labelledby="va-req-h">
      <h2 id="va-req-h" className="text-sm font-semibold text-violet">
        {canDecide ? `VA requests · ${items.length}` : "My requests"}
      </h2>
      <ul className="mt-2 divide-y divide-line">
        {items.slice(0, 8).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              <span className="block text-sm">
                {canDecide ? "Asks to " : "Asked to "}
                <span className="font-semibold">{WORD[r.to]}</span>{" "}
                {r.slug ? (
                  <Link href={`/clients/${r.slug}`} className="font-semibold hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </span>
              <span className="block text-[11px] text-muted">
                {[reasonLabel(r.reason), r.note, formatDate(r.at.slice(0, 10))].filter(Boolean).join(" · ")}
              </span>
            </span>
            {canDecide ? (
              <span className="flex shrink-0 gap-2">
                <form action={decideVaRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button type="submit" className="pressable min-h-10 rounded-xl bg-violet-deep px-3 text-xs font-semibold">
                    Approve
                  </button>
                </form>
                <form action={decideVaRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <button type="submit" className="pressable min-h-10 rounded-xl border border-line px-3 text-xs font-semibold">
                    Turn down
                  </button>
                </form>
              </span>
            ) : (
              <span className={cn("shrink-0 text-xs font-semibold", r.status === "approved" ? "text-lime" : r.status === "declined" ? "text-rose" : "text-amber")}>
                {r.status === "approved" ? "Approved" : r.status === "declined" ? "Turned down" : "Waiting"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
