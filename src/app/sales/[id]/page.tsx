import { ArrowDownRight, ArrowUpRight, BookOpen, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { stageInfo } from "@/components/cards/ProspectCard";
import { ScoreRing } from "@/components/labels/charts";
import { GradeBadge, Pill, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getConversations, getProspect, getProspects, getToday } from "@/lib/data-source";
import { describeDue, formatDate, formatUsd } from "@/lib/format";
import type { Grade } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getProspects().map((p) => ({ id: p.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: getProspect(id)?.name ?? "Prospect" };
}

const gradeColor: Record<Grade, string> = {
  A: "var(--color-amber)",
  B: "var(--color-teal)",
  C: "var(--color-sky)",
  D: "var(--color-faint)",
};

export default async function ProspectPage({ params }: Props) {
  const { id } = await params;
  const p = getProspect(id);
  if (!p) notFound();
  const today = getToday();
  const convos = getConversations().filter((c) => c.prospectId === p.id);

  return (
    <>
      <PageHeader title={p.name} subtitle={p.industry} backHref="/sales" backLabel="Sales" action={<Provenance kind="sample" />} />

      <GlassCard className="flex items-center gap-4">
        <ScoreRing score={p.grade.score} color={gradeColor[p.grade.letter]} label={`Prospect score ${p.grade.score} out of 100`} size={72} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <GradeBadge grade={p.grade.letter} />
            <Pill color={stageInfo[p.stage].color}>{stageInfo[p.stage].label}</Pill>
          </div>
          <p className="text-sm">
            Wants <span className="font-semibold">{p.wants.join(" + ")}</span>
          </p>
          <p className="text-xs text-muted">
            Est. {formatUsd(p.estMonthlyUsd.low)}–{formatUsd(p.estMonthlyUsd.high)}/mo · from {p.source}
          </p>
        </div>
      </GlassCard>

      <SectionTitle aside="Hand-set for now">Why this grade</SectionTitle>
      <GlassCard>
        <ul className="space-y-1.5">
          {p.grade.factors.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-sm">
              {f.effect === "positive" ? (
                <ArrowUpRight aria-label="Raises the grade" className="mt-0.5 size-4 shrink-0 text-lime" />
              ) : (
                <ArrowDownRight aria-label="Lowers the grade" className="mt-0.5 size-4 shrink-0 text-rose" />
              )}
              {f.label}
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-line pt-2 text-[11px] text-faint">
          Later, grades are calculated from the prospect&apos;s activity and always show their reasons. A person decides
          what to do.
        </p>
      </GlassCard>

      <SectionTitle>Contact</SectionTitle>
      <GlassCard className="space-y-1.5 text-sm">
        <p className="font-medium">{p.contactName}</p>
        <p className="flex items-center gap-1.5 text-muted">
          <Phone aria-hidden className="size-3.5" />
          {p.phone}
        </p>
        <p className="flex items-center gap-1.5 break-all text-muted">
          <Mail aria-hidden className="size-3.5 shrink-0" />
          {p.email}
        </p>
        {p.nextFollowUp && (
          <p className={p.nextFollowUp < today ? "font-semibold text-rose" : "text-muted"}>
            Next follow-up {describeDue(p.nextFollowUp, today)}
          </p>
        )}
        {p.lastTouch && <p className="text-xs text-faint">Last touch {formatDate(p.lastTouch)}</p>}
      </GlassCard>

      {p.notes.length > 0 && (
        <>
          <SectionTitle>Notes</SectionTitle>
          <GlassCard className="space-y-1.5 text-sm">
            {p.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </GlassCard>
        </>
      )}

      <SectionTitle aside="Read-only">Conversations</SectionTitle>
      {convos.length > 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {convos.map((c) => (
              <ConversationRow key={c.id} conversation={c} name={p.name} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-1 text-sm text-faint">No conversations yet.</p>
      )}

      {p.businessId && (
        <p className="mt-6 text-center text-sm">
          <Link href={`/growth/dex/${p.businessId}`} className="inline-flex items-center gap-1.5 text-violet hover:underline">
            <BookOpen aria-hidden className="size-4" /> Open research profile in the Business Dex
          </Link>
        </p>
      )}
    </>
  );
}
