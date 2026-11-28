"use client";

// "Communications needed" under the Journey Line: every client on the journey, one card each.
// Who needs something now comes first (overdue, reached out, due today, risk, request), then
// everyone else's next touch ("Coming up"). Each card shows the stage, the touch and what to
// send; tapping it opens the client drawer. At most 5 before "Show more". "Mark sent" only RECORDS the touch in Atlas (the rep sends it
// from GoHighLevel or their phone first). Nothing is ever sent from the app.

import { AlertTriangle, CalendarClock, CheckCircle2, Clock, HeartPulse, Inbox, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { logTouch } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import { cn } from "@/lib/format";
import { JOURNEY_STAGES } from "@/lib/journey";
import { CARD_TAG, CARDS_SHOWN, type ActionCard, type CardKind } from "@/lib/journey-line";
import { STAGE_COLORS, STAGE_TEXT } from "./dot-style";

export type ActionCardView = ActionCard & {
  /** Database id, for Mark sent (null in the demo or before setup: no button then). */
  clientDbId: string | null;
  /** Copy-only draft for this touch, if any. */
  draft: string | null;
  /** "What to say" for this touch (from the journey steps), shown as the prep line. */
  say: string | null;
  /** They replied STOP (0032): a text touch is logged as an email. */
  noTexts: boolean;
};

const KIND_LOOK: Record<CardKind, { Icon: typeof Clock; tone: string }> = {
  overdue: { Icon: AlertTriangle, tone: "text-rose border-rose/40 bg-rose/10" },
  reached_out: { Icon: MessageCircle, tone: "text-violet border-violet/40 bg-violet/10" },
  today: { Icon: Clock, tone: "text-amber border-amber/40 bg-amber/10" },
  risk: { Icon: HeartPulse, tone: "text-rose border-rose/40 bg-rose/10" },
  request: { Icon: Inbox, tone: "text-violet border-violet/40 bg-violet/10" },
  upcoming: { Icon: CalendarClock, tone: "text-muted border-line bg-white/5" },
};

/** Keeps cards that just disappeared for a moment, so they can slide out. */
function useLeaving(cards: ActionCardView[]) {
  const [gone, setGone] = useState<ActionCardView[]>([]);
  const prev = useRef(cards);
  const key = cards.map((c) => c.id).join("|");
  useEffect(() => {
    const ids = new Set(cards.map((c) => c.id));
    const left = prev.current.filter((c) => !ids.has(c.id));
    prev.current = cards;
    if (!left.length) return;
    setGone(left);
    const t = setTimeout(() => setGone([]), 300);
    return () => clearTimeout(t);
    // Runs when the set of cards changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [...cards, ...gone.filter((g) => !cards.some((c) => c.id === g.id)).map((g) => ({ ...g, leaving: true as const }))] as (ActionCardView & { leaving?: boolean })[];
}

export function ActionCards({ cards, clientHref, staffId }: { cards: ActionCardView[]; clientHref: string; staffId: string | null }) {
  const [all, setAll] = useState(false);
  const [mine, setMine] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const visible = cards.filter((c) => !done.has(c.id) && (!mine || c.ownerId === staffId));
  const list = useLeaving(visible);
  const limit = all ? list.length : CARDS_SHOWN;
  const hasMine = Boolean(staffId) && cards.some((c) => c.ownerId === staffId);
  const now = visible.filter((c) => c.kind !== "upcoming").length;

  return (
    <section aria-labelledby="cards-h" className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id="cards-h" className="text-sm font-semibold">
          Communications needed{" "}
          <span className="font-normal text-faint">
            · {now} now · {visible.length - now} coming up
          </span>
        </h2>
        {hasMine && (
          <button type="button" onClick={() => setMine(!mine)} aria-pressed={mine} className={cn("pressable min-h-9 rounded-full border px-3 text-[11px] font-semibold", mine ? "border-violet bg-violet/15 text-violet" : "border-line text-muted")}>
            Only my clients
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <p className="glass flex items-center gap-2 rounded-2xl px-4 py-3 text-sm text-muted">
          <CheckCircle2 aria-hidden className="size-4 text-lime" /> No client is on the journey yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {list.slice(0, limit).map((c, i) => (
            <Card key={c.id} c={c} index={i} clientHref={clientHref} onSent={() => setDone((d) => new Set(d).add(c.id))} />
          ))}
        </ul>
      )}

      {list.length > CARDS_SHOWN && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="pressable mt-2 min-h-10 w-full rounded-2xl border border-line text-xs font-semibold text-violet">
          {all ? "Show fewer" : `Show ${list.length - CARDS_SHOWN} more`}
        </button>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-faint">Tap a client for their profile, what to say and the copy-only draft. Nothing sends from Atlas: send from GoHighLevel or your phone, then tap Mark sent to record it.</p>
    </section>
  );
}

function Card({ c, index, clientHref, onSent }: { c: ActionCardView & { leaving?: boolean }; index: number; clientHref: string; onSent: () => void }) {
  const { Icon, tone } = KIND_LOOK[c.kind];
  const href = `${clientHref}${encodeURIComponent(c.slug)}`;
  return (
    <li
      className={cn("glass relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-3 py-2.5 sm:flex-nowrap", c.leaving ? "jl-card-leave" : "jl-card-in")}
      style={c.leaving ? undefined : { animationDelay: `${Math.min(index, 6) * 40}ms` }}
      aria-hidden={c.leaving || undefined}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl border", tone)}>
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <Link href={href} scroll={false} className="truncate text-sm font-semibold hover:underline after:absolute after:inset-0 after:rounded-2xl after:content-['']">
            {c.name}
          </Link>
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", tone.split(" ")[0])}>{CARD_TAG[c.kind]}</span>
          {c.stage !== null && (
            <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold", STAGE_TEXT[c.stage])}>
              <span aria-hidden className={cn("size-1.5 rounded-full", STAGE_COLORS[c.stage])} />
              {JOURNEY_STAGES[c.stage]}
            </span>
          )}
          {c.also.map((k) => (
            <span key={k} className="rounded-full border border-line px-1.5 text-[10px] text-muted">
              {CARD_TAG[k]}
            </span>
          ))}
        </span>
        {c.step !== null && (
          <span className="block truncate text-xs">
            Touch {c.step <= 27 ? `${c.step} of 27` : "· ongoing"} · {c.touchTitle}
          </span>
        )}
        <span className="block truncate text-[11px] text-muted">{c.context}</span>
        {c.say && (
          <span className="mt-0.5 line-clamp-2 text-[11px] text-ink/80">
            <span className="font-semibold text-faint">Send: </span>
            {c.say}
          </span>
        )}
      </span>
      <span className="relative z-10 ml-11 flex shrink-0 items-center gap-1.5 sm:ml-0">
        {c.draft && c.button === "mark_sent" && <CopyButton text={c.draft} label={`Copy the draft for ${c.name}`} />}
        <Primary c={c} href={href} onSent={onSent} />
      </span>
    </li>
  );
}

const primaryCls = "pressable inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-semibold";

function Primary({ c, href, onSent }: { c: ActionCardView; href: string; onSent: () => void }) {
  if (c.button === "mark_sent" && c.clientDbId && c.step !== null) return <MarkSent c={c} onSent={onSent} />;
  if (c.button === "review")
    return (
      <Link href="/#va-req-h" className={cn(primaryCls, "border border-violet/50 text-violet")}>
        Review request
      </Link>
    );
  return (
    <Link href={href} scroll={false} className={cn(primaryCls, c.button === "log_call" ? "bg-violet-deep text-white" : "border border-line text-ink")}>
      {c.button === "log_call" ? "Log call" : c.button === "mark_sent" ? "Open draft" : "Open client"}
    </Link>
  );
}

function MarkSent({ c, onSent }: { c: ActionCardView; onSent: () => void }) {
  const [state, action, pending] = useActionState(logTouch, undefined);
  const handled = useRef<unknown>(undefined);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onSent();
    }
  }, [state, onSent]);
  const how = c.channel === "text" && !c.noTexts ? "text" : "email";
  return (
    <form action={action} className="flex flex-col items-end">
      <input type="hidden" name="clientId" value={c.clientDbId ?? ""} />
      <input type="hidden" name="slug" value={c.slug} />
      <input type="hidden" name="step" value={c.step ?? ""} />
      <input type="hidden" name="how" value={how} />
      <button type="submit" disabled={pending} aria-label={`Mark touch ${c.step} sent for ${c.name} (records it in Atlas; nothing is sent)`} className={cn(primaryCls, "bg-violet-deep text-white disabled:opacity-60")}>
        {pending ? "Saving…" : "Mark sent"}
      </button>
      {state?.error && (
        <span role="alert" className="mt-1 max-w-48 text-right text-[11px] text-rose">
          {state.error}
        </span>
      )}
    </form>
  );
}
