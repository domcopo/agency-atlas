// One saved Google Ads audit: what was typed, the checkpoints, the custom Ads prompt to copy,
// and links to the pages and the editor. The page that uses it has already checked the role
// and the database has decided this person may read it.

import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import { archiveAudit } from "@/app/actions";
import { AttachResults } from "@/components/audit/AttachResults";
import { RunAudit, type RunAuditProps } from "@/components/audit/RunAudit";
import { planAdsRun } from "@/lib/audit/run";
import { CopyButton } from "@/components/cards/CopyButton";
import { Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { ADS_SECTIONS } from "@/lib/audit/ads";
import { buildAdsPrompt } from "@/lib/audit/ads-prompt";
import { stateName } from "@/lib/audit/geo";
import type { AuditSettingsView, SavedAudit } from "@/lib/data-source";
import { formatShortDate } from "@/lib/format";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const usd = (v: number) => `$${v.toLocaleString("en-US")}`;

export function AdsAuditView({ audit, settings, canEdit, canArchive, runCard }: { audit: SavedAudit; settings: AuditSettingsView; canEdit: boolean; canArchive: boolean; runCard: Omit<RunAuditProps, "id" | "estimateUsd" | "hasResults"> }) {
  const i = audit.ads?.intake ?? null;
  const sections = audit.ads?.sections ?? [];
  const prompt = i ? buildAdsPrompt(i, sections, { agencyName: settings.agency.agencyName, plans: settings.adsPlans, perAuditUsd: settings.caps.perAuditUsd }) : "";
  const included = ADS_SECTIONS.filter((s) => sections.includes(s.id));
  const facts: [string, string][] = i
    ? [
        ["Website", i.domain],
        ["Business", `${i.company} · ${i.niche}`],
        ["Area", [`${i.hqTown}, ${stateName(i.state)}`, ...i.cities].join(", ")],
        ["Money keywords", i.services.join(", ")],
        ["Average job", `${usd(i.avgJobUsd)} (${i.avgJobConfirmed ? "client confirmed" : "assumption"})`],
        ["Clicks → leads", `${pct(i.clickToLeadRate)} (assumption)`],
        ["Leads → jobs", `${pct(i.leadToJobRate)} (assumption)`],
        ["Budgets compared", i.budgetsUsd.map((b) => `${usd(b)}/mo`).join(", ")],
        ["Competitors", i.competitors.length ? i.competitors.map((c) => c.name).join(", ") : "The audit finds who shows ads"],
        ["Data", [i.modules.dataforseo && "DataForSEO", i.modules.semrush && "Semrush"].filter(Boolean).join(" · ") || "None picked"],
        ["Made", `${formatShortDate(audit.createdAt.slice(0, 10))}${audit.createdByName ? ` by ${audit.createdByName}` : ""}`],
      ]
    : [];

  return (
    <div className="@container">
      <PageHeader title={i?.company ?? audit.title} subtitle={i ? `${i.domain} · Google Ads audit` : "Google Ads audit"} backHref="/audits/ads" backLabel="Google Ads audits" />

      <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @3xl:items-start @3xl:gap-6">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {audit.archived && <Pill>Archived</Pill>}
            {audit.hasResults ? <Pill color="lime">Results attached</Pill> : <Pill color="amber">Not pulled yet</Pill>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link href={`/audit/${audit.id}`} className="pressable inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-deep text-sm font-semibold">
              <ExternalLink aria-hidden className="size-4" /> Open the {audit.pageCount} pages
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

          <SectionTitle aside={`${audit.pageCount} pages`}>Included</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-sm">
            {included.map((s) => (
              <li key={s.id} className="px-4 py-2.5">
                <span className="font-semibold">{s.label}</span>
                <span className="block text-[11.5px] text-muted">{s.detail}</span>
              </li>
            ))}
          </ul>

          {canArchive && (
            <form action={archiveAudit} className="mt-3">
              <input type="hidden" name="id" value={audit.id} />
              {audit.archived && <input type="hidden" name="restore" value="1" />}
              <button type="submit" className="pressable min-h-11 w-full rounded-xl border border-line text-sm font-semibold text-muted">
                {audit.archived ? "Bring back from archive" : "Archive (hide; never deleted)"}
              </button>
            </form>
          )}
        </div>

        <div className="min-w-0">
          {i && canEdit && (
            <div className="mb-3 mt-4 @3xl:mt-0">
              <RunAudit id={audit.id} {...runCard} estimateUsd={planAdsRun(i, sections).estimateUsd} hasResults={audit.hasResults} />
            </div>
          )}
          {i && (
            <>
              <SectionTitle aside={<CopyButton text={prompt} label="Copy the custom prompt" />}>Or run it yourself: custom Ads prompt</SectionTitle>
              <div className="glass rounded-3xl p-4">
                <p className="text-xs text-muted">Copy this into a Claude chat that has DataForSEO connected. It already has this business and only the checkpoints picked. The app never sends it anywhere and never touches a Google Ads account.</p>
                <details className="mt-2">
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">Show the prompt</summary>
                  <pre className="mt-1 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-black/20 p-3 text-[11.5px] leading-relaxed text-muted">{prompt}</pre>
                </details>
              </div>
            </>
          )}
          {i && canEdit && (
            <div className="mt-3">
              <AttachResults id={audit.id} attachedOn={audit.dataRetrieved} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
