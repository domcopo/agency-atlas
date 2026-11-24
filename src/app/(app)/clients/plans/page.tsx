// Owner only: plan tiers per service (SEO first). Name, order, hours cap, what's
// included and the contact rhythm. Tiers are archived, never deleted. No prices here.

import { Archive, ArchiveRestore } from "lucide-react";
import type { Metadata } from "next";
import { setCarePlanArchived } from "@/app/actions";
import { CarePlanForm } from "@/components/forms/CarePlanForm";
import { GlassCard } from "@/components/cards/GlassCard";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { CARE_RULES, planRhythm } from "@/lib/care";
import { getCarePlans, getMember, getRoster, usesDatabase } from "@/lib/data-source";
import type { Service } from "@/lib/types";

export const metadata: Metadata = { title: "Plan tiers" };

const SERVICES: [Service, string, string][] = [
  ["SEO", "SEO", "Main focus"],
  ["Ads", "Google Ads", "Later priority"],
  ["Website", "Website build", "Later priority"],
];

export default async function PlanTiersPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (me?.role !== "owner") return <RoleNotice title="Plan tiers" />;
  const [care, clients] = await Promise.all([getCarePlans(), getRoster()]);
  if (!care.ready)
    return (
      <>
        <PageHeader title="Plan tiers" backHref="/clients" backLabel="Clients" />
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">
          Plan tiers turn on after one setup step: run <span className="font-mono text-xs">0024_client_care.sql</span> in Supabase (SQL Editor).
        </p>
      </>
    );
  const current = clients.filter((c) => c.status === "active" || c.status === "paused");
  const onTier = (id: string) => current.filter((c) => c.plans?.some((p) => p.planId === id)).length;

  return (
    <div className="lg:max-w-4xl">
      <PageHeader title="Plan tiers" subtitle="What each plan includes and how often we're in touch" backHref="/clients" backLabel="Clients" />
      <p className="mb-2 px-1 text-xs text-muted">
        Prices aren&apos;t stored here. Each client&apos;s monthly amount is on the client (only you see it). &ldquo;Top tier&rdquo; clients count as important and reach you sooner.
      </p>
      {SERVICES.map(([service, label, hint]) => {
        const tiers = care.plans.filter((p) => p.service === service).sort((a, b) => Number(a.archived) - Number(b.archived) || a.rank - b.rank);
        const nextRank = Math.min(20, Math.max(0, ...tiers.map((t) => t.rank)) + 1);
        return (
          <section key={service}>
            <SectionTitle aside={hint}>{label}</SectionTitle>
            <div className="space-y-2.5 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {tiers.map((t) => (
                <GlassCard key={t.id} className={t.archived ? "opacity-60" : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {t.name}
                        {t.topTier && <span className="ml-1.5 text-[11px] font-normal text-violet">top tier</span>}
                        {t.archived && <span className="ml-1.5 text-[11px] font-normal text-faint">archived</span>}
                      </p>
                      <p className="text-xs text-muted">{planRhythm(t)}</p>
                      <p className="text-[11px] text-faint">
                        {onTier(t.id)} current client{onTier(t.id) === 1 ? "" : "s"}
                      </p>
                    </div>
                    <form action={setCarePlanArchived}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="archived" value={t.archived ? "false" : "true"} />
                      <button type="submit" aria-label={t.archived ? `Bring back ${t.name}` : `Archive ${t.name}`} className="pressable flex min-h-10 items-center gap-1 rounded-xl border border-line bg-white/5 px-2.5 text-xs">
                        {t.archived ? <ArchiveRestore aria-hidden className="size-3.5" /> : <Archive aria-hidden className="size-3.5" />}
                        {t.archived ? "Bring back" : "Archive"}
                      </button>
                    </form>
                  </div>
                  {t.includes.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
                      {t.includes.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                  <details className="mt-2">
                    <summary className="pressable flex min-h-10 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit {t.name}</summary>
                    <div className="pt-1">
                      <CarePlanForm plan={t} service={service} nextRank={t.rank} />
                    </div>
                  </details>
                </GlassCard>
              ))}
              {tiers.filter((t) => !t.archived).length < CARE_RULES.maxTiersPerService && (
                <details className="glass rounded-3xl px-4 py-1" open={tiers.length === 0 && service === "SEO"}>
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">+ Add a {label} tier</summary>
                  <div className="pb-3">
                    <CarePlanForm service={service} nextRank={nextRank} />
                  </div>
                </details>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
