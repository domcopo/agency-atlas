import { BillingChip } from "@/components/cards/BillingChip";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarDays, Clock, Layers } from "lucide-react";
import type { Metadata } from "next";
import { isLead } from "@/lib/roles";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { CheckInForm } from "@/components/forms/CheckInForm";
import { ClientProfileCard } from "@/components/cards/ClientProfileCard";
import { ProfileButton } from "@/components/forms/AiButtons";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoreRing } from "@/components/labels/charts";
import { Pill, Provenance, StatusPill, healthStyle } from "@/components/labels/labels";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getJourneys, getStatusLog } from "@/lib/data-source";
import { JourneyCard } from "@/components/cards/JourneyCard";
import { ClientStatusForm } from "@/components/forms/ClientStatusForm";
import { ClientMemoryForm } from "@/components/forms/ClientMemoryForm";
import { STATUS_REASONS } from "@/lib/journey";
import { getActions, getAiStatus, getBilling, getCarePlans, getClientHealth, getClientOps, getClientProfile, getClientTimeline, getMember, getRemovedCheckIns, getRosterClient, getTeam, usesDatabase, getRosterSource, getToday, getWinBackList } from "@/lib/data-source";
import { ClientOpsCard } from "@/components/cards/ClientOpsCard";
import { ScoreTrend } from "@/components/cards/RiskAlerts";
import { setCheckInRemoved } from "@/app/actions";
import { planLabel, servicesLabel } from "@/lib/ops";
import { planRhythm } from "@/lib/care";
import { ClientCareForm } from "@/components/forms/ClientCareForm";
import { PriorityList } from "@/components/cards/ActionRow";
import { ActionForm } from "@/components/forms/ActionForm";
import { Timeline } from "@/components/cards/Timeline";
import { MoveToTrashButton } from "@/components/forms/TrashForms";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getRosterClient(id))?.name ?? "Client" };
}

const sourceLabel: Record<string, string> = {
  sheet: "Full client sheet",
  pdf: "Top + recent clients PDF",
  demo: "Demo list",
};

export default async function ClientPage({ params }: Props) {
  const { id } = await params;
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="Client" />;
  const c = await getRosterClient(id);
  if (!c) notFound();
  const today = getToday();
  const real = (await getRosterSource()) !== "demo";
  const health = getClientHealth(c, (await getActions()).actions);
  const winBack = (await getWinBackList()).find((w) => w.client.id === c.id);
  const ci = health?.checkIn;
  const member = await getMember();
  const ai = await getAiStatus();
  const profile = await getClientProfile(c.dbId);
  const canUseAi = Boolean(member && isLead(member.role) && ai.configured && ai.tablesReady && c.dbId);
  const ops = await getClientOps(c.id);
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const canWork = Boolean(usesDatabase() && member && isLead(member.role) && c.dbId);
  const nextAction = [...(ops?.open ?? [])].sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"))[0] ?? null;
  const isCurrent = c.status !== "canceled" && c.status !== "incomplete_expired";
  const timeline = await getClientTimeline(c.id);
  // Owner only (empty for everyone else): removed check-ins, to restore (0021).
  const removed = await getRemovedCheckIns(c.dbId);
  // Owner only: null for everyone else (and the database returns them nothing).
  const pay = (await getBilling())?.byClient.get(c.id) ?? null;
  // Plan tiers (0025): what this client's tier includes. Empty before 0025.
  const care = await getCarePlans();
  const myTiers = (c.plans ?? []).map((p) => care.plans.find((t) => t.id === p.planId)).filter((t) => t !== undefined);
  // Journey, status log and memory (0028). journeys.ready is false before 0028 runs.
  const [journeys, statusLog] = await Promise.all([getJourneys(), getStatusLog(c.dbId)]);
  const journey = journeys.bySlug.get(c.id);
  const reasonLabel = (r: string | null) => STATUS_REASONS.find(([k]) => k === r)?.[1] ?? null;
  const statusWord = { active: "Active", paused: "Paused", canceled: "Lost" } as Record<string, string>;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.status === "active" ? `${servicesLabel(c)}${c.vip ? " · VIP" : ""}` : undefined}
        backHref="/clients"
        backLabel="Clients"
        action={<StatusPill status={c.status} />}
      />

      {pay?.chip && (
        <Link href="/billing" className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-white/[0.03] p-3 text-sm">
          <BillingChip chip={pay.chip} />
          <span className="min-w-0 flex-1 text-muted">{pay.detail ?? "Payments are up to date."}</span>
          <span className="text-[11px] text-faint">Owner only</span>
        </Link>
      )}

      {c.check && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Needs checking.</span> <span className="text-muted">{c.check}</span>
          </p>
        </div>
      )}

      {c.followUp && !usesDatabase() && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Follow up.</span> <span className="text-muted">{c.followUp}</span>
          </p>
        </div>
      )}

      {/* Wide screens: actions and history on the left; account facts on the right. */}
      <Columns layout="main" single={!usesDatabase()}>
      <Column>
      {usesDatabase() && (
        <div className="mb-3">
          <ClientOpsCard
            clientDbId={c.dbId}
            slug={c.id}
            health={ops?.health ?? null}
            ownerId={c.ownerId}
            ownerName={c.ownerName}
            lastContact={c.lastContact}
            next={nextAction}
            openIssues={(ops?.open ?? []).filter((a) => a.kind === "issue").length}
            staff={staff}
            canSetOwner={member?.role === "owner"}
            ready={Boolean(ops?.ready)}
            today={today}
            ghl={c.ghl}
            plan={planLabel(c)}
          />
        </div>
      )}

      {journey && c.dbId && (
        <div className="mb-3">
          <JourneyCard journey={journey} clientDbId={c.dbId} slug={c.id} business={c.name} canEdit={canWork} />
        </div>
      )}

      {usesDatabase() && isCurrent && (
        <section id="next" className="scroll-mt-16">
          <SectionTitle aside={ops?.open.length ? `${ops.open.length} open` : undefined}>Next actions &amp; issues</SectionTitle>
          {ops?.ready ? (
            <>
              <PriorityList
                items={ops.priorities}
                staff={staff}
                canEdit={canWork}
                limit={5}
                slug={c.id}
                empty="Nothing open. Add the next step below so this client never goes quiet."
              />
              {canWork && c.dbId && (
                <details className="glass mt-2.5 rounded-3xl px-4 py-1" open={!ops.open.length}>
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">
                    + Add next action or issue
                  </summary>
                  <div className="pb-3">
                    <ActionForm clientId={c.dbId} slug={c.id} today={today} staff={staff} defaultOwnerId={c.ownerId} />
                  </div>
                </details>
              )}
            </>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
              Next actions and issues turn on after one setup step: run <span className="font-mono text-xs">0006_owners_and_next_actions.sql</span> in Supabase.
            </p>
          )}
        </section>
      )}

      {canWork && isCurrent && (
        <details className="glass mt-2.5 rounded-3xl px-4 py-1">
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">
            + Log a contact (call, message, check-in…)
          </summary>
          <div className="pb-3">
            <CheckInForm clientId={c.dbId!} slug={c.id} today={today} />
          </div>
        </details>
      )}

      {usesDatabase() && (
        <>
          <SectionTitle>Recent history</SectionTitle>
          <Timeline entries={timeline} edit={canWork ? { slug: c.id, today } : undefined} />
          {removed.length > 0 && (
            <details className="glass mt-2.5 rounded-3xl px-4 py-1">
              <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-muted">
                Removed check-ins ({removed.length})
              </summary>
              <ul className="divide-y divide-line pb-2">
                {removed.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-faint">{r.date}</p>
                      <p className="break-words text-sm text-muted">{r.note ?? "No note"}</p>
                    </div>
                    <form action={setCheckInRemoved}>
                      <input type="hidden" name="checkInId" value={r.id} />
                      <input type="hidden" name="slug" value={c.id} />
                      <input type="hidden" name="op" value="restore" />
                      <button type="submit" className="pressable min-h-10 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold">
                        Restore
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      </Column>
      <Column>
      <SectionTitle>Account</SectionTitle>
      <GlassCard className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          {c.monthlyUsd !== null ? (
            <div>
              <p className="text-xs text-muted">Monthly (only you see this)</p>
              <p className="font-display text-2xl font-bold">{formatUsdExact(c.monthlyUsd)}</p>
            </div>
          ) : (
            <div>
              <p className="text-xs text-muted">Plan</p>
              <p className="font-display text-lg font-bold leading-tight">{servicesLabel(c)}</p>
            </div>
          )}
          <div>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Clock aria-hidden className="size-3" /> With you
            </p>
            <p className="font-display text-2xl font-bold">{describeTenure(c.startDate, today)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays aria-hidden className="size-4" /> Started {formatDate(c.startDate)}
          {ci && <span>· check in every {ci.cadenceDays} days</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          {c.services.length > 0 ? (
            c.services.map((sv) => (
              <Pill key={sv} color="violet">
                {sv}
              </Pill>
            ))
          ) : (
            <span className="text-muted">Services not set yet.</span>
          )}
          {c.vip && <Pill color="amber">VIP</Pill>}
        </div>
        {usesDatabase() && (c.ownerName || c.backupName) && (
          <p className="text-xs text-muted">
            Main person: <span className="text-ink">{c.ownerName ?? "not set"}</span>
            {care.ready && (
              <>
                {" "}
                · Backup: <span className="text-ink">{c.backupName ?? "none"}</span>
              </>
            )}
          </p>
        )}
        {myTiers.map((t) => (
          <div key={t.id} className="border-t border-line pt-3">
            <p className="text-sm font-semibold">
              {t.service} {t.name}
              {t.topTier && <span className="ml-1.5 text-[11px] font-normal text-violet">top tier</span>}
            </p>
            <p className="text-xs text-muted">{planRhythm(t)}</p>
            {t.includes.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted">
                {t.includes.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {member?.role === "owner" && c.dbId && (
          <details>
            <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit plan</summary>
            <div className="mt-1.5">
              <ClientCareForm
                client={{ dbId: c.dbId, slug: c.id, name: c.name, ownerId: c.ownerId, backupId: c.backupId, vip: c.vip, services: c.services, plans: c.plans, monthlyUsd: c.monthlyUsd }}
                staff={staff}
                tiers={care.plans}
                careReady={care.ready}
              />
            </div>
          </details>
        )}
      </GlassCard>

      {journeys.ready && c.dbId && (
        <>
          <SectionTitle>Client memory</SectionTitle>
          <GlassCard className="space-y-2">
            <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-xs text-muted">Goal</dt>
              <dd>{c.memory?.goal ?? <span className="text-faint">Not set</span>}</dd>
              <dt className="text-xs text-muted">Tone</dt>
              <dd>{c.memory?.tone ?? <span className="text-faint">Not set</span>}</dd>
              <dt className="text-xs text-muted">Next ask</dt>
              <dd>{c.memory?.nextAsk ?? <span className="text-faint">Not set</span>}</dd>
            </dl>
            {canWork && (
              <details>
                <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit memory</summary>
                <div className="pt-1">
                  <ClientMemoryForm clientId={c.dbId} slug={c.id} memory={c.memory ?? { goal: null, tone: null, nextAsk: null }} />
                </div>
              </details>
            )}
          </GlassCard>

          <SectionTitle aside={statusWord[c.status] ?? c.status}>Status</SectionTitle>
          <GlassCard className="space-y-3">
            {canWork && c.status !== "incomplete_expired" && (
              <details>
                <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">
                  {c.status === "active" ? "Pause or mark lost" : "Change status"}
                </summary>
                <div className="pt-1">
                  <ClientStatusForm clientId={c.dbId} slug={c.id} status={c.status} today={today} />
                </div>
              </details>
            )}
            {statusLog.length > 0 ? (
              <ul className="space-y-1 border-t border-line pt-2 text-xs">
                {statusLog.map((s) => (
                  <li key={s.at} className="text-muted">
                    <span className="text-faint">{formatDate(s.at.slice(0, 10))}</span> · {statusWord[s.from] ?? s.from} → <span className="text-ink">{statusWord[s.to] ?? s.to}</span>
                    {reasonLabel(s.reason) ? ` · ${reasonLabel(s.reason)}` : ""}
                    {s.note ? ` · ${s.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-faint">No status changes logged yet.</p>
            )}
          </GlassCard>
        </>
      )}

      {health && ci && (
        <details className="glass mt-2.5 rounded-3xl px-4 py-1" open={!usesDatabase()}>
          <summary className="pressable flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold">
            Health score details
            <span className="flex items-center gap-2">
              <ScoreTrend trend={ops?.trend ?? null} />
              <span className={`text-xs ${healthStyle[health.level].text}`}>{health.score}/100</span>
            </span>
          </summary>
          <div className="space-y-3 pb-3">
            <div className="flex items-center gap-4">
              <ScoreRing score={health.score} color={healthStyle[health.level].ring} label={`Health ${health.score} out of 100`} size={56} />
              <p className="text-xs text-muted">
                {ci.state === "never_logged"
                  ? `No check-in logged · check in every ${ci.cadenceDays} days`
                  : `Last contact ${formatDate(ci.last!)} · next ${ci.state === "overdue" ? "was due" : "due"} ${formatDate(ci.due!)}`}
              </p>
            </div>
            <ul className="space-y-1.5 border-t border-line pt-3 text-xs">
              {health.factors.map((f) => (
                <li key={f.label} className="flex justify-between gap-3">
                  <span className="text-muted">
                    {f.label}
                    {f.source && <span className="block text-[10px] text-faint">{f.source}</span>}
                  </span>
                  <span className={f.impact < 0 ? "shrink-0 font-semibold text-rose" : f.impact > 0 ? "shrink-0 font-semibold text-lime" : "shrink-0 text-faint"}>
                    {f.impact < 0 ? f.impact : f.impact > 0 ? `+${f.impact}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-faint">Starts at 100; each fact takes points off. Every line is a recorded fact (no AI guesses); the small grey text says where it came from. The word at the top of the page is what to act on.</p>
          </div>
        </details>
      )}

      {(profile || canUseAi) && (
        <>
          <SectionTitle>Client profile</SectionTitle>
          {profile && <ClientProfileCard profile={profile} canReview={member?.role === "owner"} />}
          {canUseAi && (
            <div className={profile ? "mt-2.5" : ""}>
              <ProfileButton slug={c.id} label={profile ? "Refresh profile with AI" : "Draft a profile with AI"} disabled={ai.level === "blocked"} />
            </div>
          )}
        </>
      )}

      {winBack && (
        <>
          <SectionTitle>Win-back message</SectionTitle>
          <GlassCard className="space-y-3">
            <p className="text-sm text-muted">{winBack.script}</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-faint">Copy, edit, and send it yourself. The app never sends.</span>
              <CopyButton text={winBack.script} label="Copy win-back message" />
            </div>
          </GlassCard>
        </>
      )}

      <SectionTitle>Where this record came from</SectionTitle>
      <GlassCard className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted">
            <Layers aria-hidden className="size-4" /> Listed in
          </span>
          <span className="text-right">{c.listedIn.map((s) => sourceLabel[s] ?? s).join(" + ") || "Unknown"}</span>
        </div>
        <div className="flex justify-end">
          <Provenance kind={real ? "real" : "demo"} />
        </div>
      </GlassCard>
      {real && c.dbId && (member?.role === "owner" || member?.role === "manager") && (
        <div className="mt-4">
          <MoveToTrashButton
            kind="client"
            id={c.dbId}
            what={c.name}
            note="Only for duplicates, test records or mistakes: its work orders and check-ins go with it. A former client should be marked Ended instead, so your numbers stay right."
          />
        </div>
      )}
      </Column>
      </Columns>
    </>
  );
}
