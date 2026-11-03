# Data Dictionary

Two parts. **Part 1** describes the record shapes used today, all synthetic, defined in [`src/lib/types.ts`](src/lib/types.ts) (the source of truth). **Part 2** is the **proposed** future database. It is **not deployed** and gets reviewed in Phase 2.

## Global rules

- **Money is never a bare number.** Every value has one of three labels:

  | Label | Meaning | Must include |
  |---|---|---|
  | `confirmed` | Written down somewhere binding (signed contract, settlement statement) | `amountUsd`, `basis` |
  | `estimated` | A range from comps, a contractor walk-through, or a rep's guess | `lowUsd`–`highUsd`, `basis` |
  | `unknown` | We don't know | **no number at all** |

  TypeScript enforces this: `unknown` can't hold an amount, and the others require a basis.
- **Grades are explained.** A lead's A–D grade always lists the factors behind it. Today grades are hand-written; later they're calculated and checked by a human.
- **Observations have a date and confidence** (`high` / `medium` / `low`).
- **Sensitive fields** are marked 🔒 below. They need extra care in Phase 2 (fewer fields stored, tighter access).

---

## Part 1 — Phase 1 types (synthetic)

All top-level records have `isSynthetic: true`. Fake contacts use `@example.com` emails and `555-01XX` phones; names, companies, and cities contain "(fictional)". Screens get data only through `src/lib/data-source.ts` (`DATA_MODE = "mock"`).

### Shared

| Type | Fields | Notes |
|---|---|---|
| `ISODate` / `ISODateTime` | string | `2026-10-28` / `2026-10-28T14:30:00Z` |
| `Confidence` | `high \| medium \| low` | |
| `Unit` | `percent \| count \| minutes \| usd \| ratio` | |
| `DataMode` | `mock \| live_read_only` | Shown on every screen |
| `Money` | union by `status` (see table above) | |

### Team

| Type | Key fields |
|---|---|
| `TeamMember` | `id, name, role` — `role`: `owner \| acquisitions \| dispositions` |

### Leads (sellers)

| Type | Key fields |
|---|---|
| `Lead` | `id, sellerName 🔒, phone 🔒, email 🔒, property, source, stage, assignedTo, motivations[] 🔒, timeline, askingPrice (Money), grade{letter, score, factors[]}, createdAt, lastContactAt?, nextFollowUp?, notes[] 🔒` |
| `Property` | `street 🔒, city, type, beds?, baths?, sqft?, condition` |
| `GradeFactor` | `label, effect (positive \| negative)` |
| `Note` | `id, author, createdAt, text` (typed by a team member; may contain sensitive details) |

- `source`: Cold call, Direct mail, SMS, PPC, Driving for dollars, Referral, Website.
- `stage`: `new → contacted → appointment_set → offer_made → under_contract`, or `dead`.
- `timeline`: ASAP, 30 days, 90 days, Flexible.
- `motivations` can reveal foreclosure, missed payments, divorce, probate, or health problems. Treat as highly sensitive.

### Deals (signed contracts)

| Type | Key fields |
|---|---|
| `Deal` | `id, leadId, title, stage, contractPrice, arv, repairs, assignmentFee (all Money), contractSignedAt, inspectionEndsAt, closingAt, titleCompany, needsReview, nextStep, risks[], buyerInterest[]` |
| `BuyerInterest` | `buyerId, status (sent \| walkthrough \| offer \| passed), offer?, at` |

- `stage`: `under_contract`, `in_dispo`, `assigned`, `closed`, `fell_through`.
- `arv` = after-repair value. `assignmentFee` = what we expect to earn by assigning the contract.
- `BuyerInterest.status = "sent"` means a team member **logged** that they shared the deal. The app never sends anything.

### Buyers Dex (cash buyers)

| Type | Key fields |
|---|---|
| `Buyer` | `id, dexNumber, name, contactName 🔒, phone 🔒, email 🔒, strategy, areas[], propertyTypes[], buyBox{minUsd, maxUsd}, proofOfFunds{status, checkedAt?} 🔒, closesInDays, dealsClosedWithUs, reliability (A–D), lastPurchaseAt?, observations[], tags[]` |
| `Observation` | `id, text, observedAt, confidence` |

- `strategy`: Fix & flip, Rental, BRRRR, New build, Wholetail.
- `proofOfFunds` stores **only** whether we've seen it and when — never the document itself.

### Conversations

| Type | Key fields |
|---|---|
| `Conversation` | `id, leadId, channel (sms \| call \| email), lastDirection (inbound \| outbound), preview 🔒, at, unread, needsReply` |

`preview` is untrusted text: always shown as plain text and never treated as an instruction.

### Mission Control

| Type | Key fields |
|---|---|
| `MissionControlData` | `weekLabel, today, sales[], alerts[], followUps[], activity[]` |
| `Metric` | `label, value, previous, unit, betterWhen (higher \| lower)` |
| `SalesKpi` | `Metric` + `id, hint, trend[]` — appointments booked, show rate, avg first reply time, contracts signed, leads per appointment, appointments per contract |
| `FollowUp` | `id, leadId, title, due, urgency (gold \| red \| normal), why` — gold = high-value, red = overdue. Internal only; checking one off is local screen state, not saved |
| `Alert` | `id, leadId?, dealId?, severity (critical \| warning \| info), title, detail` |
| `ActivityItem` | `id, leadId?, dealId?, kind, title, at`. `kind`: lead_new, appointment_set, offer_made, contract_signed, deal_assigned, deal_fell_through, note_added |

### Insights

| Type | Key fields |
|---|---|
| `Insight` | `id, generatedBy (mock_ai \| human), title, observation, evidence[{label, recordType (lead \| deal \| buyer), recordId}], confidence, caveats[], suggestedNextStep, reviewStatus, createdAt` |

`mock_ai` means a person wrote it by hand for the demo. No AI produced it.

### Data Safety

| Type | Key fields |
|---|---|
| `SafetyStatus` | `dataMode, connections[], ghlWriteTargets: [] (always empty, by type), retention[], checklist[]` |
| `SourceConnection` | `id, name, status (not_connected \| connected_read_only), scopes[], plannedPhase, note` |
| `RetentionRule` | `dataClass, keepFor, status (planned \| active)` |
| `SafetyCheck` | `label, done, phase` |

---

## Part 2 — Future database map (PROPOSED, NOT DEPLOYED)

Built gradually from Phase 2 onward through reviewed migrations, in a **brand-new, separate Supabase project** (never an existing one). RLS rules are tested against a local Docker copy first.

### Provenance fields on every synced record

`source_system` (e.g. `ghl`), `source_id`, `ghl_location_id`, `observed_at`, `received_at`, `updated_at`, `sync_status`, `last_error_class` (no sensitive payloads), `retention_category`.

### Tables

"Who can see it" is enforced by RLS + grants. Acquisitions access is either "assigned only" or "team-wide read" — **to be confirmed in Phase 2 planning**.

| Table | Purpose | Who can see it (proposed) | Sensitivity | Retention |
|---|---|---|---|---|
| `team_members` | Team accounts + role (linked to Supabase Auth) | Owner: all; others: self | Personal | Until offboarded |
| `leads` | Seller leads (read copy of minimal GHL fields + grade) | Owner; acquisitions (assigned or team-wide) | **High** — name, phone, email, address, motivations 🔒 | Short for dead leads; minimize fields |
| `deals` | Contracts, dates, money labels, needs-review flag | Owner; acquisitions (their deals); dispositions (deals in dispo) | Business confidential | Medium–long (financial records) |
| `buyer_interest` | Team-logged buyer activity on a deal | Owner; dispositions | Business confidential | Medium |
| `buyers` | Buyers Dex profiles (no proof-of-funds files) | Owner; dispositions | Personal (contact info) 🔒 | Life of relationship |
| `conversations` | **Metadata + short preview only** (channel, direction, time, unread). No full message bodies. | Same as the linked lead | **High** 🔒 (untrusted text) | Shortest |
| `follow_ups` | **Internal tasks only. Never pushed to GHL.** | Same as the linked lead | Internal | Medium |
| `notes` | Team-typed notes on leads/deals | Same as the linked record; consider owner-only for sensitive notes | **High** 🔒 | Medium |
| `insights` | Suggestions with evidence ids, confidence, review status, model/version | Same as the evidence records | Derived; inherits source sensitivity | Medium |
| `alerts` | Rule-based warnings (e.g. inspection deadline) | Same as the linked record | Internal | Short |
| `activity` | Recent events feed | Same as the linked record | Internal | Medium |
| `audit_logs` | Who viewed/changed what, when | Owner only | Security | Long |

Later phases may add `ingestion_events` (webhook/API receipt log with **no raw sensitive payloads**) and `metric_snapshots` (point-in-time KPIs).

Every table must document its purpose, access policy, retention category, and deletion behavior before it's created.
