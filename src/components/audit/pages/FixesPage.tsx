// Page 5: why competitors rank higher, and the fixes that matter.
// D1 adds two fact boxes when a run found them: the business's homepage check and the town
// pages the competitors built (paths only, from their real rankings).

import type { AuditPageProps } from "../Slide";
import { FixesList } from "../FixesList";
import { Scorecard } from "../Scorecard";
import { Slide } from "../Slide";

export function FixesPage({ bundle, pageNo, pageCount }: AuditPageProps) {
  const { config, data } = bundle;
  const short = config.company.name.replace(/\s*\(.*\)$/, "");
  const ins = data.inspection;
  const byDomain = new Map(data.sites.map((s) => [s.domain, s]));
  const built = config.competitors
    .map((c) => ({ name: c.name.replace(/\s*\(.*\)$/, ""), pages: byDomain.get(c.domain)?.pagesBuilt ?? [] }))
    .filter((c) => c.pages.length)
    .slice(0, 3);
  return (
    <Slide bundle={bundle} page={pageNo ?? 5} pageCount={pageCount} title="Why competitors rank higher" aside={`and the ${data.narrative.fixes.length} fixes that matter`}>
      <div className="audit-row" style={{ flex: 1 }}>
        <div style={{ flex: 1.1, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <div className="audit-card" style={{ flex: 1, overflow: "hidden" }}>
            <h3>Side by side: what they have that {short} doesn&apos;t</h3>
            <Scorecard rows={data.scorecard} clientLabel={short} />
          </div>
          {ins && (
            <div className="audit-card" style={{ flex: "none" }}>
              <h3>Site check: {short}&apos;s homepage</h3>
              <table className="audit-table compact" style={{ fontSize: 12 }}>
                <tbody>
                  <tr>
                    <td style={{ width: 90 }}>Title</td>
                    <td>{ins.title ?? <span className="audit-nf">none found</span>}</td>
                  </tr>
                  <tr>
                    <td>H1 heading</td>
                    <td>{ins.h1 ?? <span className="audit-nf">none found</span>}</td>
                  </tr>
                  <tr>
                    <td>Home town</td>
                    <td>{ins.namesHomeTown === null ? <span className="audit-nf">not checked</span> : ins.namesHomeTown ? `Named (${config.company.hqTown})` : `Not named in the title or H1 (${config.company.hqTown})`}</td>
                  </tr>
                </tbody>
              </table>
              <p className="audit-note" style={{ marginTop: 6 }}>{ins.issues.length ? `Problems: ${ins.issues.slice(0, 4).join(" · ")}.` : "No basic problems found on the homepage."} Source: DataForSEO page check, {ins.retrieved}.</p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minHeight: 0 }}>
          <div className="audit-card" style={{ flex: 1, overflow: "hidden" }}>
            <h3>Priorities</h3>
            <FixesList fixes={data.narrative.fixes} />
          </div>
          {built.length > 0 && (
            <div className="audit-card" style={{ flex: "none" }}>
              <h3>What they built: town pages that rank</h3>
              {built.map((c) => (
                <p key={c.name} style={{ fontSize: 11.5, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b>{c.name}:</b> {c.pages.slice(0, 3).join(" · ")}
                </p>
              ))}
              <p className="audit-note" style={{ marginTop: 4 }}>Pages of theirs that rank in Google&apos;s top 20 for searches naming this area&apos;s towns (DataForSEO).</p>
            </div>
          )}
        </div>
      </div>
    </Slide>
  );
}
