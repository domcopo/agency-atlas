# Plan: "recent_runs" in the owner summary (for AI CEO's Bot activity page)

Status: **approved and built 2026-11-12.** `supabase/migrations/0018_bot_runs.sql` must be run in Supabase. Until then the code still works, but `recent_runs` stays `null`.

## What already exists
Atlas already writes **one line per AI call** to its cost log (`ai_usage`):
- which feature made the call;
- when it finished;
- the exact cost;
- whether it worked (`ok`, `refused` or `error`).

There are five AI features today:

| Bot name in the list | What it does (the fixed "action" label) | Who starts it |
|---|---|---|
| Ops Briefing | built daily plan | owner/manager taps a button |
| Client Profile | wrote client profile | owner/manager taps a button |
| Work Order Drafts | drafted work orders | owner/manager taps a button |
| Smart Add | drafted work orders from a note | owner/manager taps a button |
| Work Prompt Helper | wrote a work prompt | owner/manager taps a button |

Each run is **one request to the AI, a few seconds long**, started by a person. Nothing runs on its own, and no bot hands work to another bot.

## What the log is missing (and the fix)
1. **No random id.** The log only has its internal database id, which you asked me not to share.
2. **No start time.** Only the finish time is saved.
3. **Failed calls that never got a bill aren't logged at all**, for example when the connection drops. Those runs are invisible today.

**Proposed fix: one small database step, `0018`.** It adds two columns and one rule to the existing cost log, so there's no new table:
- **`run_ref`:** a random 12-character code, filled in by the database, including for old rows. It's stable, so AI CEO sees the same id on every refresh and can tell runs apart. It reveals nothing about the database.
- **`started_at`:** Atlas notes the time just before calling the AI and saves it with the line. Old rows don't have it, so they show the finish time as the start (said in the list's note).
- **Cost may be blank only for failed runs.** A failed call with no bill is now logged with **cost = blank (null), never 0**, because we don't know whether it was charged. Successful runs always have an exact cost.

The monthly budget still adds up only known costs, exactly as today.

## What AI CEO gets
A new top-level `recent_runs` list in the summary: the last 100 runs from the past 7 days, newest first.

```json
{ "run_id": "9f3a1c0b7e2d", "parent_run_id": null, "bot": "Ops Briefing",
  "action": "built daily plan", "started_at": "2026-11-12T14:03:10.000Z",
  "finished_at": "2026-11-12T14:03:21.000Z", "result": "ok", "cost_usd": 0.0412 }
```

- **`bot` and `action` are fixed words written in the code**, picked from the table above. They are never taken from what someone typed or what the AI answered. That's the main privacy guarantee: there's no path for client names, message text, emails or phone numbers to get in.
- **`result`:** `ok`, or `error` (the AI declining a request also counts as `error`).
- **What you won't see** (honest limits):
  - **`running`:** a run is written to the log when it finishes, and the summary is rebuilt at most once an hour (or with "Publish now"). So `running` never appears.
  - **`parent_run_id`:** this is always `null`, because no Atlas bot hands work to another.
- **`[]`** when there were no runs. The whole list is `null` if the cost log can't be read, which is different from "no runs".
- **Also, as a tiny fix:** the existing `bots` list gains Smart Add and Work Prompt Helper, which were missing.

## What stays the same
- **Same address and key check.** The summary stays read-only (GET only), with the same `owner-summary/v1` format. This is a new field, and nothing existing changes.
- **AI CEO can't start, stop or change any bot.** There's no new route and no new permission.
- **The safety checks still run on everything saved:** the summary is scanned for leaks before it's saved, and the database still refuses any emails or phone numbers.
- **No GoHighLevel changes.** No new service, no new package. **$0.**

## Tests
- **Runs list (plain code, fictional data):**
  - only the allowed keys;
  - newest first, at most 100 runs, last 7 days only;
  - unknown features are skipped;
  - a missing cost stays `null`, never `0`;
  - the bot/action words come only from the fixed table;
  - fake log lines stuffed with an email, a phone number and a message go in, and none of it comes out;
  - the `findLeaks` scan passes.
- **Guardrails:**
  - the summary code never reads prompt or answer text;
  - `run_id` is never the database id.
- **Database break-in tests:**
  - `run_ref` is filled in automatically and can't be changed (the log stays add-only);
  - a blank cost is refused on a successful run;
  - developers still can't read the cost log.

## Risks
- **Small change to the cost log.** It only adds things, and the budget math is unchanged and tested.
- **Up to an hour behind** unless you press "Publish now".

## Steps after your OK
1. Write `0018` and the tests, then give it to you to review and run in Supabase.
2. Code changes:
   - the cost log saves the start time and logs failed calls;
   - the summary builds `recent_runs`;
   - the tests above.
3. Run all checks, commit after you say so, and you push.
