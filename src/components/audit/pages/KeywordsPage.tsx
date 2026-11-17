// Page 6: keyword clusters with demand, cost per click, difficulty and who wins.

import { clusterRows } from "@/lib/audit/compute";
import type { AuditBundle } from "@/lib/audit/data";
import { fmtNum, fmtUsd } from "@/lib/audit/format";
import { Missing } from "../Bits";
import { Slide } from "../Slide";

export function KeywordsPage({ bundle }: { bundle: AuditBundle }) {
  const { config, data } = bundle;
  const names = new Map([[config.company.domain, "You"], ...config.competitors.map((c) => [c.domain, c.name.replace(/\s*\(.*\)$/, "")] as const)]);
  const rows = clusterRows(data.keywords);
  return (
    <Slide bundle={bundle} page={6} title={`Local ${config.company.niche.toLowerCase()} keywords & demand`} aside="by cluster">
      <div className="audit-card">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Cluster</th>
              <th>Representative keywords</th>
              <th className="num">Searches/mo</th>
              <th className="num">CPC range</th>
              <th className="num">Max difficulty</th>
              <th>Current winner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cluster}>
                <td style={{ fontWeight: 700 }}>{r.cluster}</td>
                <td style={{ fontSize: 12 }}>{r.keywords.slice(0, 2).join(" · ")}</td>
                <td className="num">{fmtNum(r.volume)}</td>
                <td className="num">{r.cpcMin === null ? <Missing /> : r.cpcMin === r.cpcMax ? fmtUsd(r.cpcMin, { cents: true }) : `${fmtUsd(r.cpcMin, { cents: true })}–${fmtUsd(r.cpcMax, { cents: true })}`}</td>
                <td className="num">{r.kdMax === null ? <Missing /> : `KD ${r.kdMax}`}</td>
                <td>{r.winner ? names.get(r.winner) ?? r.winner : "Nobody ranks"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="audit-note">Volumes are local search volumes, each keyword counted once. Missing figures show “not found” and are left out of totals.</p>
      </div>
      {data.narrative.pageNotes.keywords && <div className="audit-callout"><span className="audit-tag info">Opportunity</span>{data.narrative.pageNotes.keywords}</div>}
    </Slide>
  );
}
