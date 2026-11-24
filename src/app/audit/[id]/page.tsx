// SEO audit viewer: the 1280×720 pages, outside the app's tabs so they can be shown full
// width and printed to PDF. Two kinds:
//  - "sample": the fictional template (owner, managers, salespeople).
//  - a saved audit (0023): only the pages its checkpoints picked, and only if the database
//    lets this person read it (owner/managers: all; a salesperson: their own).

import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditDeck } from "@/components/audit/AuditDeck";
import { PrintButton } from "@/components/audit/PrintButton";
import { RoleNotice } from "@/components/shell/RoleNotice";
import type { AuditBundle } from "@/lib/audit/data";
import type { AuditSectionId } from "@/lib/audit/sections";
import { getAuditPreview, getMember, getSavedAudit, getSavedAuditBundle, SAMPLE_AUDIT_ID, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import "@/components/audit/audit.css";

export const metadata: Metadata = { title: "SEO audit" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") {
    return (
      <main className="mx-auto max-w-lg px-4">
        <RoleNotice title="SEO audit" />
      </main>
    );
  }
  const { id } = await params;
  let bundle: AuditBundle | null = null;
  let sections: AuditSectionId[] | undefined;
  let back = { href: "/sales/audits", label: "Audits" };
  if (id === SAMPLE_AUDIT_ID) {
    bundle = getAuditPreview(id);
  } else if (usesDatabase()) {
    const saved = await getSavedAudit(id);
    if (saved) {
      bundle = await getSavedAuditBundle(saved);
      sections = saved.sections;
      back = { href: `/sales/audits/${saved.id}`, label: saved.intake?.company ?? "Audit" };
    }
  }
  if (!bundle) notFound();
  return (
    <div className="audit audit-print-root">
      <div className="audit-viewer">
        <div className="audit-toolbar flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2">
          <Link href={back.href} className="pressable inline-flex min-h-11 items-center gap-0.5 pr-2 text-sm text-violet">
            <ChevronLeft aria-hidden className="size-4" /> {back.label}
          </Link>
          <PrintButton />
        </div>
        {bundle.sample ? (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            Template preview: a fictional business with made-up numbers, so you can check the layout. Nothing was fetched and nothing was spent.
          </p>
        ) : (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            No data pulled yet: every figure says &quot;not found&quot; until results are attached. Copy the custom prompt from the audit page to run it.
          </p>
        )}
        <AuditDeck bundle={bundle} sections={sections} />
      </div>
    </div>
  );
}
