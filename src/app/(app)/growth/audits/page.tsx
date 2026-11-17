// SEO audits list. Phase 1: only the template preview (fictional business, $0 dry run).

import { FileSearch } from "lucide-react";
import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAuditPreview, getMember, SAMPLE_AUDIT_ID, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "SEO audits" };

export default async function AuditsPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO audits" />;
  const sample = getAuditPreview(SAMPLE_AUDIT_ID);
  return (
    <>
      <PageHeader title="SEO audits" subtitle="Eight-page audits for a client or prospect. Every number has a source; money is a labeled model." backHref="/growth" backLabel="Growth" />
      <SectionTitle>Template preview</SectionTitle>
      {sample && (
        <GlassCard href={`/audit/${sample.id}`} label="Open the sample audit" className="space-y-1">
          <p className="flex items-center gap-2 font-semibold">
            <FileSearch aria-hidden className="size-4 text-teal" /> {sample.config.company.name}
          </p>
          <p className="text-sm text-muted">
            {sample.config.company.niche} · {sample.config.company.region} · {sample.config.competitors.length} competitors
          </p>
          <p className="text-[11px] text-faint">Fictional business, made-up numbers. Dry run: nothing fetched, $0.</p>
        </GlassCard>
      )}
      <p className="mt-4 px-1 text-[12px] text-faint">
        Coming next: an intake form (website, location, Google profile, average ticket, niche), live data from DataForSEO and LeadSnap with a cost estimate and budget cap, then a Google Ads audit.
      </p>
    </>
  );
}
