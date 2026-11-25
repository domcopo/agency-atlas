// Role guides (docs/ROLE_GUIDES_PLAN.md, approved 2026-11-25). Pure: no database, no
// network. The starter text for each job lives here (reviewed in Git, works before 0036);
// the owner and managers can replace a part or add a section later (role_guide_parts, 0036).
//
// Who sees which guide is decided on the SERVER from the database role (guidesFor), never
// from what the browser asks for. The feature and helper lists below are tested against the
// real app (tabs, BizToad rules), so a guide can't promise something a role can't reach.
// Text uses Kit's simple marks (parseKitText) and is always shown as plain text.
// No real names: roles only.

import type { MemberRole } from "@/lib/roles";
import { MEMBER_ROLES } from "@/lib/roles";

/** Parts the owner/managers may rewrite. Features and helpers stay generated from the lists below. */
export type GuidePartKey = "duties" | "goals" | "how_to";
export const GUIDE_PARTS: { key: GuidePartKey; label: string }[] = [
  { key: "duties", label: "What you do" },
  { key: "goals", label: "Your goals" },
  { key: "how_to", label: "How to use Atlas" },
];
export const guidePartLabel = (k: GuidePartKey) => GUIDE_PARTS.find((p) => p.key === k)?.label ?? k;

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  developer: "Developer",
  sales: "Sales",
  va: "Client care assistant (VA)",
};

/** The bottom-tab each feature lives under (matches MODE_TABS in BottomNav.tsx; tested). */
export type GuideTab = "/" | "/clients" | "/sales" | "/work" | "/growth" | "/kit";

export interface GuideFeature {
  id: string;
  name: string;
  /** Where to find it (a link inside Atlas), or null when it's a card on another screen. */
  href: string | null;
  tab: GuideTab;
  what: string;
  roles: readonly MemberRole[];
  /** Extra words for one role (e.g. "your own work only"). */
  note?: Partial<Record<MemberRole, string>>;
}

export interface GuideHelper {
  id: string;
  name: string;
  what: string;
  limits: string;
  roles: readonly MemberRole[];
  /** True when Atlas itself asks the AI (cost logged, monthly budget). */
  usesAi: boolean;
}

const LEADS = ["owner", "manager"] as const;

export const GUIDE_FEATURES: readonly GuideFeature[] = [
  { id: "mission", name: "Mission Control (Home)", href: "/", tab: "/", what: "Today's priorities, risk alerts, client health scores and deadlines in one place. A switcher picks the layout for your job (Everything, Client care, Work lead, Sales).", roles: LEADS },
  { id: "dev_today", name: "Today (Home)", href: "/", tab: "/", what: "Your work orders, their steps and deadlines, and a link to the rankings for the clients you work on.", roles: ["developer"] },
  { id: "sales_today", name: "Your plan (Home)", href: "/", tab: "/", what: "Your daily target, the leads to touch today and how you're doing this week.", roles: ["sales"] },
  { id: "care_today", name: "Client care today (Home)", href: "/", tab: "/", what: "The client touches due today (calls first), your daily points and what's waiting on you.", roles: ["va"] },
  { id: "clients", name: "Clients", href: "/clients", tab: "/clients", what: "Every client: profile, health, plan tier, contact preferences, the client journey (27 touches) and memory notes.", roles: ["owner", "manager", "va"], note: { va: "You never see amounts. To pause a client or mark them lost, you ask; the owner or a manager approves.", manager: "Amounts are owner-only." } },
  { id: "add_client", name: "Add a client", href: "/clients/new", tab: "/clients", what: "Add a new client with their plan tier and contact preferences.", roles: LEADS },
  { id: "restart", name: "Restart journeys and daily goals", href: "/clients/restart", tab: "/clients", what: "Restart a client's journey and set each person's daily care goal.", roles: ["owner"] },
  { id: "work", name: "Work", href: "/work", tab: "/work", what: "Check-ins, promises, blockers and the next action for each client.", roles: [...LEADS, "developer"], note: { developer: "Only the work and clients assigned to you." } },
  { id: "work_orders", name: "Work orders", href: "/work/orders", tab: "/work", what: "The board of jobs: details, steps, comments, review before done. Includes internal agency work.", roles: [...LEADS, "developer"], note: { developer: "Only your own work orders. Tick steps, comment, ask for help, send for review." } },
  { id: "sales", name: "Sales", href: "/sales", tab: "/sales", what: "Leads and pipeline (read from GoHighLevel, never changed there), touches you log, and the sales leaderboard.", roles: [...LEADS, "sales"] },
  { id: "scout", name: "Scout", href: "/sales/scout", tab: "/sales", what: "Find local businesses that could use our help, log walk-ins, and claim prospects from the shared pool.", roles: [...LEADS, "sales"] },
  { id: "audits", name: "Audits (SEO and Google Ads)", href: "/audits", tab: "/sales", what: "Build an audit for a business, run it inside Atlas or attach results, and show the pages.", roles: [...LEADS, "sales"] },
  { id: "growth", name: "Growth", href: "/growth", tab: "/growth", what: "Surveys, the SEO Watcher rankings board, demand and opportunity markets.", roles: LEADS },
  { id: "billing", name: "Billing", href: "/billing", tab: "/", what: "Invoices and payments, read-only from GoHighLevel. Owner only, end to end.", roles: ["owner"] },
  { id: "safety", name: "Data Safety", href: "/safety", tab: "/", what: "The shield on Home: two-factor, backups and what's connected.", roles: ["owner", "manager", "developer", "sales"] },
  { id: "trash", name: "Trash", href: "/trash", tab: "/", what: "Things that were removed. Only the owner can delete forever.", roles: LEADS },
  { id: "kit", name: "Kit", href: "/kit", tab: "/kit", what: "This guide, the handbook, SOPs, FAQ, templates and where each tool's login is kept. Send ideas from here too.", roles: MEMBER_ROLES },
];

export const GUIDE_HELPERS: readonly GuideHelper[] = [
  { id: "biztoad", name: "BizToad", what: "The animated toad. Ask it a question about what you can already see in Atlas (type, or hold to talk; it can read answers aloud). Owner and managers can get one work order draft to check and confirm.", limits: "Monthly cost caps set by the owner. Developers and salespeople get only their own facts; names are swapped for codes before anything reaches the AI.", roles: ["owner", "manager", "developer", "sales"], usesAi: true },
  { id: "briefing", name: "AI briefing", what: "A short summary on Home of what needs attention today.", limits: "Counts toward the monthly AI budget; client and staff names are swapped for codes.", roles: LEADS, usesAi: true },
  { id: "smart_add", name: "Smart add", what: "Type, talk, add screenshots or one PDF, and it drafts work orders. Nothing is saved until you tap Confirm.", limits: "Pictures and PDFs can't be scrubbed of names, so the screen warns you. They're never saved.", roles: LEADS, usesAi: true },
  { id: "work_prompt", name: "Work prompt helper and client profiles", what: "Writes a step-by-step prompt for a work order, or a client profile summary, for a person to use.", limits: "Monthly AI budget; names swapped for codes.", roles: LEADS, usesAi: true },
  { id: "care_ai", name: "Client care next moves and drafts", what: "Suggests the next moves for a client and drafts a message you can copy. Atlas never sends it.", limits: "Monthly AI budget; copy-only.", roles: LEADS, usesAi: true },
  { id: "audit_run", name: "Run audit in Atlas", what: "Looks up search data (read-only) and has the AI write the words for the audit pages.", limits: "Spending caps per person and per month; every figure shows its source.", roles: [...LEADS, "sales"], usesAi: true },
  { id: "audit_attach", name: "Attach audit results", what: "Paste Claude's reply and Atlas checks every field before it's used.", limits: "Anything that doesn't pass the check is refused, with the reason.", roles: [...LEADS, "sales"], usesAi: false },
  { id: "scout_prompt", name: "Scout search prompt", what: "A copy-only prompt you run in Claude; you paste the results back and Atlas checks and scores each business.", limits: "About $10 a month per salesperson, $25 a month in total. No phones, emails or people's names are kept.", roles: [...LEADS, "sales"], usesAi: false },
  { id: "watcher_rounds", name: "SEO Watcher rounds", what: "A copy-only prompt to check rankings for watched clients; results are attached and checked.", limits: "$20 a month cap; important clients only.", roles: LEADS, usesAi: false },
  { id: "ghl_sync", name: "GoHighLevel sync", what: "Reads call and message times from GoHighLevel once a day so client care stays current. Read-only, forever.", limits: "Never changes anything in GoHighLevel and never reads message text.", roles: ["owner"], usesAi: false },
  { id: "owner_feed", name: "Owner summary and bot runs", what: "A totals-only summary your outside AI assistant can read, and a log of every helper's runs.", limits: "One read-only address, token-checked.", roles: ["owner"], usesAi: false },
];

export interface StarterGuide {
  role: MemberRole;
  title: string;
  summary: string;
  parts: Record<GuidePartKey, string>;
}

const ALWAYS = "**Atlas never sends anything for you.** Drafts and prompts are copy-only; you decide what goes out.";

export const STARTER_GUIDES: Record<MemberRole, StarterGuide> = {
  owner: {
    role: "owner",
    title: "Owner guide",
    summary: "You run the agency: clients, money, the team and the tools.",
    parts: {
      duties: [
        "- Keep every client healthy and paying: watch health scores, risk alerts and the client journey.",
        "- Set direction for the team: goals for each person, priorities on Home, work order approvals.",
        "- Own the money: billing, plan tiers and client amounts are yours alone.",
        "- Approve VA requests to pause or mark a client lost.",
        "- Review ideas from the team in Kit → Ideas inbox.",
        "- Keep access safe: two-factor for everyone, remove logins when someone leaves.",
      ].join("\n"),
      goals: [
        "- No client goes a week without a real conversation.",
        "- Every red health score has a next action and an owner.",
        "- AI and tool spending stays inside the monthly caps.",
        "- Ideas inbox answered at least once a week.",
      ].join("\n"),
      how_to: [
        "1. Start on **Home** (Everything layout). Read the AI briefing and the risk alerts.",
        "2. Open **Clients** for anyone red or amber; log what you did.",
        "3. Check **Work orders** waiting for review.",
        "4. Look at **Sales** and the leaderboard; check **Billing** for anything overdue.",
        "5. In **Kit**, update guides and goals, and read new ideas.",
        "",
        ALWAYS,
      ].join("\n"),
    },
  },
  manager: {
    role: "manager",
    title: "Manager guide",
    summary: "You keep clients happy and the work moving.",
    parts: {
      duties: [
        "- Run client care: calls first, the client journey touches, memory notes.",
        "- Turn requests into clear work orders and assign them; review work before it's done.",
        "- Help sales with audits and Scout when needed.",
        "- Approve or decline VA requests to pause or mark a client lost.",
        "- Keep Kit current: guides, SOPs, FAQ, templates and goals for the team.",
      ].join("\n"),
      goals: [
        "- Hit your daily client care points.",
        "- No work order overdue without a note on why.",
        "- Every client in trouble has a next action today.",
      ].join("\n"),
      how_to: [
        "1. Open **Home** with the layout for your job (Client care or Work lead).",
        "2. Work through today's client touches; log each one.",
        "3. Use **Smart add** to turn a call or a screenshot into work order drafts, then confirm.",
        "4. Review the **Work orders** board; answer developers' questions.",
        "5. Check **Kit** for new pages and your goals.",
        "",
        ALWAYS,
      ].join("\n"),
    },
  },
  developer: {
    role: "developer",
    title: "Developer guide",
    summary: "You do the SEO and website work for the clients assigned to you.",
    parts: {
      duties: [
        "- Finish the work orders assigned to you, step by step.",
        "- Tick steps as you go, comment when something changes, and ask for help early when blocked.",
        "- Send work for review when it's done; fix anything the review finds.",
        "- Follow the SOPs in Kit for each kind of job.",
      ].join("\n"),
      goals: [
        "- Work orders done by their due date.",
        "- Blockers raised the same day you find them.",
        "- Your clients' rankings moving the right way.",
      ].join("\n"),
      how_to: [
        "1. Open **Home** (Today) to see what's due.",
        "2. Open a work order, follow the steps, tick each one.",
        "3. Stuck? Use **Ask for help** on the work order.",
        "4. Done? **Send for review**.",
        "5. Ask **BizToad** about your own work any time.",
        "",
        "You only see your own work and clients. That's on purpose: the database decides, not the screen.",
      ].join("\n"),
    },
  },
  sales: {
    role: "sales",
    title: "Sales guide",
    summary: "You find and win new clients.",
    parts: {
      duties: [
        "- Touch your leads every day: calls, texts, emails, visits. Log each one.",
        "- Find new local businesses with **Scout**; claim the ones you'll work.",
        "- Build audits to show a business what we can do for them.",
        "- Keep GoHighLevel up to date yourself (Atlas only reads it).",
      ].join("\n"),
      goals: [
        "- Hit your daily touch target.",
        "- Book discovery calls from your pipeline every week.",
        "- Every prospect you claim gets a first touch within two working days.",
      ].join("\n"),
      how_to: [
        "1. Open **Home** for your plan and target.",
        "2. Go to **Sales** for your leads; log each touch.",
        "3. Use **Scout** to find and claim prospects; log walk-ins.",
        "4. Use **Audits** to build and run an SEO or Google Ads audit.",
        "5. Ask **BizToad** about your own leads and numbers.",
        "",
        ALWAYS,
      ].join("\n"),
    },
  },
  va: {
    role: "va",
    title: "Client care assistant guide",
    summary: "You keep in touch with clients so nobody feels forgotten.",
    parts: {
      duties: [
        "- Make today's client touches: calls first, then a voicemail and text if nobody answers.",
        "- Log every touch with the outcome and a short note.",
        "- Add memory notes (birthdays, preferences, what they care about).",
        "- If a client wants to pause or leave, send a request; the owner or a manager decides.",
      ].join("\n"),
      goals: [
        "- Hit your daily care points (a real conversation counts most).",
        "- No client touch left overdue at the end of the day.",
      ].join("\n"),
      how_to: [
        "1. Open **Home** to see today's touches and your points.",
        "2. Open a client in **Clients** and log what happened.",
        "3. Use the templates in **Kit** for messages; copy, then send them yourself.",
        "",
        "You don't see client amounts, and there are no AI helpers for this job.",
      ].join("\n"),
    },
  },
};

/** Which guides a person may read: owner and managers all five; everyone else only their own. */
export function guidesFor(role: MemberRole | null | undefined): MemberRole[] {
  if (!role) return [];
  if (role === "owner" || role === "manager") return [...MEMBER_ROLES];
  return [role];
}

/** Who may edit a guide: owner edits all; managers all except the owner's; nobody else. */
export function canEditGuide(editor: MemberRole | null | undefined, guide: MemberRole): boolean {
  if (editor === "owner") return true;
  if (editor === "manager") return guide !== "owner";
  return false;
}

export const featuresFor = (role: MemberRole) => GUIDE_FEATURES.filter((f) => f.roles.includes(role));
export const helpersFor = (role: MemberRole) => GUIDE_HELPERS.filter((h) => h.roles.includes(role));

/** Reads a role from a URL segment; anything else is null (the page shows "not found"). */
export function asGuideRole(v: unknown): MemberRole | null {
  return MEMBER_ROLES.includes(v as MemberRole) ? (v as MemberRole) : null;
}

// ---------------------------------------------------------------------------
// Edits saved in the database (0036): replace a part, or add a section.
// ---------------------------------------------------------------------------

export interface GuideEdit {
  id: string;
  role: MemberRole;
  /** A starter part it replaces, or "extra" for an added section. */
  part: GuidePartKey | "extra";
  title: string | null;
  body: string;
  position: number;
  updatedAt: string;
}

export interface GuideSection {
  key: string;
  title: string;
  body: string;
  /** The database row behind it, or null when it's the starter text. */
  editId: string | null;
  edited: boolean;
  part: GuidePartKey | "extra";
}

/** The starter text with any saved edits applied (latest edit per part wins), then added sections. */
export function mergeGuide(role: MemberRole, edits: readonly GuideEdit[]): GuideSection[] {
  const mine = edits.filter((e) => e.role === role);
  const latest = (key: GuidePartKey) =>
    mine.filter((e) => e.part === key).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const base: GuideSection[] = GUIDE_PARTS.map(({ key, label }) => {
    const e = latest(key);
    return { key, title: label, body: e ? e.body : STARTER_GUIDES[role].parts[key], editId: e?.id ?? null, edited: !!e, part: key };
  });
  const extras = mine
    .filter((e) => e.part === "extra")
    .sort((a, b) => a.position - b.position || a.updatedAt.localeCompare(b.updatedAt))
    .map((e) => ({ key: e.id, title: e.title || "More", body: e.body, editId: e.id, edited: true, part: "extra" as const }));
  return [...base, ...extras];
}

export const GUIDE_LIMITS = { title: 80, body: 8000, goal: 300 } as const;
