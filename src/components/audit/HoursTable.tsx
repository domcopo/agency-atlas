// The roadmap: phases, focus and hours per task (hours come from the settings).

import type { RoadmapPhase } from "@/lib/audit/config";

export function HoursTable({ phases }: { phases: RoadmapPhase[] }) {
  return (
    <table className="audit-table" style={{ fontSize: 12.5 }}>
      <thead>
        <tr>
          <th>Phase</th>
          <th>Focus</th>
          <th>Key tasks (hours / month)</th>
          <th className="num">Total</th>
        </tr>
      </thead>
      <tbody>
        {phases.map((p) => (
          <tr key={p.label}>
            <td style={{ width: "16%" }}>
              <b>{p.label}</b>
              <span className="sub">{p.name}</span>
            </td>
            <td style={{ width: "20%" }}>{p.focus}</td>
            <td>{p.tasks.map((t) => `${t.task} (${t.hours}h)`).join(" · ")}</td>
            <td className="num">{p.tasks.reduce((s, t) => s + t.hours, 0)}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
