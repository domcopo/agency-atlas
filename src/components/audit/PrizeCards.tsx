// "What additional visits are worth": the same funnel applied to fixed visit steps.

import { fmtNum, fmtUsd } from "@/lib/audit/format";

export interface Prize {
  extraVisits: number;
  leads: number;
  jobs: number;
  revenueMo: number;
  revenueYr: number;
}

export function PrizeCards({ prizes }: { prizes: Prize[] }) {
  return (
    <div className="audit-prize">
      {prizes.map((p) => (
        <div key={p.extraVisits}>
          <div className="l">+{fmtNum(p.extraVisits)} visits / mo</div>
          <div className="v">{fmtUsd(p.revenueMo)}/mo</div>
          <div className="s">
            {fmtNum(p.leads)} leads · {fmtNum(p.jobs, 1)} jobs
            <br />
            {fmtUsd(p.revenueYr)} / year
          </div>
        </div>
      ))}
    </div>
  );
}
