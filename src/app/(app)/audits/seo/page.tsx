// Audits → SEO audits (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md): saved SEO audits and
// "New SEO audit". Read as the signed-in person: a salesperson gets only the audits they
// made; owner/managers get all; developers none.

import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SavedAuditCard } from "@/components/audit/SavedAuditCard";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAudits, getMember, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "SEO audits" };

export default async function SeoAuditsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="SEO audits" />;
  const { ready, audits } = await getAudits();
  const lead = isLead(me?.role);
  const seo = audits.filter((a) => a.kind === "seo");
  const open = seo.filter((a) => !a.archived);
  const archived = seo.filter((a) => a.archived);

  return (
    <div className="@container">
      <PageHeader
        title="SEO audits"
        subtitle="Where they rank, who beats them, and what it's worth."
        backHref="/audits"
        backLabel="Audits"
        action={
          <Link href="/audits/seo/new" className="pressable inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-violet-deep px-3.5 text-sm font-semibold">
            <Plus aria-hidden className="size-4" /> New SEO audit
          </Link>
        }
      />

      {usesDatabase() && !ready && <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Saving audits needs one setup step first (0023 SQL).</p>}

      <SectionTitle aside={ready ? `${open.length} saved` : undefined}>{lead ? "Saved SEO audits" : "My SEO audits"}</SectionTitle>
      {open.length ? (
        <ul className="grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {open.map((a) => (
            <li key={a.id}>
              <SavedAuditCard a={a} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-3xl px-4 py-4 text-sm text-muted">No SEO audits yet. Tap New SEO audit, or open a lead and tap SEO audit for this lead.</p>
      )}

      {archived.length > 0 && (
        <Fold title="Archived" summary="Hidden from the list, never deleted" badge={`${archived.length}`} label="Archived SEO audits">
          <ul className="mt-2.5 grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {archived.map((a) => (
              <li key={a.id}>
                <SavedAuditCard a={a} />
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  );
}
