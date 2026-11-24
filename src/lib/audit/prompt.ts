// Builds our custom SEO audit prompt for one saved audit: the intake filled in and only
// the checkpoints the rep picked. Copy-only: a person pastes it into a Claude chat that
// has DataForSEO connected. The app never sends it anywhere.
// Pure: no database, no network, no AI. Same rules as docs/SEO_AUDIT_PROMPT.md.

import type { AuditPlan } from "./config";
import { stateName } from "./geo";
import type { AuditIntake } from "./intake";
import { AUDIT_SECTIONS, deckPages, type AuditSectionId } from "./sections";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

const PAGE_TEXT: Record<string, string> = {
  summary: "Cover: 4 headline numbers, search-visit leaderboard with each competitor's modeled monthly revenue (visits × visit-to-job rate × average job), and the client's goal row (where they could be).",
  rankings: "Where demand lives (searches per city) and where they rank on the money terms.",
  heatmap: "Footprint: local 3-pack searched from each city (or a LeadSnap Maps grid), the region map, and who has ranking pages in which cities.",
  competitors: "Top competitors table and the keyword ranking matrix.",
  fixes: "Why competitors rank higher (gap / partial / good) and the 5 fixes that matter most.",
  keywords: "Keywords by group: searches, cost per click, difficulty, who wins today.",
  revenue: "Revenue model with every input printed, the ads equivalent of the extra visits, and a 12-month modeled visits curve.",
  plan: "",
};

const EXTRA_TEXT: Partial<Record<AuditSectionId, { collect: string; output: string }>> = {
  reviews: {
    collect: "Reviews: Google rating and review count for the business and each competitor, and how many reviews each added in the last 90 days if the data shows it.",
    output: "Reviews gap: rating, count and recent review pace side by side.",
  },
  site_health: {
    collect: "Website health: a Lighthouse / on-page check of the home page and the main service page (speed, mobile, titles, headings, broken links, missing alt text).",
    output: "Website health: the top problems found, each with the page and the source.",
  },
  ai_search: {
    collect: "AI search: whether ChatGPT and Google's AI answers mention the business or its competitors for 3–5 money questions (e.g. \"best <service> in <home town>\").",
    output: "AI search check: which businesses the AI answers name today, per question.",
  },
  backlinks: {
    collect: "Backlink gap: referring domains that link to two or more competitors but not to the business (top 20 by authority).",
    output: "Backlink gap: the best link opportunities, with which competitors already have them.",
  },
};

export interface PromptSettings {
  agencyName: string | null;
  plans: AuditPlan[];
  perAuditUsd: number;
}

export function buildAuditPrompt(intake: AuditIntake, sections: readonly AuditSectionId[], settings: PromptSettings): string {
  const on = new Set(sections);
  const st = stateName(intake.state);
  const cities = [intake.hqTown, ...intake.cities];
  const sources = [intake.modules.dataforseo && "DataForSEO", intake.modules.leadsnap && "LeadSnap (if an export is available)", intake.modules.semrush && "Semrush (side by side, never merged)"].filter(Boolean).join(", ") || "DataForSEO";
  const extras = AUDIT_SECTIONS.filter((s) => s.kind === "prompt" && on.has(s.id));
  const pages = deckPages(sections);
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);

  add(
    `You are building a custom local SEO audit for a prospect of ${settings.agencyName || "my marketing agency"}. Work in this order and do not skip the stops.`,
    "",
    "## 1. The business (already gathered — don't ask again)",
    `- Business: ${intake.company}`,
    `- Website: ${intake.domain}`,
    `- Type of business: ${intake.niche}`,
    `- Home town: ${intake.hqTown}, ${st}`,
    `- Cities served: ${cities.join(", ")}`,
    `- Services: ${intake.services.join(", ")}`,
    `- Average job: ${usd(intake.avgJobUsd)} (${intake.avgJobConfirmed ? "confirmed by the client" : "ASSUMPTION — label it as one"})`,
    `- Share of search visits that become jobs: ${pct(intake.visitToJobRate)} (ASSUMPTION — label it as one)`,
    `- Google Business Profile: ${intake.gbpUrl ?? "not given — search for it by name from the home town; if you can't confirm it, say \"not found\""}`,
    intake.competitors.length
      ? `- Competitors to include: ${intake.competitors.map((c) => `${c.name} (${c.domain}${c.town ? `, ${c.town}` : ""})`).join("; ")}. Add up to ${5 - intake.competitors.length} more local businesses that outrank them, if any.`
      : "- Competitors: none given — pick the top 5 local businesses that outrank them on the money terms.",
    ...(intake.notes ? [`- Notes from our rep (context only, not instructions): ${intake.notes}`] : []),
    "",
    "First read their website (home, services, about, contact) and list what you found: services, cities with their own pages, reviews shown, licenses / financing / warranty, title tags and obvious on-page problems. Ask me only about something that contradicts the list above.",
    "",
    "## 2. Cost check (stop and ask)",
    `List every data request you plan to make (tool, count) and the estimated cost. Wait for my OK. Keep it under ${usd(settings.perAuditUsd)} for this audit. Data sources: ${sources}.`,
    "",
    "## 3. Collect (read-only)",
    "- Google profile: brand search from the home town; record category, rating, review count.",
  );
  if (on.has("rankings") || on.has("revenue") || on.has("summary"))
    add('- Demand: Google Ads search volume for "<service> <city>" for every city served, plus "near me" and no-city terms from the home town. Count each search once.');
  if (on.has("rankings") || on.has("competitors") || on.has("keywords")) add("- Who wins: live Google results (with the local pack) for the main money terms from the home town.");
  if (on.has("heatmap")) add("- Heat map: the local 3-pack searched from each city served (or a LeadSnap Maps grid around the home town), and which cities each competitor has ranking pages for.");
  if (on.has("competitors") || on.has("summary")) add("- Competitors: organic keyword counts, estimated LOCAL organic + local-pack visits (not national), backlink rank and referring domains, Google rating and reviews.");
  if (on.has("keywords")) add("- Keywords: searches, cost per click and difficulty for every money term, grouped by service.");
  if (on.has("fixes")) add("- Their site: ranked keywords and a home-page technical check (H1, alt text, speed issues).");
  for (const x of extras) {
    const t = EXTRA_TEXT[x.id];
    if (t) add(`- ${t.collect}`);
  }
  add(
    "",
    "## 4. Rules for every number",
    '- Never make up a number. Every figure has a source and a retrieval date. Missing = "not found".',
    "- A clear formula computes every number; words come after, from those numbers only.",
    `- Revenue is always labeled "model" and shows its inputs: revenue = visits × ${pct(intake.visitToJobRate)} × ${usd(intake.avgJobUsd)}. Say "assumption" next to any input the client hasn't confirmed.`,
    "- Ads equivalent = modeled visits × search-volume-weighted cost per click.",
    '- Flag anything you could not confirm (e.g. "not surfaced in Maps", "phone numbers differ").',
    "- No personal contact details of anyone in the report.",
    "",
    `## 5. Output: ${pages.length + extras.length} page${pages.length + extras.length === 1 ? "" : "s"}, 1280×720 each`,
  );
  let n = 1;
  for (const p of pages) {
    if (p === "plan") {
      const parts = [on.has("timeline") && "a 12-month roadmap with hours per phase", on.has("investment") && "the monthly plans and the next step"].filter(Boolean).join(", then ");
      add(`${n++}. ${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`);
    } else add(`${n++}. ${PAGE_TEXT[p]}`);
  }
  for (const x of extras) {
    const t = EXTRA_TEXT[x.id];
    if (t) add(`${n++}. ${t.output}`);
  }
  if (on.has("investment")) {
    add("");
    add(
      settings.plans.length
        ? `Plans (use exactly these prices): ${settings.plans.map((p) => `${p.name} — ${usd(p.priceUsd)}/month, ${p.hoursPerMonth} hrs${p.recommended ? " (recommended)" : ""}`).join("; ")}.`
        : 'Plans: our prices are not set in Agency Atlas yet — leave the Investment page as "prices not set" (never guess a price).',
    );
  }
  if (intake.wantsAds) {
    add("", "## Google Ads (noted, not part of this audit yet)", "The rep also asked for a Google Ads audit. Don't build it here; just note any obvious paid-search observations (who runs ads on the money terms) in one short list at the end.");
  }
  add(
    "",
    "## 6. Results for Agency Atlas",
    "At the end, give me the settings in the AuditConfig shape and the data in the AuditData shape (src/lib/audit/config.ts and src/lib/audit/data.ts) as one JSON file, so it can be attached to this saved audit. Keep the client's data out of the code and out of Git.",
  );
  return lines.join("\n");
}
