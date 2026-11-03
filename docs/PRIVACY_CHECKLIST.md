# Privacy Checklist — complete before ANY real client data

> This is a working checklist, **not legal advice**. Have qualified counsel review it before collecting real communications, recordings, or regulated data.

Nothing on this list is required for Phase 1 (fake data only). All of it must be done before the one-client pilot (Phase 5). Transcript items must be done before Phase 6.

## Authority and consent

- [ ] Written client authorization to copy their GHL data into Agency Atlas, covering which data types and for what purpose
- [ ] Client contracts and DPAs allow this processing and storage location
- [ ] Customers' reasonable expectations considered (privacy policy / notice updated if needed)
- [ ] A named person who can approve and revoke data access for each client

## Calls, recordings, and transcripts

- [ ] Federal and state call-recording consent laws reviewed (some states require **all-party** consent)
- [ ] Confirmed which calls are actually recorded/transcribed. Don't assume all are.
- [ ] Transcripts stored only in the restricted `transcripts` table, with separate access
- [ ] Decision documented: summaries/metadata vs full text, and why

## Regulated and prohibited data

- [ ] **Regulated industries flagged** (e.g. *Brightline Dental*: patient messages may contain PHI)
- [ ] For PHI: HIPAA applicability reviewed; Business Associate Agreements (BAA) in place with every vendor that would touch it (Supabase, host, AI provider), **or** PHI excluded entirely
- [ ] Prohibited data classes listed and filtered out (e.g. payment card numbers, SSNs, health details, unless a compliant architecture exists)
- [ ] Vendor terms checked (GHL API terms, Supabase, host, AI provider data use and retention)

## Minimization

- [ ] For each table: why each field is needed, written down
- [ ] Start with counts, references, and metadata. Message bodies only when justified and approved.
- [ ] No real data in fixtures, dev databases, screenshots, or AI prompts during development

## Retention and deletion

- [ ] Retention period set per data class (raw webhook payloads shortest)
- [ ] Deletion workflow built **and tested** (per client and per contact)
- [ ] Backups covered by retention; restore test done
- [ ] Offboarding plan: what happens to a client's data when they leave

## Access

- [ ] Staff access by role and client membership (least privilege), enforced by RLS
- [ ] MFA required for all staff and all admin consoles
- [ ] Access to sensitive views written to the audit log
- [ ] Periodic access review scheduled

## Incidents

- [ ] Incident runbook: who to call, revoke/rotate steps, client notification duties
- [ ] Kill switch tested (stops imports; never touches GHL)

## Research (Business Dex)

- [ ] No private revenue rumors stored as fact. Every value labeled and sourced.
- [ ] Public observations kept separate from client-private claims
