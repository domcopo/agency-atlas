# Privacy Checklist — complete before ANY real lead, seller, or buyer data

> This is a working checklist, **not legal advice**. Items marked ⚖️ need review by a qualified professional (for example, the user's attorney) before real data or real outreach is involved.

Nothing on this list is required for Phase 1 (fake data only). All of it must be done before real data arrives (Phase 5). Transcript items must be done before any transcript is stored.

## Seller data (high sensitivity)

- [ ] Seller leads hold names, phone numbers, property addresses, and sensitive financial or life details (foreclosure, behind on payments, divorce, probate, health). Decide which of these we truly need, and store the minimum. ⚖️
- [ ] Motivations and notes visible only to roles that need them (enforced by RLS, tested)
- [ ] Team guidance written: what *not* to type into notes (e.g. medical details, Social Security numbers, bank details)
- [ ] Dead leads deleted or reduced after a set period

## Calling and texting rules

- [ ] Calling/texting rules reviewed — TCPA, Do Not Call lists, and state telemarketing rules — before any real outreach data is stored or shown. ⚖️
- [ ] Confirmed: **this app never sends messages, places calls, or emails anyone.** Any outreach happens in other tools, under their own compliance setup.
- [ ] Opt-out / DNC status, if imported from GHL, shown clearly and never hidden

## Wholesaling law

- [ ] Many states regulate wholesaling (licensing, disclosure that a contract may be assigned, marketing rules). Flag for the user's attorney for every state the team works in. ⚖️
- [ ] The app's labels and suggestions never encourage skipping a required disclosure

## Buyer data

- [ ] Buyer proof-of-funds documents are financial documents. **Don't store the files in this app** — record only "verified/unverified" and the date checked.
- [ ] Buyer contact details limited to owner and dispositions roles

## Calls, recordings, and transcripts

- [ ] Federal and state call-recording consent laws reviewed (some states require **all-party** consent) ⚖️
- [ ] Confirmed which calls are actually recorded/transcribed. Don't assume all are.
- [ ] Decision documented: metadata/short previews vs full text, and why. Start with metadata only.

## Authority and vendors

- [ ] Vendor terms checked (GHL API terms, Supabase, host, any AI provider: data use and retention)
- [ ] Privacy notice on our website/forms matches what we actually collect and store ⚖️
- [ ] Prohibited data classes listed and filtered out (payment card numbers, SSNs, bank account numbers)

## Minimization

- [ ] For each table: why each field is needed, written down
- [ ] Start with counts, references, and metadata. Message bodies only when justified and approved.
- [ ] No real data in fixtures, dev databases, screenshots, or AI prompts during development

## Retention and deletion

- [ ] Retention period set per data class (raw webhook payloads shortest)
- [ ] Deletion workflow built **and tested** (per lead, per buyer)
- [ ] Backups covered by retention; restore test done

## Access

- [ ] Team access by role (owner / acquisitions / dispositions), least privilege, enforced by RLS
- [ ] Acquisitions scope decided: assigned-only vs team-wide read
- [ ] MFA required for all team members and all admin consoles
- [ ] Access to sensitive views written to the audit log
- [ ] Access removed promptly when someone leaves the team

## Incidents

- [ ] Incident runbook: who to call, revoke/rotate steps, any notification duties ⚖️
- [ ] Kill switch tested (stops imports; never touches GHL)
