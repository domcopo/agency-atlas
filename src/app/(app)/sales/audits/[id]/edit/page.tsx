// Edit a saved audit: the same builder, filled in. The database decides who may save
// (owner/managers: any; a salesperson: their own, not archived).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuditBuilder } from "@/components/audit/AuditBuilder";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { capsLine } from "@/lib/audit/caps-line";
import type { AuditIntake } from "@/lib/audit/intake";
import { getAuditSettings, getAuditSpend, getMember, getSavedAudit, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Edit audit" };

export default async function EditAuditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!usesDatabase()) notFound();
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return <RoleNotice title="Edit audit" />;
  const audit = await getSavedAudit((await params).id);
  if (!audit) notFound();
  if (!isLead(me.role) && (audit.createdBy !== me.userId || audit.archived)) return <RoleNotice title="Edit audit" />;
  const [settings, spend] = await Promise.all([getAuditSettings(), getAuditSpend()]);
  // A saved intake that no longer passes the check still fills the form, so it can be fixed.
  const intake: Partial<AuditIntake> = audit.intake ?? (audit.rawIntake as Partial<AuditIntake>);
  return (
    <>
      <PageHeader title="Edit audit" subtitle={audit.intake?.company ?? audit.title} backHref={`/sales/audits/${audit.id}`} backLabel="Audit" />
      <AuditBuilder id={audit.id} intake={intake} sections={audit.sections} capsLine={capsLine(settings, spend)} plansSet={settings.agency.plans.length > 0} ready={settings.ready} />
    </>
  );
}
