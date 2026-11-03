# Data Dictionary

Two parts. **Part 1** describes the record shapes used today, all synthetic, defined in [`src/lib/types.ts`](src/lib/types.ts). **Part 2** is the **proposed** future database. It is **not deployed** and gets reviewed in Phase 2.

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

## Part 1 — Phase 1 types (synthetic)

All records have `isSynthetic: true`. Fake contacts use `@example.com` emails and `555-01XX` phones. Source URLs use `synthetic://`. Screens get data only through `src/lib/data-source.ts` (`DATA_MODE = "mock"`).

### Shared

| Type | Fields | Notes |
|---|---|---|
| `ISODate` / `ISODateTime` | string | `2026-10-28` / `2026-10-28T14:30:00Z` |
| `Confidence` | `high \| medium \| low` | |
| `Unit` | `percent \| count \| minutes \| usd` | |
| `DataMode` | `mock \| live_read_only` | Shown on every screen |
| `Source` | `id, label, kind, url, retrievedAt` | `kind`: `client_provided`, `public_web`, `industry_report`, `internal_observation` |
| `Revenue` | union by `status` (see table above) | `annualUsd` or `lowUsd`/`highUsd`, plus `asOf`, `sourceId` |

### Business Dex

| Type | Key fields |
|---|---|
| `Business` | `id, dexNumber, name, tagline, industry, region, isClient, clientId?, revenue, signals[], hypotheses[], acquisitionChannels[], patternTags[], sources[], updatedAt` |
| `Observation` (signal) | `id, text, observedAt, confidence, sourceId` |
| `Hypothesis` | `id, text, confidence, status` |
| `Industry` | Dental, Home services, Events & food, Fitness, Legal, Restaurant, Automotive, Education, Energy |

`patternTags` are short labels shared across businesses. The Dex uses them to show patterns.

### Clients

| Type | Key fields |
|---|---|
| `Client` | `id, businessId, name, industry, dataSensitivity, primaryContact{name,email,phone}, clientSince, health{score 0–100, status, trend[]}, metrics[], goals[], blockers[], whatChanged[], notes[]` |
| `Metric` | `label, value, previous, unit, betterWhen (higher \| lower)` |
| `Note` | `id, author, createdAt, text` (staff-entered) |
| `HealthStatus` | `thriving \| steady \| at_risk` |

`dataSensitivity: "regulated"` marks industries such as dental and medical, where customer messages may contain protected health information (PHI). Example: *Brightline Dental*. These clients need legal and HIPAA review, and possibly a Business Associate Agreement (BAA), before any live data.

### Mission Control

| Type | Key fields |
|---|---|
| `MissionControlData` | `weekLabel, kpis[], alerts[], followUps[], activity[]` |
| `AgencyKpi` | `Metric` + `id, trend[]` |
| `Alert` | `id, clientId?, severity (critical \| warning \| info), title, detail` |
| `FollowUp` | `id, clientId, title, due, priority` (internal only; checking one off is local screen state, not saved) |
| `ActivityItem` | `id, clientId?, kind, title, at`. `kind`: appointment_booked, deal_won, deal_lost, lead_new, no_show, note_added |

### Insights

| Type | Key fields |
|---|---|
| `Insight` | `id, generatedBy (mock_ai \| human), title, observation, evidence[{label, recordType, recordId}], confidence, caveats[], suggestedNextStep, reviewStatus, createdAt` |

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

Built gradually from Phase 2 onward through reviewed migrations, in a **separate development Supabase project** first. Only a few tables go into the first database sprint.

### Provenance fields on every synced record

`source_system` (e.g. `ghl`), `source_id`, `ghl_location_id`, `observed_at`, `received_at`, `updated_at`, `verified_at` (nullable), `confidence`, `sync_status`, `last_error_class` (no sensitive payloads), `retention_category`, `consent_tag` where relevant.

### Tables

Tenant boundary means the column that ties a row to a client. RLS uses it to decide who can see the row.

| Table | Purpose | Tenant boundary | Sensitivity | Retention category |
|---|---|---|---|---|
| `clients` | Agency clients | `id` (is the tenant) | Internal | Life of relationship |
| `ghl_locations` | Authorized GHL sub-accounts (allowlist) | `client_id` | Internal | Life of relationship |
| `app_users` | Staff accounts (linked to Supabase Auth) | n/a (agency-wide) | Personal | Until offboarded |
| `client_memberships` | Which staff can see which client | `client_id` + `user_id` | Access control | Until revoked |
| `contacts` | Read-only copy of minimal GHL contact fields | `client_id`, `ghl_location_id` | **Personal (PII)** | Short; minimize fields |
| `conversations` | Thread metadata (channel, counts, timestamps) | `client_id`, `ghl_location_id` | Personal | Short |
| `messages` | Message metadata; body text only if justified + approved | `client_id`, `ghl_location_id` | **High** | Shortest; body optional |
| `call_metadata` | Duration, status, direction | `client_id`, `ghl_location_id` | Personal | Short |
| `transcripts` | **Restricted, optional.** Only after consent + privacy review | `client_id` | **Highest** | Shortest; separate access |
| `opportunities` | Pipeline deals, stages, values (read replica) | `client_id`, `ghl_location_id` | Business confidential | Medium |
| `appointments` | Booked / showed / no-show (read replica) | `client_id`, `ghl_location_id` | Personal | Medium |
| `surveys` | Survey definitions | `client_id` or agency | Internal | Medium |
| `survey_responses` | Submitted answers (untrusted text) | `client_id` | Personal | Short–medium |
| `businesses` | Business Dex entries (public research) | none, **public research only** | Public / internal | Long |
| `business_observations` | Sourced, dated observations; `revenue_label`, `source_url`, `evidence_excerpt`, `metric_definition` | `business_id`; private claims stored separately with `client_id` | Public vs private, kept apart | Long (public) / client rules (private) |
| `metric_snapshots` | Point-in-time KPIs | `client_id` | Business confidential | Long (aggregates) |
| `followup_tasks` | **Internal tasks only. Never pushed to GHL.** | `client_id` | Internal | Medium |
| `ai_insights` | `source_record_ids`, `model/version`, `confidence`, `human_review_status`, `date_generated` | `client_id` (tenant_id) | Derived, inherits source sensitivity | Medium |
| `ingestion_events` | Webhook/API receipt log: event id, type, status, idempotency key, **no raw sensitive payloads** | `client_id`, `ghl_location_id` | Operational | Short (raw), longer (metadata) |
| `audit_logs` | Who viewed/changed what, when | `client_id` where relevant | Security | Long |

Every table must document its purpose, access policy, retention category, and deletion behavior before it's created.
