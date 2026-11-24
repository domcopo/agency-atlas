# Scout prompt

The prompt that runs one Scout in Claude Code (where DataForSEO is connected) is built by
`buildScoutPrompt()` in `src/lib/scout-prompt.ts`, filled in with one run's settings
(area, kinds of business, size, budget). Copy it from **Sales → Scout → the run → Copy
the Scout prompt**. The app never runs or sends it.

What it asks for (see `docs/SCOUT_PLAN.md`):
- businesses from DataForSEO business listings around Austintown, OH (30 miles);
- which of them show as paid Google ads, whether the ad goes to the home page or a slow
  mobile page (signs, not proof), their Google Maps position, reviews vs the top 3, whether
  the site loads, and whether they have a storefront;
- a source and date on every figure, `null` when not found, never a guess;
- **no phone numbers, emails or people's names**;
- one JSON file (`"kind": "atlas-scout-results"`, `"version": 1`) to attach to the run.

Atlas checks the file again (`parseScoutResults` in `src/lib/scout-intake.ts`): unknown
fields are dropped, businesses with contact details in kept fields are refused, and the
database skips existing clients, GoHighLevel leads and do-not-contact businesses.
