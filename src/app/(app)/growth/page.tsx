import { Bot, ChevronRight, ClipboardList, Layers, Link2, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/cards/GlassCard";
import { InsightCard } from "@/components/cards/InsightCard";
import { ConfidenceMeter, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBusiness, getBusinesses, getInsights, getSurveyQuestions, getSurveyResponses, getTrends, showsSamples } from "@/lib/data-source";

export const metadata: Metadata = { title: "Growth Lab" };

export default function GrowthPage() {
  const samples = showsSamples();
  const trends = getTrends();
  const businesses = getBusinesses();
  const questions = getSurveyQuestions();
  const answers = getSurveyResponses();
  const consented = answers.filter((a) => a.questionId === "q20" && a.answer.startsWith("Yes")).length;

  return (
    <>
      <PageHeader title="Growth Lab" subtitle="Long-term case studies: why businesses grow, and what to ask them." />

      <div className="grid grid-cols-2 gap-3">
        <GlassCard href="/growth/dex" label="Open case studies (Business Dex)" padding="tight" className="space-y-1">
          <p className="flex items-center justify-between text-[11px] text-muted">
            Case studies <Layers aria-hidden className="size-3.5 text-violet" />
          </p>
          <p className="font-display text-2xl font-bold">{businesses.length}</p>
          <p className="text-[11px] text-faint">{samples ? "Sample: 12 months of history each" : "None yet"}</p>
        </GlassCard>
        <GlassCard href="/growth/surveys" label="Open survey question bank" padding="tight" className="space-y-1">
          <p className="flex items-center justify-between text-[11px] text-muted">
            Survey questions <ClipboardList aria-hidden className="size-3.5 text-teal" />
          </p>
          <p className="font-display text-2xl font-bold">{questions.length}</p>
          <p className="text-[11px] text-faint">{samples ? `${answers.length} sample answers` : "Ready to copy and ask"}</p>
        </GlassCard>
      </div>

      {trends.length > 0 && (
        <>
          <SectionTitle aside={<Provenance kind="sample" />}>Trends across businesses</SectionTitle>
          <div className="space-y-3">
            {trends.map((t) => (
              <GlassCard key={t.id} className="scroll-mt-16 space-y-2.5">
                <div id={t.id} className="flex items-start gap-2">
                  <TrendingUp aria-hidden className="mt-0.5 size-4 shrink-0 text-lime" />
                  <div>
                    <h3 className="font-semibold leading-snug">{t.title}</h3>
                    <p className="mt-1 text-sm text-muted">{t.finding}</p>
                  </div>
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {t.businessIds.map((id) => (
                    <li key={id}>
                      <Link
                        href={`/growth/dex/${id}`}
                        className="pressable inline-flex min-h-8 items-center gap-1 rounded-full border border-line bg-white/5 px-2.5 text-xs hover:border-violet/50"
                      >
                        <Link2 aria-hidden className="size-3 text-violet" />
                        {getBusiness(id)?.name ?? id}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between gap-2 border-t border-line pt-2">
                  <ConfidenceMeter level={t.confidence} />
                  <span className="text-right text-[11px] text-faint">{t.caveat}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        </>
      )}

      <SectionTitle>How this gets real</SectionTitle>
      <GlassCard padding="none">
        <ol className="divide-y divide-line text-sm">
          {[
            "Ask clients (and willing prospects) the survey questions. Start with the consent question.",
            "Record their answers and monthly numbers. Later, results come from GoHighLevel (read-only).",
            "The app spots patterns across businesses and shows the evidence behind each one.",
            "A person reviews every pattern before anyone acts on it.",
          ].map((step, i) => (
            <li key={step} className="flex gap-3 px-4 py-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal/20 text-[11px] font-bold text-teal">
                {i + 1}
              </span>
              <span className="text-muted">{step}</span>
            </li>
          ))}
        </ol>
        {samples && (
          <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
            {consented} sample businesses have said yes to sharing anonymized numbers.
          </p>
        )}
      </GlassCard>

      {samples && (
        <>
          <SectionTitle aside={<Provenance kind="sample" />}>Insights to review</SectionTitle>
          <div className="mb-3 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-xs">
            <Bot aria-hidden className="mt-0.5 size-4 shrink-0 text-amber" />
            <p className="text-muted">
              <span className="font-semibold text-ink">No AI is running.</span> These were written by hand to show the
              format. Later AI suggestions read data only, cite their evidence and wait for a person to review them.
            </p>
          </div>
          <div className="space-y-3">
            {getInsights().map((i) => (
              <InsightCard key={i.id} insight={i} />
            ))}
          </div>

          <Link href="/growth/dex" className="pressable mt-5 flex items-center justify-between rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-sm font-semibold">
            Browse all case studies <ChevronRight aria-hidden className="size-4 text-faint" />
          </Link>
        </>
      )}
    </>
  );
}
