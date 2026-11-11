# Plan: "Smart add" for work orders (Quick add, upgraded)

Status: **approved and built 2026-11-11.** Not live until pushed.

## What you asked for
You or a manager describe work by **typing, talking, or dropping screenshots**. You press one button, and the AI organizes it into a work order with:
- title and steps;
- priority and time needed;
- a **suggested person, chosen from who's actually free**;
- a **suggested deadline**.

You either **Confirm** it as-is or **edit** it first. Nothing is created until a person confirms.

## What already exists (Quick add, on Work Orders)
- Type, or talk using your phone keyboard's microphone.
- One photo or screenshot, shrunk on your phone before sending, never saved.
- The AI drafts the title, steps, priority, time and a suggested person. Client and team names are swapped for codes before anything is sent to the AI.
- Each draft opens in the normal "Add work order" form to check before saving.
- Uses your existing AI budget ($10/month default, hard stop at 100%).

## What Smart add adds
1. **Easy to reach:** a **"Smart add"** button at the top of Work Orders, and on the floating button's page. Owner and managers only. The database already refuses work orders from developers.
2. **Screenshots:** drag-and-drop on a computer, or pick from your phone. **Up to 3 images** per request. Each is shrunk on your device (EXIF location data removed), checked by its real file type, sent once, and never saved.
3. **Talk:** a microphone button that uses your browser's own speech-to-text. It's free, with no new service, and works in Safari on iPhone. Your keyboard's microphone still works too.
4. **Who's free:** Atlas works out each developer's real load in plain code:
   - open work hours (from estimates);
   - overdue items;
   - what's due this week.

   The AI only gets those numbers, with names swapped for codes. It must pick from them and say why, for example "least open hours (4 h) and does SEO work". If a person has no estimates yet, Atlas says so instead of guessing.
5. **Deadline:** the AI suggests a due date from the time needed, the urgency and the person's load. Atlas then checks it in plain code: never in the past, and never earlier than the person could realistically fit it in. If the AI's date is unrealistic, Atlas moves it and tells you why.
6. **Confirm or edit:** each draft shows as a card with everything filled in:
   - **Confirm** saves it straight away as a normal work order. It then goes through the same rules as any other: history is recorded and the developer gets their "assigned" notice.
   - **Edit** opens the full form, pre-filled, to change anything first.
   - **Skip** throws the draft away.

   Several drafts from one request can be confirmed one by one.
7. **Client:** if the client is clear from the text, it's pre-picked; if not, you choose it before confirming. Confirm is disabled until a client is set.

## Rules (unchanged, and tested)
- **The AI never creates, assigns or sends anything.** A person's tap on Confirm does.
- **Contact details:** removed from what's sent where possible. Drafts are checked for emails and phone numbers and refused, like everything else.
- **No GoHighLevel and no email.** Nothing is read from either, and nothing is sent anywhere.
- **Budget:** every request is logged with its exact cost and must fit the remaining monthly budget.

## Cost
About **2–5 cents per request** with text, **5–10 cents** with screenshots, from your existing AI budget. There's no new service, and speech-to-text is free (built into the browser).

## Database changes
**None.** It uses the existing work orders, AI cost log and workload rules.

## Risks
- **The AI can pick the wrong person or date.** That's why Confirm is a separate tap and the plain-code checks run first.
- **Screenshots can contain client contact details.** The AI is told to leave them out, drafts are checked, and images are never stored. It isn't perfect, so check before confirming.
- **Browser speech-to-text** quality varies; you can always edit the text before pressing the button.

## Tests
- **Load numbers and the deadline check:** plain code, fictional data.
- **Guardrails:**
  - Smart add creates nothing on its own;
  - only the owner and managers can use it;
  - images are never saved;
  - no GoHighLevel;
  - the cost is logged.
- **Live:** you try a typed request, a talked one and a screenshot on your phone.
