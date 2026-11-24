// Audits → Google Ads audits. The builder comes in Phase 3 of
// docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md; until then this page says what it will show and
// lists any saved Ads audits (none yet). Plain text only; nothing is fetched.

import type { Metadata } from "next";
import { SavedAuditCard } from "@/components/audit/SavedAuditCard";
import { Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getAudits, getMember, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Google Ads audits" };

const COMING = [
  ["Market size", "Searches a month for their services in their area, and how many clicks are up for grabs."],
  ["Cost per click", "Low, typical and high price per click for each money keyword."],
  ["Budget calculator", "For each budget: clicks → leads (1 in 10 clicks) → jobs (close rate) → revenue and return per $1."],
  ["Who's bidding", "Which competitors show ads on their key searches, and what the ads say."],
  ["Competitor ad spend", "Estimated monthly clicks and spend per competitor, labeled as an estimate."],
  ["Are they running ads now?", "Whether they show up in ads, and which page the ad opens."],
  ["Landing page check", "Does the ad's page load fast on phones, with a call button and a form."],
  ["Plan + investment", "Ad budget plus our management fee, and a ramp-up timeline."],
] as const;

export default async function AdsAuditsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !isLead(me?.role) && me?.role !== "sales") return <RoleNotice title="Google Ads audits" />;
  const { audits } = await getAudits();
  const ads = audits.filter((a) => a.kind === "ads" && !a.archived);

  return (
    <div className="@container">
      <PageHeader title="Google Ads audits" subtitle="What clicks cost in their market, and what a budget could bring in." backHref="/audits" backLabel="Audits" />

      <div className="glass rounded-3xl p-4 lg:p-5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          Being built next <Pill color="amber">Coming soon</Pill>
        </p>
        <p className="mt-1 text-sm text-muted">
          Same rules as the SEO audit: every number has a source and date, and money is a model with its inputs shown. Rates stay &ldquo;assumption&rdquo; until the client confirms them.
        </p>
        <ul className="mt-3 grid gap-2 @2xl:grid-cols-2">
          {COMING.map(([title, detail]) => (
            <li key={title} className="rounded-2xl border border-line px-3 py-2.5">
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-[12px] text-muted">{detail}</p>
            </li>
          ))}
        </ul>
      </div>

      {ads.length > 0 && (
        <>
          <SectionTitle aside={`${ads.length} saved`}>Saved Google Ads audits</SectionTitle>
          <ul className="grid gap-2.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
            {ads.map((a) => (
              <li key={a.id}>
                <SavedAuditCard a={a} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
