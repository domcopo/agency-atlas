// Work hub header: title, search, "+ New", "Suggestions (n)", and the List | Board | Team
// switcher. Then the stat chips that filter the view (with an × to clear). All plain links
// and GET forms: the address holds the view and filters.

import { Keyboard, Lightbulb, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { OpenDialogLink } from "@/components/work/HubDialog";
import { cn } from "@/lib/format";
import { HUB_CHIPS, hubHref, type HubChip, type HubFilters, type HubView } from "@/lib/work-hub";

const VIEWS: { id: HubView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "board", label: "Board" },
  { id: "team", label: "Team" },
];

export function WorkHeader({ f, newHref, suggestions, suggestHref, keysHref, canAdd, canSuggest }: { f: HubFilters; newHref: string; suggestions: number; suggestHref: string; keysHref: string; canAdd: boolean; canSuggest: boolean }) {
  return (
    <header className="pt-4 lg:pt-6">
      <div className="flex flex-wrap items-center gap-2 lg:gap-3">
        <h1 className="mr-auto font-display text-[28px] font-bold leading-tight tracking-tight lg:mr-4 lg:text-[34px]">Work</h1>
        <nav aria-label="Work view" className="order-last flex w-full rounded-xl border border-line bg-white/[0.03] p-1 sm:order-none sm:w-auto">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={hubHref(f, { view: v.id })}
              aria-current={f.view === v.id ? "page" : undefined}
              className={cn("pressable flex min-h-9 flex-1 items-center justify-center rounded-lg px-4 text-sm font-semibold sm:flex-none", f.view === v.id ? "bg-violet/25 text-ink" : "text-muted hover:text-ink")}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form method="get" action="/work" role="search" className="relative order-last w-full min-w-0 sm:order-none sm:w-auto sm:min-w-48 sm:max-w-xs sm:flex-1 lg:ml-auto">
          {Object.entries({ view: f.view === "list" ? undefined : f.view, chip: f.chip, who: f.who === null ? "none" : f.who, client: f.client, type: f.type, prio: f.prio, open: f.open }).map(([k, v]) =>
            v ? <input key={k} type="hidden" name={k} value={v} /> : null,
          )}
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input id="work-search" type="search" name="q" defaultValue={f.q} maxLength={80} placeholder="Search work" aria-label="Search work" className="min-h-10 w-full rounded-xl border border-line bg-white/5 pl-9 pr-3 text-sm text-ink placeholder:text-faint" />
        </form>
        <OpenDialogLink name="keys" href={keysHref} className="pressable hidden min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted hover:bg-white/[0.06] hover:text-ink lg:inline-flex">
          <Keyboard aria-hidden className="size-4" /> Shortcuts
        </OpenDialogLink>
        {canSuggest && (
          <OpenDialogLink name="suggest" href={suggestHref} className="pressable inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm font-semibold text-ink hover:bg-white/[0.08]">
            <Lightbulb aria-hidden className="size-4 text-amber" /> Suggestions{" "}
            <span className={cn("rounded-full px-2 text-xs tabular-nums", suggestions > 0 ? "bg-amber/20 text-amber" : "bg-white/[0.07] text-muted")}>{suggestions}</span>
          </OpenDialogLink>
        )}
        {canAdd && (
          <OpenDialogLink name="new" href={newHref} className="pressable inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white">
            <Plus aria-hidden className="size-4" /> New
          </OpenDialogLink>
        )}
      </div>
    </header>
  );
}

export function StatChips({ f, counts }: { f: HubFilters; counts: Record<HubChip, number> }) {
  return (
    <nav aria-label="Filter by" className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0 lg:pb-0">
      {HUB_CHIPS.map((c) => {
        const on = f.chip === c.id;
        const n = counts[c.id];
        const alarm = (c.id === "overdue" || c.id === "blocked") && n > 0;
        return (
          <Link
            key={c.id}
            href={hubHref(f, { chip: on ? undefined : c.id })}
            aria-current={on ? "true" : undefined}
            aria-label={on ? `${c.label}: ${n}. Showing only these; tap to clear` : `${c.label}: ${n}`}
            className={cn(
              "pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold",
              on ? "border-violet bg-violet/25 text-ink" : "border-line bg-white/[0.03] text-muted hover:text-ink",
            )}
          >
            {c.label}
            <span className={cn("tabular-nums", alarm ? "text-rose" : on ? "text-ink" : "text-ink/80")}>{n}</span>
            {on && <X aria-hidden className="size-3.5" />}
          </Link>
        );
      })}
      {f.chip === "now" && (
        <Link href={hubHref(f, { chip: undefined })} aria-current="true" className="pressable inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-violet bg-violet/25 px-4 text-sm font-semibold text-ink">
          Overdue + today <X aria-hidden className="size-3.5" />
        </Link>
      )}
    </nav>
  );
}
