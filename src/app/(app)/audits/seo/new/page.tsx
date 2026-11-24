// New audit: the builder. With ?lead=<id>, the business name comes from that lead (only a
// lead the database lets this person see; anything else is ignored).

import type { Metadata } from "next";
import { AuditBuilder } from "@/components/audit/AuditBuilder";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { capsLine } from "@/lib/audit/caps-line";
import { DEFAULT_SECTIONS } from "@/lib/audit/sections";
import { getAuditSettings, getAuditSpend, getMember, getSales, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "New SEO audit" };

const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function NewAuditPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="New audit" />;
  const leadParam = (await searchParams).lead;
  let lead: { id: string; name: string } | null = null;
  if (usesDatabase() && leadParam && LEAD_ID.test(leadParam)) {
    const found = (await getSales()).leads.find((l) => l.ghlId === leadParam && l.status === "open");
    if (found) lead = { id: found.ghlId, name: found.name };
  }
  const [settings, spend] = await Promise.all([getAuditSettings(), getAuditSpend()]);
  return (
    <>
      <PageHeader
        title="New SEO audit"
        subtitle="Our custom SEO audit: pick what goes in, save, then copy the prompt."
        backHref={lead ? `/sales/lead/${encodeURIComponent(lead.id)}` : "/audits/seo"}
        backLabel={lead ? lead.name : "SEO audits"}
      />
      <AuditBuilder leadId={lead?.id} leadName={lead?.name} sections={DEFAULT_SECTIONS} capsLine={capsLine(settings, spend)} plansSet={settings.agency.plans.length > 0} ready={settings.ready} />
    </>
  );
}
