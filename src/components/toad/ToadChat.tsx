"use client";

// Ask BizToad (0030, docs/BIZTOAD_PLAN.md section 10). The chat lives only in this panel:
// closing it or the tab forgets everything. Answers are plain text (never HTML) and are
// suggestions only. The server checks the role, the caps and the budget on every question.
//
// Voice (Phase 4): "Talk" uses the browser's own speech-to-text (Chrome sends the audio to
// Google, Safari may use Apple), and the words land in the box for you to check before
// asking; nothing is sent automatically. "Read aloud" uses a voice built into this device.
// The app records and saves nothing. Both buttons are hidden where the browser lacks them.
//
// Phase 3: developers and salespeople ask too (each gets only their own facts, chosen on the
// server from their role). Owner and managers may get one work order draft back: "Review and
// add" opens Smart add's confirm card, which saves only when a person taps Confirm.

import { ClipboardList, Mic, MicOff, Square, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { askToad, type ToadDraftPickers } from "@/app/actions";
import { DraftCard } from "@/components/forms/QuickAddWorkOrders";
import type { ToadAnswer } from "@/lib/ai/toad-snapshot";
import { pickVoice, speechText } from "@/lib/toad";
import type { WorkOrderDraft } from "@/lib/types";

type Recognizer = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognizerClass = new () => Recognizer;
const recognizerClass = (): RecognizerClass | null => {
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noSubscribe = () => () => {};

type Turn = { q: string; answer?: ToadAnswer; error?: string; costUsd?: number; draft?: WorkOrderDraft; pickers?: ToadDraftPickers };
type ChatMode = "full" | "developer" | "sales";

const INTRO: Record<ChatMode, { intro: string; example: string }> = {
  full: {
    intro: "Ask me about clients, work orders, the team or where to find something. I can also draft a work order for you to review. I only see what your login can see, and I never see money.",
    example: "e.g. Which work orders are overdue?",
  },
  developer: {
    intro: "Ask me about your own work orders, steps and due dates, or when your clients were last contacted. I only see your own work, and I never see money.",
    example: "e.g. What should I work on first today?",
  },
  sales: {
    intro: "Ask me about your leads, follow-ups, today's reach-outs, appointments or Scout prospects. I only see your own leads and the shared pool, and I never see money.",
    example: "e.g. Which of my leads haven't heard from me in a week?",
  },
};

/** "Review and add": Smart add's confirm card, opened on request. Nothing saves until Confirm. */
function DraftOffer({ draft, pickers }: { draft: WorkOrderDraft; pickers: ToadDraftPickers }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="space-y-1">
        <DraftCard d={draft} i={0} clients={pickers.clients} staff={pickers.staff} today={pickers.today} myStaffId={pickers.myStaffId && pickers.staff.some((m) => m.id === pickers.myStaffId) ? pickers.myStaffId : null} />
        <p className="text-[11px] text-faint">Nothing is saved until you tap Confirm.</p>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-violet/40 bg-violet/10 px-3 text-[13px] font-semibold">
      <ClipboardList aria-hidden className="size-4" /> Review and add: {draft.title.slice(0, 60)}
    </button>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;
const cents = (n: number) => (n < 0.01 ? "under 1¢" : `${Math.round(n * 100)}¢`);

export function ToadChat({
  usedUsd,
  capUsd,
  mode,
  onThinking,
  onTalking,
}: {
  usedUsd: number | null;
  capUsd: number;
  /** Which kind of login (sets the hints only; the server decides what BizToad sees). */
  mode: ChatMode;
  onThinking: (on: boolean) => void;
  /** While reading aloud (the frog's mouth moves). */
  onTalking: (on: boolean) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLOListElement>(null);
  const spentHere = turns.reduce((n, t) => n + (t.costUsd ?? 0), 0);

  // --- Voice ---
  const canListen = useSyncExternalStore(noSubscribe, () => recognizerClass() !== null, () => false);
  const canSpeak = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);
  const rec = useRef<Recognizer | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<number | null>(null);

  // Stop listening and talking when the panel closes.
  useEffect(
    () => () => {
      rec.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      onTalking(false);
    },
    [onTalking],
  );

  function talk() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = recognizerClass();
    if (!R) return;
    const r = new R();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = false; // stops by itself when you stop talking
    const before = text.trim();
    r.onresult = (e) => {
      const said = Array.from(e.results, (res) => res[0]?.transcript ?? "").join(" ").trim();
      setText([before, said].filter(Boolean).join(" ").slice(0, 1000));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel();
    setSpeaking(null);
    onTalking(false);
  }

  function readAloud(i: number, answer: ToadAnswer) {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking === i) {
      stopSpeaking();
      return;
    }
    const u = new SpeechSynthesisUtterance(speechText(answer));
    const voice = pickVoice(synth.getVoices(), navigator.language);
    if (voice) u.voice = voice;
    u.lang = voice?.lang ?? "en-US";
    u.rate = 1;
    u.onend = u.onerror = () => {
      setSpeaking((now) => (now === i ? null : now));
      onTalking(false);
    };
    setSpeaking(i);
    onTalking(true);
    synth.speak(u);
  }

  function ask() {
    const q = text.trim();
    if (!q || pending) return;
    rec.current?.stop();
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
        <p className="text-muted">{INTRO[mode].intro}</p>
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
                  {t.draft && t.pickers && <DraftOffer draft={t.draft} pickers={t.pickers} />}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-faint">
                      Suggestion — check before acting.{typeof t.costUsd === "number" ? ` Cost ${cents(t.costUsd)}.` : ""}
                    </p>
                    {canSpeak && (
                      <button
                        type="button"
                        onClick={() => readAloud(i, t.answer!)}
                        aria-pressed={speaking === i}
                        className="pressable inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl border border-line px-2 text-[12px] font-medium text-muted hover:text-ink"
                      >
                        {speaking === i ? <Square aria-hidden className="size-3.5" /> : <Volume2 aria-hidden className="size-3.5" />}
                        {speaking === i ? "Stop" : "Read aloud"}
                      </button>
                    )}
                  </div>
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
          placeholder={INTRO[mode].example}
          className="min-h-11 w-full resize-none rounded-2xl border border-line bg-bg px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-violet"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={pending || !text.trim()} className="pressable min-h-11 flex-1 rounded-2xl bg-violet-deep px-3 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Thinking…" : "Ask"}
          </button>
          {canListen && (
            <button
              type="button"
              onClick={talk}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Talk: say your question"}
              className={`pressable inline-flex min-h-11 items-center gap-1.5 rounded-2xl border px-3 text-[13px] font-semibold ${listening ? "border-rose/60 bg-rose/15 text-rose" : "border-line text-muted hover:text-ink"}`}
            >
              {listening ? <MicOff aria-hidden className="size-4" /> : <Mic aria-hidden className="size-4" />}
              {listening ? "Stop" : "Talk"}
            </button>
          )}
          {turns.length > 0 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (canSpeak) stopSpeaking();
                setTurns([]);
              }} className="pressable min-h-11 rounded-2xl border border-line px-3 text-[13px] font-medium text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
      </form>
      <p className="text-[11px] text-faint">
        {usedUsd !== null ? `You've used ${money(usedUsd + spentHere)} of ${money(capUsd)} this month.` : `Your monthly allowance is ${money(capUsd)}.`} Chats aren&apos;t saved.
        {canListen && " Talk uses your browser's speech-to-text (Chrome sends the audio to Google; Safari may use Apple). Check the words before you ask."}
      </p>
    </div>
  );
}
