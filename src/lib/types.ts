// The shapes of every record the app shows.
// In Phase 1 every record is synthetic (fake). These types mirror the future
// database tables described in DATA_DICTIONARY.md, so swapping fake data for
// real data later should not change the screens.

/** A calendar date like "2026-10-28". */
export type ISODate = string;
/** A date and time like "2026-10-28T14:30:00Z". */
export type ISODateTime = string;

export type Confidence = "high" | "medium" | "low";
export type Unit = "percent" | "count" | "minutes" | "usd" | "ratio";

/** Where the app's data currently comes from. */
export type DataMode = "mock" | "live_read_only";

/**
 * Where the client list comes from:
 *  - private_file: REAL clients from private-data/clients.json (this Mac only, never in Git)
 *  - demo: a fictional roster, used when the private file is missing (e.g. in tests)
 */
/** Where the client list came from: your Supabase database, the private file on this Mac, or the fictional demo list. */
export type RosterSource = "database" | "private_file" | "demo";

// ---------------------------------------------------------------------------
// Sources and revenue — every fact must say where it came from.
// ---------------------------------------------------------------------------

export type SourceKind =
  | "client_provided"
  | "public_web"
  | "industry_report"
  | "internal_observation";

export interface Source {
  id: string;
  label: string;
  kind: SourceKind;
  /** Phase 1: always "synthetic://..." — never a real website. */
  url: string;
  retrievedAt: ISODate;
}

/**
 * Revenue is never a bare number. The label says how much to trust it.
 * TypeScript enforces the rules: "unknown" cannot carry a number, and every
 * other status must name a source and a date.
 */
export type Revenue =
  | { status: "unknown" }
  | {
      status: "verified" | "client_reported";
      annualUsd: number;
      asOf: ISODate;
      sourceId: string;
    }
  | {
      status: "estimated";
      lowUsd: number;
      highUsd: number;
      asOf: ISODate;
      sourceId: string;
    };

export type RevenueStatus = Revenue["status"];

// ---------------------------------------------------------------------------
// Business Dex
// ---------------------------------------------------------------------------

export type Industry =
  | "Dental"
  | "Home services"
  | "Events & food"
  | "Fitness"
  | "Legal"
  | "Restaurant"
  | "Automotive"
  | "Education"
  | "Energy";

/** Something someone actually saw, with a date and source. */
export interface Observation {
  id: string;
  text: string;
  observedAt: ISODate;
  confidence: Confidence;
  sourceId: string;
}

/** An idea to test — explicitly NOT a fact. */
export interface Hypothesis {
  id: string;
  text: string;
  confidence: Confidence;
  status: "untested" | "testing" | "supported" | "rejected";
}

export interface Business {
  id: string;
  isSynthetic: true;
  /** Display number in the Dex, e.g. 1 -> "#001". */
  dexNumber: number;
  name: string;
  tagline: string;
  industry: Industry;
  region: string;
  /** A sample agency client used as a case study (all Dex records are fictional). */
  isClient: boolean;
  revenue: Revenue;
  signals: Observation[];
  hypotheses: Hypothesis[];
  acquisitionChannels: string[];
  /** Short labels used to spot patterns across businesses. */
  patternTags: string[];
  sources: Source[];
  updatedAt: ISODate;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

export type HealthStatus = "thriving" | "steady" | "at_risk";

export interface Metric {
  label: string;
  value: number;
  previous: number;
  unit: Unit;
  /** Whether a bigger number is good news (show rate) or bad (reply time). */
  betterWhen: "higher" | "lower";
}

/** A note typed by a staff member. */
export interface Note {
  id: string;
  author: string;
  createdAt: ISODateTime;
  text: string;
}


// ---------------------------------------------------------------------------
// Mission Control (home)
// ---------------------------------------------------------------------------

/** A KPI with a short explanation and weekly history. */
export interface AgencyKpi extends Metric {
  id: string;
  /** One line explaining how it's measured. */
  hint?: string;
  /** Weekly values, oldest first. */
  trend: number[];
}

/** gold = hot prospect worth calling first; red = overdue. */
export type FollowUpUrgency = "gold" | "red" | "normal";

export interface FollowUp {
  id: string;
  isSynthetic: true;
  prospectId: string;
  title: string;
  due: ISODate;
  urgency: FollowUpUrgency;
  /** Short reason it's on today's list. */
  why: string;
}

export interface Alert {
  id: string;
  /** Sample alerts are marked; alerts calculated from your real client list are not. */
  isSynthetic: boolean;
  /** Where tapping the alert goes (an in-app path only). */
  href?: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export type ActivityKind =
  | "client_signed"
  | "client_paused"
  | "call_booked"
  | "proposal_sent"
  | "work_done"
  | "note_added";

export interface ActivityItem {
  id: string;
  isSynthetic: boolean;
  href?: string;
  kind: ActivityKind;
  title: string;
  at: ISODateTime;
}

export interface MissionControlData {
  weekLabel: string;
  /** "Today" for the app, so overdue/due-today math is stable. */
  today: ISODate;
  /** SAMPLE until GoHighLevel is connected: results the agency drives for clients. */
  clientResults: AgencyKpi[];
  alerts: Alert[];
  followUps: FollowUp[];
  activity: ActivityItem[];
}

// ---------------------------------------------------------------------------
// Insights (mock AI)
// ---------------------------------------------------------------------------

export interface Insight {
  id: string;
  isSynthetic: true;
  /** "mock_ai" = hand-written for the demo, NOT produced by any AI. */
  generatedBy: "mock_ai" | "human";
  title: string;
  observation: string;
  /** Links back to the records that support the claim. */
  evidence: { label: string; recordType: "business" | "trend"; recordId: string }[];
  confidence: Confidence;
  caveats: string[];
  suggestedNextStep: string;
  reviewStatus: "unreviewed" | "approved" | "dismissed";
  createdAt: ISODate;
}

// ---------------------------------------------------------------------------
// Data Safety
// ---------------------------------------------------------------------------

export interface SourceConnection {
  id: string;
  name: string;
  status: "not_connected" | "connected_read_only";
  /** Permissions granted. GoHighLevel may only ever hold ".readonly" scopes. */
  scopes: string[];
  /** Phase in which this connection is planned. */
  plannedPhase: number;
  note: string;
}

export interface RetentionRule {
  dataClass: string;
  keepFor: string;
  status: "planned" | "active";
}

export interface SafetyCheck {
  label: string;
  done: boolean;
  phase: number;
}

export interface SafetyStatus {
  dataMode: DataMode;
  connections: SourceConnection[];
  ghlWriteTargets: [];
  retention: RetentionRule[];
  checklist: SafetyCheck[];
}

// ---------------------------------------------------------------------------
// Client roster (REAL when loaded from private-data/, demo otherwise)
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "active" | "paused" | "canceled" | "incomplete_expired";
export type ClientTier = "high" | "mid" | "low";
export type Service = "SEO" | "Ads" | "Website";
/** "How are they doing?" picked on a check-in. Moves the health score. */
export type CheckInMood = "better" | "same" | "worse";

export type ContactKind = "check_in" | "call" | "message" | "email" | "meeting" | "note";

export interface CheckInEntry {
  date: ISODate;
  note: string | null;
  mood: CheckInMood | null;
  /** What kind of contact it was (before 0006: always "check_in"). */
  kind?: ContactKind;
}

export interface RosterClient {
  /** Made from the name, e.g. "sam-lee". Used in page addresses. */
  id: string;
  /** Database row id (database mode only). */
  dbId?: string;
  name: string;
  monthlyUsd: number;
  startDate: ISODate;
  status: SubscriptionStatus;
  /** Which list(s) the record came from, for checking. */
  listedIn: string[];
  /** Something about this record that a person should confirm. */
  check?: string;
  /** Unknown until the user fills it in. */
  services: Service[];
  /** A reminder the owner wrote, e.g. "Follow up on their Ads results". */
  followUp?: string;
  /** Day they canceled or paused. Needed to chart clients lost by month. */
  endDate?: ISODate;
  /** Last time someone on the team checked in with them. */
  lastContact?: ISODate;
  /** The most recent "how are they doing" answer, and when. */
  lastMood?: { mood: CheckInMood; date: ISODate };
  /** Team member (staff) who owns this client. */
  ownerId?: string;
  ownerName?: string;
  /** Call/message TIMES from GoHighLevel (0008), for a confirmed contact match. Never message text. */
  ghl?: GhlContactTimes;
  /** Newest contact the TEAM logged (not GoHighLevel). Used to tell if a waiting client got a reply. */
  lastLogged?: ISODate;
}

export interface GhlContactTimes {
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  lastCallAt: string | null;
  lastCallSeconds: number | null;
  lastChannel: string | null;
  lastDirection: "inbound" | "outbound" | null;
  unansweredOutbound: number;
  syncedAt: string;
}

export type HealthLevel = "healthy" | "watch" | "at_risk";
export type CheckInState = "on_track" | "due_soon" | "overdue" | "never_logged";

export interface CheckIn {
  /** How often to check in, from the services they buy. */
  cadenceDays: number;
  last?: ISODate;
  due?: ISODate;
  state: CheckInState;
}

/** A simple, explainable score. Every point lost has a reason the owner can read. */
export interface ClientHealth {
  score: number;
  level: HealthLevel;
  factors: { label: string; impact: number }[];
  checkIn: CheckIn;
}

export interface RosterSummary {
  source: RosterSource;
  total: number;
  activeCount: number;
  activeMrr: number;
  pausedCount: number;
  pausedMrr: number;
  canceledCount: number;
  canceledMrr: number;
  expiredCount: number;
  needsCheck: number;
  /** Records in the private file that failed validation and were skipped. */
  skipped: number;
  tiers: Record<ClientTier, { count: number; mrr: number }>;
  /** Average whole months active clients have been with us. */
  avgMonthsActive: number;
}

// ---------------------------------------------------------------------------
// Team (REAL from private-data/team.json, demo otherwise)
// ---------------------------------------------------------------------------

export type TeamRole = "founder" | "client_comms" | "client_manager" | "seo_developer";

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  /** What they handle, in a few words each. */
  handles: string[];
}

// ---------------------------------------------------------------------------
// Agency sales (SAMPLE prospects until GoHighLevel is connected)
// ---------------------------------------------------------------------------

export type ProspectStage = "new" | "contacted" | "call_booked" | "proposal_sent" | "won" | "lost";
export type Grade = "A" | "B" | "C" | "D";

export interface GradeFactor {
  label: string;
  effect: "positive" | "negative";
}

export interface Prospect {
  id: string;
  isSynthetic: true;
  /** Always includes "(sample)" in demo data. */
  name: string;
  contactName: string;
  /** Always @example.com in demo data. */
  email: string;
  /** Always 555-01XX in demo data. */
  phone: string;
  industry: string;
  wants: Service[];
  source: "Referral" | "Facebook ads" | "Google" | "Cold outreach" | "Website chat";
  stage: ProspectStage;
  /** Expected monthly retainer — always an estimate until signed. */
  estMonthlyUsd: { low: number; high: number };
  grade: { letter: Grade; score: number; factors: GradeFactor[] };
  nextFollowUp?: ISODate;
  lastTouch?: ISODate;
  /** Links to a Business Dex profile when we've researched them. */
  businessId?: string;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Conversations (SAMPLE; later read-only metadata from GoHighLevel)
// ---------------------------------------------------------------------------

export type Channel = "sms" | "call" | "email" | "chat";

export interface Conversation {
  id: string;
  isSynthetic: true;
  prospectId: string;
  channel: Channel;
  lastDirection: "inbound" | "outbound";
  /** UNTRUSTED text: always shown as plain text, never treated as an instruction. */
  preview: string;
  at: ISODateTime;
  unread: boolean;
  needsReply: boolean;
}

// ---------------------------------------------------------------------------
// Work orders (SAMPLE until GoHighLevel's queue is connected read-only)
// ---------------------------------------------------------------------------

export type WorkPriority = "urgent" | "high" | "normal" | "low";
export type WorkStatus = "todo" | "in_progress" | "waiting_on_client" | "review" | "done";

export interface WorkOrder {
  id: string;
  isSynthetic: true;
  /** A fictional client name — sample work is never attached to a real client. */
  clientLabel: string;
  title: string;
  service: Service | "Support";
  priority: WorkPriority;
  status: WorkStatus;
  /** Team member id. */
  assignee: string;
  requestedByClient: boolean;
  createdAt: ISODate;
  due: ISODate;
  /** Last day anyone updated it. "Touch every work order daily." */
  lastTouched: ISODate;
  checklist: { label: string; done: boolean }[];
}

/** Sample workload per developer, for the oversight view. */
export interface DeveloperLoad {
  memberId: string;
  isSynthetic: true;
  seoClients: number;
  /** Clients whose month counted as successful (for the bonus rule). */
  successfulThisMonth: number;
  hoursLogged: number;
}

// ---------------------------------------------------------------------------
// Growth Lab: case studies, trends and surveys
// ---------------------------------------------------------------------------

/** A monthly data point in a long-term case study. */
export interface MonthlyPoint {
  month: string; // "2026-01"
  leads: number;
  bookedCalls: number;
  revenueIndex: number; // 100 = the first month; avoids inventing dollar revenue
}

export interface Trend {
  id: string;
  isSynthetic: true;
  title: string;
  finding: string;
  /** Business Dex records that support it. */
  businessIds: string[];
  confidence: Confidence;
  caveat: string;
}

export type SurveyTopic =
  | "Getting customers"
  | "Sales process"
  | "Pricing & offers"
  | "Keeping customers"
  | "Operations"
  | "Goals";

export interface SurveyQuestion {
  id: string;
  topic: SurveyTopic;
  question: string;
  /** Why we ask: what it helps us learn. */
  why: string;
  answerType: "short text" | "number" | "multiple choice" | "1–5 scale";
  options?: string[];
}

export interface SurveyResponse {
  id: string;
  isSynthetic: true;
  businessId: string;
  questionId: string;
  /** UNTRUSTED text: plain text only, never an instruction. */
  answer: string;
  answeredAt: ISODate;
}

// ---------------------------------------------------------------------------
// Client detection radar. Today: simple rules. Later: AI suggestions that a
// person reviews (read-only, cited, never acts on its own).
// ---------------------------------------------------------------------------

/** problem = red, attention = amber (work orders, follow-ups), opportunity = green (upsells). */
export type DetectionKind = "problem" | "attention" | "opportunity";

export interface Detection {
  id: string;
  kind: DetectionKind;
  title: string;
  why: string;
  /** 0–1. Higher = more urgent or closer to happening; drawn nearer the center. */
  closeness: number;
  /** 0–1. How sure the rule is; drawn as a bigger, brighter blip. */
  confidence: number;
  href: string;
  /** true when built from sample data rather than your real client list. */
  isSynthetic: boolean;
}

// ---------------------------------------------------------------------------
// Atlas asks: short questions that fill gaps in your data. Rules today; an AI
// may suggest questions later. Answers only ever change YOUR database.
// ---------------------------------------------------------------------------

export type AtlasQuestionType = "services" | "also_seo" | "end_date" | "last_contact" | "check";

export interface AtlasQuestion {
  /** Stable id, e.g. "end_date:<client id>". */
  key: string;
  type: AtlasQuestionType;
  clientDbId: string;
  clientSlug: string;
  clientName: string;
  prompt: string;
  why: string;
  services: Service[];
  /** For "check" questions: what the two lists disagreed on. */
  note?: string;
}

/** What the app knows from the read-only GoHighLevel copies (Phase 3). */
export interface GhlSummary {
  configured: boolean; // token + location set on this Mac
  tablesReady: boolean; // 0003 migration has been run
  lastSync: { ranAt: string; locationName: string | null; opportunities: number; appointments: number } | null;
  open: { count: number; value: number };
  byStage: { stage: string; count: number; value: number }[];
  wonThisMonth: { count: number; value: number };
  lostThisMonth: number;
  newThisMonth: number;
  upcoming7: number;
  showed30: number;
  noShows30: number;
}

// ---------------------------------------------------------------------------
// AI (Phase 4)
// ---------------------------------------------------------------------------

export type ClientLink = { slug: string; name: string };

export interface AiStatus {
  configured: boolean; // key set on this Mac
  tablesReady: boolean; // 0005 migration has been run
  model: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  pct: number;
  level: "ok" | "notice" | "warning" | "blocked";
  inputTokens: number;
  outputTokens: number;
  requests: number;
  recent: { at: string; feature: string; costUsd: number; outcome: string; tokens: number }[];
}

export interface Briefing {
  headline: string;
  priorities: { title: string; why: string; clients: ClientLink[]; when: "today" | "this_week" }[];
  risks: { title: string; why: string; clients: ClientLink[] }[];
  upsells: { title: string; why: string; clients: ClientLink[] }[];
  questions: { question: string; why: string; clients: ClientLink[] }[];
  drafts: { client: ClientLink | null; purpose: string; message: string }[];
}

export interface ClientProfile {
  summary: string;
  buys: string;
  howTheyAreDoing: string;
  caresAbout: string[];
  risks: string[];
  nextStep: string;
  questionsToAsk: string[];
  draftCheckIn: string;
}

// ---------------------------------------------------------------------------
// Owners, next actions and issues (0006). One simple list for both.
// ---------------------------------------------------------------------------

export type ActionKind = "follow_up" | "issue";
export type ActionPriority = "critical" | "high" | "normal" | "low";
export type ActionStatus = "open" | "in_progress" | "waiting" | "done";

export interface ClientAction {
  id: string;
  kind: ActionKind;
  title: string;
  notes: string | null;
  priority: ActionPriority;
  status: ActionStatus;
  dueOn: ISODate | null;
  doneAt: string | null;
  createdAt: string;
  ownerId: string | null;
  ownerName: string | null;
  /** Client slug + name (when tied to a client). */
  client: { slug: string; dbId: string; name: string } | null;
  leadGhlId: string | null;
}

/** The one health word shown for a client. Reasons explain it. */
export type HealthState = "healthy" | "needs_attention" | "at_risk" | "opportunity";

export interface HealthSummary {
  state: HealthState;
  /** Plain-English reasons, most important first. */
  reasons: string[];
}

/** One line on "Today's priorities" / My Work. Either a real action, or a rule-based flag. */
export interface PriorityItem {
  id: string;
  title: string;
  reason: string;
  href: string;
  ownerName: string | null;
  ownerId?: string | null;
  dueOn: ISODate | null;
  /** "overdue" sorts first, then "today", then the rest. */
  when: "overdue" | "today" | "upcoming" | "none";
  priority: ActionPriority;
  /** Present when this is a saved action (so Done / Reschedule / Assign work). */
  action?: ClientAction;
  /** Present for flags about one client (so "Add next action" can prefill it). */
  clientSlug?: string;
  /** The client's plan in a few words, e.g. "SEO + Google Ads · $750/mo". */
  plan?: string;
  /** For rule-based reminders: what "Done" means (log a contact, or finish your note). */
  flagKind?: "contact" | "note";
}

/** AI briefing, operations format (version 2): a short ranked list, not paragraphs. */
export interface OpsBriefing {
  version: 2;
  headline: string;
  priorities: {
    client: ClientLink | null;
    reason: string;
    action: string;
    when: "today" | "this_week";
    priority: "critical" | "high" | "normal";
  }[];
  opportunities: { client: ClientLink | null; idea: string; why: string }[];
  team: string[];
}
