// Monthly plans. Prices come only from the audit settings, never from code.

import type { AuditPlan } from "@/lib/audit/config";
import { fmtUsd } from "@/lib/audit/format";

export function PricingCards({ plans }: { plans: AuditPlan[] }) {
  if (!plans.length) return <p className="audit-nf">Plan prices aren&apos;t set yet. The owner adds them in Sales → Audits → Settings.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {plans.map((p) => (
        <div key={p.name} className={`audit-price${p.recommended ? " rec" : ""}`}>
          {p.recommended && <span className="badge">RECOMMENDED</span>}
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: "var(--a-muted)" }}>{p.hoursPerMonth} hrs/mo</div>
            <div style={{ fontSize: 11, color: "var(--a-body)", marginTop: 2 }}>{p.summary}</div>
          </div>
          <div className="p">
            {fmtUsd(p.priceUsd, { exact: true })}
            <small>/month</small>
          </div>
        </div>
      ))}
    </div>
  );
}
