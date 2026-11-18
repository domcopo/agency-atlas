// "Today → goal" strip under the leaderboard: where the client is now and where the plan
// aims. Today values are data; goal values are the agency's targets or the model.

import type { ReactNode } from "react";

export interface GoalItem {
  label: string;
  today: ReactNode;
  goal: ReactNode;
  /** "goal" = a target the agency set; "model" = calculated from the model. */
  kind: "goal" | "model";
}

export function GoalPanel({ title, items, terms, columns }: { title: string; items: GoalItem[]; terms?: string[]; columns?: number }) {
  return (
    <div className="audit-goal">
      <p className="audit-goal-title">{title}</p>
      <div className="audit-goal-grid" style={{ gridTemplateColumns: `repeat(${columns ?? items.length}, 1fr)` }}>
        {items.map((it) => (
          <div key={it.label}>
            <div className="l">{it.label}</div>
            <div className="v">
              <span className="today">{it.today}</span>
              <span className="arrow">→</span>
              <span className="target">{it.goal}</span>
            </div>
            <div className={`k ${it.kind}`}>{it.kind === "goal" ? "goal" : "model"}</div>
          </div>
        ))}
      </div>
      {terms && terms.length > 0 && (
        <p className="audit-goal-terms">
          <b>Page 1 goal for:</b> {terms.join(" · ")}
        </p>
      )}
    </div>
  );
}
