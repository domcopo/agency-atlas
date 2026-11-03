import { ArrowDownRight, ArrowUpRight, Bot, Home, Mail, Phone, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoreRing } from "@/components/labels/charts";
import { DealStagePill, GradeBadge, LeadStagePill, MoneyLabel, Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import {
  getConversationsForLead,
  getDealForLead,
  getLead,
  getLeads,
  getMissionControl,
  getTeamMemberName,
} from "@/lib/data-source";
import { describeDue, formatDate, formatShortDate } from "@/lib/format";
import type { LeadGrade } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return getLeads().map((l) => ({ id: l.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: getLead(id)?.property.street ?? "Lead" };
}

const gradeColor: Record<LeadGrade, string> = {
  A: "var(--color-amber)",
  B: "var(--color-teal)",
  C: "var(--color-sky)",
  D: "var(--color-faint)",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) notFound();
  const { today, followUps } = getMissionControl();
  const deal = getDealForLead(lead.id);
  const conversations = getConversationsForLead(lead.id);
  const tasks = followUps.filter((f) => f.leadId === lead.id);
  const p = lead.property;

  return (
    <>
      <PageHeader title={p.street} subtitle={p.city} backHref="/leads" backLabel="Leads" />

      <GlassCard className="flex items-center gap-4">
        <ScoreRing
          score={lead.grade.score}
          color={gradeColor[lead.grade.letter]}
          label={`Lead score ${lead.grade.score} out of 100`}
          size={72}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <GradeBadge grade={lead.grade.letter} />
            <LeadStagePill stage={lead.stage} />
          </div>
          <p className="mt-2 text-sm font-semibold">{lead.sellerName}</p>
          <p className="text-xs text-muted">
            {lead.source} · assigned to {getTeamMemberName(lead.assignedTo)}
          </p>
        </div>
      </GlassCard>

      <SectionTitle aside="Hand-written for the demo">Why this grade</SectionTitle>
      <GlassCard className="space-y-2">
        <ul className="space-y-1.5">
          {lead.grade.factors.map((f) => (
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
        <p className="flex gap-1.5 border-t border-line pt-2 text-[11px] text-faint">
          <Bot aria-hidden className="size-3.5 shrink-0" />
          Later, grades are calculated from the lead&apos;s data and always show their reasons. A person
          decides what to do; the app never contacts anyone.
        </p>
      </GlassCard>

      <SectionTitle>Seller</SectionTitle>
      <GlassCard>
        <dl className="divide-y divide-line">
          <Row label="Motivation">
            <span className="flex flex-wrap justify-end gap-1">
              {lead.motivations.map((m) => (
                <Pill key={m} color="violet">
                  {m}
                </Pill>
              ))}
            </span>
          </Row>
          <Row label="Timeline">{lead.timeline}</Row>
          <Row label="Asking price">
            <MoneyLabel money={lead.askingPrice} showBasis />
          </Row>
          <Row label="Phone">
            <span className="inline-flex items-center gap-1.5">
              <Phone aria-hidden className="size-3.5 text-faint" />
              {lead.phone}
            </span>
          </Row>
          <Row label="Email">
            <span className="inline-flex items-center gap-1.5 break-all">
              <Mail aria-hidden className="size-3.5 shrink-0 text-faint" />
              {lead.email}
            </span>
          </Row>
          {lead.lastContactAt && <Row label="Last contact">{formatDate(lead.lastContactAt)}</Row>}
          {lead.nextFollowUp && lead.stage !== "dead" && (
            <Row label="Next follow-up">
              <span className={lead.nextFollowUp < today ? "font-semibold text-rose" : undefined}>
                {describeDue(lead.nextFollowUp, today)}
              </span>
            </Row>
          )}
        </dl>
        <p className="mt-2 flex gap-1.5 text-[11px] text-faint">
          <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
          Motivations can be sensitive (money trouble, divorce, probate). Later only the right roles see them.
        </p>
      </GlassCard>

      <SectionTitle>Property</SectionTitle>
      <GlassCard>
        <dl className="divide-y divide-line">
          <Row label="Type">
            <span className="inline-flex items-center gap-1.5">
              <Home aria-hidden className="size-3.5 text-faint" />
              {p.type}
            </span>
          </Row>
          {p.beds !== undefined && <Row label="Beds / baths">{`${p.beds} / ${p.baths ?? "?"}`}</Row>}
          {p.sqft !== undefined && <Row label="Size">{`${p.sqft.toLocaleString("en-US")} sq ft`}</Row>}
          <Row label="Condition">{p.condition}</Row>
        </dl>
      </GlassCard>

      {deal && (
        <>
          <SectionTitle>Deal</SectionTitle>
          <GlassCard href={`/deals/${deal.id}`} label={`Open deal ${deal.title}`} className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{deal.title}</p>
              <p className="mt-0.5 text-xs text-muted">Closing {formatShortDate(deal.closingAt)}</p>
            </div>
            <DealStagePill stage={deal.stage} />
          </GlassCard>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <SectionTitle>Follow-ups</SectionTitle>
          <GlassCard padding="none">
            <ul className="divide-y divide-line">
              {tasks.map((t) => (
                <li key={t.id} className="px-4 py-3">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {describeDue(t.due, today)} · {t.why}
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>
        </>
      )}

      <SectionTitle aside="Read-only preview">Conversations</SectionTitle>
      {conversations.length > 0 ? (
        <div className="glass overflow-hidden rounded-3xl">
          <ul className="divide-y divide-line">
            {conversations.map((c) => (
              <ConversationRow key={c.id} conversation={c} leadName={lead.sellerName} />
            ))}
          </ul>
        </div>
      ) : (
        <p className="px-1 text-sm text-faint">No conversations yet.</p>
      )}

      {lead.notes.length > 0 && (
        <>
          <SectionTitle>Notes</SectionTitle>
          <div className="space-y-2.5">
            {lead.notes.map((n) => (
              <GlassCard key={n.id} padding="tight">
                <p className="text-sm">{n.text}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  {n.author} · {formatDate(n.createdAt)}
                </p>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-center text-xs text-faint">
        <Link href="/leads" className="hover:text-ink">
          Back to all leads
        </Link>
      </p>
    </>
  );
}
