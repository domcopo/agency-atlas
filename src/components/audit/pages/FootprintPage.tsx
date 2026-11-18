// Page 3: geo-grids around the office, the state map, and who holds pages where.

import { bestPositionInMarket } from "@/lib/audit/compute";
import type { AuditBundle } from "@/lib/audit/data";
import { STATES } from "@/lib/audit/geo";
import { CompetitorFootprint } from "../CompetitorFootprint";
import { HeatGrid, HeatLegend } from "../HeatGrid";
import { MapLegend, StateMap } from "../StateMap";
import { Slide } from "../Slide";

export function FootprintPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const demand = new Map(data.demand.map((d) => [d.marketId, d.searches.value]));
  const points = config.markets.map((m) => ({ market: m, searches: demand.get(m.id) ?? null, position: bestPositionInMarket(data.keywords, config.company.domain, m.name) }));
  const names = new Map([[config.company.domain, config.company.name], ...config.competitors.map((c) => [c.domain, c.name] as const)]);
  const sites = data.sites
    .map((s) => ({ name: names.get(s.domain) ?? s.domain, domain: s.domain, isClient: s.domain === config.company.domain, marketIds: s.footprint }))
    .sort((a, b) => b.marketIds.length - a.marketIds.length);
  // Top three competitors by footprint, plus the client (always shown).
  const rows = [...sites.filter((s) => !s.isClient).slice(0, 3), ...sites.filter((s) => s.isClient)];
  const g = data.grids[0];
  const stateName = STATES[config.map.state]?.name ?? config.map.state;
  return (
    <Slide bundle={bundle} page={3} title="Competitor geographic footprint" aside={`${stateName} · ${g?.kind === "pack" ? "local 3-pack by city" : "Maps geo-grid"} + ranking pages`}>
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.3, display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0 }}>
            {g?.kind === "pack"
              ? `Google local 3-pack, searched from each city served`
              : `Google Maps rank at ${g ? g.size * g.size : 0} points (~${g?.spacingMiles ?? 1} mi apart) around ${config.company.hqTown}`}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.grids.length}, 1fr)`, gap: g?.kind === "pack" ? 14 : 18 }}>
            {data.grids.map((gr) => (
              <HeatGrid key={gr.term} grid={gr} />
            ))}
          </div>
          <HeatLegend kind={g?.kind ?? "maps"} />
          {data.narrative.pageNotes.footprint && <div className="audit-callout" style={{ marginTop: "auto" }}><span className="audit-tag info">What the grid shows</span>{data.narrative.pageNotes.footprint}</div>}
        </div>
        <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <h3 style={{ margin: 0 }}>The {stateName} picture</h3>
          <div style={{ height: config.map.view === "markets" ? 262 : 300 }}>
            <StateMap points={points} state={config.map.state} ringsMiles={config.map.ringsMiles} view={config.map.view} />
          </div>
          <MapLegend />
          <CompetitorFootprint rows={rows} markets={config.markets} />
        </div>
      </div>
    </Slide>
  );
}
