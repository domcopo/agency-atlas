// The developer's work screen (approved 2026-11-10): Now / Next / Waiting / Sent for review.
// Big, plain buttons: Start, I'm stuck (says why), Ready for review. Steps are tick boxes
// (0016). Plain forms post to the same server actions as everywhere else; the database has
// the final say (developers can change only the status and ticks of their own items).
// readOnly = "Preview as developer": everything shows, nothing can be pressed (the server
// refuses too).

import { BookOpen, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { toggleStep, updateAction } from "@/app/actions";
import { priorityTone } from "@/components/cards/ActionRow";
import { cn } from "@/lib/format";
import { developerSections, dueLabel, dueWhen, kindLabel, minutesLabel, needsReview, parseSteps, promiseMissed, stepProgress } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";
import { DEADLINE_STYLE, deadlineColor } from "@/lib/work-orders";

const bigBtn = "pressable inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink disabled:opacity-50";

export function DeveloperWork({ items, today, readOnly = false, stepsReady = true }: { items: ClientAction[]; today: string; readOnly?: boolean; stepsReady?: boolean }) {
  const s = developerSections(items, today);
  const total = s.now.length + s.next.length + s.waiting.length + s.review.length;
  if (!total) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing assigned right now. New work shows up here as soon as a manager adds it.</p>;
  return (
    <div className="space-y-5">
      <Section title="Now" hint="What you're working on" items={s.now} today={today} readOnly={readOnly} stepsReady={stepsReady} open empty="Nothing started. Pick the top item in Next and tap Start." />
      <Section title="Next" hint="Most urgent first" items={s.next} today={today} readOnly={readOnly} stepsReady={stepsReady} openFirst={s.now.length === 0} />
      <Section title="Waiting" hint="Stuck or waiting on someone" items={s.waiting} today={today} readOnly={readOnly} stepsReady={stepsReady} />
      <Section title="Sent for review" hint="A manager checks these" items={s.review} today={today} readOnly={readOnly} stepsReady={stepsReady} />
      <Link href="/kit" className="pressable glass flex min-h-11 items-center gap-2 rounded-2xl px-4 text-sm">
        <BookOpen aria-hidden className="size-4 text-violet" />
        <span className="font-semibold">How-to guides</span>
        <span className="text-muted">SOPs and tools in the Kit</span>
      </Link>
    </div>
  );
}

function Section({
  title,
  hint,
  items,
  today,
  readOnly,
  stepsReady,
  open = false,
  openFirst = false,
  empty,
}: {
  title: string;
  hint: string;
  items: ClientAction[];
  today: string;
  readOnly: boolean;
  stepsReady: boolean;
  open?: boolean;
  openFirst?: boolean;
  empty?: string;
}) {
  if (!items.length && !empty) return null;
  return (
    <section aria-label={title}>
      <h2 className="mb-2 flex items-baseline justify-between px-1">
        <span className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
          {title} {items.length ? <span className="text-faint">({items.length})</span> : null}
        </span>
        <span className="text-[11px] text-faint">{hint}</span>
      </h2>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((a, i) => (
            <Card key={a.id} a={a} today={today} readOnly={readOnly} stepsReady={stepsReady} open={open || (openFirst && i === 0)} />
          ))}
        </ul>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-xs text-muted">{empty}</p>
      )}
    </section>
  );
}

function Card({ a, today, readOnly, stepsReady, open }: { a: ClientAction; today: string; readOnly: boolean; stepsReady: boolean; open: boolean }) {
  const when = dueWhen(a.dueOn, today);
  const missed = promiseMissed(a, today);
  const progress = stepProgress(a);
  const steps = parseSteps(a.steps);
  return (
    <li className={cn("rounded-2xl border bg-white/[0.03]", a.reviewNote && a.status !== "review" ? "border-amber/50" : "border-line")}>
      <details open={open} className="group">
        <summary className="pressable flex min-h-12 cursor-pointer list-none items-start gap-2 p-3">
          <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", priorityTone[a.priority].dot)} aria-label={`${priorityTone[a.priority].label} priority`} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-snug">{a.title}</span>
            <span className="mt-0.5 block text-[11px] text-muted">
              {a.client ? a.client.name : "No client"} · {kindLabel(a.kind)}
              {" · "}
              <span className={cn(DEADLINE_STYLE[deadlineColor(a.dueOn, today, a.status)].text, when === "overdue" || when === "today" ? "font-semibold" : "")}>{dueLabel(a.dueOn, today)}</span>
              {progress && (
                <span className={progress.done === progress.total ? "text-lime" : "text-teal"}>
                  {" · "}
                  {progress.done} of {progress.total} steps
                </span>
              )}
            </span>
            {a.reviewNote && a.status !== "review" && <span className="mt-0.5 block text-[11px] font-semibold text-amber">Sent back: {a.reviewNote}</span>}
            {a.status === "blocked" && <span className="mt-0.5 block text-[11px] text-rose">Stuck: {a.blockedReason || "no reason given"}</span>}
            {a.status === "waiting" && <span className="mt-0.5 block text-[11px] text-teal">Waiting on someone</span>}
          </span>
        </summary>

        <div className="space-y-2.5 border-t border-line px-3 pb-3 pt-2.5">
          {(a.promisedOn || a.estMinutes) && (
            <p className="text-[11px]">
              {a.promisedOn && <span className={missed ? "font-semibold text-rose" : "text-amber"}>{missed ? "Promise to the client missed" : "Promised to the client by"} {a.promisedOn}</span>}
              {a.promisedOn && a.estMinutes ? " · " : ""}
              {a.estMinutes ? <span className="text-faint">About {minutesLabel(a.estMinutes)}</span> : null}
            </p>
          )}

          {steps.length > 0 && (
            <ol className="space-y-1">
              {steps.map((step, i) => (
                <Step key={`${i}-${step}`} a={a} n={i + 1} text={step} ticked={progress?.ticked.has(i + 1) ?? false} readOnly={readOnly || !stepsReady || a.status === "review"} />
              ))}
              {!stepsReady && <li className="text-[11px] text-faint">Tick boxes turn on after the 0016 setup step.</li>}
            </ol>
          )}

          {a.notes && <p className="text-xs text-muted">{a.notes}</p>}
          {a.kind === "work_order" && (
            <Link href={`/work/orders/${a.id}`} className="inline-flex min-h-9 items-center text-xs font-semibold text-violet hover:underline">
              Open: comments, links, hours, history →
            </Link>
          )}
          {(a.sourceLink || a.sourceNote) && (
            <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
              {a.sourceNote && <span>From: {a.sourceNote}</span>}
              {a.sourceLink && (
                <a href={a.sourceLink} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-9 items-center gap-1 font-semibold text-violet hover:underline">
                  Open conversation <ExternalLink aria-hidden className="size-3" />
                </a>
              )}
            </p>
          )}

          {a.status === "review" ? (
            <p className="rounded-xl border border-violet/30 bg-violet/5 px-3 py-2 text-xs text-violet">
              Waiting for a manager{a.submittedAt ? ` since ${a.submittedAt.slice(0, 10)}` : ""}. Nothing to do unless it comes back.
            </p>
          ) : (
            <fieldset disabled={readOnly} className="space-y-2">
              <div className="flex gap-2">
                {a.status !== "in_progress" && (
                  <StatusButton a={a} status="in_progress" className="bg-violet-deep">
                    {a.status === "blocked" || a.status === "waiting" ? "Back to it" : "Start"}
                  </StatusButton>
                )}
                <form action={updateAction} className="flex flex-1">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="done" />
                  <button type="submit" className={cn(bigBtn, "border border-lime/40 bg-lime/10 text-lime")}>
                    {needsReview(a) ? "Ready for review" : "Done"}
                  </button>
                </form>
              </div>
              {a.status !== "blocked" && (
                <form action={updateAction} className="flex gap-2">
                  <input type="hidden" name="actionId" value={a.id} />
                  <input type="hidden" name="op" value="status" />
                  <input type="hidden" name="status" value="blocked" />
                  <input name="reason" required maxLength={200} placeholder="I'm stuck on…" aria-label={`What you're stuck on for "${a.title}"`} className={input} />
                  <button type="submit" className={cn(bigBtn, "flex-none border border-rose/40 bg-rose/10 text-rose")}>
                    I&apos;m stuck
                  </button>
                </form>
              )}
            </fieldset>
          )}
          {readOnly && <p className="text-[11px] text-faint">Preview: buttons are off.</p>}
        </div>
      </details>
    </li>
  );
}

function StatusButton({ a, status, className, children }: { a: ClientAction; status: ClientAction["status"]; className?: string; children: ReactNode }) {
  return (
    <form action={updateAction} className="flex flex-1">
      <input type="hidden" name="actionId" value={a.id} />
      <input type="hidden" name="op" value="status" />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={cn(bigBtn, className)}>
        {children}
      </button>
    </form>
  );
}

export function Step({ a, n, text, ticked, readOnly }: { a: ClientAction; n: number; text: string; ticked: boolean; readOnly: boolean }) {
  return (
    <li>
      <form action={toggleStep}>
        <input type="hidden" name="actionId" value={a.id} />
        <input type="hidden" name="step" value={n} />
        <input type="hidden" name="on" value={ticked ? "0" : "1"} />
        <button
          type="submit"
          disabled={readOnly}
          aria-pressed={ticked}
          aria-label={`Step ${n}: ${text}${ticked ? " (done)" : ""}`}
          className="pressable flex min-h-11 w-full items-start gap-2.5 rounded-xl px-1 py-1.5 text-left text-sm disabled:cursor-default"
        >
          <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", ticked ? "border-lime/60 bg-lime/20 text-lime" : "border-line bg-white/5")}>
            {ticked && <Check aria-hidden className="size-3.5" />}
          </span>
          <span className={ticked ? "text-faint line-through" : "text-ink"}>{text}</span>
        </button>
      </form>
    </li>
  );
}
