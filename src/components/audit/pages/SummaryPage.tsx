// Page 1: headline numbers, search-visit leaderboard, and the headline.

import { adsEquivalent, avgMapsRank, goalScenario, packCityPresence, packPresence, clientSite, leaderboard, localDemand, revenueFromVisits, revenueScenarios, totalVisits, weightedCpc } from "@/lib/audit/compute";
import type { AuditPageProps } from "../Slide";
import { fmtDate, fmtNum, fmtPct, fmtUsd } from "@/lib/audit/format";
import { BasisTag, FigValue, ModelTag } from "../Bits";
import { GoalPanel, type GoalItem } from "../GoalPanel";
import { KpiCards } from "../KpiCards";
import { Leaderboard } from "../Leaderboard";
import { Slide } from "../Slide";

export function SummaryPage({ bundle, pageNo, pageCount }: AuditPageProps) {
  const { config, data } = bundle;
  const demand = localDemand(data);
  const scenarios = revenueScenarios(config, demand);
  const base = scenarios?.find((r) => r.baseline) ?? null;
  const you = clientSite(config, data);
  const leader = [...data.sites].sort((a, b) => (b.organicKeywords.value ?? -1) - (a.organicKeywords.value ?? -1))[0];
  const leaderName = config.competitors.find((c) => c.domain === leader?.domain)?.name ?? leader?.domain ?? "";
  const cpc = weightedCpc(data.keywords);
  const ads = adsEquivalent(base?.visits ?? null, cpc);
  const rank = avgMapsRank(data.grids);
  const pack = packPresence(data.grids);
  const board = leaderboard(config, data);
  const short = config.company.name.replace(/\s*\((sample|fictional)\)$/i, "");
  const nowVisits = you ? totalVisits(you) : null;
  const nowPlace = board.findIndex((r) => r.isClient) + 1;
  const goalVisits = goalScenario(scenarios, nowVisits)?.visits ?? null;
  const goalPlace = goalVisits === null ? null : board.filter((r) => !r.isClient && (r.visits ?? -1) >= goalVisits).length + 1;
  const goal = config.goal;
  const cities = packCityPresence(data.grids);
  const rate = config.competitorRevenue?.visitToJobRate;
  const goalItems: GoalItem[] = [];
  if (goal?.packCities !== undefined && cities.checked > 0)
    goalItems.push({ label: "Local 3-pack", today: `${cities.inPack} of ${cities.checked} cities`, goal: `${goal.packCities} of ${cities.checked}`, kind: "goal" });
  if (goalVisits !== null)
    goalItems.push({ label: "Search visits/mo", today: fmtNum(nowVisits), goal: `≈${fmtNum(goalVisits)}`, kind: "model" });
  if (goalPlace !== null && nowPlace > 0 && goalPlace < nowPlace) goalItems.push({ label: "Leaderboard spot", today: `#${nowPlace}`, goal: `#${goalPlace}`, kind: "model" });
  if (rate && goalVisits !== null)
    goalItems.push({ label: "Modeled revenue/mo", today: fmtUsd(revenueFromVisits(config, nowVisits)), goal: fmtUsd(revenueFromVisits(config, goalVisits)), kind: "model" });
  return (
    <Slide
      bundle={bundle}
      page={pageNo ?? 1} pageCount={pageCount}
      kicker="Custom SEO audit"
      title={config.company.domain}
      subtitle={`Who wins ${config.company.niche.toLowerCase()} searches in ${config.company.region}, and how ${config.company.name} closes the gap. Prepared by ${config.agency.name} · ${fmtDate(config.preparedOn)}`}
    >
      <KpiCards
        items={[
          data.grids.some((gr) => gr.kind === "pack")
            ? { value: `${pack.inPack} of ${pack.checked}`, label: "Local 3-pack appearances", detail: `${data.grids.length} terms searched from each city served`, color: "#12c48b" }
            : { value: fmtNum(rank, 2), label: "Avg Google Maps rank", detail: `${data.grids.length} geo-grid terms, ${data.grids[0]?.size ?? 0}×${data.grids[0]?.size ?? 0} points`, color: "#12c48b" },
          { value: fmtNum(demand), label: "Local searches / month", detail: data.nearbySearches ? "Near-me, home-town and every town within 30 miles, each search counted once" : data.homeTownSearches ? "Near-me + plain home-town searches + every market's own, added once" : "Near-me + every market's own searches, added once" },
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
          <Leaderboard
            rows={board}
            showSemrush={config.modules.semrush}
            goal={goal && goalVisits !== null ? { label: `${short}: ${goal.months}-month goal`, visits: goalVisits, revenueMo: revenueFromVisits(config, goalVisits) } : undefined}
          />
          <p className="audit-note" style={{ marginTop: 6 }}>
            {board.some((r) => r.visits === null) ? "Rows with no number weren't measured (DataForSEO had no answer), so they aren't ranked. " : ""}
            Visits = organic + local-pack estimates (search only, not total website traffic){data.visitsScope === "national" ? "; each site's US-wide total, not this area only" : ""}.
            {config.modules.semrush ? " Semrush figures shown beside, not merged." : " Semrush was not run."}
            {rate ? (
              <>
                {" "}
                <ModelTag />
                Revenue = visits × {fmtPct(rate.value)} of visits becoming jobs <BasisTag value={rate} /> × {fmtUsd(config.services.reduce((t, x) => t + x.mixShare * x.jobValueUsd.value, 0), { exact: true })} average job
                {config.services.some((x) => x.jobValueUsd.basis === "assumption") ? " (assumption)" : ""}. A model, not their reported revenue
                {data.visitsScope === "national" ? "; US-wide visits make it higher than their local revenue" : ""}.
              </>
            ) : (
              " Estimates, not competitor revenue."
            )}
          </p>
        </div>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>The headline</h3>
          <p style={{ fontSize: 14.5, lineHeight: 1.45, margin: "0 0 8px", color: "var(--a-body)" }}>{data.narrative.headline}</p>
          <ul style={{ fontSize: 12.5, lineHeight: 1.5, paddingLeft: 18, margin: 0, color: "var(--a-body)" }}>
            <li>
              Google Ads equivalent of the {config.baselineScenario.toLowerCase()} visits: <b>{ads === null ? fmtNum(null) : `${fmtUsd(ads)}/mo`}</b> (weighted CPC {fmtUsd(cpc, { cents: true })})
            </li>
            <li>
              Annual modeled opportunity: <b>{base ? fmtUsd(base.revenueYr) : fmtNum(null)}</b> <ModelTag />
            </li>
          </ul>
          {goal && goalItems.length > 0 && <GoalPanel title={`Where ${short} could be in ${goal.months} months`} items={goalItems} terms={goal.firstPageTerms} columns={2} />}
        </div>
      </div>
    </Slide>
  );
}
