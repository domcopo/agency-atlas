"use client";

// Search and filter for leads. Filtering happens on the fake data already on
// the page. (Later, with real data, the server decides what each team member
// may see — the browser only narrows down what it was allowed to receive.)

import { SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import type { Lead, LeadGrade } from "@/lib/types";
import { EmptyState } from "@/components/labels/labels";
import { Chip, ChipRow, SearchBox } from "./Filters";
import { LeadCard } from "./LeadCard";

type View = "active" | "contract" | "dead" | "all";

const views: { id: View; label: string }[] = [
  { id: "active", label: "Working" },
  { id: "contract", label: "Under contract" },
  { id: "dead", label: "Dead" },
  { id: "all", label: "All" },
];

const grades: LeadGrade[] = ["A", "B", "C", "D"];

function inView(lead: Lead, view: View) {
  if (view === "all") return true;
  if (view === "contract") return lead.stage === "under_contract";
  if (view === "dead") return lead.stage === "dead";
  return lead.stage !== "dead" && lead.stage !== "under_contract";
}

export function LeadBrowser({ leads, today }: { leads: Lead[]; today: string }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("active");
  const [grade, setGrade] = useState<LeadGrade | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (!inView(l, view)) return false;
      if (grade && l.grade.letter !== grade) return false;
      if (!q) return true;
      return [l.sellerName, l.property.street, l.property.city, l.source, ...l.motivations]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [leads, query, view, grade]);

  return (
    <div>
      <SearchBox
        value={query}
        onChange={setQuery}
        label="Search leads"
        placeholder="Search address, seller, motivation…"
      />

      <div className="mt-3 space-y-2">
        <ChipRow label="Filter by stage">
          {views.map((v) => (
            <Chip key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Filter by grade">
          {grades.map((g) => (
            <Chip
              key={g}
              tone="amber"
              active={grade === g}
              onClick={() => setGrade(grade === g ? null : g)}
              count={leads.filter((l) => inView(l, view) && l.grade.letter === g).length}
            >
              Grade {g}
            </Chip>
          ))}
        </ChipRow>
      </div>

      <p className="mb-2.5 mt-5 px-1 text-xs text-faint" aria-live="polite">
        {results.length} lead{results.length === 1 ? "" : "s"} · best grade first
      </p>

      {results.length > 0 ? (
        <ul className="space-y-2.5">
          {results.map((l, i) => (
            <li key={l.id} className="animate-rise-in" style={{ animationDelay: `${i * 30}ms` }}>
              <LeadCard lead={l} today={today} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<SearchX className="size-5" />} title="No matches">
          Try a different word, or clear the filters.
        </EmptyState>
      )}
    </div>
  );
}
