// "Atlas asks": up to 3 quick questions that fill gaps in your data.
// Answer, Skip (asks again in 2 weeks) or Later (asks again in 3 days).
// Answers update YOUR database only. The server re-checks every answer.

import { MessageCircleQuestion } from "lucide-react";
import { answerQuestion } from "@/app/actions";
import type { AtlasQuestion } from "@/lib/types";

const input = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const btn = "pressable min-h-10 rounded-xl px-3 text-xs font-semibold";

function Fields({ q, today }: { q: AtlasQuestion; today: string }) {
  switch (q.type) {
    case "services":
      return (
        <div className="flex flex-wrap gap-2">
          {(["SEO", "Ads", "Website"] as const).map((s) => (
            <label key={s} className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
              <input type="checkbox" name="services" value={s} /> {s}
            </label>
          ))}
        </div>
      );
    case "also_seo":
      return (
        <div className="flex gap-2">
          {[["yes", "Yes, SEO too"], ["no", "Only Ads"]].map(([v, label]) => (
            <label key={v} className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
              <input type="radio" name="choice" value={v} required /> {label}
            </label>
          ))}
        </div>
      );
    case "end_date":
    case "last_contact":
      return <input type="date" name="date" max={today} required className={input} aria-label="Date" />;
    case "check":
      return (
        <div className="space-y-2">
          <p className="rounded-xl bg-amber/10 px-3 py-2 text-xs text-amber">{q.note}</p>
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
            <input type="radio" name="choice" value="ok" /> It&apos;s correct now
          </label>
          <input name="note" maxLength={300} placeholder="Or note what's wrong" className={input} aria-label="What's wrong" />
        </div>
      );
  }
}

export function AtlasAsks({ questions, today }: { questions: AtlasQuestion[]; today: string }) {
  if (questions.length === 0) return null;
  return (
    <section aria-labelledby="atlas-asks" className="glass mt-3 rounded-3xl p-4">
      <h2 id="atlas-asks" className="flex items-center gap-2 text-sm font-semibold">
        <MessageCircleQuestion aria-hidden className="size-4 text-violet" /> Atlas asks
        <span className="text-xs font-normal text-faint">· {questions.length} quick {questions.length === 1 ? "question" : "questions"}</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {questions.map((q) => (
          <li key={q.key} className="rounded-2xl border border-line bg-white/[0.03] p-3">
            <form action={answerQuestion} className="space-y-2.5">
              <input type="hidden" name="key" value={q.key} />
              <p className="text-sm font-semibold">{q.prompt}</p>
              <p className="text-[11px] text-faint">{q.why}</p>
              <Fields q={q} today={today} />
              <div className="flex gap-2">
                <button type="submit" name="status" value="answered" className={`${btn} flex-1 bg-violet-deep`}>
                  Save
                </button>
                <button type="submit" name="status" value="later" formNoValidate className={`${btn} border border-line text-muted`}>
                  Later
                </button>
                <button type="submit" name="status" value="skipped" formNoValidate className={`${btn} border border-line text-muted`}>
                  Skip
                </button>
              </div>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
