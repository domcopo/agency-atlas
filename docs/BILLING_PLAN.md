# Billing (read-only): plan for approval

Status: **approved 2026-11-08. Step 1 is built** (migration, tests, read code and owner screens). Step 2 is your token plus the first live refresh. Step 3 is the owner summary metrics (not built yet).

Decisions taken (the plan's recommendations): D1 keep the name only while unmatched; D2 3 days; D3 7/7/30; D4 **no** subscriptions scope (GoHighLevel's screen doesn't offer it, and card charges appear as payment transactions anyway).
Date: 2026-11-08. This is step 7 ("Money") of `docs/ATLAS_OS_PLAN.md`.

## 0. What you told me

- Clients are invoiced and pay through **GoHighLevel Payments**.
- **Stripe is connected inside GoHighLevel** and collects the money.
- QuickBooks isn't used.

## 1. Where to read billing from (recommendation)

**Read from GoHighLevel only, with a second Private Integration token that has billing read-only permissions.** Don't connect Stripe for now.

Why GoHighLevel and not Stripe:
- GoHighLevel is where the invoices live: who each invoice is for (a GHL contact), due date, and status. Stripe only sees the payment underneath and doesn't know which Atlas client it belongs to.
- Atlas already has one small, tested, read-only GoHighLevel module, and billing reuses it. A Stripe connection would mean a second network module, a second key and more to guard.
- Cost: $0.

Why a **separate** token instead of adding scopes to the existing one:
- You can switch billing off by revoking one token without breaking the pipeline and conversation sync.
- The existing token keeps exactly the permissions it has today.
- Atlas uses the billing token **only** for the billing addresses, and a test checks this.

### 1a. GoHighLevel scopes to tick (and only these)

Sub-account level. Source: GoHighLevel's scope list (github.com/GoHighLevel/highlevel-api-docs, `docs/oauth/Scopes.md`), checked 2026-11-08.

| Tick | Why | Address Atlas reads (GET only) |
|---|---|---|
| `invoices.readonly` | Invoices: amount, amount due, status, issue and due dates | `GET /invoices/` |
| `payments/transactions.readonly` | Payments: paid, failed and refunded charges, and when they happened | `GET /payments/transactions` |
| `payments/subscriptions.readonly` | Recurring retainers charged without an invoice (only so their charges can be tied to a client) | `GET /payments/subscriptions` |

**Do not tick** anything else, especially:
- `invoices.write`, `invoices/schedule.*`, `invoices/template.*`, `invoices/estimate.*`, which can create, send or void invoices;
- `payments/orders.*`, which isn't needed;
- `payments/integration.*`, `payments/custom-provider.*` and `payments/coupons.*`, which touch payment settings;
- any `contacts.*`, `conversations/message.write` or `workflows.*`.

**Can these scopes write?** No write version exists for transactions or subscriptions, and the invoice one we tick is `.readonly`. GoHighLevel's docs don't spell out "a readonly scope can never write", so I'm **not relying on that alone**. Atlas's module can only send GET requests to the exact addresses above, and tests fail if that changes. Three layers: the token's scopes, GET-only code, and tests.

**Not confirmed by GoHighLevel's docs, to check on the first live sync (with no writes, just reading):**
- the API version header these addresses expect (the docs show `v3`; the existing module sends dated versions);
- where an invoice's contact ID sits. It's documented only inside `contactDetails`, so Atlas would read **only** `contactDetails.id` and discard the rest of that object;
- the full list of transaction status words (the docs show only `succeeded`). An unrecognised word is counted as **unknown**, never guessed as paid or failed;
- invoices have no documented "paid on" date. Atlas takes it from the linked payment (`entityId` → invoice), or leaves it blank.

GoHighLevel has **no "overdue" status**. Atlas works it out: an invoice is overdue when the amount due is above 0 and the due date has passed.

Rate limits: 100 requests per 10 seconds and 200,000 a day, shared across your private integrations. A full refresh is roughly 3–10 requests.

### 1b. Stripe (not recommended now; fallback only)

Only if GoHighLevel turns out not to show failed charges. In Stripe: **Developers → API keys → Create restricted key**.
- Set **Read** on Invoices, Charges, PaymentIntents and Subscriptions. Everything else stays **None**, including **Customers**: leaving it at None means Atlas never gets names or emails and matches by customer ID instead.
- The key starts with `rk_live_` and is shown once.
- Stripe maps Read to GET only, and anything else is refused.

This would need its own approval: it adds a second network module and a second key.

### 1c. QuickBooks (not used)

For the record: as far as I could find, QuickBooks Online has **no read-only option**. Its accounting permission (`com.intuit.quickbooks.accounting`) allows reading **and** changing everything. I couldn't open Intuit's own scopes page to confirm this, so treat it as very likely, not certain.

What that means: if the key or the app were ever compromised, it could edit or delete your books. The only protection would be Atlas's own code, not QuickBooks. I wouldn't connect it unless there's no other source.

### 1d. How you'll add the key (you, not me)

1. In GoHighLevel, in the same sub-account: **Settings → Private Integrations → Create new integration**, named "Atlas billing (read-only)". Tick only the scopes in 1a. Copy the token.
2. In Vercel: **Project → Settings → Environment Variables**. Add `GHL_BILLING_READONLY_TOKEN` for Production, with **Sensitive** turned on. Redeploy.
3. Never paste it in chat, a file, a commit or a screenshot. I will never ask for it. `.env.example` gets the name only.
4. If it ever leaks: revoke it in GoHighLevel first, then make a new one.

## 2. What Atlas keeps (the minimum)

For each invoice or payment, Atlas keeps only:

| Kept | Notes |
|---|---|
| Matched Atlas client | Empty means "unmatched" (see 3) |
| Amount, amount still due | In cents, so totals don't drift. "Amount due" is needed for partly paid invoices |
| Currency | 3 letters (USD) |
| Status | paid / open / overdue / failed / refunded. Void and draft invoices are skipped entirely |
| Issued, due and paid dates | Dates only |
| Provider's ID | GHL invoice or transaction ID, so a re-sync updates the record instead of duplicating it |
| GHL contact **ID** | Letters and numbers only. Needed to match to a client. Not a name, email or phone |

**Thrown away at sync time** (never saved, logged or sent to the AI): card or bank details (brand, last 4, expiry), billing emails, phones, addresses, company/business details, line items, notes, terms, invoice titles and numbers, payment links, and anything else.

**One decision for you (D1):** to match an unmatched invoice by hand, you need to see who it's for.
- **Proposal:** for **unmatched** records only, keep the contact's **name as written on the invoice** (max 80 characters, owner-only). It's cleared automatically once you match it.
- **Alternative:** show only the GHL contact ID, and you look it up in GoHighLevel yourself (safer, but clumsier).

## 3. Matching (no guessing)

An invoice belongs to a client **only** when its GHL contact ID is one you've confirmed. A confirmed ID comes from either:
1. a contact you already confirmed for that client in Phase 6 (`ghl_contact_links`, status confirmed), or
2. a contact you match by hand on the new **Unmatched** list (new table `billing_contact_matches`). One client can have several billing contacts, for example a bookkeeper.

There's no name matching, no "closest match" and no AI. Everything else goes on the **Unmatched** list: "Invoice for *Name on invoice*, $750, due Nov 1 → [pick client]". Matching once covers all past and future invoices for that contact.

## 4. Database migration `0015_billing_read_only.sql`

New tables:

- **`billing_records`**:
  - columns: `id`, `provider` ('ghl'), `kind` ('invoice' or 'payment'), `provider_id` (unique with provider and kind), `provider_contact_id`, `client_id` (nullable = unmatched), `unmatched_label` (≤80, only while unmatched, if D1 = yes), `amount_cents`, `amount_due_cents`, `currency` (`^[A-Z]{3}$`), `status` (one of the 5 words), `issued_on`, `due_on`, `paid_on`, `synced_at`;
  - checks: no amount below 0 or above $1,000,000, and a database check that refuses anything that looks like an email or phone number in `unmatched_label`.
- **`billing_contact_matches`**:
  - columns: `provider_contact_id` (primary key), `client_id`, `matched_by`, `matched_at`;
  - set by the owner only.
- **`billing_syncs`**:
  - columns: `started_at`, `finished_at`, `ok`, `invoices_read`, `payments_read`, `unmatched`, `error_code`;
  - every sync, success or failure, gets a row.

Permissions (start from nothing):
- **Owner only**, for reading and writing. Managers and developers get **0 rows**, and anon gets **permission denied**.
- No delete permission on any of the three tables for anyone.
- The restrictive two-factor (aal2) rule on all three tables, like every other table.
- `billing_records`: the owner can insert, and can update only the sync columns and `client_id`.
- **Rate limit inside the database:** a trigger refuses a new `billing_syncs` row if the last one started less than 10 minutes ago. Even a bug in the app can't hammer GoHighLevel. GoHighLevel's own limit is far higher.
- `activity.kind` gains `billing_sync`. **Activity is readable by managers**, so the activity line holds **no money**, only "Billing refreshed: 42 records read, 3 unmatched" or "Billing refresh failed (403)". Amounts live only in the owner-only tables.

Before `0015` is run, the app keeps working and shows "Billing not set up".

## 5. The sync

- **Where it runs:** the owner's existing **Sync** (GoHighLevel) also refreshes billing. A **Refresh billing** button sits on the billing screen. Atlas has no automatic background schedule today, and I'm not adding one.
- **Code:**
  - `src/lib/ghl/client.ts` (still the only network code) gains the billing GET addresses on its allowlist and the billing token, used only for those addresses;
  - pure parsers keep only the fields in section 2 and drop the rest;
  - `src/app/actions.ts` gains `syncBilling` (owner-only, checks the 10-minute limit, then writes) and `matchBillingContact` (owner-only).
- **Read-only, enforced three ways:**
  - GoHighLevel refuses writes because the token has only `.readonly` scopes;
  - the module can only send GET to allowlisted addresses;
  - tests fail if anything else appears.
  - No invoice, payment, reminder or text is ever created, changed, voided, sent, charged or refunded.
- **If a sync fails, nothing is overwritten.** The last good data stays, marked with its date, and the failure is recorded in `billing_syncs` and `activity`.

## 6. Blank is not zero

All totals are `null`, shown as "Unknown" with the reason, when any of these is true:
- billing isn't connected (no token);
- `0015` hasn't been run;
- the most recent sync failed;
- the last successful sync is more than **3 days** old (D2: you can change this number).

A real 0 ("nothing overdue") is shown only after a successful, recent sync.

## 7. What you'll see (owner only, phone-first)

**Billing** section on **Home** (owner only), with a full **/billing** screen:

- **Totals:**
  - collected this month;
  - still open;
  - overdue (count and $);
  - failed payments this month.

  Each shows "as of 2:10 pm · from GoHighLevel".
- **Plan vs collected:**
  - "Plan MRR $X (from your client list) vs collected this month $Y. Gap $Z.";
  - plan MRR is clearly labeled "plan amount, not a payment".
- **Status chip on each client:**
  - paid, due soon (within 7 days), overdue or failed;
  - shown on the Clients list and the client page, **for the owner only**. Managers see no chip at all, because their database read returns nothing.
- **At-risk signal:** an overdue invoice (7+ days) or a failed payment adds an owner-only risk alert ("Payment: 2 invoices, $1,200, 18 days late · source GoHighLevel"), which feeds Today's priorities and the AI briefing's `risk_alerts`.
  - **Important:** it is **not** added to the shared health score. Managers can read the saved daily health scores (`client_health_daily`). If billing moved those scores, a manager would see "health dropped" and could infer a payment problem. So billing stays a separate signal visible only to you.
  - **Changed while building:** payment alerts are **not** sent to the AI briefing or work-order drafts either. Saved briefings are readable by managers, so a payment alert inside one would leak. They appear only on your Home billing card, the Billing screen and the client page.
- **Unmatched list:** pick a client for each contact.
- **Sync history:** last 10 syncs.

## 8. Owner summary (`/api/owner-summary`)

No change to the key, the fingerprint check, the rate limit or the route. The snapshot builder gains:

- `metrics` (units in USD unless noted):
  - `collected_revenue` (week, plus the existing month periods);
  - `open_invoices_usd`;
  - `overdue_invoices_usd`;
  - `overdue_invoices_count` (count);
  - `failed_payments_count` (count).
- `lists.overdue_clients`: client name plus a detail like "2 invoices, $1,200, 18 days late". Unmatched invoices are counted as "Unmatched (N)", never named.
- `alerts`: `urgent` "Payments need attention" when anything is more than 30 days overdue or a payment failed this month.
- Every value is `null` under the rules in section 6.
- The existing leak scan (`findLeaks`) and the database check still refuse emails and phones.
- The schema stays `owner-summary/v1`; the new keys are additions, so AI CEO keeps working.

## 9. Guardrail test changes

`tests/guardrails.test.ts` (these tighten the rules; none are weakened):
- The allowlist test lists the new billing addresses **exactly** (and nothing that writes).
- `GHL_BILLING_READONLY_TOKEN` is read only in `ghl/client.ts`, never with `NEXT_PUBLIC_`, and used only for the billing addresses.
- Billing parsers never read card, bank, email, phone, address, notes or line-item fields. This is checked by a forbidden-field scan like the Phase 6 one.
- No `void`, `send`, `charge`, `refund`, `record-payment` or `schedule` call paths anywhere. The billing code is GET-only.
- Only `syncBilling` and `matchBillingContact` write billing tables; both check for the owner; no `.delete(`.
- Billing data reaches screens only through `data-source.ts`, and only for the owner.
- The owner summary still imports nothing new, and its route is unchanged.

`tests/fixtures.test.ts`, covering pure functions in a new `src/lib/billing.ts`, with **fictional** sample invoices:
- status mapping (void and draft skipped, partly paid counts as open);
- overdue by date;
- totals are null when not connected, failed or stale, and 0 only after a good sync;
- matching only by confirmed ID;
- the "18 days late" detail text;
- the 30-day urgent alert.

`supabase/tests/10_rls_break_in.sql`, new section 7l:
- a manager login and a developer login each read **0 rows** from all three tables;
- anon gets **permission denied**;
- managers and developers can't insert or update;
- nobody can delete (permission denied, even the owner);
- a second sync row within 10 minutes is refused;
- an email-looking `unmatched_label` is refused, and so is a bad status like 'void';
- the column list of `billing_records` equals the approved list exactly, so a card or email column can't be added quietly;
- the two-factor rule is present on all three tables (the existing generic check).

## 10. Costs

**$0 extra.** The GoHighLevel API is included in your plan. Vercel Pro and Supabase Pro are unchanged, and the data is tiny. No AI is used for billing. The briefing already runs, and adding the payment alerts adds a few cents a month at most. Stripe isn't connected, so it costs nothing.

## 11. What I'd test

1. `npm run check` and `npm run test:rls`, with all old and new tests passing.
2. **Before** the token exists: "Billing not connected", every total Unknown, and the owner summary returns `null`s.
3. **You** add the token in Vercel. I'll guide you, and I never see it. Then, on the live site, as the owner:
   - Refresh billing;
   - check the totals against what GoHighLevel shows for 2–3 invoices;
   - match one unmatched contact;
   - confirm a second refresh within 10 minutes is refused.
4. **Manager and developer logins:**
   - no Billing section, no chips;
   - their database reads return nothing. The break-in tests prove this, and I'd also check it in the app with a test manager login if you have one.
5. **Owner summary:** the new keys are present, there are no emails, phones or cards, and AI CEO still loads.
6. **Failure check:** temporarily remove the token. Totals switch to Unknown, nothing is overwritten, and the failure appears in history.

## 12. Security review checklist (approve before the key is ever added)

- [ ] Token has **only** the `.readonly` scopes in 1a. No write, void, send or payment-provider scopes.
- [ ] Token lives only in Vercel (Sensitive), never in code, chat, git, logs or `NEXT_PUBLIC_`.
- [ ] `ghl/client.ts` is still the only network code: GET only, fixed host, exact allowlist (tested).
- [ ] Billing token used only for billing addresses (tested).
- [ ] Parsers keep only the approved fields; card, bank, email, phone and address fields are never read (tested).
- [ ] Billing tables are owner-only by row-level security. Manager, developer and anon break-in tests pass.
- [ ] No deletes on billing tables; two-factor rule on all three.
- [ ] The column list is locked by a test.
- [ ] Activity lines contain no amounts (managers can read activity).
- [ ] Billing isn't part of the shared health score; the payment alert is owner-only.
- [ ] Unknown is `null`, never 0 (tested).
- [ ] Rate limit enforced in the database (tested).
- [ ] Owner summary: no new route, no auth change, leak scan passes, `null` when unknown.
- [ ] No reminders, emails, texts or charges anywhere. Automatic reminders stay out of scope.
- [ ] You've reviewed and run `0015` yourself in the SQL Editor.
- [ ] Revocation plan known: revoke the token in GoHighLevel, and billing stops on the next refresh.

**Privacy note for human review:** this stores what each client paid and when. That's financial information about your clients, and it stays in your Supabase (Pro, daily backups) and the owner-only screens. Check that your client agreements and your own privacy notice allow you to keep payment records in an internal tool. Most agencies already do this through their invoicing tool, but it's your call, not mine.

## 13. Build order after approval

1. Migration `0015`, the break-in tests, the pure `billing.ts` and its tests, and the module and actions behind the "not connected" state. No key is needed. You review and run `0015`.
2. You create the token and add it to Vercel. Then the first real sync and the checks in section 11.
3. The owner summary additions, then the AI CEO check.

## Decisions for you

- **D1:** keep the name on the invoice for unmatched records only (recommended), or the ID only?
- **D2:** totals become "Unknown" after **3 days** without a good sync. OK?
- **D3:** "Due soon" = due within **7 days**; at-risk after **7 days** overdue; urgent after **30**. OK?
- **D4:** do some clients pay by an automatic subscription (card charged monthly, no invoice)? If **none** do, skip `payments/subscriptions.readonly`. Fewer permissions is better.
