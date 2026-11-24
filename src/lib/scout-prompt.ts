// The Scout prompt (docs/SCOUT_PLAN.md S1): copy-only text a person pastes into Claude Code,
// where DataForSEO is connected, to run one scout. The app never runs or sends it. It
// carries only the run's settings (area, kinds, size, budget) — never client names, staff
// names or anything from the database. Pure; tested in tests/scout.test.ts.

import { SCOUT_RULES } from "@/lib/scout";

export function buildScoutPrompt(run: { id: string; area: string; kinds: string[]; size: number; budgetUsd: number }): string {
  const b = SCOUT_RULES.base;
  return `You are running a Scout for Agency Atlas: find local businesses worth a walk-in or a call from a small SEO and Google Ads agency. Use the DataForSEO tools. Read-only research: never contact, message, book or sign up for anything.

RUN
- Run id: ${run.id}
- Area: ${run.area}
- Home base: ${SCOUT_RULES.base.label} (${b.lat}, ${b.lng}); stay within about ${SCOUT_RULES.radiusMiles} miles (${SCOUT_RULES.counties.join(", ")} counties).
- Kinds of business: ${run.kinds.join("; ")}
- Up to ${run.size} businesses in total, spread across the kinds and towns.
- BUDGET: stop before DataForSEO spend reaches $${run.budgetUsd.toFixed(2)}. Prefer cheap calls; skip optional checks rather than go over.

STEPS
1. Find businesses: business listings search per kind, around the home base. Keep: name, website, category, street address, town, latitude, longitude, Google Maps link (place/cid link), rating, review count, and whether it has a real storefront (not "service area only").
2. Ads: for each kind and main town, read the Google results for "[kind] near [town]" and "[kind] [town]". Note which listed businesses appear as PAID ads (match by website domain) and on which searches. Optionally add their estimated paid search clicks per month (DataForSEO Labs).
3. Ads probably not optimized (only for businesses seen in ads): does the ad send people to the plain home page? How many seconds until the ad's page is usable on a phone (Lighthouse, mobile)? Check at most 20 ad pages.
4. SEO: for each business, its position in the Google Maps / local results for "[its kind] [its town]" (null if not in the top 20), plus the average review count of the top 3 for that search. Does its website load?
5. Do NOT collect phone numbers, email addresses, or any person's name (owners, staff, reviewers). Leave them out entirely, even if a tool returns them.
6. Every signal needs a "source" (e.g. "DataForSEO SERP", "DataForSEO Labs", "Lighthouse", "DataForSEO Business Listings") and the "date" you got it (YYYY-MM-DD). If you could not find something, use null for its value. Never guess or invent a number.

OUTPUT: one JSON file named scout-${run.id.slice(0, 8)}.json, exactly this shape and nothing else:
{
  "kind": "atlas-scout-results",
  "version": 1,
  "runId": "${run.id}",
  "retrievedOn": "YYYY-MM-DD",
  "costUsd": 0.00,
  "businesses": [
    {
      "name": "…", "website": "https://… or null", "category": "…", "address": "…", "town": "…",
      "lat": 41.0, "lng": -80.0, "mapsUrl": "https://www.google.com/maps/… or null", "rating": 4.5, "reviews": 37,
      "signals": {
        "adsSeen": { "value": true, "keywords": ["roofer near boardman"], "source": "…", "date": "YYYY-MM-DD" },
        "paidTraffic": { "value": 120, "source": "…", "date": "…" },
        "adToHomePage": { "value": true, "source": "…", "date": "…" },
        "adPageMobileSeconds": { "value": 6.2, "source": "Lighthouse", "date": "…" },
        "mapsRank": { "value": 7, "keyword": "roofer boardman", "source": "…", "date": "…" },
        "top3Reviews": { "value": 140, "source": "…", "date": "…" },
        "siteLoads": { "value": true, "source": "…", "date": "…" },
        "storefront": { "value": true, "source": "…", "date": "…" }
      }
    }
  ]
}
Leave out any signal you did not check. Put the real total DataForSEO cost in costUsd. Then I will attach the file in Atlas (Sales → Scout → this run → Attach results).`;
}
