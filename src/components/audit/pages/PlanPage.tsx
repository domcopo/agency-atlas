// Page 8: 12-month roadmap with hours, monthly plans, and the next step.

import { localDemand, revenueScenarios } from "@/lib/audit/compute";
import type { AuditBundle } from "@/lib/audit/data";
import { fmtUsd } from "@/lib/audit/format";
import { HoursTable } from "../HoursTable";
import { PricingCards } from "../PricingCards";
import { Slide } from "../Slide";

export function PlanPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const base = revenueScenarios(config, localDemand(data))?.find((r) => r.baseline) ?? null;
  const rec = config.plans.find((p) => p.recommended);
  const ratio = base && rec && rec.priceUsd > 0 ? Math.round(base.revenueMo / rec.priceUsd) : null;
  const contact = [config.agency.name, config.agency.phone, config.agency.email, config.agency.website].filter(Boolean).join(" · ");
  return (
    <Slide bundle={bundle} page={8} title="SEO strategy, timeline & investment" aside="12-month roadmap">
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.15 }}>
          <HoursTable phases={config.roadmap} />
        </div>
        <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Monthly investment</h3>
          <PricingCards plans={config.plans} />
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
      </div>
    </Slide>
  );
}
