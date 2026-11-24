import { Activity, Bot, ChevronRight, ClipboardList, FileSearch, Layers, Link2, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import { isLead } from "@/lib/roles";
import { RoleNotice } from "@/components/shell/RoleNotice";
import Link from "next/link";
import { GlassCard } from "@/components/cards/GlassCard";
import { InsightCard } from "@/components/cards/InsightCard";
import { ConfidenceMeter, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getBusiness, getBusinesses, getInsights, getMember, getOps, getSurveyQuestions, getSurveyResponses, getTrends, showsSamples, usesDatabase } from "@/lib/data-source";
import { OpportunityList } from "@/components/cards/OpportunityList";
import { opportunities } from "@/lib/ops";

export const metadata: Metadata = { title: "Growth Lab" };

export default async function GrowthPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="Growth Lab" />;
  const samples = showsSamples();
  const ops = await getOps();
  const member = usesDatabase() ? await getMember() : null;
  const opps = ops.clients
    .map((c) => ({
      slug: c.id,
      name: c.name,
      monthlyUsd: c.monthlyUsd,
      ownerName: c.ownerName,
      ideas: opportunities(c, ops.today),
      added: new Set(ops.actions.filter((a) => a.status !== "done" && a.client?.slug === c.id).map((a) => a.title.toLowerCase())),
    }))
    .filter((o) => o.ideas.length > 0)
    .sort((a, b) => b.monthlyUsd - a.monthlyUsd);
  const trends = getTrends();
  const businesses = getBusinesses();
  const questions = getSurveyQuestions();
  const answers = getSurveyResponses();
  const consented = answers.filter((a) => a.questionId === "q20" && a.answer.startsWith("Yes")).length;

  return (
    <>
      <PageHeader title="Growth Lab" subtitle="Long-term case studies: why businesses grow, and what to ask them." />

      <GlassCard href="/growth/watcher" label="Open SEO Watcher" className="mb-5 space-y-1">
        <p className="flex items-center justify-between text-[11px] text-muted">
          SEO Watcher <Activity aria-hidden className="size-3.5 text-violet" />
        </p>
        <p className="text-sm font-semibold">Rankings board: trends, movers, rising competitors, easy markets</p>
        <p className="text-[11px] text-faint">Preview with sample data; real watching comes next</p>
      </GlassCard>

      {!samples && (
        <section id="opportunities" className="mb-5 scroll-mt-16">
          <SectionTitle aside={`${opps.length} clients`}>Opportunities</SectionTitle>
          <OpportunityList items={opps} canAdd={Boolean(member && isLead(member.role) && ops.ready)} />
          <p className="mt-1.5 px-1 text-[11px] text-faint">Simple rules from your client list (services, months together, mood). You decide what to pitch.</p>
        </section>
      )}

      {/* Wide screens: the three shortcuts sit in one row. */}
      <div className="lg:grid lg:grid-cols-3 lg:gap-4">
      <div className="grid grid-cols-2 gap-3 lg:contents">
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

      <GlassCard href="/growth/audits" label="Open SEO audits" padding="tight" className="mt-3 space-y-1 lg:mt-0">
        <p className="flex items-center justify-between text-[11px] text-muted">
          SEO audits <FileSearch aria-hidden className="size-3.5 text-sky" />
        </p>
        <p className="text-sm font-semibold">Eight-page audit for a client or prospect</p>
        <p className="text-[11px] text-faint">Template preview ready; live data comes next</p>
      </GlassCard>
      </div>

      {trends.length > 0 && (
        <>
          <SectionTitle aside={<Provenance kind="sample" />}>Trends across businesses</SectionTitle>
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
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
          <div className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0">
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
