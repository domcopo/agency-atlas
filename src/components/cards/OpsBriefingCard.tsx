// The AI briefing as a short, ranked list: who, why, what, owner, when.
// Plain text only. "Make it a next action" is a person's tap; the AI can't add anything.

import { Check, Lightbulb, Plus, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { addSuggestedAction } from "@/app/actions";
import { priorityTone } from "@/components/cards/ActionRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { cn } from "@/lib/format";
import type { OpsBriefing } from "@/lib/types";

export function OpsBriefingCard({
  briefing,
  createdAt,
  isToday,
  owners,
  existing,
  canAdd,
}: {
  briefing: OpsBriefing;
  createdAt: string;
  isToday: boolean;
  /** client slug -> owner name (current, from the database, not from the AI). */
  owners: Map<string, string | undefined>;
  /** "slug|title" of open actions, so a suggestion already added shows as added. */
  existing: Set<string>;
  canAdd: boolean;
}) {
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(createdAt));
  return (
    <GlassCard className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          {briefing.headline}
        </p>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px]", isToday ? "bg-violet/20 text-violet" : "bg-white/8 text-faint")}>{isToday ? "Today" : when}</span>
      </div>

      {briefing.priorities.length > 0 && (
        <ol className="space-y-2.5">
          {briefing.priorities.map((p, i) => {
            const owner = p.client ? owners.get(p.client.slug) : undefined;
            const added = p.client ? existing.has(`${p.client.slug}|${p.action.toLowerCase()}`) : false;
            return (
              <li key={i} className="flex gap-2.5 rounded-2xl bg-white/[0.04] p-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet/20 text-xs font-bold text-violet">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold">
                    {p.client ? (
                      <Link href={`/clients/${p.client.slug}`} className="underline-offset-2 hover:underline">
                        {p.client.name}
                      </Link>
                    ) : (
                      "Team"
                    )}
                    {p.priority !== "normal" && <span className={cn("ml-1.5 text-[11px]", priorityTone[p.priority].text)}>{priorityTone[p.priority].label}</span>}
                  </p>
                  <p className="text-xs text-muted">{p.reason}</p>
                  <p className="text-xs">
                    <span className="text-faint">Do:</span> {p.action}
                    <span className="text-faint"> · {p.when === "today" ? "Today" : "This week"} · </span>
                    {p.client ? owner ? <span>{owner}</span> : <span className="text-amber">no owner</span> : null}
                  </p>
                  {canAdd && p.client && p.action && (
                    added ? (
                      <p className="flex items-center gap-1 text-[11px] text-lime">
                        <Check aria-hidden className="size-3" /> Added as a next action
                      </p>
                    ) : (
                      <form action={addSuggestedAction}>
                        <input type="hidden" name="slug" value={p.client.slug} />
                        <input type="hidden" name="title" value={p.action} />
                        <input type="hidden" name="when" value={p.when} />
                        <input type="hidden" name="priority" value={p.priority} />
                        <button type="submit" className="pressable mt-0.5 inline-flex min-h-9 items-center gap-1 rounded-xl border border-violet/40 px-2.5 text-[11px] font-semibold text-violet">
                          <Plus aria-hidden className="size-3" /> Make it a next action
                        </button>
                      </form>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {briefing.opportunities.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Lightbulb aria-hidden className="size-3.5 text-lime" /> Opportunities
          </p>
          <ul className="space-y-1 text-xs">
            {briefing.opportunities.map((o, i) => (
              <li key={i}>
                {o.client ? (
                  <Link href={`/clients/${o.client.slug}`} className="font-semibold underline-offset-2 hover:underline">
                    {o.client.name}
                  </Link>
                ) : null}
                {o.client ? ": " : ""}
                {o.idea} <span className="text-muted">({o.why})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {briefing.team.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Users aria-hidden className="size-3.5 text-sky" /> Team
          </p>
          <ul className="space-y-0.5 text-xs text-muted">
            {briefing.team.map((t, i) => (
              <li key={i}>• {t}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-faint">Written by AI from your records. It suggests; people decide. It can be wrong.</p>
    </GlassCard>
  );
}
