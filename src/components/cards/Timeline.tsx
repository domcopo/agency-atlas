// A client's recent history, newest first. Plain text only.
// Owner and managers get "Fix" on logged check-ins (0021).

import { CheckInEditForm } from "@/components/forms/CheckInEditForm";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/format";
import type { TimelineEntry } from "@/lib/data-source";

const dot = { neutral: "bg-white/40", good: "bg-lime", bad: "bg-rose", info: "bg-sky" } as const;

export function Timeline({ entries, edit }: { entries: TimelineEntry[]; edit?: { slug: string; today: string } }) {
  if (!entries.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No history yet. Log a contact to start it.</p>;
  return (
    <ol className="glass space-y-0 rounded-3xl px-4 py-3">
      {entries.map((e, i) => (
        <li key={e.checkIn ? e.checkIn.id : `${e.at}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
          <span className="flex w-2 flex-col items-center">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot[e.tone])} />
            {i < entries.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-faint">{formatDate(e.at.slice(0, 10))}</p>
            <p className="text-sm">{e.title}</p>
            {e.detail && <p className="mt-0.5 break-words text-xs text-muted">{e.detail}</p>}
            {edit && e.checkIn && (
              <details className="mt-1">
                <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">Fix or remove</summary>
                <div className="pt-1">
                  <CheckInEditForm checkIn={e.checkIn} slug={edit.slug} today={edit.today} />
                </div>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
