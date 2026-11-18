# SEO audit prompt (paste into a Claude chat that has DataForSEO, and optionally Semrush)

Use this when you want an audit before the Agency Atlas intake form exists (audit Phase 3).
Paste everything between the lines, then send the prospect's website. It follows the same
rules as the app (`docs/SEO_AUDIT_PLAN.md`).

---

You are building a local SEO audit for a prospect of my marketing agency. Work in this order and
do not skip the stops.

## 1. Intake (stop and ask)

I will give you a website. First read the site yourself (home, services, about, contact) and fill
in what you can: business name, niche, services, home city, cities served (and whether each has
its own page), reviews or ratings shown, license/financing/warranty mentions, title tags, and obvious
on-page problems. Show me what you found as a short list.

Then ask me ONLY what you could not find, in one message, numbered:
1. Job mix and average ticket per service (I may give one average for everything).
2. Google Business Profile link (or say you will search for it by name).
3. Lead rate and close rate (if I don't know, propose numbers and mark them "assumption").
4. Competitors to include (if none, you pick the top 5 local businesses that outrank them).
5. Which of my agency brands to show, and the three monthly plan prices with hours.
6. Data sources: DataForSEO (default), Semrush (optional, side by side), LeadSnap export (optional).

## 2. Cost check (stop and ask)

List every data request you plan to make (tool, count) and the estimated cost. Wait for my OK.
Keep DataForSEO under $5 per audit unless I say otherwise.

## 3. Collect (read-only)

- Google profile: brand search from the home city; record category, rating, review count.
- Demand: Google Ads search volume for "<service> <city>" for every city served (counted once;
  "remodel"/"remodeling" variants share one figure), plus "near me" and no-city terms from the home city.
- Who wins: live Google results (with local pack) for the main money terms from the home city, and
  the local 3-pack searched from each city served.
- Competitors: organic keyword counts, estimated organic + local-pack visits, backlink rank and
  referring domains, Google rating and reviews, and which cities they have ranking pages for.
- The prospect's site: ranked keywords, homepage technical check (H1, alt text, speed issues).
- Semrush (if on): its traffic estimate for the same domains, shown next to DataForSEO, never merged.

## 4. Rules for every number

- Never make up a number. Every figure has a source and a retrieval date. Missing = "not found".
- Code or a clear formula computes every number; words come after, from those numbers only.
- Revenue is always labeled "model" and shows its inputs:
  visits = local demand × share captured (2.5% / 5% / 8%); leads = visits × lead rate;
  jobs = leads × close rate; revenue = jobs × average ticket. Ticket and rates say "assumption"
  until the client confirms them.
- Ads equivalent = modeled visits × search-volume-weighted cost per click.
- Flag anything you could not confirm (e.g. "not surfaced in Maps", "phone numbers differ").
- Prices come only from what I gave you.
- No personal contact details of anyone in the report.

## 5. Output: eight pages, 1280×720 each

1. Cover: 4 headline numbers, search-visit leaderboard, the headline.
2. Where demand lives (bars per city) and where they rank on the money terms.
3. Footprint: local 3-pack by city (or LeadSnap grid), region map, who has pages where.
4. Top competitors table and keyword ranking matrix.
5. Why competitors rank higher (gap / partial / good) and the 5 fixes that matter.
6. Keywords by cluster: searches, cost per click, difficulty, current winner.
7. Revenue model with every input printed, value of extra visits, 12-month modeled visits curve.
8. 12-month roadmap with hours, the three plans, and the next step.

In Agency Atlas: put the settings in the `AuditConfig` shape (`src/lib/audit/config.ts`) and the
data in the `AuditData` shape (`src/lib/audit/data.ts`), then render with the audit template.
Keep the client's data out of the code and out of Git.

---
