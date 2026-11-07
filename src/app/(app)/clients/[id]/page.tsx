import { AlertTriangle, BellRing, CalendarDays, Clock, Layers } from "lucide-react";
import type { Metadata } from "next";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/cards/CopyButton";
import { CheckInForm } from "@/components/forms/CheckInForm";
import { ClientProfileCard } from "@/components/cards/ClientProfileCard";
import { ProfileButton } from "@/components/forms/AiButtons";
import { GlassCard } from "@/components/cards/GlassCard";
import { ScoreRing } from "@/components/labels/charts";
import { Pill, Provenance, StatusPill, healthStyle } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getActions, getAiStatus, getClientHealth, getClientOps, getClientProfile, getClientTimeline, getMember, getRosterClient, getTeam, usesDatabase, getRosterSource, getToday, getWinBackList, tierOf } from "@/lib/data-source";
import { ClientOpsCard } from "@/components/cards/ClientOpsCard";
import { ScoreTrend } from "@/components/cards/RiskAlerts";
import { setClientServices } from "@/app/actions";
import { planLabel } from "@/lib/ops";
import { PriorityList } from "@/components/cards/ActionRow";
import { ActionForm } from "@/components/forms/ActionForm";
import { Timeline } from "@/components/cards/Timeline";
import { describeTenure, formatDate, formatUsdExact } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };


export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getRosterClient(id))?.name ?? "Client" };
}

const tierLabel = { high: "High tier ($500+)", mid: "Mid tier ($150–499)", low: "Low tier (under $150)" } as const;
const sourceLabel: Record<string, string> = {
  sheet: "Full client sheet",
  pdf: "Top + recent clients PDF",
  demo: "Demo list",
};

export default async function ClientPage({ params }: Props) {
  const { id } = await params;
  if (usesDatabase() && (await getMember())?.role === "developer") return <RoleNotice title="Client" />;
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
  const canUseAi = Boolean(member && member.role !== "developer" && ai.configured && ai.tablesReady && c.dbId);
  const ops = await getClientOps(c.id);
  const staff = (await getTeam()).members.map((m) => ({ id: m.id, name: m.name }));
  const canWork = Boolean(usesDatabase() && member && member.role !== "developer" && c.dbId);
  const nextAction = [...(ops?.open ?? [])].sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"))[0] ?? null;
  const isCurrent = c.status !== "canceled" && c.status !== "incomplete_expired";
  const timeline = await getClientTimeline(c.id);

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

      {c.followUp && !usesDatabase() && (
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
            ghl={c.ghl}
            plan={planLabel(c)}
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
          <Timeline entries={timeline} />
        </>
      )}

      <SectionTitle>Account</SectionTitle>
      <GlassCard className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
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
        </div>
        {member?.role === "owner" && c.dbId && (
          <details>
            <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit plan</summary>
            <form action={setClientServices} className="mt-1.5 space-y-2">
              <input type="hidden" name="clientId" value={c.dbId} />
              <input type="hidden" name="slug" value={c.id} />
              <div className="flex flex-wrap gap-2">
                {([
                  ["Website", "Website build"],
                  ["SEO", "SEO"],
                  ["Ads", "Google Ads"],
                ] as const).map(([v, label]) => (
                  <label key={v} className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
                    <input type="checkbox" name="services" value={v} defaultChecked={c.services.includes(v)} className="size-4 accent-violet-500" />
                    {label}
                  </label>
                ))}
              </div>
              <button type="submit" className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold">
                Save plan
              </button>
              <p className="text-[11px] text-faint">Monthly amount comes from your client list. Saved in this app only.</p>
            </form>
          </details>
        )}
      </GlassCard>

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
    </>
  );
}
