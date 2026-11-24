// Sales → Audits (docs/AUDIT_BUILDER_PLAN.md Phase A): saved audits, "New audit", spending,
// the fictional template, and (owner) audit settings. Read as the signed-in person: a
// salesperson gets only the audits they made; owner/managers get all; developers none.

import { FileSearch, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { saveAuditUserCap } from "@/app/actions";
import { AuditSettingsForm } from "@/components/audit/AuditSettingsForm";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAudits, getAuditPreview, getAuditSettings, getAuditSpend, getMember, getSalespeople, SAMPLE_AUDIT_ID, usesDatabase, type SavedAudit } from "@/lib/data-source";
import { stateName } from "@/lib/audit/geo";
import { deckPages } from "@/lib/audit/sections";
import { formatShortDate } from "@/lib/format";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Audits" };

const money = (n: number) => `$${n.toFixed(2).replace(/\.00$/, "")}`;

function AuditCard({ a }: { a: SavedAudit }) {
  const i = a.intake;
  return (
    <GlassCard href={`/sales/audits/${a.id}`} label={`Open ${a.title}`} className="h-full space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-semibold leading-snug">
          <FileSearch aria-hidden className="mr-1.5 inline size-4 align-[-2px] text-teal" />
          {i?.company ?? a.title}
        </p>
        {a.archived ? <Pill>Archived</Pill> : a.hasResults ? <Pill color="lime">Results in</Pill> : <Pill color="amber">Not pulled yet</Pill>}
      </div>
      {i ? (
        <p className="text-sm text-muted">
          {i.domain} · {i.hqTown}, {stateName(i.state)}
        </p>
      ) : (
        <p className="text-sm text-rose">The saved details need fixing. Open it to edit.</p>
      )}
      <p className="text-[11px] text-faint">
        {deckPages(a.sections).length} pages · {i?.competitors.length ?? 0} competitors named · {a.createdByName ? `by ${a.createdByName}, ` : ""}
        {formatShortDate(a.createdAt.slice(0, 10))}
        {a.leadGhlId ? " · from a lead" : ""}
      </p>
    </GlassCard>
  );
}

export default async function SalesAuditsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="Audits" />;
  const [{ ready, audits }, settings, spend] = await Promise.all([getAudits(), getAuditSettings(), getAuditSpend()]);
  const owner = me?.role === "owner";
  const lead = isLead(me?.role);
  const people = owner ? await getSalespeople() : [];
  const sample = getAuditPreview(SAMPLE_AUDIT_ID);
  const open = audits.filter((a) => !a.archived);
  const archived = audits.filter((a) => a.archived);

  return (
    <div className="@container">
      <PageHeader
        title="Audits"
        subtitle={lead ? "Every saved SEO audit. Build one for a lead or any business." : "Your saved SEO audits. Build one for a lead or any business."}
        backHref="/sales"
        backLabel="Sales"
        action={
          <Link href="/sales/audits/new" className="pressable inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-violet-deep px-3.5 text-sm font-semibold">
            <Plus aria-hidden className="size-4" /> New audit
          </Link>
        }
      />

      {!usesDatabase() ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Saving audits needs the database. The template preview below still works.</p>
      ) : !ready || !settings.ready ? (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Saving audits needs one setup step first (0023 SQL).</p>
      ) : (
        <div className="glass flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-3xl px-4 py-3 text-sm">
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
      )}

      <SectionTitle aside={ready ? `${open.length} saved` : undefined}>{lead ? "Saved audits" : "My audits"}</SectionTitle>
      {open.length ? (
        <ul className="grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {open.map((a) => (
            <li key={a.id}>
              <AuditCard a={a} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">No audits yet. Tap New audit, or open a lead and tap Audit this lead.</p>
      )}

      {archived.length > 0 && (
        <Fold title="Archived" summary="Hidden from the list, never deleted" badge={`${archived.length}`} label="Archived audits">
          <ul className="mt-2.5 grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {archived.map((a) => (
              <li key={a.id}>
                <AuditCard a={a} />
              </li>
            ))}
          </ul>
        </Fold>
      )}

      {sample && (
        <>
          <SectionTitle>Template preview</SectionTitle>
          <GlassCard href={`/audit/${sample.id}`} label="Open the sample audit" className="space-y-1">
            <p className="flex items-center gap-2 font-semibold">
              <FileSearch aria-hidden className="size-4 text-teal" /> {sample.config.company.name}
            </p>
            <p className="text-sm text-muted">All eight pages with a fictional business and made-up numbers, to show what an audit looks like.</p>
          </GlassCard>
        </>
      )}

      {owner && settings.ready && (
        <Fold title="Settings" summary="Spending caps, agency name, plan prices" label="Audit settings">
          <div className="glass mt-2.5 space-y-5 rounded-3xl p-4">
            <AuditSettingsForm caps={settings.caps} agencyName={settings.agency.agencyName} agencyWebsite={settings.agency.agencyWebsite} plans={settings.agency.plans} />
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
