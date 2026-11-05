import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BellRing, CalendarDays, Clock, Layers, ListChecks } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { CheckInForm } from "@/components/forms/CheckInForm";
import { ClientProfileCard } from "@/components/cards/ClientProfileCard";
import { ProfileButton } from "@/components/forms/AiButtons";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoreRing } from "@/components/labels/charts";
import { EmptyState, Pill, Provenance, StatusPill, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getAiStatus, getCheckInHistory, getClientHealth, getClientOps, getClientProfile, getMember, getRosterClient, getTeam, usesDatabase, getRosterSource, getToday, getWinBackList, tierOf } from "@/lib/data-source";
import { ClientOpsCard } from "@/components/cards/ClientOpsCard";
import { PriorityList } from "@/components/cards/ActionRow";
import { ActionForm } from "@/components/forms/ActionForm";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getRosterClient(id))?.name ?? "Client" };
}

const kindLabel = { check_in: "Check-in", call: "Call", message: "Message", email: "Email", meeting: "Meeting", note: "Note" } as const;
const tierLabel = { high: "High tier ($500+)", mid: "Mid tier ($150–499)", low: "Low tier (under $150)" } as const;
const sourceLabel: Record<string, string> = {
  sheet: "Full client sheet",
  pdf: "Top + recent clients PDF",
  demo: "Demo list",
};

export default async function ClientPage({ params }: Props) {
  const { id } = await params;
  const c = await getRosterClient(id);
  if (!c) notFound();
  const today = getToday();
  const real = (await getRosterSource()) !== "demo";
  const health = getClientHealth(c);
  const winBack = (await getWinBackList()).find((w) => w.client.id === c.id);
  const ci = health?.checkIn;
  const member = await getMember();
  const history = await getCheckInHistory(c.dbId);
  const ai = await getAiStatus();
  const profile = await getClientProfile(c.dbId);
  const canUseAi = Boolean(member && member.role !== "developer" && ai.configured && ai.tablesReady && c.dbId);
  const ops = await getClientOps(c.id);
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const canWork = Boolean(usesDatabase() && member && member.role !== "developer" && c.dbId);
  const nextAction = [...(ops?.open ?? [])].sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"))[0] ?? null;
  const isCurrent = c.status !== "canceled" && c.status !== "incomplete_expired";

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.status === "active" ? tierLabel[tierOf(c.monthlyUsd)] : undefined}
        backHref="/clients"
        backLabel="Clients"
        action={<StatusPill status={c.status} />}
      />

      {c.check && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Needs checking.</span> <span className="text-muted">{c.check}</span>
          </p>
        </div>
      )}

      {c.followUp && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <BellRing aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Follow up.</span> <span className="text-muted">{c.followUp}</span>
          </p>
        </div>
      )}

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
          />
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

      <SectionTitle>Account</SectionTitle>
      <GlassCard className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">Monthly</p>
          <p className="font-display text-2xl font-bold">{formatUsdExact(c.monthlyUsd)}</p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted">
            <Clock aria-hidden className="size-3" /> With you
          </p>
          <p className="font-display text-2xl font-bold">{describeTenure(c.startDate, today)}</p>
        </div>
        <div className="col-span-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarDays aria-hidden className="size-4" /> Started {formatDate(c.startDate)}
        </div>
      </GlassCard>

      {health && ci && (
        <>
          <SectionTitle>Health &amp; check-ins</SectionTitle>
          <GlassCard className="space-y-3">
            <div className="flex items-center gap-4">
              <ScoreRing score={health.score} color={healthStyle[health.level].ring} label={`Health ${health.score} out of 100`} size={64} />
              <div>
                <p className={`text-lg font-bold ${healthStyle[health.level].text}`}>{healthStyle[health.level].label}</p>
                <p className="text-xs text-muted">
                  {ci.state === "never_logged"
                    ? `No check-in logged · check in every ${ci.cadenceDays} days`
                    : `Last check-in ${formatDate(ci.last!)} · next ${ci.state === "overdue" ? "was due" : "due"} ${formatDate(ci.due!)}`}
                </p>
              </div>
            </div>
            <ul className="space-y-1.5 border-t border-line pt-3 text-xs">
              {health.factors.map((f) => (
                <li key={f.label} className="flex justify-between gap-3">
                  <span className="text-muted">{f.label}</span>
                  <span className={f.impact < 0 ? "shrink-0 font-semibold text-rose" : f.impact > 0 ? "shrink-0 font-semibold text-lime" : "shrink-0 text-faint"}>
                    {f.impact < 0 ? f.impact : f.impact > 0 ? `+${f.impact}` : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-faint">Starts at 100. Each risk takes points off; a &ldquo;better&rdquo; check-in adds 10 back. 75+ healthy, 50–74 watch, under 50 at risk.</p>
          </GlassCard>
          {c.status !== "canceled" && c.status !== "incomplete_expired" && (
            <GlassCard className="mt-2.5">
              {usesDatabase() && c.dbId && member && member.role !== "developer" ? (
                <>
                  <p className="mb-2 text-xs font-semibold text-muted">Log a contact</p>
                  <CheckInForm clientId={c.dbId} slug={c.id} today={today} />
                </>
              ) : (
                <p className="text-xs text-muted">
                  Logging check-ins turns on once the database is connected. For now, tell Claude the date.
                </p>
              )}
            </GlassCard>
          )}
          {history.length > 0 && (
            <GlassCard className="mt-2.5">
              <p className="mb-2 text-xs font-semibold text-muted">Recent contacts</p>
              <ul className="space-y-2 text-sm">
                {history.map((h, i) => {
                  const Icon = h.mood === "better" ? ArrowUpRight : h.mood === "worse" ? ArrowDownRight : ArrowRight;
                  const tone = h.mood === "better" ? "text-lime" : h.mood === "worse" ? "text-rose" : "text-faint";
                  return (
                    <li key={`${h.date}-${i}`} className="flex gap-2">
                      <Icon aria-hidden className={`mt-0.5 size-4 shrink-0 ${tone}`} />
                      <span className="min-w-0">
                        <span className="font-semibold">{formatDate(h.date)}</span>
                        {h.kind && h.kind !== "check_in" && <span className="ml-1.5 text-xs text-sky">{kindLabel[h.kind]}</span>}
                        {h.mood && <span className={`ml-1.5 text-xs ${tone}`}>{h.mood === "better" ? "Better" : h.mood === "worse" ? "Worse" : "Same"}</span>}
                        {h.note && <span className="block break-words text-xs text-muted">{h.note}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </GlassCard>
          )}
        </>
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

      <SectionTitle>Services</SectionTitle>
      <GlassCard className="flex flex-wrap items-center gap-2 text-sm">
        {c.services.length > 0 ? (
          c.services.map((s) => (
            <Pill key={s} color="violet">
              {s}
            </Pill>
          ))
        ) : (
          <span className="text-muted">Not set yet. Tell Claude which services (SEO, Ads, Website) this client buys.</span>
        )}
      </GlassCard>

      <SectionTitle aside="From GoHighLevel, Phase 3">Results &amp; work orders</SectionTitle>
      <EmptyState icon={<ListChecks className="size-5" />} title="Not connected yet">
        Leads, appointments and this client&apos;s work orders will appear here once GoHighLevel is connected
        read-only. Nothing is made up in the meantime.
      </EmptyState>

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
    </>
  );
}
