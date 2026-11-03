# Privacy Checklist — for human review

> This is a working checklist, **not legal advice**. Have qualified counsel review it before collecting real communications, recordings, or regulated data.

The first section applies **now**: the user approved loading their real client list early (Phase 1 interim). The rest must be done before the one-client GoHighLevel pilot (Phase 5); transcript and survey items before Phase 6.

## Now: real client list on this Mac (needs human review)

- [x] Real data kept only in `private-data/` (Git-ignored, folder `700`, files `600`), read by one validating server-only loader
- [x] Tests fail if a real client name appears in any tracked file; Wi-Fi mode blocked while real data exists
- [ ] **Review:** real client names and monthly amounts are business/financial data. Confirm client contracts allow keeping them in this tool
- [ ] **FileVault (full-disk encryption) is on** for this Mac. The app does not encrypt the file itself
- [ ] Folder not copied to cloud sync (iCloud Desktop/Documents, Dropbox), backups you don't control, USB drives, or AI chats
- [ ] Records flagged "needs check" verified against billing or the database (the list was transcribed from screenshots by ChatGPT)
- [ ] Plan for Phase 2: import into Supabase with role-based access, then **delete** the private file

## Surveys (before any real answers are collected)

- [ ] Consent asked first, with a clear purpose and how long answers are kept (retention)
- [ ] Cross-business trends use anonymized, combined answers only
- [ ] Answers treated as untrusted text (never instructions, never rendered as HTML)
- [ ] A public survey form is a new attack surface: later phase only, with spam protection and input validation
- [ ] The app never sends surveys itself; staff copy questions manually

## Team data

- [ ] Developer pay and bonus information is **HR-sensitive**: owner-only once roles exist (Phase 2); never in sample data tied to a real person

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
- [ ] No real data in fixtures, tests, docs, dev databases, screenshots, or AI prompts during development (the private file is the one approved exception, and stays out of all of these)

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
