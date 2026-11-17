# Plan: PDFs in Smart add + "Our agency" work orders (0022)

Status: APPROVED 2026-11-17 and BUILT. Waiting for 0022 to be run in Supabase (Our agency saves say "needs 0022" until then; PDFs work without it).

Note: the due date on a draft is checked against the SUGGESTED person's load; if you pick someone else, check the date.

## What you asked for

1. In Smart add, attach a **PDF** as well as typing, talking or adding screenshots. The AI reads it, drafts the work orders it thinks are best and suggests who should do each one. The person adding them approves, and can change things later.
2. In the client picker, a first option **before any client: our agency**, for internal work (our own marketing, website, admin).

## What already works (no change)

- Smart add drafts are **never saved by themselves**. Each draft shows a suggested person (picked from real workload) and a date. A person taps Confirm or Edit.
- After that, the owner or a manager can reassign it, and a developer can ask to be reassigned.

## 1. PDFs in Smart add

**On screen**
- The "Add photos" button becomes "Add photos or a PDF".
- You can add one PDF per Smart add, up to 3.5 MB.
- Photos still work alongside it (up to 3), as long as everything together stays under about 4 MB.

**Who gets the work**
- Each draft gets a new **"Assign to me"** button next to the suggested person, plus the existing person picker.
- You can also assign it to someone else, or leave it unassigned.

**Checks before anything is sent**
- The server checks that the file really is a PDF from its first bytes (`%PDF-`), not from its name.
- It also checks the size. The PDF is sent to the AI once, then thrown away; it is **never stored**.

**Privacy**
- Names typed in your note are still swapped for codes.
- A PDF, like a photo, **can't be scrubbed**: whatever is in it (client names, emails, prices) goes to the AI.
- The screen will warn you about this, the same way it does for photos.

**Safety**
- A PDF is treated as data, not instructions. If a PDF says "assign everything to X" or "ignore your rules", the AI is told to ignore it.
- The AI still has no tools and can't save anything.
- Every draft goes through the existing checks: no contact details in titles or steps, dates checked against real workload, no weekends, no past dates.

**Cost** (Claude Opus 5.5 at $4 per million input tokens and $20 per million output tokens)
- A PDF uses roughly 1,500–3,000 tokens per page.
  - A 5-page PDF costs about **$0.05–0.15**.
  - A 30-page PDF costs about **$0.40**.
- Before sending, the budget check assumes the worst case (up to 100 pages, about $1.30). If less than that is left in this month's budget, it refuses.
- The exact cost is logged like every other AI call, under the "quick add" bot.

**Technical change**
- The request size limit goes from 2 MB to 4 MB, because Vercel caps a request at 4.5 MB.
- PDFs larger than that need to be split, or turned into screenshots of the key pages.

## 2. "Our agency" as a client choice

**Database change 0022** (you run it in the SQL Editor):
- New column `actions.internal` (yes/no).
- The rule "every item belongs to exactly one client OR one sales lead" becomes "exactly one client, OR one lead, OR our agency".
- Only work orders can be internal; follow-ups and issues stay tied to a client.
- Break-in tests prove a developer still sees only internal work assigned to them.

**On screen**
- In every work order client picker (Smart add drafts, Add, Edit), the first option is **"Our agency (internal)"**.
- It shows as a small "Internal" tag on lists and boards.

**What internal work does NOT affect**
- Any client's health score.
- "Last contact".
- The client pages.
- The AI's client risk alerts.

**Where it does count**
- Workload, deadlines, notices, the review queue and the owner summary's work order numbers, like any other work order.

**The AI**
- The AI gets "our agency" as one of the choices.
- Smart add can therefore draft "update our own Google profile" as internal.

**Before 0022 is run**
- The option shows but says it needs one setup step first.
- Everything else keeps working.

**Label**
- The label in the app will be "Our agency (internal)".
- I can show the company name instead if you prefer. I'll keep it out of tests and code comments either way.

## Not included

- Developers or salespeople creating work orders. Today only the owner and managers can, which was decided in the Work Orders plan.
  - If you want developers to add work for themselves, that's a separate permission change and needs its own OK.
  - It would be: "a developer may add a work order only assigned to themselves, and it goes to a manager to approve".
- Saving the PDF on the work order.
  - That needs file storage with its own access rules, which costs more.
  - For now, paste a link to the file (Google Drive and so on) in the work order's Links.
- Anything in GoHighLevel (still read-only).

## Tests

- **App tests:**
  - PDF magic bytes are accepted, and fake or renamed files are refused;
  - size limits;
  - the budget worst case includes the PDF;
  - "Our agency" drafts restore correctly from the AI;
  - internal items never reach health or client rules;
  - every new action is blocked while previewing (guardrail).
- **Database break-in tests (0022):**
  - an internal item can't also have a client or lead;
  - follow-ups can't be internal;
  - a developer sees only their own internal work;
  - salespeople see none of it.
- `npm run check` and `npm run test:rls` must pass.

## Risks

- **PDF contents go to the AI unredacted.** You or a manager decide what to upload.
- **Big PDFs cost more.** The budget hard stop still applies.
- **Changing the "one client or one lead" rule touches a core table.** It is covered by the break-in tests, and old rows are unaffected (they all have a client or a lead).

## Done means

- From your phone, you can add a PDF in Smart add, get drafts, tap "Assign to me" or pick someone, and Confirm.
- You can pick "Our agency (internal)" as the client.
- All tests pass.
- Committed for you to push.
