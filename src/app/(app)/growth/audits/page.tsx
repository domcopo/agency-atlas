// SEO audits on Growth: the template preview and a link to the saved audits in Sales.

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
  // Wide screens: kept to a comfortable reading width.
  return (
    <div className="lg:max-w-4xl">
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
      <SectionTitle>Saved audits</SectionTitle>
      <GlassCard href="/audits" label="Open audits" className="space-y-1">
        <p className="font-semibold">Sales → Audits</p>
        <p className="text-sm text-muted">Build, save and reopen custom audits (every rep&apos;s, for the owner and managers), and set spending caps and plan prices.</p>
      </GlassCard>
      <p className="mt-4 px-1 text-[12px] text-faint">
        Coming next: attach results to a saved audit, real-looking maps, then a Google Ads audit.
      </p>
    </div>
  );
}
