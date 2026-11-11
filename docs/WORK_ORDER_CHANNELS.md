# Options: how work orders reach the team (comparison only)

Status: **for discussion (2026-11-11).** Nothing here is built or planned as a default.

Ground rules from you and your AI CEO advisor:
- **Team check-in automation is PAUSED.** Anything that messages developers to check on tasks would reverse that. It is flagged ⚠️ below and is **not** a default.
- **GoHighLevel stays read-only** unless you approve write access after a security review.
- Judge the Work Orders screens from real use (they went live 2026-11-10), not from guesses.

| Option | What it does | Cost | Effort | Privacy / risk | Pauses respected? |
|---|---|---|---|---|---|
| **A. In Atlas only (today)** | Developers see new and changed work in Atlas: the badge, the notices list and their Work tab. | $0 | Done | Lowest: nothing leaves Atlas | ✅ Nothing is sent |
| **B. Dictate on iPhone → draft you approve** (built as Smart add) | You talk or type in Atlas, get drafts with a suggested person and date, and tap Confirm. | ~2–10¢ per request (existing AI budget) | Done | Text and screenshots go to the AI (names coded; screenshots as they are) | ✅ Nothing is sent to anyone |
| **C. One daily summary email to your main developer** | Once a day, one email: "Your open work orders: 3 due this week, 1 overdue", with titles and a link to Atlas. No client contact details. | $0 on Resend's free plan (3,000/month) | Small: new email service key in Vercel, a daily job, an opt-out | Low to medium: titles leave Atlas by email | ⚠️ It's a scheduled message to a developer. Only with your explicit OK, as an opt-in summary, not a check-in |
| **D. WhatsApp** | Send work orders or reminders to developers on WhatsApp. | Meta WhatsApp Business API: per-conversation fees plus a provider (e.g. Twilio); a few dollars a month at your size | Large: Business account verification, message templates, phone numbers stored in Atlas | Highest: needs developers' phone numbers, and messages leave Atlas to Meta | ⚠️ A messaging channel to developers. Reverses the pause if used for check-ins |
| **E. Copy into WhatsApp yourself** | Use the existing **Copy** button on Work Orders and paste into a WhatsApp chat by hand. | $0 | Done | You choose what to share | ✅ A person sends it, by choice |

## My recommendation
1. **Use A + B for a week or two** and note what feels clunky on your phone.
2. If your main developer misses things, try **C** as an **opt-in daily summary**: one email, no reminders, no "are you done?" questions. It needs your explicit OK first.
3. For WhatsApp, use **E** (copy and paste by hand) rather than **D**. D adds phone numbers, a paid provider and a new place where data leaves Atlas, for little gain over E.

Nothing in A–E writes to GoHighLevel.
