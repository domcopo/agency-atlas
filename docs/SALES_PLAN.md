# Plan: Sales role, leads and a daily coach

Status: **approved 2026-11-15** (lead values visible to sales; default target 15). **Step 1 built and run** (`0020`, 2026-11-15). **Step 2 built** (screens, Refresh leads, setup); not committed or deployed yet. Step 3 (AI drafts) not started.

**Built in step 2:** Sales role tabs (Home · Sales · Kit); Home "Today's plan" for salespeople; Sales tab with Refresh leads, follow-ups, lead list (Mine / Everyone's) and reach-out buttons; for you and managers, pipeline health + all sales leads on Sales; owner-only `/sales/setup` (pipelines + hot stages, login ↔ GoHighLevel user, targets; linked from Data Safety and Sales). Sync now also copies each lead's pipeline and assigned user, and GoHighLevel user names (needs `users.readonly`).

**One limit found while building (tested):** salespeople can only ever see *open* leads, so the database also lets their refresh save only open leads. When a salesperson refreshes, new and still-open leads are saved; leads that closed in GoHighLevel (won/lost) stay on their list until you or a manager refreshes (opening Home or Sales does it at most hourly) or you press Sync. A small later fix is possible (a `0021` letting salespeople record that a sales lead closed), only with your OK.

## What you asked for
- **What salespeople get:** their own view in Atlas. They go through every lead in your **two sales pipelines**, kept separate from the GoHighLevel pipelines you use for other work. They log their follow-ups, and they see how many leads to reach out to today.
- **A "sales coach"** that tells them what to do when they log in.
- **Live tracking** that the sales pipelines are actually being worked.

## What already exists
- **Sync** copies opportunities from **every** GoHighLevel pipeline, read-only:
  - lead name;
  - pipeline and stage;
  - status;
  - value;
  - source;
  - dates.

  Only you can run it, by tapping Sync.
- **Lead follow-ups** on the Sales tab: tasks tied to a GoHighLevel lead. They live only in Atlas.
- **The won/lost history.**
- **Missing:**
  - a role for salespeople;
  - who each lead is **assigned to** in GoHighLevel;
  - a record of who reached out to whom;
  - targets.

## The new "Sales" role (enforced by the database)
Atlas has three roles today: owner, manager and developer. A fourth one, **Sales**, follows the same rule as everything else: **it sees nothing unless a database rule says so.**

| | Salespeople see / do | Never |
|---|---|---|
| Leads | Every **open lead in the sales pipelines** (name, stage, value, age, who it's assigned to) | Leads in your other pipelines |
| Follow-ups | Lead follow-ups: add, update, tick done | Client follow-ups, work orders, issues |
| Reach-outs | Log "called / texted / emailed / met" on a lead (add-only) | Edit or delete someone's log |
| Their day | Their own target and progress | Other people's targets (you and managers see everyone's) |
| Everything else | Kit (handbook) | Clients, client revenue, billing, work orders, health scores, AI CEO, Data Safety, Trash |

**Tabs for salespeople:** Home (their coach), Sales and Kit. Any other screen shows "not part of your view", but the database is the real lock.

## How it works
1. **Which pipelines count as Sales:** on Data Safety, you tick your two sales pipelines once. Only leads from those are shown to salespeople and counted in sales numbers. Your other pipelines stay out.
2. **Who owns which lead:** Sync also copies the **assigned user** of each opportunity, plus GoHighLevel users' **names and ids only** (no emails or phones).
   - You link each salesperson's Atlas login to their GoHighLevel user once.
   - That gives every salesperson a **"Mine / Everyone's"** filter.
   - This needs **one more read-only permission** on your GoHighLevel key: `users.readonly`. Still GET-only and allowlisted, nothing written.
3. **Fresher data:** you, managers and salespeople can tap **Sync**, at most once every 10 minutes for everyone, like billing. Sync also runs on its own when someone opens Sales and the copy is over an hour old. So the leads stay close to live without a scheduled job.
4. **Logging a reach-out:** on each lead, one tap: **Called / Texted / Emailed / Met**, with an optional short note.
   - Notes refuse email addresses and phone numbers.
   - Calling and texting still happen in GoHighLevel; Atlas only records that it happened.
   - Lead follow-ups (with due dates) work as today.
5. **Daily target:** you set a number per salesperson, e.g. **15 reach-outs a day** (default 15, weekdays only, New York time). They see "7 of 15 today". You see everyone's progress.

## The sales coach (no nagging)
When a salesperson opens Atlas, their Home shows **"Today's plan"**: their target and progress, then a short list of who to reach out to, in this order.
1. **Follow-ups due today or late.**
2. **New leads nobody has contacted yet**, newest first.
3. **Leads stuck in a stage** with no reach-out for 7+ days.
4. **Hot stages first**: you mark which stages are hot when you tick the pipelines.

**Plain rules, free, and every pick says why**, e.g. "new 2 days ago, no contact yet". It appears when they open the app: **no random pop-ups and no messages.** Your team check-in automation stays paused.

**Optional AI "Draft a follow-up"** on any lead (step 3):
- **What it uses:** only the lead's stage, age, source and the last reach-out type. The name is swapped for a code first.
- **What you get:** a short message to **copy** into GoHighLevel yourself. Atlas never sends it.
- **Cost:** about 1–3 cents each, from your existing AI budget, with a new "Sales coach" line in the bot list.

## Pipeline health (you and managers)
A new card on Sales, one row per sales pipeline:
- open leads;
- new this week;
- **not contacted yet**;
- **stuck 7+ days**;
- reach-outs today and this week;
- won and lost this month.

There's also a per-person row: reach-outs today vs target, leads owned, and overdue follow-ups. This is how you see whether each pipeline is actually being worked. The AI CEO summary can get these numbers later (separate OK).

## Not included (on purpose)
- **No writing to GoHighLevel:** a lead typed into Atlas wouldn't exist in GoHighLevel. Salespeople keep adding new leads **in GoHighLevel**, and Atlas picks them up on the next Sync (at most an hour later, or right away with Sync).
- **No contact details stored in Atlas:** no lead phone numbers, emails or addresses. They open the lead in GoHighLevel to call or text.
- **No automatic reach-out counting from GoHighLevel messages yet.** It's possible later, read-only, from conversation times like for clients, but it means many more GoHighLevel requests. Taps are simpler and honest for week one.

## Database changes (`0020`, you run it in Supabase)
- **The role:** `team_members.role` gains `sales`, and `team_members.ghl_user_id` links a login to a GoHighLevel user.
- **`ghl_opportunities`** gains:
  - `assigned_user_id` and `pipeline_id`;
  - salespeople read only open leads in sales pipelines.
- **New tables** (each with security rules, the two-factor rule and break-in tests):
  - `ghl_users`: GoHighLevel user id + name only;
  - `sales_pipelines`: your ticked pipelines and hot stages, owner only;
  - `lead_touches`: reach-out log, add-only, refuses contact details;
  - `sales_targets`: the daily number per person, owner sets;
  - `ghl_syncs`: gains a 10-minute limit.
- **`actions`:** salespeople may read, add and update **lead** follow-ups only. The database refuses client items for them.

**New break-in tests:**
- **The whole database:** a salesperson reads **zero rows** from every other table: clients, billing, work orders, AI, health, Trash, AI CEO. This is one test that covers every table, including future ones.
- **Leads:** a salesperson can't see leads from other pipelines.
- **Follow-ups:** a salesperson can't create or change client items.
- **Reach-out log:** a salesperson can't edit or delete reach-outs, or log one as someone else.

## Steps (each stops for your check)
1. `0020` and the break-in tests. You review it, run it, and add `users.readonly` to your GoHighLevel key yourself.
2. The screens:
   - Sales role tabs;
   - your pipeline picker;
   - lead list with Mine/Everyone's and reach-out buttons;
   - targets;
   - Today's plan;
   - the pipeline health card;
   - Sync for sales.

   **Salespeople can start after this step.**
3. The AI follow-up drafts (copy-only).

**Rough timing:** steps 1–2 take about 2 days of building plus your checks, so salespeople could start around Wednesday or Thursday.

## Cost
- **$0 for the role, leads, targets, coach list and health card.** No new services or packages.
- **AI drafts:** about 1–3 cents each, from the existing $10/month budget, with the hard stop unchanged.

## Risks
- **A new role touches many security rules.** The "sees nothing by default" design plus the whole-database zero-rows test makes a mistake show up as a failed test, not a leak.
- **Lead names are personal data:** they're already stored today. Salespeople will now see them, but still no phones or emails.
- **The `users.readonly` permission adds GoHighLevel team names to Atlas.** Names and ids only, tested.
- **Logged reach-outs depend on people tapping.** The numbers are only as good as the habit. Automatic counting is a later option.

## Questions (only what I need)
1. **Should salespeople see the value ($) of leads?**
   - **Recommended: yes**, since it helps them prioritise.
   - **Alternative: hide it.** Then only you and managers see deal values.
2. **Daily target default:** **15 reach-outs** per weekday, changeable per person. OK?

## Next phases (ideas you approved in principle; each gets its own plan and OK)
1. **Scout:** local prospect finder. It looks for businesses with no or slow websites, weak rankings, or Google Ads spend. It builds walk-in routes as Google Maps links and a call list for hand-dialing only, with "do not call" tracking. Estimated $0–10/month plus a $50 prepaid DataForSEO deposit. It starts with a 100-business test in one city.
2. **Audits:** good-looking Google Ads and SEO audits for prospects and clients:
   - a competitor analysis;
   - where they rank now versus the top 4–5 positions;
   - estimated traffic and value at those positions;
   - what it would take, and a typical timeline.

   Sources: DataForSEO or Semrush, plus LeadSnap heat maps where available. The AI writes a draft and a person reviews it before anything goes to a client.
