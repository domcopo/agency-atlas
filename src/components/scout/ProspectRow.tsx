// One Scout prospect, short: name, score, the two strongest reasons, town and distance,
// where it stands. Tapping opens the prospect page. Business names are plain text.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { claimProspect } from "@/app/actions";
import { Pill } from "@/components/labels/labels";
import { cn } from "@/lib/format";
import { milesBetween, SCOUT_RULES, STATUS_LABEL, type Prospect } from "@/lib/scout";

const ANGLE = { ads: { label: "Ads", color: "amber" }, seo: { label: "SEO", color: "teal" }, website: { label: "No site", color: "violet" } } as const;

export function scoreTone(score: number): string {
  return score >= 70 ? "bg-lime/15 text-lime border-lime/40" : score >= 45 ? "bg-amber/10 text-amber border-amber/40" : "bg-white/5 text-muted border-line";
}

export function milesFromBase(p: { lat: number | null; lng: number | null }): number | null {
  return p.lat !== null && p.lng !== null ? Math.round(milesBetween(SCOUT_RULES.base, { lat: p.lat, lng: p.lng }) * 10) / 10 : null;
}

export function ProspectRow({ p, assignedName, canClaim, selectForm }: { p: Prospect; assignedName?: string | null; canClaim?: boolean; selectForm?: string }) {
  const miles = milesFromBase(p);
  const a = ANGLE[p.angle];
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      {selectForm && (
        <input type="checkbox" name="prospectId" value={p.id} form={selectForm} aria-label={`Select ${p.name}`} className="mt-1.5 size-5 shrink-0 accent-violet" />
      )}
      <Link href={`/sales/scout/${p.id}`} className="pressable -mx-1 flex min-w-0 flex-1 items-start gap-3 rounded-xl px-1">
        <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border font-display text-sm font-bold", scoreTone(p.score))} aria-label={`Score ${p.score} out of 100`}>
          {p.score}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 break-words text-sm font-semibold leading-snug">{p.name}</span>
            <Pill color={a.color}>{a.label}</Pill>
          </span>
          <span className="mt-0.5 block text-xs text-muted">{p.reasons.slice(0, 2).join(" · ") || "No strong signals found"}</span>
          <span className="block text-[11px] text-faint">
            {[p.town, miles !== null ? `${miles} mi` : null, p.status !== "new" ? STATUS_LABEL[p.status] : null, assignedName ? `with ${assignedName}` : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <ChevronRight aria-hidden className="mt-3 size-4 shrink-0 text-faint" />
      </Link>
      {canClaim && (
        <form action={claimProspect} className="shrink-0">
          <input type="hidden" name="prospectId" value={p.id} />
          <button type="submit" className="pressable min-h-10 rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold text-violet">
            Claim
          </button>
        </form>
      )}
    </div>
  );
}
