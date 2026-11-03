import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getSurveyQuestions, getSurveyResponses } from "@/lib/data-source";
import type { SurveyTopic } from "@/lib/types";

export const metadata: Metadata = { title: "Survey questions" };

const topics: SurveyTopic[] = ["Goals", "Getting customers", "Sales process", "Pricing & offers", "Keeping customers", "Operations"];

export default function SurveysPage() {
  const questions = getSurveyQuestions();
  const answers = getSurveyResponses();
  const consent = questions.find((q) => q.id === "q20");
  const fullSurvey = [
    ...(consent ? [consent] : []),
    ...questions.filter((q) => q.id !== "q20"),
  ]
    .map((q, i) => `${i + 1}. ${q.question}${q.options ? ` (${q.options.join(" / ")})` : ""}`)
    .join("\n");

  return (
    <>
      <PageHeader
        title="Survey questions"
        subtitle="What to ask businesses so we learn what makes them grow."
        backHref="/growth"
        backLabel="Growth"
      />

      <GlassCard className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Copy the whole survey</p>
          <p className="text-xs text-muted">{questions.length} questions, consent first. Paste into your form tool.</p>
        </div>
        <CopyButton text={fullSurvey} label="Copy all survey questions" />
      </GlassCard>

      <div className="mt-3 flex gap-3 rounded-2xl border border-lime/30 bg-lime/8 p-3.5 text-xs text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-lime" />
        <p>
          <span className="font-semibold text-ink">Ask permission first</span> and only use answers from businesses that
          say yes. Don&apos;t ask for personal, health or bank details. This app doesn&apos;t send surveys: you copy the
          questions. An online form people fill in would come in a later phase, with spam protection.
        </p>
      </div>

      {topics.map((topic) => {
        const qs = questions.filter((q) => q.topic === topic);
        return (
          <section key={topic}>
            <SectionTitle aside={`${qs.length} questions`}>{topic}</SectionTitle>
            <div className="space-y-2.5">
              {qs.map((q) => {
                const n = answers.filter((a) => a.questionId === q.id).length;
                return (
                  <GlassCard key={q.id} padding="tight" className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold">{q.question}</p>
                      <CopyButton text={q.question} label={`Copy question: ${q.question}`} />
                    </div>
                    <p className="text-xs text-muted">
                      <span className="text-faint">Why we ask: </span>
                      {q.why}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Pill>{q.answerType}</Pill>
                      {q.options?.map((o) => (
                        <Pill key={o} color="sky">
                          {o}
                        </Pill>
                      ))}
                      {n > 0 && <span className="text-[11px] text-faint">{n} sample answer{n === 1 ? "" : "s"}</span>}
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
