"use client";

// Ask BizToad (0029, docs/BIZTOAD_PLAN.md section 10). The chat lives only in this panel:
// closing it or the tab forgets everything. Answers are plain text (never HTML) and are
// suggestions only. The server checks the role, the caps and the budget on every question.

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { askToad } from "@/app/actions";
import type { ToadAnswer } from "@/lib/ai/toad-snapshot";

type Turn = { q: string; answer?: ToadAnswer; error?: string; costUsd?: number };

const money = (n: number) => `$${n.toFixed(2)}`;
const cents = (n: number) => (n < 0.01 ? "under 1¢" : `${Math.round(n * 100)}¢`);

export function ToadChat({ usedUsd, capUsd, onThinking }: { usedUsd: number | null; capUsd: number; onThinking: (on: boolean) => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const spentHere = turns.reduce((n, t) => n + (t.costUsd ?? 0), 0);

  function ask() {
    const q = text.trim();
    if (!q || pending) return;
    // Only finished turns go back as context (the server cleans and caps them again).
    const history = turns.filter((t) => t.answer).map((t) => ({ q: t.q, a: t.answer!.answer }));
    setText("");
    setTurns((all) => [...all, { q }]);
    onThinking(true);
    start(async () => {
      let reply: Awaited<ReturnType<typeof askToad>>;
      try {
        reply = await askToad(q, history);
      } catch {
        reply = { error: "BizToad couldn't answer just now. Try again in a minute." };
      }
      onThinking(false);
      setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, ...reply } : t)));
      requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {turns.length === 0 ? (
        <p className="text-muted">
          Ask me about clients, work orders, the team or where to find something. I only see what your login can see, and I never see money.
        </p>
      ) : (
        <ol ref={listRef} aria-live="polite" className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {turns.map((t, i) => (
            <li key={i} className="space-y-2">
              <p className="ml-6 rounded-2xl rounded-br-md bg-violet-deep/40 px-3 py-2 text-ink">{t.q}</p>
              {t.error ? (
                <p className="rounded-2xl border border-amber/40 bg-amber/10 px-3 py-2 text-amber">{t.error}</p>
              ) : t.answer ? (
                <div className="mr-2 space-y-2 rounded-2xl rounded-bl-md border border-line bg-white/5 px-3 py-2">
                  <p className="whitespace-pre-line">{t.answer.answer}</p>
                  {t.answer.points.length > 0 && (
                    <ul className="space-y-1 text-[13px]">
                      {t.answer.points.map((p, j) => (
                        <li key={j}>
                          • {p.text} {p.source && <span className="text-faint">({p.source})</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.answer.unknowns.length > 0 && <p className="text-[12px] text-faint">Not in what I can see: {t.answer.unknowns.join("; ")}</p>}
                  {t.answer.links.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {t.answer.links.map((l) => (
                        <Link key={l.path} href={l.path} className="pressable inline-flex min-h-9 items-center rounded-xl border border-line px-2.5 text-[12px] font-medium hover:bg-white/5">
                          {l.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-faint">
                    Suggestion — check before acting.{typeof t.costUsd === "number" ? ` Cost ${cents(t.costUsd)}.` : ""}
                  </p>
                </div>
              ) : (
                <p className="text-muted">Thinking…</p>
              )}
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
        className="flex flex-col gap-2"
      >
        <label htmlFor="toad-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="toad-question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask();
            }
          }}
          maxLength={1000}
          rows={2}
          placeholder="e.g. Which work orders are overdue?"
          className="min-h-11 w-full resize-none rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-violet"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !text.trim()} className="pressable min-h-11 flex-1 rounded-2xl bg-violet-deep px-3 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Thinking…" : "Ask"}
          </button>
          {turns.length > 0 && (
            <button type="button" disabled={pending} onClick={() => setTurns([])} className="pressable min-h-11 rounded-2xl border border-line px-3 text-[13px] font-medium text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
      </form>
      <p className="text-[11px] text-faint">
        {usedUsd !== null ? `You've used ${money(usedUsd + spentHere)} of ${money(capUsd)} this month.` : `Your monthly allowance is ${money(capUsd)}.`} Chats aren&apos;t saved.
      </p>
    </div>
  );
}
