// Audits → Google Ads audits: saved Ads audits, "New Google Ads audit" and the fictional
// template. Read as the signed-in person: a salesperson gets only the audits they made;
// owner/managers get all; developers none.

import { MousePointerClick, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SavedAuditCard } from "@/components/audit/SavedAuditCard";
import { GlassCard } from "@/components/cards/GlassCard";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAuditSettings, getAudits, getMember, SAMPLE_ADS_AUDIT_ID, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Google Ads audits" };

export default async function AdsAuditsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="Google Ads audits" />;
  const [{ ready, audits }, settings] = await Promise.all([getAudits(), getAuditSettings()]);
  const lead = isLead(me?.role);
  const ads = audits.filter((a) => a.kind === "ads");
  const open = ads.filter((a) => !a.archived);
  const archived = ads.filter((a) => a.archived);

  return (
    <div className="@container">
      <PageHeader
        title="Google Ads audits"
        subtitle="What clicks cost in their market, and what a budget could bring in."
        backHref="/audits"
        backLabel="Audits"
        action={
          <Link href="/audits/ads/new" className="pressable inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-violet-deep px-3.5 text-sm font-semibold">
            <Plus aria-hidden className="size-4" /> New Ads audit
          </Link>
        }
      />

      {usesDatabase() && ready && !settings.adsReady && <p className="glass mb-3 rounded-3xl px-4 py-3 text-sm text-muted">Saving Google Ads audits needs one setup step first (0029 SQL). The template below still works.</p>}

      <SectionTitle aside={ready ? `${open.length} saved` : undefined}>{lead ? "Saved Google Ads audits" : "My Google Ads audits"}</SectionTitle>
      {open.length ? (
        <ul className="grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {open.map((a) => (
            <li key={a.id}>
              <SavedAuditCard a={a} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">No Google Ads audits yet. Tap New Ads audit, or open a lead and tap Google Ads audit for this lead.</p>
      )}

      {archived.length > 0 && (
        <Fold title="Archived" summary="Hidden from the list, never deleted" badge={`${archived.length}`} label="Archived Google Ads audits">
          <ul className="mt-2.5 grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {archived.map((a) => (
              <li key={a.id}>
                <SavedAuditCard a={a} />
              </li>
            ))}
          </ul>
        </Fold>
      )}

      <SectionTitle>Template preview</SectionTitle>
      <GlassCard href={`/audit/${SAMPLE_ADS_AUDIT_ID}`} label="Open the sample Google Ads audit" className="space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <MousePointerClick aria-hidden className="size-4 text-amber" /> Riverbend Plumbing (sample)
        </p>
        <p className="text-sm text-muted">Every Google Ads page with a fictional business and made-up numbers, to show what an Ads audit looks like.</p>
      </GlassCard>
    </div>
  );
}
