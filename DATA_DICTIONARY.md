# Data Dictionary

Two parts. **Part 1** describes the record shapes used today, defined in [`src/lib/types.ts`](src/lib/types.ts): the real client roster and team (from a private file) plus sample data. **Part 2** is the **proposed** future database. It is **not deployed** and gets reviewed in Phase 2.

## Global rules

- **Revenue is never a bare number.** Every value has one of four labels:

  | Label | Meaning | Must include |
  |---|---|---|
  | `verified` | Confirmed from a trustworthy document (e.g. client-provided financials) | amount, as-of date, source |
  | `client_reported` | The client told us; not independently checked | amount, as-of date, source |
  | `estimated` | Our or a third party's estimate | low–high range, as-of date, source |
  | `unknown` | We don't know | **no number at all** |

  TypeScript enforces this: `unknown` can't hold an amount, and the others require a source.
- **Every fact has provenance:** a source, a date, and a confidence level (`high` / `medium` / `low`).
- **Hypotheses are not facts.** They carry a status: `untested` / `testing` / `supported` / `rejected`.
- **Public research and private client data are kept separate.**

---

## Part 1 — Phase 1 types

Screens get data only through `src/lib/data-source.ts` (`DATA_MODE = "mock"`, meaning no outside connections).

**Two kinds of data:**

- **REAL (user-approved):** `RosterClient` and `TeamMember`, loaded by `src/lib/private-data.ts` from `private-data/clients.json` and `private-data/team.json` on this Mac (Git-ignored). Each record is validated; bad ones are skipped and counted. If the files are missing, a fictional demo roster ("(fictional)" names) is used instead. `RosterSource` says which: `private_file | demo`.
- **SAMPLE:** every other record has `isSynthetic: true`, "(sample)"/"(fictional)" names, `@example.com` emails, `555-01XX` phones and `synthetic://` sources. Sample records are never attached to a real client or team member.

### Shared

| Type | Fields | Notes |
|---|---|---|
| `ISODate` / `ISODateTime` | string | `2026-10-28` / `2026-10-28T14:30:00Z` |
| `Confidence` | `high \| medium \| low` | |
| `Unit` | `percent \| count \| minutes \| usd \| ratio` | |
| `DataMode` | `mock \| live_read_only` | |
| `Source` | `id, label, kind, url, retrievedAt` | `url` is always `synthetic://` today |
| `Revenue` | union by `status` (see table above) | `annualUsd` or `lowUsd`/`highUsd`, plus `asOf`, `sourceId` |
| `Metric` | `label, value, previous, unit, betterWhen` | |

### Client roster and team (REAL when the private file is loaded)

| Type | Key fields | Notes |
|---|---|---|
| `RosterClient` | `id` (made from the name), `name` (≤80 chars), `monthlyUsd` (0–100,000), `startDate`, `status`, `listedIn[]`, `check?`, `services[]` | `status`: `active \| paused \| canceled \| incomplete_expired`. `check` = "needs check" note; some records were transcribed from screenshots and must be verified |
| `ClientTier` | `high` ($500+/mo) · `mid` ($150–499) · `low` (under $150) | Active clients only |
| `RosterSummary` | counts and monthly totals by status and tier, `needsCheck`, `skipped`, `avgMonthsActive`, `source` | Calculated, not stored |
| `TeamMember` | `id, name, role, handles[]` | `role`: `founder \| client_comms \| client_manager \| seo_developer` |

### Agency sales (SAMPLE)

| Type | Key fields |
|---|---|
| `Prospect` | `name, contactName, email, phone, industry, wants[], source, stage, estMonthlyUsd{low,high}, grade{letter A–D, score, factors[]}, nextFollowUp?, lastTouch?, businessId?, notes[]` |
| `Conversation` | `prospectId, channel (sms \| call \| email \| chat), lastDirection, preview` (**untrusted text**; one sample contains a prompt-injection string to prove it is ignored), `at, unread, needsReply` |
| `FollowUp` | `prospectId, title, due, urgency (gold = hot \| red = overdue \| normal), why` |

### Home

| Type | Key fields |
|---|---|
| `MissionControlData` | `weekLabel, today, clientResults[] (SAMPLE lead-result KPIs incl. leads per appointment, appointments per deal), alerts[], followUps[], activity[]` |
| `Alert` / `ActivityItem` | `isSynthetic` is `false` for items calculated from the real roster, `true` for samples; `href` is always an in-app path |

### Work (SAMPLE orders, real rules)

| Type | Key fields |
|---|---|
| `WorkOrder` | `clientLabel` ("Sample client: …"), `title, service, priority (urgent \| high \| normal \| low), status, assignee` (Developer A–D, sample), `requestedByClient, createdAt, due, lastTouched, checklist[]` |
| `DeveloperLoad` | `memberId, seoClients, successfulThisMonth, hoursLogged` |
| Work rules (real process) | 10 hrs per SEO client; up to 15 SEO clients per developer; 80% SEO / 20% misc; $15 bonus per client after 10 successful monthly clients; escalation by role; daily order: queue → work orders → SEO → stay active |

### Growth (SAMPLE case studies, real survey questions)

| Type | Key fields |
|---|---|
| `Business` | `dexNumber, name, tagline, industry, region, isClient, revenue, signals[], hypotheses[], acquisitionChannels[], patternTags[], sources[], updatedAt` |
| `Observation` / `Hypothesis` | sourced, dated facts / ideas with `status: untested \| testing \| supported \| rejected` |
| `MonthlyPoint` | `month, leads, bookedCalls, revenueIndex` (100 = first month; avoids inventing dollars). 12 months per case study |
| `Trend` | `title, finding, businessIds[], confidence, caveat` |
| `SurveyQuestion` | `topic, question, why, answerType, options?` (the user's real 20-question bank; consent question first) |
| `SurveyResponse` | `businessId, questionId, answer` (**untrusted text**), `answeredAt` |
| `Insight` | `generatedBy (mock_ai \| human), title, observation, evidence[], confidence, caveats[], suggestedNextStep, reviewStatus`. `mock_ai` = hand-written; no AI produced it |

`Brightline Dental Studio` (a fictional sample) shows how regulated industries are flagged: real dental or medical data may contain protected health information (PHI) and needs HIPAA review first.

### Data Safety

| Type | Key fields |
|---|---|
| `SafetyStatus` | `dataMode, connections[], ghlWriteTargets: [] (always empty, by type), retention[], checklist[]` |
| `SourceConnection` | `id, name, status (not_connected \| connected_read_only), scopes[], plannedPhase, note` |

---

## Part 2 — Future database map (PROPOSED, NOT DEPLOYED)

Built gradually from Phase 2 onward through reviewed migrations, in a **brand-new, separate Supabase project** (plus a local Docker copy for access-rule tests).

**Proposed first Phase 2 tables (pending approval):** `clients`/`subscriptions`, `prospects`, `conversations` (metadata + preview), `work_orders`, `team_members`, `case_study_metrics`, `survey_questions`, `survey_responses` (+ consent), `insights`, `audit_logs`. Access by role: owner sees everything (including developer pay/bonus); managers a narrower view; developers their own work. The private client file is imported, then deleted. The longer-term map below covers later phases.

### Provenance fields on every synced record

`source_system` (e.g. `ghl`), `source_id`, `ghl_location_id`, `observed_at`, `received_at`, `updated_at`, `verified_at` (nullable), `confidence`, `sync_status`, `last_error_class` (no sensitive payloads), `retention_category`, `consent_tag` where relevant.

### Tables

Tenant boundary means the column that ties a row to a client. RLS uses it to decide who can see the row.

| Table | Purpose | Tenant boundary | Sensitivity | Retention category |
|---|---|---|---|---|
| `clients` (+ `subscriptions`) | Agency clients, monthly amount, status, start date | `id` (is the tenant) | **Business confidential** (names + amounts) | Life of relationship |
| `ghl_locations` | Authorized GHL sub-accounts (allowlist) | `client_id` | Internal | Life of relationship |
| `app_users` / `team_members` | Staff accounts (linked to Supabase Auth) and roles; pay/bonus is owner-only | n/a (agency-wide) | Personal; pay/bonus is **HR-sensitive** | Until offboarded |
| `client_memberships` | Which staff can see which client | `client_id` + `user_id` | Access control | Until revoked |
| `contacts` | Read-only copy of minimal GHL contact fields | `client_id`, `ghl_location_id` | **Personal (PII)** | Short; minimize fields |
| `conversations` | Thread metadata (channel, counts, timestamps) | `client_id`, `ghl_location_id` | Personal | Short |
| `messages` | Message metadata; body text only if justified + approved | `client_id`, `ghl_location_id` | **High** | Shortest; body optional |
| `call_metadata` | Duration, status, direction | `client_id`, `ghl_location_id` | Personal | Short |
| `transcripts` | **Restricted, optional.** Only after consent + privacy review | `client_id` | **Highest** | Shortest; separate access |
| `opportunities` | Pipeline deals, stages, values (read replica) | `client_id`, `ghl_location_id` | Business confidential | Medium |
| `appointments` | Booked / showed / no-show (read replica) | `client_id`, `ghl_location_id` | Personal | Medium |
| `surveys` | Survey definitions | `client_id` or agency | Internal | Medium |
| `survey_responses` | Submitted answers (untrusted text) + consent record | `client_id` | Personal / business confidential | Short–medium; cross-business trends anonymized |
| `businesses` | Business Dex entries (public research) | none, **public research only** | Public / internal | Long |
| `business_observations` | Sourced, dated observations; `revenue_label`, `source_url`, `evidence_excerpt`, `metric_definition` | `business_id`; private claims stored separately with `client_id` | Public vs private, kept apart | Long (public) / client rules (private) |
| `metric_snapshots` | Point-in-time KPIs | `client_id` | Business confidential | Long (aggregates) |
| `followup_tasks` | **Internal tasks only. Never pushed to GHL.** | `client_id` | Internal | Medium |
| `ai_insights` | `source_record_ids`, `model/version`, `confidence`, `human_review_status`, `date_generated` | `client_id` (tenant_id) | Derived, inherits source sensitivity | Medium |
| `ingestion_events` | Webhook/API receipt log: event id, type, status, idempotency key, **no raw sensitive payloads** | `client_id`, `ghl_location_id` | Operational | Short (raw), longer (metadata) |
| `audit_logs` | Who viewed/changed what, when | `client_id` where relevant | Security | Long |

Every table must document its purpose, access policy, retention category, and deletion behavior before it's created.
