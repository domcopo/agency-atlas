// One saved audit in a list (Audits home, SEO audits, Google Ads audits). Shows plain text
// only; the database already decided which audits this person may see.

import { FileSearch, MousePointerClick } from "lucide-react";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import { stateName } from "@/lib/audit/geo";
import type { SavedAudit } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";

export const KIND_LABEL = { seo: "SEO audit", ads: "Google Ads audit" } as const;

export function SavedAuditCard({ a, showKind = false }: { a: SavedAudit; showKind?: boolean }) {
  const i = a.base;
  const Icon = a.kind === "ads" ? MousePointerClick : FileSearch;
  return (
    <GlassCard href={`/audits/${a.id}`} label={`Open ${a.title}`} className="h-full space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug">
          <Icon aria-hidden className={`mr-1.5 inline size-4 align-[-2px] ${a.kind === "ads" ? "text-amber" : "text-teal"}`} />
          {i?.company ?? a.title}
        </p>
        {a.archived ? <Pill>Archived</Pill> : a.hasResults ? <Pill color="lime">Results in</Pill> : <Pill color="amber">Not pulled yet</Pill>}
      </div>
      {i ? (
        <p className="text-sm text-muted">
          {i.domain} · {i.hqTown}, {stateName(i.state)}
        </p>
      ) : (
        <p className="text-sm text-rose">The saved details need fixing. Open it to edit.</p>
      )}
      <p className="text-[11px] text-faint">
        {showKind ? `${KIND_LABEL[a.kind]} · ` : ""}
        {a.pageCount} pages · {i?.competitors ?? 0} competitors named · {a.createdByName ? `by ${a.createdByName}, ` : ""}
        {formatShortDate(a.createdAt.slice(0, 10))}
        {a.leadGhlId ? " · from a lead" : ""}
      </p>
    </GlassCard>
  );
}
