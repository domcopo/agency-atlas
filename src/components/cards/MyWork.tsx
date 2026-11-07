// Work tab: one person's queue (Overdue · Today · Upcoming · Waiting) and the
// team's load. Until team logins exist (after hosting), you pick whose list to view.

import { ActionRow } from "@/components/cards/ActionRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { SectionTitle } from "@/components/shell/PageHeader";
import { cn } from "@/lib/format";
import type { WorkBucket } from "@/lib/ops";
import type { PriorityItem } from "@/lib/types";

const BUCKETS: { id: WorkBucket; label: string; tone: string }[] = [
  { id: "overdue", label: "Overdue", tone: "text-rose" },
  { id: "today", label: "Today", tone: "text-amber" },
  { id: "upcoming", label: "Upcoming", tone: "" },
  { id: "waiting", label: "Waiting", tone: "text-sky" },
  { id: "blocked", label: "Blocked", tone: "text-rose" },
];

export function MyWork({
  who,
  staff,
  buckets,
  load,
  canEdit,
  personal = false,
  done = [],
}: {
  who: string;
  staff: { id: string; name: string }[];
  buckets: Record<WorkBucket, PriorityItem[]>;
  load: {
    people: { id: string; name: string; open: number; overdue: number; clients: number; done7?: number }[];
    unowned: { open: number; overdue: number; clients: number; done7?: number };
  };
  /** Marked done in the last 7 days, for this view's person (or everyone). */
  done?: { at: string; summary: string; client: { slug: string; name: string } | null }[];
  canEdit: boolean;
  /** A developer's own view: no person picker, no team load, status-only buttons. */
  personal?: boolean;
}) {
  const name = personal ? "your" : who === "all" ? "Everyone" : who === "none" ? "No owner" : (staff.find((m) => m.id === who)?.name ?? "Everyone");
  const total = BUCKETS.reduce((n, b) => n + buckets[b.id].length, 0);
  return (
    <section id="my-work" className="scroll-mt-16">
      <SectionTitle aside={`${total} items`}>My work</SectionTitle>
      {!personal && (
      <form method="get" action="/work#my-work" className="mb-2.5 flex gap-2">
        <label className="sr-only" htmlFor="who">
          Whose work
        </label>
        <select id="who" name="who" defaultValue={who} className="min-h-11 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
          <option value="all">Everyone</option>
          {staff.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="none">No owner</option>
        </select>
        <button type="submit" className="pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold">
          Show
        </button>
      </form>
      )}

      <GlassCard className="grid grid-cols-5 gap-1 text-center">
        {BUCKETS.map((b) => (
          <a key={b.id} href={`#work-${b.id}`} className="pressable rounded-xl py-1">
            <span className={cn("block font-display text-2xl font-bold", buckets[b.id].length > 0 && b.tone)}>{buckets[b.id].length}</span>
            <span className="text-[10px] leading-tight text-muted">{b.label}</span>
          </a>
        ))}
      </GlassCard>

      {total === 0 ? (
        <p className="glass mt-2.5 rounded-3xl px-4 py-3 text-sm text-muted">{personal ? "Nothing on your list right now." : `Nothing on ${name}'s list right now.`}</p>
      ) : (
        BUCKETS.filter((b) => buckets[b.id].length > 0).map((b) => (
          <div key={b.id} id={`work-${b.id}`} className="mt-2.5 scroll-mt-16">
            <p className={cn("mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em]", b.tone || "text-muted")}>
              {b.label} · {buckets[b.id].length}
            </p>
            <ol className="glass divide-y divide-line overflow-hidden rounded-3xl">
              {buckets[b.id].map((i) => (
                <li key={i.id}>
                  <ActionRow item={i} staff={staff} canEdit={canEdit} statusOnly={personal} />
                </li>
              ))}
            </ol>
          </div>
        ))
      )}

      {done.length > 0 && (
        <details className="glass mt-2.5 rounded-3xl">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
            Done this week <span className="text-xs font-normal text-lime">{done.length}</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line text-sm">
            {done.slice(0, 30).map((d, i) => (
              <li key={`${d.at}-${i}`} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  {d.client ? <a href={`/clients/${d.client.slug}`} className="font-semibold hover:underline">{d.client.name}</a> : null}
                  {d.client ? ": " : ""}
                  <span className="text-muted">{d.summary}</span>
                </span>
                <span className="shrink-0 text-[11px] text-faint">{new Date(d.at).toLocaleDateString("en-US", { weekday: "short" })}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!personal && (
      <details className="glass mt-2.5 rounded-3xl">
        <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
          Team load <span className="text-xs font-normal text-muted">open · overdue · clients · done 7d</span>
        </summary>
        <ul className="divide-y divide-line border-t border-line text-sm">
          {[...load.people.map((p) => ({ key: p.id, label: p.name, ...p })), { key: "none", label: "No owner", ...load.unowned }].map((p) => (
            <li key={p.key}>
              <a href={`/work?who=${p.key}#my-work`} className="pressable flex items-center justify-between gap-3 px-4 py-2.5">
                <span className={p.key === "none" && (p.open || p.clients) ? "text-amber" : ""}>{p.label}</span>
                <span className="shrink-0 text-xs text-muted">
                  {p.open} · <span className={p.overdue ? "font-semibold text-rose" : ""}>{p.overdue}</span> · {p.clients} ·{" "}
                  <span className={p.done7 ? "text-lime" : ""}>{p.done7 ?? 0}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </details>
      )}
    </section>
  );
}
