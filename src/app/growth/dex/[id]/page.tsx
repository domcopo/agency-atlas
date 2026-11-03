import { Eye, FileText, FlaskConical, Megaphone, MessageSquareQuote, Tag } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { Monogram, industryGradient } from "@/components/cards/DexCard";
import { ConfidenceMeter, Pill, RevenueLabel, SourceTag } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBusiness, getBusinesses, getCaseStudyHistory, getSurveyQuestions, getSurveyResponses } from "@/lib/data-source";
import { Sparkline } from "@/components/labels/charts";
import { formatDate, formatDexNumber } from "@/lib/format";
import type { Hypothesis } from "@/lib/types";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getBusinesses().map((b) => ({ id: b.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: getBusiness(id)?.name ?? "Business" };
}

const hypothesisPill: Record<Hypothesis["status"], { label: string; color: "neutral" | "sky" | "lime" | "rose" }> = {
  untested: { label: "Untested", color: "neutral" },
  testing: { label: "Testing", color: "sky" },
  supported: { label: "Supported", color: "lime" },
  rejected: { label: "Rejected", color: "rose" },
};

export default async function DexDetailPage({ params }: Props) {
  const { id } = await params;
  const b = getBusiness(id);
  if (!b) notFound();
  const sourceById = new Map(b.sources.map((s) => [s.id, s]));
  const revenueSource = b.revenue.status !== "unknown" ? sourceById.get(b.revenue.sourceId) : undefined;
  const history = getCaseStudyHistory(b.id);
  const first = history[0];
  const last = history[history.length - 1];
  const answers = getSurveyResponses(b.id);
  const questionById = new Map(getSurveyQuestions().map((q) => [q.id, q]));
  const series = first && last
    ? [
        { label: "Leads per month", values: history.map((h) => h.leads), from: first.leads, to: last.leads, color: "var(--color-violet)" },
        { label: "Booked calls per month", values: history.map((h) => h.bookedCalls), from: first.bookedCalls, to: last.bookedCalls, color: "var(--color-teal)" },
        { label: "Revenue index (start = 100)", values: history.map((h) => h.revenueIndex), from: first.revenueIndex, to: last.revenueIndex, color: "var(--color-lime)" },
      ]
    : [];

  return (
    <>
      <PageHeader title={b.name} subtitle={b.tagline} backHref="/growth/dex" backLabel="Business Dex" />

      <GlassCard className="overflow-hidden">
        <div
          aria-hidden
          className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-30 ${industryGradient[b.industry]}`}
        />
        <div className="relative flex items-center gap-4">
          <Monogram business={b} size="lg" />
          <div className="space-y-1.5">
            <p className="font-mono text-xs font-semibold text-muted">{formatDexNumber(b.dexNumber)}</p>
            <div className="flex flex-wrap gap-1.5">
              <Pill color="violet">{b.industry}</Pill>
              {b.isClient ? <Pill color="lime">Sample client</Pill> : <Pill>Sample business</Pill>}
            </div>
            <p className="text-xs text-muted">{b.region}</p>
          </div>
        </div>
      </GlassCard>

      {series.length > 0 && (
        <>
          <SectionTitle aside="Sample · 12 months">Long-term case study</SectionTitle>
          <GlassCard className="space-y-3">
            {series.map((x) => {
              const change = Math.round(((x.to - x.from) / Math.max(1, x.from)) * 100);
              return (
                <div key={x.label} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted">{x.label}</p>
                    <p className="text-sm font-semibold">
                      {x.from} → {x.to}{" "}
                      <span className={change >= 0 ? "text-lime" : "text-rose"}>
                        ({change >= 0 ? "+" : ""}
                        {change}%)
                      </span>
                    </p>
                  </div>
                  <Sparkline values={x.values} color={x.color} width={110} height={34} />
                </div>
              );
            })}
            <p className="border-t border-line pt-2 text-[11px] text-faint">
              {first?.month} to {last?.month}. Revenue is shown as an index, not dollars, so no revenue is invented.
            </p>
          </GlassCard>
        </>
      )}

      {answers.length > 0 && (
        <>
          <SectionTitle aside="Sample answers">Survey answers</SectionTitle>
          <div className="space-y-2.5">
            {answers.map((a) => (
              <GlassCard key={a.id} padding="tight" className="flex gap-2.5">
                <MessageSquareQuote aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
                <div className="min-w-0">
                  <p className="text-xs text-muted">{questionById.get(a.questionId)?.question}</p>
                  <p className="mt-0.5 text-sm">{a.answer}</p>
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Revenue</SectionTitle>
      <GlassCard className="space-y-2">
        <div className="text-lg">
          <RevenueLabel revenue={b.revenue} />
        </div>
        {revenueSource ? (
          <p>
            <SourceTag source={revenueSource} />
          </p>
        ) : (
          <p className="text-xs text-faint">
            No trustworthy source yet, so no number is shown. We never guess revenue.
          </p>
        )}
      </GlassCard>

      <SectionTitle aside={`${b.signals.length} observed`}>Signals</SectionTitle>
      <div className="space-y-2.5">
        {b.signals.map((s) => {
          const src = sourceById.get(s.sourceId);
          return (
            <GlassCard key={s.id} className="space-y-2">
              <p className="flex gap-2 text-sm">
                <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-teal" />
                {s.text}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ConfidenceMeter level={s.confidence} />
                <span className="text-[11px] text-faint">Seen {formatDate(s.observedAt)}</span>
              </div>
              {src && <SourceTag source={src} />}
            </GlassCard>
          );
        })}
      </div>

      <SectionTitle aside="Ideas, not facts">Growth hypotheses</SectionTitle>
      <div className="space-y-2.5">
        {b.hypotheses.map((h) => (
          <GlassCard key={h.id} className="space-y-2">
            <p className="flex gap-2 text-sm">
              <FlaskConical aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
              {h.text}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Pill color={hypothesisPill[h.status].color}>{hypothesisPill[h.status].label}</Pill>
              <ConfidenceMeter level={h.confidence} />
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GlassCard>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber">
            <Megaphone aria-hidden className="size-3.5" /> How they get customers
          </p>
          <div className="flex flex-wrap gap-1.5">
            {b.acquisitionChannels.map((c) => (
              <Pill key={c}>{c}</Pill>
            ))}
          </div>
        </GlassCard>
        <GlassCard>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal">
            <Tag aria-hidden className="size-3.5" /> Patterns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {b.patternTags.map((t) => (
              <Pill key={t} color="teal">
                {t}
              </Pill>
            ))}
          </div>
        </GlassCard>
      </div>

      <SectionTitle>Sources</SectionTitle>
      <GlassCard>
        <ul className="space-y-2.5">
          {b.sources.map((s) => (
            <li key={s.id} className="flex gap-2">
              <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <div className="min-w-0">
                <p className="text-sm">{s.label}</p>
                <p className="break-all font-mono text-[11px] text-faint">{s.url}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-faint">
          Sources are shown as text, not links. Real links will be checked before they become clickable.
        </p>
      </GlassCard>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-faint">
        <span>Updated {formatDate(b.updatedAt)}</span>
      </div>
    </>
  );
}
