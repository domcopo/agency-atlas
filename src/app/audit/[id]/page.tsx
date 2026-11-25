// Audit viewer (SEO and Google Ads): the 1280×720 pages, outside the app's tabs so they can
// be shown full width and printed to PDF. Kinds:
//  - "sample" / "sample-ads": the fictional templates (owner, managers, salespeople).
//  - a saved audit (0023): only the pages its checkpoints picked, and only if the database
//    lets this person read it (owner/managers: all; a salesperson: their own).

import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditDeck } from "@/components/audit/AuditDeck";
import { AdsDeck } from "@/components/audit/ads/AdsDeck";
import { PrintButton } from "@/components/audit/PrintButton";
import { RoleNotice } from "@/components/shell/RoleNotice";
import type { AdsBundle, AdsSectionId } from "@/lib/audit/ads";
import { SOURCE_LABELS, type AuditBundle } from "@/lib/audit/data";
import { fmtDate } from "@/lib/audit/format";
import type { AuditSectionId } from "@/lib/audit/sections";
import { getAdsPreview, getAuditPreview, getMember, getSavedAdsBundle, getSavedAudit, getSavedAuditBundle, SAMPLE_ADS_AUDIT_ID, SAMPLE_AUDIT_ID, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import "@/components/audit/audit.css";

export const metadata: Metadata = { title: "Audit" };

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") {
    return (
      <main className="mx-auto max-w-lg px-4">
        <RoleNotice title="Audit" />
      </main>
    );
  }
  const { id } = await params;
  let bundle: AuditBundle | null = null;
  let adsBundle: AdsBundle | null = null;
  let sections: AuditSectionId[] | undefined;
  let adsSections: AdsSectionId[] | undefined;
  let back = { href: "/audits/seo", label: "Audits" };
  if (id === SAMPLE_AUDIT_ID) {
    bundle = getAuditPreview(id);
  } else if (id === SAMPLE_ADS_AUDIT_ID) {
    adsBundle = getAdsPreview(id);
    back = { href: "/audits/ads", label: "Google Ads audits" };
  } else if (usesDatabase()) {
    const saved = await getSavedAudit(id);
    if (saved?.kind === "ads") {
      adsBundle = await getSavedAdsBundle(saved);
      adsSections = saved.ads?.sections;
    } else if (saved) {
      bundle = await getSavedAuditBundle(saved);
      sections = saved.sections;
    }
    if (saved) back = { href: `/audits/${saved.id}`, label: saved.base?.company ?? "Audit" };
  }
  if (!bundle && !adsBundle) notFound();
  const sample = bundle?.sample ?? adsBundle?.sample ?? false;
  const used = bundle?.data.sourcesUsed ?? adsBundle?.data.sourcesUsed ?? [];
  const retrieved = used.length ? (bundle?.data.retrieved ?? adsBundle?.data.retrieved ?? null) : null;
  const sourceNames = used.map((s) => SOURCE_LABELS[s]).join(", ");
  return (
    <div className="audit audit-print-root">
      <div className="audit-viewer">
        <div className="audit-toolbar flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-2">
          <Link href={back.href} className="pressable inline-flex min-h-11 items-center gap-0.5 pr-2 text-sm text-violet">
            <ChevronLeft aria-hidden className="size-4" /> {back.label}
          </Link>
          <PrintButton />
        </div>
        {sample ? (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            Template preview: a fictional business with made-up numbers, so you can check the layout. Nothing was fetched and nothing was spent.
          </p>
        ) : retrieved ? (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-line bg-white/5 px-3 py-2 text-sm text-muted">
            Results from {fmtDate(retrieved)} ({sourceNames}). Every figure shows its source; spot-check a couple before sending this to anyone.
          </p>
        ) : (
          <p className="audit-toolbar w-full max-w-[1280px] rounded-xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
            No data pulled yet: every figure says &quot;not found&quot; until results are attached. Copy the custom prompt from the audit page, run it, then use Attach results.
          </p>
        )}
        {bundle ? <AuditDeck bundle={bundle} sections={sections} /> : adsBundle ? <AdsDeck bundle={adsBundle} sections={adsSections} /> : null}
      </div>
    </div>
  );
}
