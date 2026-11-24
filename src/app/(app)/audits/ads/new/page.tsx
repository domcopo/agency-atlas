// New Google Ads audit: the Ads builder. With ?lead=<id>, the business name comes from that
// lead (only a lead the database lets this person see; anything else is ignored).

import type { Metadata } from "next";
import { AdsBuilder } from "@/components/audit/ads/AdsBuilder";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { DEFAULT_ADS_SECTIONS } from "@/lib/audit/ads";
import { capsLine } from "@/lib/audit/caps-line";
import { getAuditSettings, getAuditSpend, getMember, getSales, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "New Google Ads audit" };

const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function NewAdsAuditPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="New Google Ads audit" />;
  const leadParam = (await searchParams).lead;
  let lead: { id: string; name: string } | null = null;
  if (usesDatabase() && leadParam && LEAD_ID.test(leadParam)) {
    const found = (await getSales()).leads.find((l) => l.ghlId === leadParam && l.status === "open");
    if (found) lead = { id: found.ghlId, name: found.name };
  }
  const [settings, spend] = await Promise.all([getAuditSettings(), getAuditSpend()]);
  const ready = settings.ready && settings.adsReady;
  const setupNote = !usesDatabase() ? "Saving needs the database." : !settings.ready ? "Saving audits needs one setup step first (0023 SQL)." : !settings.adsReady ? "Saving Google Ads audits needs one setup step first (0029 SQL)." : null;
  return (
    <>
      <PageHeader
        title="New Google Ads audit"
        subtitle="What clicks cost in their market, and what a budget could bring in."
        backHref={lead ? `/sales/lead/${encodeURIComponent(lead.id)}` : "/audits/ads"}
        backLabel={lead ? lead.name : "Google Ads audits"}
      />
      <AdsBuilder leadId={lead?.id} leadName={lead?.name} sections={DEFAULT_ADS_SECTIONS} capsLine={capsLine(settings, spend)} plansSet={settings.adsPlans.length > 0} ready={ready} setupNote={setupNote} />
    </>
  );
}
