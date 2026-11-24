// Audit checkpoints: which pages (or parts of a page) go into one audit, and presets.
// Pure: no database, no network. The database keeps the same id list in a check rule
// (supabase/migrations/0023_saved_audits.sql); a test makes sure they match.

export const AUDIT_SECTION_IDS = [
  "summary",
  "rankings",
  "heatmap",
  "competitors",
  "fixes",
  "keywords",
  "revenue",
  "timeline",
  "investment",
  "reviews",
  "site_health",
  "ai_search",
  "backlinks",
] as const;

export type AuditSectionId = (typeof AUDIT_SECTION_IDS)[number];

/** "page" = its own page in the deck; "prompt" = asked for in the prompt now, its page comes later. */
export interface AuditSection {
  id: AuditSectionId;
  label: string;
  detail: string;
  kind: "page" | "prompt";
  /** Always included (the cover). */
  always?: boolean;
  /** On for a new audit. */
  defaultOn: boolean;
}

export const AUDIT_SECTIONS: readonly AuditSection[] = [
  { id: "summary", label: "Summary", detail: "Cover: headline numbers, competitor visits and modeled revenue, the goal.", kind: "page", always: true, defaultOn: true },
  { id: "rankings", label: "Demand & rankings", detail: "Searches per city and where they rank on the money terms.", kind: "page", defaultOn: true },
  { id: "heatmap", label: "Heat map & region map", detail: "Local 3-pack or Maps grid by city, the state map, who has pages where.", kind: "page", defaultOn: true },
  { id: "competitors", label: "Competitor analysis", detail: "Top competitors side by side and the keyword ranking matrix.", kind: "page", defaultOn: true },
  { id: "fixes", label: "Top fixes", detail: "Why competitors rank higher and the 5 fixes that matter.", kind: "page", defaultOn: true },
  { id: "keywords", label: "Money keywords", detail: "Keywords by group: searches, cost per click, difficulty, who wins.", kind: "page", defaultOn: true },
  { id: "revenue", label: "Revenue opportunity", detail: "Revenue model with every input shown, ads equivalent, 12-month curve.", kind: "page", defaultOn: true },
  { id: "timeline", label: "SEO timeline", detail: "12-month roadmap with hours per phase.", kind: "page", defaultOn: true },
  { id: "investment", label: "Investment", detail: "The monthly plans and the next step.", kind: "page", defaultOn: true },
  { id: "reviews", label: "Reviews gap", detail: "Rating, review count and how fast competitors add reviews.", kind: "prompt", defaultOn: false },
  { id: "site_health", label: "Website health", detail: "Speed, mobile, titles, broken basics (Google Lighthouse).", kind: "prompt", defaultOn: false },
  { id: "ai_search", label: "AI search check", detail: "Whether ChatGPT and Google's AI answers mention them or competitors.", kind: "prompt", defaultOn: false },
  { id: "backlinks", label: "Backlink gap", detail: "Sites that link to competitors but not to them.", kind: "prompt", defaultOn: false },
];

export const AUDIT_PRESETS: readonly { id: string; label: string; sections: readonly AuditSectionId[] }[] = [
  { id: "quick", label: "Quick look", sections: ["summary", "heatmap", "fixes", "investment"] },
  { id: "full", label: "Full local SEO", sections: AUDIT_SECTION_IDS },
  { id: "competitors", label: "Competitor deep dive", sections: ["summary", "rankings", "heatmap", "competitors", "keywords", "backlinks"] },
];

export const DEFAULT_SECTIONS: AuditSectionId[] = AUDIT_SECTIONS.filter((s) => s.defaultOn).map((s) => s.id);

const VALID = new Set<string>(AUDIT_SECTION_IDS);

/** Cleans a list from a form or the database: known ids only, in the standard order, cover always in. */
export function parseSections(raw: unknown): AuditSectionId[] {
  const list = Array.isArray(raw) ? raw : [];
  const picked = new Set(list.filter((v): v is string => typeof v === "string" && VALID.has(v)));
  picked.add("summary");
  return AUDIT_SECTION_IDS.filter((id) => picked.has(id));
}

/** The deck pages in order. Timeline and Investment share the last page. */
export type DeckPageKey = "summary" | "rankings" | "heatmap" | "competitors" | "fixes" | "keywords" | "revenue" | "plan";

export function deckPages(sections: readonly AuditSectionId[]): DeckPageKey[] {
  const on = new Set(sections);
  const pages: DeckPageKey[] = ["summary"];
  for (const id of ["rankings", "heatmap", "competitors", "fixes", "keywords", "revenue"] as const) if (on.has(id)) pages.push(id);
  if (on.has("timeline") || on.has("investment")) pages.push("plan");
  return pages;
}

export function sectionLabel(id: AuditSectionId): string {
  return AUDIT_SECTIONS.find((s) => s.id === id)?.label ?? id;
}
