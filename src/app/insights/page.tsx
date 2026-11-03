import { Bot, MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";
import { InsightCard } from "@/components/cards/InsightCard";
import { EmptyState } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getInsights } from "@/lib/data-source";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  const insights = getInsights();
  return (
    <>
      <PageHeader title="Insights Lab" subtitle="Observations with evidence, caveats and a human in charge." backHref="/more" backLabel="More" />

      <div className="flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
        <Bot aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
        <p>
          <span className="font-semibold">No AI is running.</span>{" "}
          <span className="text-muted">
            These cards were written by hand to show the format. Real AI suggestions arrive in Phase 6.
            They will read data only, and a person will review each one.
          </span>
        </p>
      </div>

      <SectionTitle aside={`${insights.length} mock insights`}>Latest</SectionTitle>
      <div className="space-y-3">
        {insights.map((i) => (
          <InsightCard key={i.id} insight={i} />
        ))}
      </div>

      <SectionTitle>Ask a question</SectionTitle>
      <EmptyState icon={<MessageCircleQuestion className="size-5" />} title="Coming in Phase 6">
        You&apos;ll ask things like &ldquo;Which lead sources turned into contracts this month?&rdquo; The AI will
        have no tools and no access to send, edit or delete anything, so it can&apos;t act on what it reads.
      </EmptyState>
    </>
  );
}
