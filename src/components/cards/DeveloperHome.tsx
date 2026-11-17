// The developer's Home "Today" (DEVELOPER_SIMPLIFY_PLAN, 2026-11-17): one big "Do this next"
// card with a Start button, a short "Needs attention" list only when something needs it,
// and a link to the full Work list. The items come from the same developer read as the
// Work tab (the database limits it to their own work; no revenue). readOnly = preview.

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { StatusButton } from "@/components/cards/DeveloperButtons";
import { clientLabel } from "@/lib/agency";
import { cn } from "@/lib/format";
import { developerFocus, dueLabel, stepProgress, type FocusAlert } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";
import { DEADLINE_STYLE, deadlineColor } from "@/lib/work-orders";

const WHY: Record<FocusAlert["why"], { label: string; tone: string }> = {
  sent_back: { label: "Sent back", tone: "text-amber" },
  promise_missed: { label: "Promise to the client missed", tone: "text-rose" },
  overdue: { label: "Overdue", tone: "text-rose" },
};

const hrefFor = (a: ClientAction) => (a.kind === "work_order" ? `/work/orders/${a.id}` : "/work");

export function DeveloperHome({ items, today, readOnly = false }: { items: ClientAction[]; today: string; readOnly?: boolean }) {
  const { next, alerts, openCount } = developerFocus(items, today);
  if (!openCount) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing assigned right now. New work shows up here as soon as a manager adds it.</p>;
  const progress = next ? stepProgress(next) : null;
  return (
    <div className="space-y-4">
      {next ? (
        <section aria-label="Do this next" className="glass rounded-3xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{next.status === "in_progress" ? "You're working on" : "Do this next"}</p>
          <Link href={hrefFor(next)} className="mt-1 block hover:underline">
            <span className="block text-base font-semibold leading-snug">{next.title}</span>
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            {clientLabel(next)}
            {" · "}
            <span className={DEADLINE_STYLE[deadlineColor(next.dueOn, today, next.status)].text}>{dueLabel(next.dueOn, today)}</span>
            {progress && (
              <span className={progress.done === progress.total ? "text-lime" : "text-teal"}>
                {" · "}
                {progress.done} of {progress.total} steps
              </span>
            )}
          </p>
          {next.reviewNote && <p className="mt-1 text-xs font-semibold text-amber">Sent back: {next.reviewNote}</p>}
          <div className="mt-3 flex gap-2">
            {next.status === "open" && (
              <fieldset disabled={readOnly} className="flex flex-1">
                <StatusButton a={next} status="in_progress" className="bg-violet-deep">
                  Start
                </StatusButton>
              </fieldset>
            )}
            <Link href={hrefFor(next)} className="pressable inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold">
              Open
            </Link>
          </div>
        </section>
      ) : (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing new to start. Check what&apos;s waiting on Work.</p>
      )}

      {alerts.length > 0 && (
        <section aria-label="Needs attention">
          <h2 className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Needs attention</h2>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {alerts.map(({ item, why }) => (
              <li key={item.id}>
                <Link href={hrefFor(item)} className="pressable block min-h-12 px-4 py-2.5">
                  <span className={cn("block text-[11px] font-semibold", WHY[why].tone)}>
                    {WHY[why].label}
                    {why === "sent_back" && item.reviewNote ? `: ${item.reviewNote}` : ""}
                  </span>
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="block text-xs text-muted">{clientLabel(item)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href="/work" className="pressable glass flex min-h-12 items-center justify-center gap-1 rounded-2xl text-sm font-semibold text-violet">
        All my work ({openCount}) <ArrowRight aria-hidden className="size-4" />
      </Link>
      {readOnly && <p className="px-1 text-[11px] text-faint">Preview: buttons are off.</p>}
    </div>
  );
}
