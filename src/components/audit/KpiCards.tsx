// Four headline numbers across the top of the cover page.

import type { ReactNode } from "react";

export interface Kpi {
  value: ReactNode;
  label: string;
  detail: ReactNode;
  color?: string;
}

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="audit-kpis">
      {items.map((k) => (
        <div key={k.label} className="audit-kpi" style={k.color ? { borderTopColor: k.color } : undefined}>
          <div className="v">{k.value}</div>
          <div className="l">{k.label}</div>
          <div className="s">{k.detail}</div>
        </div>
      ))}
    </div>
  );
}
