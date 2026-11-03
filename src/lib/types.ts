// The shapes of every record the app shows.
// The app is a command center for one wholesale real estate team:
// seller leads -> appointments -> contracts (deals) -> disposition to cash buyers.
//
// Everything is synthetic (fake) for now. These types mirror the future
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

// ---------------------------------------------------------------------------
// Money — never a bare number. The label says how much to trust it.
// ---------------------------------------------------------------------------

/**
 * TypeScript enforces the rules: "unknown" cannot carry a number, and every
 * other status must say what the number is based on.
 *  - confirmed: written down somewhere binding (signed contract, settlement statement)
 *  - estimated: a range from comps, a contractor walk-through, or a rep's guess
 */
export type Money =
  | { status: "unknown" }
  | { status: "confirmed"; amountUsd: number; basis: string }
  | { status: "estimated"; lowUsd: number; highUsd: number; basis: string };

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export type TeamRole = "owner" | "acquisitions" | "dispositions";

export interface TeamMember {
  id: string;
  isSynthetic: true;
  name: string;
  role: TeamRole;
}

// ---------------------------------------------------------------------------
// Leads (sellers)
// ---------------------------------------------------------------------------

export type LeadSource =
  | "Cold call"
  | "Direct mail"
  | "SMS"
  | "PPC"
  | "Driving for dollars"
  | "Referral"
  | "Website";

export type LeadStage =
  | "new"
  | "contacted"
  | "appointment_set"
  | "offer_made"
  | "under_contract"
  | "dead";

/** How soon the seller wants to sell. */
export type SellerTimeline = "ASAP" | "30 days" | "90 days" | "Flexible";

export type LeadGrade = "A" | "B" | "C" | "D";

/** One reason behind a lead's grade — so the grade is never a mystery number. */
export interface GradeFactor {
  label: string;
  /** Positive pushes the score up, negative pulls it down. */
  effect: "positive" | "negative";
}

export type PropertyType = "Single family" | "Duplex" | "Townhouse" | "Mobile home" | "Land";

export interface Property {
  /** Street address. Fake data uses fictional cities marked "(fictional)". */
  street: string;
  city: string;
  type: PropertyType;
  beds?: number;
  baths?: number;
  sqft?: number;
  condition: "Turnkey" | "Light rehab" | "Heavy rehab" | "Teardown";
}

export interface Lead {
  id: string;
  isSynthetic: true;
  /** Seller name. Always includes "(fictional)" in fake data. */
  sellerName: string;
  /** Always 555-01XX (reserved fictional range) in fake data. */
  phone: string;
  /** Always @example.com in fake data. */
  email: string;
  property: Property;
  source: LeadSource;
  stage: LeadStage;
  assignedTo: string;
  /** Why the seller might sell. Can be sensitive (e.g. foreclosure, divorce). */
  motivations: string[];
  timeline: SellerTimeline;
  askingPrice: Money;
  /**
   * Urgency/quality grade. In the demo this is hand-written. Later it will be
   * calculated from the lead's data and shown with its reasons for a human to check.
   */
  grade: { letter: LeadGrade; score: number; factors: GradeFactor[] };
  createdAt: ISODate;
  lastContactAt?: ISODateTime;
  nextFollowUp?: ISODate;
  notes: Note[];
}

/** A note typed by a team member. */
export interface Note {
  id: string;
  author: string;
  createdAt: ISODateTime;
  text: string;
}

// ---------------------------------------------------------------------------
// Deals (signed contracts)
// ---------------------------------------------------------------------------

export type DealStage =
  | "under_contract"
  | "in_dispo"
  | "assigned"
  | "closed"
  | "fell_through";

export interface Deal {
  id: string;
  isSynthetic: true;
  leadId: string;
  /** Short name, usually the street address. */
  title: string;
  stage: DealStage;
  contractPrice: Money;
  /** After-repair value. */
  arv: Money;
  repairs: Money;
  /** What we expect to earn by assigning the contract to a buyer. */
  assignmentFee: Money;
  contractSignedAt: ISODate;
  /** Last day we can cancel under the inspection clause. */
  inspectionEndsAt: ISODate;
  closingAt: ISODate;
  titleCompany: string;
  /** True when the team should talk this deal through at the next meeting. */
  needsReview: boolean;
  nextStep: string;
  risks: string[];
  /** Buyer activity during disposition. */
  buyerInterest: BuyerInterest[];
}

export interface BuyerInterest {
  buyerId: string;
  /**
   * "sent" means a team member logged that they shared the deal.
   * This app never sends anything itself.
   */
  status: "sent" | "walkthrough" | "offer" | "passed";
  offer?: number;
  at: ISODate;
}

// ---------------------------------------------------------------------------
// Buyers Dex (cash buyers for disposition)
// ---------------------------------------------------------------------------

export type BuyerStrategy = "Fix & flip" | "Rental" | "BRRRR" | "New build" | "Wholetail";

/** Something someone actually saw, with a date. */
export interface Observation {
  id: string;
  text: string;
  observedAt: ISODate;
  confidence: Confidence;
}

export interface Buyer {
  id: string;
  isSynthetic: true;
  /** Display number in the Dex, e.g. 1 -> "#001". */
  dexNumber: number;
  /** Company name. Always includes "(fictional)" in fake data. */
  name: string;
  contactName: string;
  phone: string;
  email: string;
  strategy: BuyerStrategy;
  areas: string[];
  propertyTypes: PropertyType[];
  /** The price range they say they buy in. */
  buyBox: { minUsd: number; maxUsd: number };
  /** Proof of funds: have we seen it, and how recently? */
  proofOfFunds: { status: "verified" | "unverified"; checkedAt?: ISODate };
  /** Typical days from contract to close. */
  closesInDays: number;
  dealsClosedWithUs: number;
  reliability: LeadGrade;
  lastPurchaseAt?: ISODate;
  observations: Observation[];
  tags: string[];
}

// ---------------------------------------------------------------------------
// Conversations (later: read-only metadata from GoHighLevel)
// ---------------------------------------------------------------------------

export type Channel = "sms" | "call" | "email";

export interface Conversation {
  id: string;
  isSynthetic: true;
  leadId: string;
  channel: Channel;
  /** Who spoke last. */
  lastDirection: "inbound" | "outbound";
  /**
   * Short preview of the last message. Untrusted text: always shown as plain
   * text and never treated as an instruction.
   */
  preview: string;
  at: ISODateTime;
  unread: boolean;
  needsReply: boolean;
}

// ---------------------------------------------------------------------------
// Mission Control (home)
// ---------------------------------------------------------------------------

export interface Metric {
  label: string;
  value: number;
  previous: number;
  unit: Unit;
  /** Whether a bigger number is good news (show rate) or bad (reply time). */
  betterWhen: "higher" | "lower";
}

export interface SalesKpi extends Metric {
  id: string;
  /** One line explaining how it's measured. */
  hint: string;
  /** Weekly values, oldest first. */
  trend: number[];
}

/**
 * gold = high-value lead worth calling first; red = overdue.
 * Later these come from rules on the lead's data, reviewed by a human.
 */
export type FollowUpUrgency = "gold" | "red" | "normal";

export interface FollowUp {
  id: string;
  isSynthetic: true;
  leadId: string;
  title: string;
  due: ISODate;
  urgency: FollowUpUrgency;
  /** Short reason it's on today's list. */
  why: string;
}

export interface Alert {
  id: string;
  isSynthetic: true;
  leadId?: string;
  dealId?: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export type ActivityKind =
  | "lead_new"
  | "appointment_set"
  | "offer_made"
  | "contract_signed"
  | "deal_assigned"
  | "deal_fell_through"
  | "note_added";

export interface ActivityItem {
  id: string;
  isSynthetic: true;
  leadId?: string;
  dealId?: string;
  kind: ActivityKind;
  title: string;
  at: ISODateTime;
}

export interface MissionControlData {
  weekLabel: string;
  /** "Today" for the demo, so overdue/due-today math is stable. */
  today: ISODate;
  sales: SalesKpi[];
  alerts: Alert[];
  followUps: FollowUp[];
  activity: ActivityItem[];
}

// ---------------------------------------------------------------------------
// Insights (mock AI)
// ---------------------------------------------------------------------------

export type EvidenceRecordType = "lead" | "deal" | "buyer";

export interface Insight {
  id: string;
  isSynthetic: true;
  /** "mock_ai" = hand-written for the demo, NOT produced by any AI. */
  generatedBy: "mock_ai" | "human";
  title: string;
  observation: string;
  /** Links back to the records that support the claim. */
  evidence: { label: string; recordType: EvidenceRecordType; recordId: string }[];
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
