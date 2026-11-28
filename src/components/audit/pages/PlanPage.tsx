// Page 8: 12-month roadmap with hours, monthly plans, and the next step.

import { clientSite, localDemand, revenueScenarios, setupHours, totalVisits } from "@/lib/audit/compute";
import type { AuditPageProps } from "../Slide";
import { fmtUsd } from "@/lib/audit/format";
import { HoursTable } from "../HoursTable";
import { PricingCards } from "../PricingCards";
import { Slide } from "../Slide";

export function PlanPage({ bundle, pageNo, pageCount, show }: AuditPageProps) {
  const { config, data } = bundle;
  const you = clientSite(config, data);
  const base = revenueScenarios(config, localDemand(data), you ? totalVisits(you) : null)?.find((r) => r.baseline) ?? null;
  const rec = config.plans.find((p) => p.recommended);
  const ratio = base && rec && rec.priceUsd > 0 ? Math.round(base.revenueMo / rec.priceUsd) : null;
  const setup = setupHours(config, data);
  const contact = [config.agency.name, config.agency.phone, config.agency.email, config.agency.website].filter(Boolean).join(" · ");
  const showTimeline = show?.timeline ?? true;
  const showInvestment = show?.investment ?? true;
  const title = showTimeline && showInvestment ? "SEO strategy, timeline & investment" : showTimeline ? "SEO strategy & timeline" : "Investment & next step";
  return (
    <Slide bundle={bundle} page={pageNo ?? 8} pageCount={pageCount} title={title} aside={showTimeline ? "12-month roadmap" : "monthly plans"}>
      <div className="audit-row" style={{ flex: 1 }}>
        {showTimeline && (
          <div className="audit-card" style={{ flex: 1.15 }}>
            <HoursTable phases={config.roadmap} />
          </div>
        )}
        {showInvestment && (
          <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Monthly investment</h3>
            <PricingCards plans={config.plans} />
            <div className="audit-note" style={{ marginTop: 0, fontSize: 11 }}>
              <b>One-time setup ≈ {setup.total} hours:</b> {setup.items.map((i) => `${i.task.toLowerCase()} ${i.hours}h`).join(" · ")}.
              {config.plans.length > 0 && (
                <>
                  {" "}
                  <b>12-month total:</b>{" "}
                  {config.plans.map((p) => `${p.name} ${setup.total + 12 * p.hoursPerMonth}h`).join(" · ")} (setup + 12 × monthly hours). Estimates, revised after the first 30 days of real data; no ranking is guaranteed.
                </>
              )}
            </div>
            <div className="audit-dark">
              <em>Next step:</em> a 20-minute call to walk through this audit and pick a plan.
              {base && rec && (
                <>
                  {" "}
                  The {config.baselineScenario.toLowerCase()} scenario models <em>{fmtUsd(base.revenueMo)}/mo</em> in potential job revenue against a <em>{fmtUsd(rec.priceUsd, { exact: true })}/mo</em> investment
                  {ratio !== null ? ` (about ${ratio}:1, modeled, not guaranteed)` : ""}.
                </>
              )}
              <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 8 }}>{contact}</div>
            </div>
          </div>
        )}
        {!showInvestment && (
          <div className="audit-card" style={{ flex: 0.6, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div className="audit-dark">
              <em>Next step:</em> a 20-minute call to walk through this audit.
              <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 8 }}>{contact}</div>
            </div>
          </div>
        )}
      </div>
    </Slide>
  );
}
