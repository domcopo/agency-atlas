// AI Search Watch board (docs/AI_VISIBILITY_PLAN.md): per client, how often ChatGPT, Gemini
// and Google's AI Overview named them, who got named instead, and each question's result.
// Server-rendered, no client JavaScript; <details> opens a client's questions. Answer
// excerpts are untrusted text and are rendered as plain text only.

import { CircleCheck, Link2 } from "lucide-react";
import { GlassCard } from "@/components/cards/GlassCard";
import { Column, Columns } from "@/components/shell/Columns";
import { SectionTitle } from "@/components/shell/PageHeader";
import { shortDate } from "@/components/watcher/Board";
import { Basis } from "@/components/watcher/Bits";
import { Change, Sparkline, trendWord } from "@/components/watcher/Charts";
import { cn } from "@/lib/format";
import { AI_ENGINE_LABEL, AI_WATCH_RULES, type AiBoard, type AiClientView, type InsteadOf } from "@/lib/watch/ai";

const scoreTone = (s: number | null) => (s === null ? "text-faint" : s >= 60 ? "text-teal" : s >= 25 ? "text-amber" : "text-rose");

export function AiSearchBoard({ board, costLine }: { board: AiBoard; costLine: string }) {
  if (board.clients.length === 0) {
    return <p className="glass rounded-3xl p-4 text-sm text-muted">No AI questions checked yet.</p>;
  }
  return (
    <Columns layout="main">
      <Column>
        <SectionTitle aside={board.latest ? `round of ${shortDate(board.latest)}` : undefined}>Clients</SectionTitle>
        <ul className="space-y-2.5">
          {board.clients.map((v) => (
            <li key={v.client.id}>
              <ClientCard view={v} />
            </li>
          ))}
        </ul>
      </Column>
      <Column>
        <SectionTitle aside={<Basis>found in answers</Basis>}>Named instead of our clients</SectionTitle>
        <GlassCard>
          <InsteadList items={board.instead} empty="Every answer that named a business also named our client." />
          <p className="mt-2 text-[11px] text-faint">Businesses the engines named in answers that left our client out, latest round, all clients.</p>
        </GlassCard>

        <SectionTitle>How this works</SectionTitle>
        <GlassCard className="space-y-2 text-xs text-muted">
          <p>
            Each question is asked the way a customer would, with the city in the words. ChatGPT and Gemini get it {AI_WATCH_RULES.tries} times per round because their
            answers change from one ask to the next; Google&apos;s AI Overview once, searched from the client&apos;s city.
          </p>
          <p>
            <span className="font-semibold text-ink">Named</span> = the business name or website appears in the answer. <span className="font-semibold text-ink">Cited</span>{" "}
            = their website is one of the sources shown. Plain matching, no AI judges the answers. An engine error counts as &ldquo;not checked&rdquo;, never as
            &ldquo;not named&rdquo;.
          </p>
          <p>AI score = named tries ÷ answered tries. Shown from {AI_WATCH_RULES.minTries} answered tries. These are samples of what the engines said on the date shown, not a promise of what every customer sees.</p>
          <p className="text-faint">{costLine}</p>
        </GlassCard>
      </Column>
    </Columns>
  );
}

function ClientCard({ view: v }: { view: AiClientView }) {
  const tw = trendWord(v.trend);
  const change = v.score !== null && v.prevScore !== null ? v.score - v.prevScore : null;
  return (
    <div className="glass rounded-3xl p-3.5 lg:p-5" id={`ai-${v.client.id}`}>
      <div className="flex items-center gap-3">
        <div className={cn("w-14 shrink-0 text-center font-display text-3xl font-bold tabular-nums", scoreTone(v.score))}>
          {v.score ?? "—"}
          <span className="sr-only"> out of 100</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{v.client.name}</p>
          <p className="text-[11px] text-muted">
            {v.client.niche} · AI score{v.score === null ? ": not enough answers yet" : ""}
          </p>
        </div>
        <Sparkline values={v.series} tone={tw.tone} label={`${v.client.name} AI score: ${tw.text.toLowerCase()}`} />
        <div className="w-16 text-right">
          <Change pct={change} suffix=" pts" />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Named by engine, latest round">
        {v.engines.map((e) => (
          <li key={e.engine} className={cn("rounded-full border px-2.5 py-1 text-[11px]", e.mentioned > 0 ? "border-teal/50 text-teal" : "border-line text-muted")}>
            {AI_ENGINE_LABEL[e.engine]}: {e.checked === 0 ? "not checked" : `${e.mentioned} of ${e.checked}`}
          </li>
        ))}
        {v.citedTries > 0 && (
          <li className="inline-flex items-center gap-1 rounded-full border border-sky/50 px-2.5 py-1 text-[11px] text-sky">
            <Link2 aria-hidden className="size-3" /> website cited {v.citedTries}×
          </li>
        )}
      </ul>

      {v.changes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {v.changes.slice(0, 3).map((c) => (
            <li key={`${c.questionId}-${c.engine}`} className={c.kind === "win" ? "text-teal" : "text-rose"}>
              {c.kind === "win" ? "▲ Now named" : "▼ Named less"} by {AI_ENGINE_LABEL[c.engine]} for &ldquo;{c.question}&rdquo; ({c.from}/{c.tries} → {c.to}/{c.tries})
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3 rounded-2xl border border-line">
        <summary className="pressable flex min-h-10 cursor-pointer items-center px-3 text-sm font-semibold text-violet">Questions and who got named instead</summary>
        <div className="space-y-3 px-3 pb-3">
          {v.rows.map((r) => (
            <div key={r.question.id} className="border-t border-line pt-2">
              <p className="text-sm">&ldquo;{r.question.text}&rdquo;</p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                {r.cells.map((c) => (
                  <li key={c.engine} className={c.mentioned > 0 ? "text-teal" : undefined}>
                    {AI_ENGINE_LABEL[c.engine]}: {c.checked === 0 ? "not checked" : `named ${c.mentioned}/${c.checked}`}
                    {c.bestPlace !== null && ` · #${c.bestPlace} in list`}
                    {c.cited && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-sky">
                        <CircleCheck aria-hidden className="size-3" />
                        cited
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {r.excerpt && (
                <p className="mt-1 rounded-xl bg-white/5 px-2.5 py-1.5 text-[11px] text-faint">
                  {AI_ENGINE_LABEL[r.excerpt.engine]}: {r.excerpt.text}
                </p>
              )}
            </div>
          ))}
          <div className="border-t border-line pt-2">
            <p className="mb-1 text-xs font-semibold">Named when {v.client.name} wasn&apos;t</p>
            <InsteadList items={v.instead} empty="Nobody: every answer that named a business named them too." />
          </div>
        </div>
      </details>
    </div>
  );
}

function InsteadList({ items, empty }: { items: InsteadOf[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((i) => (
        <li key={i.domain} className="flex items-center justify-between gap-2 text-sm">
          <span className="truncate">
            {i.domain}
            {!i.known && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-faint">not on our list</span>}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted">{i.times}×</span>
        </li>
      ))}
    </ul>
  );
}
