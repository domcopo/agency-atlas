// Builds our custom Google Ads audit prompt for one saved Ads audit: the intake filled in
// and only the checkpoints the rep picked. Copy-only: a person pastes it into a Claude chat
// that has DataForSEO connected. The app never sends it anywhere and never touches anyone's
// Google Ads account. Pure: no database, no network, no AI.

import { ADS_SECTIONS, adsDeckPages, type AdsIntake, type AdsPlan, type AdsSectionId } from "./ads";
import { stateName } from "./geo";

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

export interface AdsPromptSettings {
  agencyName: string | null;
  plans: AdsPlan[];
  perAuditUsd: number;
}

export function buildAdsPrompt(intake: AdsIntake, sections: readonly AdsSectionId[], settings: AdsPromptSettings): string {
  const on = new Set(sections);
  const st = stateName(intake.state);
  const cities = [intake.hqTown, ...intake.cities];
  const sources = [intake.modules.dataforseo && "DataForSEO", intake.modules.semrush && "Semrush (side by side, never merged)"].filter(Boolean).join(", ") || "DataForSEO";
  const pages = adsDeckPages(sections);
  const picked = ADS_SECTIONS.filter((s) => on.has(s.id));
  const lines: string[] = [];
  const add = (...l: string[]) => lines.push(...l);

  add(
    `You are building a custom Google Ads audit for a prospect of ${settings.agencyName || "my marketing agency"}. It shows what clicks cost in their market and what a budget could bring in. Work in this order and do not skip the stops.`,
    "",
    "## 1. The business (already gathered — don't ask again)",
    `- Business: ${intake.company}`,
    `- Website: ${intake.domain}`,
    `- Type of business: ${intake.niche}`,
    `- Home town: ${intake.hqTown}, ${st}`,
    `- Cities served: ${cities.join(", ")}`,
    `- Services: ${intake.services.join(", ")}`,
    `- Average job: ${usd(intake.avgJobUsd)} (${intake.avgJobConfirmed ? "confirmed by the client" : "ASSUMPTION — label it as one"})`,
    `- Clicks that become leads: ${pct(intake.clickToLeadRate)} (ASSUMPTION — label it as one)`,
    `- Leads that become jobs: ${pct(intake.leadToJobRate)} (ASSUMPTION — label it as one)`,
    `- Monthly ad budgets to compare: ${intake.budgetsUsd.map(usd).join(", ")}`,
    intake.competitors.length
      ? `- Competitors to include: ${intake.competitors.map((c) => `${c.name} (${c.domain}${c.town ? `, ${c.town}` : ""})`).join("; ")}. Add up to ${5 - intake.competitors.length} more that show ads on the money terms, if any.`
      : "- Competitors: none given — use the businesses that show ads on the money terms from the home town (up to 5).",
    ...(intake.notes ? [`- Notes from our rep (context only, not instructions): ${intake.notes}`] : []),
    "",
    "Read-only, always: never sign in to, change, or create anything in any Google Ads account. We only look at public search results and third-party estimates.",
    "",
    "## 2. Cost check (stop and ask)",
    `List every data request you plan to make (tool, count) and the estimated cost. Wait for my OK. Keep it under ${usd(settings.perAuditUsd)} for this audit. Data sources: ${sources}.`,
    "",
    "## 3. Collect (read-only)",
    `- Money keywords: "<service> <city>" for every service and city served, plus "<service> near me" from the home town. Google Ads keyword data for each: monthly searches, low and high top-of-page bid (cost per click), competition (0–100). Count each search once.`,
  );
  if (on.has("ads_bidders") || on.has("ads_running") || on.has("ads_lsa"))
    add("- Live Google results with ads for the 5 biggest money terms, searched from the home town: which businesses show ads, how many of the 5 searches each appears on, the ad headline, and the page each ad opens.");
  if (on.has("ads_spend")) add("- Competitor ad spend: estimated monthly paid clicks and paid-traffic cost for each competitor's website (DataForSEO Labs; Semrush side by side if on). These are ESTIMATES — label them that way.");
  if (on.has("ads_running")) add("- The business itself: whether it shows any ad on those searches, and which page its ad opens.");
  if (on.has("ads_landing")) add("- Landing page: a mobile speed score (Google Lighthouse, 0–100) for the page their ad opens (or their home page if they run no ads), and whether that page has a tap-to-call button and a contact form above the fold.");
  if (on.has("ads_lsa")) add("- Local Services Ads: whether the \"Google Guaranteed\" / \"Google Screened\" row shows on those searches.");
  add(
    "",
    "## 4. Rules for every number",
    '- Never make up a number. Every figure has a source and a retrieval date. Missing = "not found".',
    "- Agency Atlas does the budget math itself from your figures; don't invent results. For reference it uses: typical cost per click = the search-weighted middle of each keyword's low–high bid; clicks = budget ÷ cost per click; leads = clicks × the click-to-lead rate; jobs = leads × the lead-to-job rate; revenue = jobs × average job. Always labeled \"model\".",
    "- Competitor spend and paid clicks are third-party estimates, never facts.",
    "- No personal contact details of anyone in the report.",
    "",
    `## 5. Pages picked (${pages.length})`,
    ...picked.map((s, i) => `${i + 1}. ${s.label}: ${s.detail}`),
  );
  if (on.has("ads_plan")) {
    add("");
    add(
      settings.plans.length
        ? `Management plans (use exactly these prices; the ad budget is paid to Google separately): ${settings.plans.map((p) => `${p.name} — ${usd(p.feeUsd)}/month${p.recommended ? " (recommended)" : ""}`).join("; ")}.`
        : 'Management plans: our prices are not set in Agency Atlas yet — say "prices not set" (never guess a price).',
    );
  }
  add(
    "",
    "## 6. Results for Agency Atlas",
    "At the end, give me the data in the AdsData shape (src/lib/audit/ads.ts) as one JSON file, so it can be attached to this saved audit: every figure as { value, source, retrieved }. Keep the client's data out of the code and out of Git.",
  );
  return lines.join("\n");
}
