// Page 7: modeled revenue opportunity with every assumption printed, plus growth chart.

import { blendedJobValue, growthCurve, localDemand, prizeFor, revenueScenarios, clientSite, totalVisits } from "@/lib/audit/compute";
import type { AuditBundle } from "@/lib/audit/data";
import { fmtNum, fmtPct, fmtUsd } from "@/lib/audit/format";
import { BasisTag, ModelTag } from "../Bits";
import { GrowthChart } from "../GrowthChart";
import { PrizeCards } from "../PrizeCards";
import { ScenarioTable } from "../ScenarioTable";
import { Slide } from "../Slide";

export function RevenuePage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const demand = localDemand(data);
  const rows = revenueScenarios(config, demand);
  const base = rows?.find((r) => r.baseline) ?? null;
  const you = clientSite(config, data);
  const now = you ? totalVisits(you) : null;
  const curve = base && now !== null ? growthCurve(now, base.visits) : null;
  const refs = data.sites
    .filter((s) => s.domain !== config.company.domain)
    .map((s) => ({ label: (config.competitors.find((c) => c.domain === s.domain)?.name ?? s.domain).replace(/\s*\(.*\)$/, ""), value: totalVisits(s) }))
    .filter((r): r is { label: string; value: number } => r.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  const { leadRate, closeRate } = config.funnel;
  const rec = config.plans.find((p) => p.recommended);
  return (
    <Slide bundle={bundle} page={7} title="Revenue opportunity from Google" aside="modeled, with every assumption shown">
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ marginBottom: 0 }}>
            <ModelTag />
            Visits × {fmtPct(leadRate.value)} lead rate × {fmtPct(closeRate.value)} close rate × avg job value
          </h3>
          {rows ? <ScenarioTable rows={rows} /> : <p className="audit-nf">Local demand not found, so revenue can&apos;t be modeled.</p>}
          <div className="audit-note" style={{ marginTop: 0, fontSize: 11 }}>
            <b>Inputs:</b> local demand {fmtNum(demand)} searches/mo · lead rate {fmtPct(leadRate.value)} <BasisTag value={leadRate} /> · close rate {fmtPct(closeRate.value)} <BasisTag value={closeRate} />
            <br />
            Job mix:{" "}
            {config.services.map((s, i) => (
              <span key={s.name}>
                {i > 0 && " + "}
                {fmtPct(s.mixShare)} {s.name.toLowerCase()} @ {fmtUsd(s.jobValueUsd.value, { exact: true })} <BasisTag value={s.jobValueUsd} />
              </span>
            ))}{" "}
            → blended {fmtUsd(blendedJobValue(config), { exact: true })}.
            <br />A model of potential, not a prediction, and not competitor revenue. No traffic, ranking or revenue outcome is guaranteed.
          </div>
          <PrizeCards prizes={[100, 250, 500].map((v) => prizeFor(config, v))} />
        </div>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>
            12-month modeled visits{rec ? ` — ${rec.name} plan (${rec.hoursPerMonth} hrs/mo)` : ""}
          </h3>
          {curve ? <GrowthChart curve={curve} refs={refs} /> : <p className="audit-nf">Not found: today&apos;s visits or local demand is missing, so the curve can&apos;t be drawn.</p>}
          <p className="audit-note">
            <ModelTag />
            From today&apos;s ≈{fmtNum(now)} search visits/mo to the {config.baselineScenario.toLowerCase()} scenario. Dashed lines = competitors&apos; current estimated visits. {data.narrative.pageNotes.revenue ?? ""}
          </p>
        </div>
      </div>
    </Slide>
  );
}
