// Audits home (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phases 1 and 3): two doors, SEO audit and
// Google Ads audit, then recent audits of both kinds, the fictional template, spending, and
// (owner) the shared audit settings. Owner, managers and salespeople; developers don't
// see audits (the database decides which audits come back).

import { ChevronRight, FileSearch, MousePointerClick, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { saveAuditUserCap } from "@/app/actions";
import { AuditSettingsForm } from "@/components/audit/AuditSettingsForm";
import { AdsPlansForm } from "@/components/audit/ads/AdsPlansForm";
import { SavedAuditCard } from "@/components/audit/SavedAuditCard";
import { GlassCard } from "@/components/cards/GlassCard";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAudits, getAuditPreview, getAuditSettings, getAuditSpend, getMember, getSalespeople, SAMPLE_AUDIT_ID, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Audits" };

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

function Door({
  href,
  icon: Icon,
  iconClass,
  title,
  blurb,
  count,
  badge,
  action,
}: {
  href: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClass: string;
  title: string;
  blurb: string;
  count: string;
  badge?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="glass flex h-full flex-col rounded-3xl p-4 lg:p-5">
      <Link href={href} className="pressable -m-1 flex flex-1 items-start gap-3 rounded-2xl p-1">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/5">
          <Icon aria-hidden className={`size-6 ${iconClass}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-bold">{title}</span>
            {badge}
          </span>
          <span className="mt-0.5 block text-sm text-muted">{blurb}</span>
          <span className="mt-1.5 block text-[11px] text-faint">{count}</span>
        </span>
        <ChevronRight aria-hidden className="mt-3 size-5 shrink-0 text-faint" />
      </Link>
      <div className="mt-3">{action}</div>
    </div>
  );
}

export default async function AuditsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="Audits" />;
  const [{ ready, audits }, settings, spend] = await Promise.all([getAudits(), getAuditSettings(), getAuditSpend()]);
  const owner = me?.role === "owner";
  const lead = isLead(me?.role);
  const people = owner ? await getSalespeople() : [];
  const sample = getAuditPreview(SAMPLE_AUDIT_ID);
  const open = audits.filter((a) => !a.archived);
  const seoCount = open.filter((a) => a.kind === "seo").length;
  const adsCount = open.filter((a) => a.kind === "ads").length;
  const saved = (n: number) => (ready ? `${n} saved` : "Not set up yet");

  return (
    <div className="@container">
      <PageHeader title="Audits" subtitle="Show a business what it's leaving on the table. Pick the kind of audit." />

      <div className="grid gap-3 @2xl:grid-cols-2">
        <Door
          href="/audits/seo"
          icon={FileSearch}
          iconClass="text-teal"
          title="SEO audit"
          blurb="Where they rank on Google and Maps, who beats them, and what ranking higher is worth."
          count={saved(seoCount)}
          action={
            <Link href="/audits/seo/new" className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-violet-deep text-sm font-semibold">
              <Plus aria-hidden className="size-4" /> New SEO audit
            </Link>
          }
        />
        <Door
          href="/audits/ads"
          icon={MousePointerClick}
          iconClass="text-amber"
          title="Google Ads audit"
          blurb="How many clicks their market has, what a click costs, and what a budget could bring in."
          count={saved(adsCount)}
          action={
            <Link href="/audits/ads/new" className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1 rounded-xl bg-violet-deep text-sm font-semibold">
              <Plus aria-hidden className="size-4" /> New Google Ads audit
            </Link>
          }
        />
      </div>

      {usesDatabase() && (!ready || !settings.ready) ? (
        <p className="glass mt-3 rounded-3xl px-4 py-3 text-sm text-muted">Saving audits needs one setup step first (0023 SQL).</p>
      ) : usesDatabase() ? (
        <div className="glass mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-3xl px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">{money(spend?.weekUsed ?? 0)}</span> <span className="text-muted">of {money(spend?.weekCap ?? settings.caps.weeklyUsd)} used this week</span>
            {lead && (
              <>
                {" · "}
                <span className="font-semibold">{money(spend?.monthUsed ?? 0)}</span> <span className="text-muted">of {money(settings.caps.monthlyUsd)} this month (everyone)</span>
              </>
            )}
          </span>
          <span className="text-[11px] text-faint">Audits don&apos;t pull paid data from the app yet, so nothing is spent here.</span>
        </div>
      ) : (
        <p className="glass mt-3 rounded-3xl px-4 py-3 text-sm text-muted">Saving audits needs the database. The template preview below still works.</p>
      )}

      <SectionTitle aside={open.length > 6 ? <Link href="/audits/seo" className="font-semibold text-violet">All SEO audits</Link> : undefined}>
        {lead ? "Recent audits" : "My recent audits"}
      </SectionTitle>
      {open.length ? (
        <ul className="grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {open.slice(0, 6).map((a) => (
            <li key={a.id}>
              <SavedAuditCard a={a} showKind />
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">No audits yet. Start one above, or open a lead and tap SEO audit for this lead.</p>
      )}

      {sample && (
        <>
          <SectionTitle>Template preview</SectionTitle>
          <GlassCard href={`/audit/${sample.id}`} label="Open the sample audit" className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <FileSearch aria-hidden className="size-4 text-teal" /> {sample.config.company.name}
            </p>
            <p className="text-sm text-muted">All eight SEO pages with a fictional business and made-up numbers, to show what an audit looks like.</p>
          </GlassCard>
        </>
      )}

      {owner && settings.ready && (
        <Fold title="Settings" summary="Spending caps, agency name, SEO and Google Ads prices" label="Audit settings">
          <div className="glass mt-2.5 space-y-5 rounded-3xl p-4">
            <AuditSettingsForm caps={settings.caps} agencyName={settings.agency.agencyName} agencyWebsite={settings.agency.agencyWebsite} plans={settings.agency.plans} />
            <div className="border-t border-line pt-4">
              <AdsPlansForm plans={settings.adsPlans} ready={settings.adsReady} />
            </div>
            {people.length > 0 && (
              <div className="border-t border-line pt-4">
                <p className="text-sm font-semibold">Weekly cap per salesperson</p>
                <p className="text-[11px] text-faint">Overrides the {money(settings.caps.weeklyUsd)} weekly cap for that person.</p>
                <ul className="mt-2 space-y-2">
                  {people.map((p) => (
                    <li key={p.userId}>
                      <form action={saveAuditUserCap} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={p.userId} />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <input name="weeklyUsd" inputMode="decimal" aria-label={`Weekly cap for ${p.name}`} defaultValue={settings.userCaps.get(p.userId) ?? settings.caps.weeklyUsd} className="min-h-11 w-24 rounded-xl border border-line bg-white/5 px-3 text-sm" />
                        <button type="submit" className="pressable min-h-11 rounded-xl border border-line px-3 text-sm font-semibold text-violet">
                          Save
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Fold>
      )}
    </div>
  );
}
