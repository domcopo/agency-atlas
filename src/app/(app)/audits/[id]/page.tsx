// One saved audit: what was typed, the checkpoints, the custom prompt to copy, and links to
// the pages and the editor. "Not found" unless the database lets this person read it.

import { ExternalLink, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { archiveAudit } from "@/app/actions";
import { AdsAuditView } from "@/components/audit/ads/AdsAuditView";
import { AttachResults } from "@/components/audit/AttachResults";
import { AuditSteps } from "@/components/audit/AuditSteps";
import { RunAudit } from "@/components/audit/RunAudit";
import { unknownPlaces } from "@/lib/audit/places-list";
import { capsLine } from "@/lib/audit/caps-line";
import { planSeoRun } from "@/lib/audit/run";
import { isDataForSeoConfigured } from "@/lib/audit/sources/dataforseo";
import { CopyButton } from "@/components/cards/CopyButton";
import { Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { stateName } from "@/lib/audit/geo";
import { buildAuditPrompt } from "@/lib/audit/prompt";
import { AUDIT_SECTIONS, deckPages } from "@/lib/audit/sections";
import { getAuditSettings, getAuditSpend, getLatestAuditRun, getMember, getSavedAudit, usesDatabase } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Audit" };

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

export default async function SavedAuditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!usesDatabase()) notFound();
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return <RoleNotice title="Audit" />;
  const audit = await getSavedAudit((await params).id);
  if (!audit) notFound();
  const settings = await getAuditSettings();
  const canEdit = isLead(me.role) || (audit.createdBy === me.userId && !audit.archived);
  const [runInfo, spend] = await Promise.all([getLatestAuditRun(audit.id), getAuditSpend()]);
  const runCard = { configured: isDataForSeoConfigured(), ready: runInfo.ready, run: runInfo.run, capsLine: capsLine(settings, spend) };
  if (audit.kind === "ads") return <AdsAuditView audit={audit} settings={settings} canEdit={canEdit} canArchive={isLead(me.role)} runCard={runCard} />;
  const i = audit.intake;
  const prompt = i ? buildAuditPrompt(i, audit.sections, { agencyName: settings.agency.agencyName, plans: settings.agency.plans, perAuditUsd: settings.caps.perAuditUsd }) : "";
  const pages = deckPages(audit.sections).length;
  const extras = AUDIT_SECTIONS.filter((s) => s.kind === "prompt" && audit.sections.includes(s.id));
  const included = AUDIT_SECTIONS.filter((s) => s.kind === "page" && audit.sections.includes(s.id));

  const facts: [string, string][] = i
    ? [
        ["Website", i.domain],
        ["Business", `${i.company} · ${i.niche}`],
        ["Area", [`${i.hqTown}, ${stateName(i.state)}`, ...i.cities].join(", ")],
        ["Services", i.services.join(", ")],
        ["Average job", `$${i.avgJobUsd.toLocaleString("en-US")} (${i.avgJobConfirmed ? "client confirmed" : "assumption"})`],
        ["Visits → jobs", `${pct(i.visitToJobRate)} (assumption)`],
        ["Competitors", i.competitors.length ? i.competitors.map((c) => c.name).join(", ") : "The audit finds them"],
        ["Data", [i.modules.dataforseo && "DataForSEO", i.modules.leadsnap && "LeadSnap", i.modules.semrush && "Semrush"].filter(Boolean).join(" · ") || "None picked"],
        ["Made", `${formatShortDate(audit.createdAt.slice(0, 10))}${audit.createdByName ? ` by ${audit.createdByName}` : ""}`],
      ]
    : [];

  return (
    <div className="@container">
      <PageHeader title={i?.company ?? audit.title} subtitle={i ? `${i.domain} · SEO audit` : "SEO audit"} backHref="/audits/seo" backLabel="SEO audits" />

      <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {audit.archived && <Pill>Archived</Pill>}
            {audit.hasResults ? <Pill color="lime">Results attached</Pill> : <Pill color="amber">Not pulled yet</Pill>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link href={`/audit/${audit.id}`} className="pressable inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-deep text-sm font-semibold">
              <ExternalLink aria-hidden className="size-4" /> Open the {pages} pages
            </Link>
            {canEdit ? (
              <Link href={`/audits/${audit.id}/edit`} className="pressable glass inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold">
                <Pencil aria-hidden className="size-4" /> Edit
              </Link>
            ) : (
              <span className="glass inline-flex min-h-12 items-center justify-center rounded-xl text-xs text-faint">Archived: view only</span>
            )}
          </div>

          {i ? (
            <div className="glass mt-3 rounded-3xl p-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {facts.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              {i.notes && <p className="mt-3 border-t border-line pt-2 text-xs text-muted">Notes: {i.notes}</p>}
            </div>
          ) : (
            <p className="glass mt-3 rounded-3xl px-4 py-3 text-sm text-rose">The saved details no longer pass the check. Tap Edit to fix them.</p>
          )}

          <SectionTitle aside={`${pages} pages`}>Included</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
            {included.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <span className="font-semibold">{s.label}</span>
                <span className="block text-[11.5px] text-muted">{s.detail}</span>
              </li>
            ))}
            {extras.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <span className="font-semibold">{s.label}</span> <span className="text-[10.5px] text-faint">prompt only for now</span>
                <span className="block text-[11.5px] text-muted">{s.detail}</span>
              </li>
            ))}
          </ul>

          {isLead(me.role) && (
            <form action={archiveAudit} className="mt-3">
              <input type="hidden" name="id" value={audit.id} />
              {audit.archived && <input type="hidden" name="restore" value="1" />}
              <button type="submit" className="pressable min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-muted">
                {audit.archived ? "Bring back from archive" : "Archive (hide; never deleted)"}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 min-w-0 @3xl:mt-0">
          {i && canEdit ? (
            <AuditSteps
              id={audit.id}
              pageCount={audit.pageCount}
              canEdit={canEdit}
              detailsOk
              placeIssues={unknownPlaces(i.state, [i.hqTown, ...i.cities])}
              hasResults={audit.hasResults}
              retrieved={audit.dataRetrieved}
              run={<RunAudit id={audit.id} {...runCard} estimateUsd={planSeoRun(i, audit.sections).estimateUsd} hasResults={audit.hasResults} compact />}
              advanced={
                <>
              <div className="glass rounded-3xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted">Copy this into a Claude chat that has DataForSEO connected. It already has this business and only the checkpoints picked. The app never sends it anywhere.</p>
                  <CopyButton text={prompt} label="Copy the custom prompt" />
                </div>
                <details className="mt-2">
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">Show the prompt</summary>
                  <pre className="mt-1 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-black/20 p-3 text-[11.5px] leading-relaxed text-muted">{prompt}</pre>
                </details>
              </div>
                  <AttachResults id={audit.id} attachedOn={audit.dataRetrieved} />
                </>
              }
            />
          ) : i ? (
            <>
              <SectionTitle>Custom prompt</SectionTitle>
              <div className="glass rounded-3xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-muted">Copy this into a Claude chat that has DataForSEO connected. It already has this business and only the checkpoints picked. The app never sends it anywhere.</p>
                  <CopyButton text={prompt} label="Copy the custom prompt" />
                </div>
                <details className="mt-2">
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">Show the prompt</summary>
                  <pre className="mt-1 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-black/20 p-3 text-[11.5px] leading-relaxed text-muted">{prompt}</pre>
                </details>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
