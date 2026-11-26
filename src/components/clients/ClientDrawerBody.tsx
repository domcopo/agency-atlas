// The client drawer (Clients page → a client): the 27-touch timeline with each touch's
// deliverable and whether it was done, the latest audit, and what Atlas doesn't have yet.
// Server component; reads only through data-source.

import { Check, CircleDashed, Minus, MoveRight } from "lucide-react";
import Link from "next/link";
import { JourneyCard } from "@/components/cards/JourneyCard";
import { getAudits, getCareTouches, getClientCareInfo, getMember } from "@/lib/data-source";
import { cn, formatDate } from "@/lib/format";
import { deliverableLabel, JOURNEY_STAGES, missingIntake, type JourneyState, type JourneySteps, type Tick } from "@/lib/journey";
import { auditForClient } from "@/lib/journey-line";
import { canCare, isLead } from "@/lib/roles";
import type { RosterClient } from "@/lib/types";

const TICK_LOOK: Record<Tick, { Icon: typeof Check; word: string; cls: string }> = {
  done: { Icon: Check, word: "Done", cls: "border-lime/50 bg-lime/15 text-lime" },
  skipped: { Icon: Minus, word: "Skipped", cls: "border-line bg-white/5 text-muted" },
  placed: { Icon: MoveRight, word: "Before their start point", cls: "border-line text-faint" },
  next: { Icon: CircleDashed, word: "Next", cls: "border-violet bg-violet/15 text-violet" },
  todo: { Icon: CircleDashed, word: "Upcoming", cls: "border-line text-faint" },
};

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export async function ClientDrawerBody({ client, journey, steps, today, sample }: { client: RosterClient; journey: JourneyState | undefined; steps: JourneySteps; today: string; sample: boolean }) {
  const [me, touches, careInfo, audits] = await Promise.all([getMember(), getCareTouches(), getClientCareInfo(), getAudits()]);
  const canEdit = Boolean(me && canCare(me.role) && client.dbId && !sample);
  // When each touch was last done or skipped (this journey only).
  const logs = (client.dbId ? (touches.byClient.get(client.dbId) ?? []) : []).filter((t) => t.status !== "attempt" && (!journey?.startedOn || t.happenedOn >= journey.startedOn));
  const lastOn = new Map<number, string>();
  for (const l of logs) if (!lastOn.has(l.step) || lastOn.get(l.step)! < l.happenedOn) lastOn.set(l.step, l.happenedOn);
  const info = client.dbId ? careInfo.byClient.get(client.dbId) : undefined;
  const audit = me && isLead(me.role) && audits.ready ? auditForClient(client.name, audits.audits.map((a) => ({ ...a, company: a.intake?.company ?? null }))) : null;
  const started = journey?.startedOn ?? null;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        {client.services.join(" + ") || "Services not set"}
        {client.ownerName ? ` · Main person: ${client.ownerName}` : ""}
        {client.backupName ? ` · Backup: ${client.backupName}` : ""}
        {client.vip ? " · VIP" : ""}
      </p>

      {journey ? (
        <JourneyCard
          journey={journey}
          clientDbId={client.dbId ?? ""}
          slug={client.id}
          business={client.name}
          canEdit={canEdit}
          noTexts={Boolean(info?.noTexts)}
          missing={careInfo.ready ? missingIntake(info?.intake ?? {}) : []}
          steps={steps}
        />
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">This client isn&apos;t on the journey (only active clients are).</p>
      )}

      <section aria-labelledby="timeline-h" className="glass rounded-3xl p-4">
        <h3 id="timeline-h" className="text-sm font-semibold">
          27-touch timeline
        </h3>
        {!started && <p className="mt-1 text-xs text-muted">Not started: this client is on the ongoing Grow rhythm. The list shows the plan.</p>}
        {JOURNEY_STAGES.slice(0, 5).map((stage, s) => (
          <div key={stage} className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">{stage}</p>
            <ol className="mt-1 space-y-1">
              {steps.touches
                .map((t, i) => ({ t, tick: journey?.ticks[i] ?? "todo" }))
                .filter(({ t }) => t.stage === s)
                .map(({ t, tick }) => {
                  const look = TICK_LOOK[tick];
                  const on = lastOn.get(t.step);
                  const due = started ? addDays(started, t.day) : null;
                  const late = tick === "next" && due !== null && due < today;
                  return (
                    <li key={t.step} className="flex items-start gap-2.5 rounded-xl px-1 py-1" aria-current={tick === "next" ? "step" : undefined}>
                      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[9px]", look.cls)} title={look.word}>
                        <look.Icon aria-hidden className="size-3" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          <span className="text-faint">{t.step}.</span> {t.title}
                          <span className="sr-only"> ({look.word})</span>
                        </span>
                        <span className="block text-[11px] text-muted">
                          {t.how}
                          {t.deliverable !== "none" && <> · {deliverableLabel(t.deliverable)}</>}
                        </span>
                        <span className={cn("block text-[11px]", late ? "font-semibold text-rose" : tick === "done" ? "text-lime" : "text-faint")}>
                          {tick === "done" && on
                            ? `${t.deliverable !== "none" ? "Sent" : "Done"} ${formatDate(on)}`
                            : tick === "skipped" && on
                              ? `Skipped ${formatDate(on)}`
                              : tick === "placed"
                                ? "Before their start point (placed by start date)"
                                : due
                                  ? `${late ? "Overdue since" : tick === "next" ? "Due" : "Planned"} ${formatDate(due)}`
                                  : `Day ${t.day}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
            </ol>
          </div>
        ))}
        <p className="mt-3 text-[11px] text-faint">&ldquo;Sent&rdquo; means someone marked that touch done in Atlas. Atlas never sends anything itself.</p>
      </section>

      <section aria-labelledby="extras-h" className="glass rounded-3xl p-4">
        <h3 id="extras-h" className="text-sm font-semibold">
          Audit, heat maps and Google profile
        </h3>
        <dl className="mt-2 space-y-2.5 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Latest audit</dt>
            <dd className="mt-0.5">
              {me && !isLead(me.role) ? (
                <span className="text-muted">Audits are for the owner and managers.</span>
              ) : audit ? (
                <>
                  <Link href={`/audits/${audit.id}`} className="font-semibold text-violet hover:underline">
                    {audit.title}
                  </Link>
                  <span className="block text-[11px] text-faint">Saved {formatDate(audit.createdAt.slice(0, 10))} · matched by business name (audits are saved for sales leads, not clients)</span>
                </>
              ) : (
                <span className="text-muted">No audit linked. Audits are saved for sales leads; none has this business name.</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Heat map history</dt>
            <dd className="mt-0.5 text-muted">Not available yet. Heat maps are made outside Atlas. The heat map touches above show when each one was sent.</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">Google Business Profile recommendations</dt>
            <dd className="mt-0.5 text-muted">Not available yet. Nothing in Atlas stores them. Touches with the &ldquo;Google Business Profile recommendations&rdquo; deliverable show when they were sent.</dd>
          </div>
        </dl>
      </section>

      <Link href={`/clients/${encodeURIComponent(client.id)}`} className="pressable glass flex min-h-12 items-center justify-center rounded-2xl text-sm font-semibold text-violet">
        Open the full client page
      </Link>
    </div>
  );
}
