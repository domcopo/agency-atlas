// Client page: the relationship journey (6 stages, 27 ticks) and the next move.
// Atlas never sends anything: copy the draft, send it from GoHighLevel, tap Done.

import { Check } from "lucide-react";
import { startOnboarding } from "@/app/actions";
import { NextMoveForm } from "@/components/forms/NextMoveForm";
import { cn, formatDate } from "@/lib/format";
import { draftMessage, GROW_STAGE, JOURNEY_STAGES, JOURNEY_TOUCHES, touchByStep, type JourneyState } from "@/lib/journey";

export function JourneyCard({ journey, clientDbId, slug, business, canEdit }: { journey: JourneyState; clientDbId: string; slug: string; business: string; canEdit: boolean }) {
  const next = journey.next ? touchByStep(journey.next.step) : undefined;
  const neverStarted = !journey.startedOn;
  return (
    <section className="glass rounded-3xl p-4" aria-labelledby="journey-h">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="journey-h" className="text-sm font-semibold">
          Relationship journey
        </h2>
        <span className="text-[11px] text-faint">{neverStarted ? "Ongoing" : `${journey.handled} of 27 touches`}</span>
      </div>

      <ol className="mt-3 grid grid-cols-6 gap-1 text-center" aria-label="Journey stages">
        {JOURNEY_STAGES.map((name, i) => {
          const done = i < journey.stage && !(neverStarted && i < GROW_STAGE);
          const now = i === journey.stage;
          return (
            <li key={name} className="flex flex-col items-center gap-1" aria-current={now ? "step" : undefined}>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-[10px] font-semibold",
                  done ? "border-lime/60 bg-lime/15 text-lime" : now ? "border-violet bg-violet/20 text-violet" : "border-line text-faint",
                )}
              >
                {done ? <Check aria-hidden className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-[10px] leading-tight", now ? "font-semibold text-violet" : done ? "text-muted" : "text-faint")}>{name}</span>
            </li>
          );
        })}
      </ol>

      {!neverStarted && (
        <div className="mt-3 flex gap-[2px]" aria-label={`${journey.handled} of 27 touches done or skipped`}>
          {JOURNEY_TOUCHES.map((t, i) => (
            <span
              key={t.step}
              title={`${t.step}. ${t.title}`}
              className={cn(
                "h-2 flex-1 rounded-sm",
                journey.ticks[i] === "done" ? "bg-lime/70" : journey.ticks[i] === "skipped" ? "bg-white/25" : journey.ticks[i] === "next" ? "bg-violet" : "bg-white/8",
              )}
            />
          ))}
        </div>
      )}

      {next && journey.next && (
        <div className="mt-4 rounded-2xl border border-violet/25 bg-violet/8 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet">
            Next move · {next.step <= 27 ? `touch ${next.step}` : "ongoing"} · {next.how}
          </p>
          <p className="mt-1 text-base font-semibold">{next.title}</p>
          <p className={cn("text-xs", journey.next.overdue ? "font-semibold text-rose" : "text-muted")}>
            {journey.next.overdue ? "Overdue since" : "Due"} {formatDate(journey.next.due)}
            {next.withSeo ? " · with the SEO team's work" : ""}
          </p>
          <p className="mt-2 text-sm text-muted">{next.say}</p>
          {next.ask && (
            <p className="mt-1 text-sm">
              <span className="text-muted">Ask for: </span>
              {next.ask}
            </p>
          )}
          {canEdit && <NextMoveForm clientId={clientDbId} slug={slug} step={next.step} defaultChannel={next.channel} draft={draftMessage(next, business)} />}
          <p className="mt-2 text-[11px] text-faint">Nothing sends from Atlas. Copy, send from GoHighLevel, then tap Done.</p>
        </div>
      )}

      {canEdit && (
        <form action={startOnboarding} className="mt-3">
          <input type="hidden" name="clientId" value={clientDbId} />
          <input type="hidden" name="slug" value={slug} />
          <button type="submit" className="pressable min-h-10 text-xs font-semibold text-violet">
            {neverStarted ? "Start onboarding (27 touches from today)" : "Restart the journey from today"}
          </button>
          {neverStarted && <p className="text-[11px] text-faint">This client started before the journey existed, so they&apos;re on the ongoing rhythm.</p>}
        </form>
      )}
    </section>
  );
}

/** Clients list: 6 short lines, the current stage highlighted, and a one-line label. */
export function JourneyMini({ stage, label, overdue, started }: { stage: number; label: string; overdue: boolean; started: boolean }) {
  return (
    <span className="flex min-w-0 flex-col gap-1" aria-label={`Journey: ${label}`}>
      <span className="flex w-28 gap-[3px]" aria-hidden>
        {JOURNEY_STAGES.map((n, i) => (
          <span key={n} className={cn("h-1.5 flex-1 rounded-full", i === stage ? "bg-violet" : i < stage && started ? "bg-lime/60" : "bg-white/12")} />
        ))}
      </span>
      <span className={cn("truncate text-[11px]", overdue ? "font-semibold text-amber" : "text-faint")}>{label}</span>
    </span>
  );
}
