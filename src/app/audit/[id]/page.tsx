// SEO audit viewer: the eight 1280×720 pages, outside the app's bottom tabs so they can
// be shown full width and printed to PDF. Owner/managers only (when the database is on).

import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditDeck } from "@/components/audit/AuditDeck";
import { PrintButton } from "@/components/audit/PrintButton";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAuditPreview, getMember, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import "@/components/audit/audit.css";

export const metadata: Metadata = { title: "SEO audit" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  if (usesDatabase() && !isLead((await getMember())?.role)) {
    return (
      <main className="mx-auto max-w-lg px-4">
        <RoleNotice title="SEO audit" />
      </main>
    );
  }
  const { id } = await params;
  const bundle = getAuditPreview(id);
  if (!bundle) notFound();
  return (
    <div className="audit audit-print-root">
      <div className="audit-viewer">
        <div className="audit-toolbar flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2">
          <Link href="/growth/audits" className="pressable inline-flex min-h-11 items-center gap-0.5 pr-2 text-sm text-violet">
            <ChevronLeft aria-hidden className="size-4" /> SEO audits
          </Link>
          <PrintButton />
        </div>
        {bundle.sample && (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            Template preview: a fictional business with made-up numbers, so you can check the layout. Nothing was fetched and nothing was spent.
          </p>
        )}
        <AuditDeck bundle={bundle} />
      </div>
    </div>
  );
}
