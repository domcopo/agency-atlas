// Page 1: headline numbers, search-visit leaderboard, and the headline.

import { adsEquivalent, avgMapsRank, clientSite, leaderboard, localDemand, revenueScenarios, weightedCpc } from "@/lib/audit/compute";
import type { AuditBundle } from "@/lib/audit/data";
import { fmtDate, fmtNum, fmtUsd } from "@/lib/audit/format";
import { FigValue, ModelTag } from "../Bits";
import { KpiCards } from "../KpiCards";
import { Leaderboard } from "../Leaderboard";
import { Slide } from "../Slide";

export function SummaryPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const demand = localDemand(data);
  const base = revenueScenarios(config, demand)?.find((r) => r.baseline) ?? null;
  const you = clientSite(config, data);
  const leader = [...data.sites].sort((a, b) => (b.organicKeywords.value ?? -1) - (a.organicKeywords.value ?? -1))[0];
  const leaderName = config.competitors.find((c) => c.domain === leader?.domain)?.name ?? leader?.domain ?? "";
  const cpc = weightedCpc(data.keywords);
  const ads = adsEquivalent(base?.visits ?? null, cpc);
  const rank = avgMapsRank(data.grids);
  return (
    <Slide
      bundle={bundle}
      page={1}
      kicker="Custom SEO audit"
      title={config.company.domain}
      subtitle={`Who wins ${config.company.niche.toLowerCase()} searches in ${config.company.region}, and how ${config.company.name} closes the gap. Prepared by ${config.agency.name} · ${fmtDate(config.preparedOn)}`}
    >
      <KpiCards
        items={[
          { value: fmtNum(rank, 2), label: "Avg Google Maps rank", detail: `${data.grids.length} geo-grid terms, ${data.grids[0]?.size ?? 0}×${data.grids[0]?.size ?? 0} points`, color: "#12c48b" },
          { value: fmtNum(demand), label: "Local searches / month", detail: "Near-me + every market's own searches, added once" },
          {
            value: (
              <>
                <FigValue fig={you?.organicKeywords} /> vs <FigValue fig={leader?.organicKeywords} />
              </>
            ),
            label: "Organic keywords vs leader",
            detail: `${config.company.name} vs ${leaderName}`,
            color: "#e8426a",
          },
          {
            value: base ? `${fmtUsd(base.revenueMo)}/mo` : fmtNum(null),
            label: "Modeled revenue opportunity",
            detail: (
              <>
                <ModelTag />
                {config.baselineScenario} scenario; inputs on page 7
              </>
            ),
            color: "#00c9b7",
          },
        ]}
      />
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.45 }}>
          <h3>Search-visit leaderboard: est. monthly visits from Google</h3>
          <Leaderboard rows={leaderboard(config, data)} showSemrush={config.modules.semrush} />
          <p className="audit-note">
            Visits = organic + local-pack estimates (search only, not total website traffic).
            {config.modules.semrush ? " Semrush figures shown beside, not merged." : " Semrush was not run."} Estimates, not competitor revenue.
          </p>
        </div>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>The headline</h3>
          <p style={{ fontSize: 16, lineHeight: 1.5, margin: "0 0 12px", color: "var(--a-body)" }}>{data.narrative.headline}</p>
          <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18, margin: 0, color: "var(--a-body)" }}>
            <li>
              Google Ads equivalent of the {config.baselineScenario.toLowerCase()} visits: <b>{ads === null ? fmtNum(null) : `${fmtUsd(ads)}/mo`}</b> (weighted CPC {fmtUsd(cpc, { cents: true })})
            </li>
            <li>
              Annual modeled opportunity: <b>{base ? fmtUsd(base.revenueYr) : fmtNum(null)}</b> <ModelTag />
            </li>
          </ul>
        </div>
      </div>
    </Slide>
  );
}
