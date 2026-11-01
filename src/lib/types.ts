// The shapes of every record the app shows.
// In Phase 1 every record is synthetic (fake). These types mirror the future
// database tables described in DATA_DICTIONARY.md, so swapping fake data for
// real data later should not change the screens.

/** A calendar date like "2026-10-28". */
export type ISODate = string;
/** A date and time like "2026-10-28T14:30:00Z". */
export type ISODateTime = string;

export type Confidence = "high" | "medium" | "low";
export type Unit = "percent" | "count" | "minutes" | "usd";

/** Where the app's data currently comes from. */
export type DataMode = "mock" | "live_read_only";

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
  isClient: boolean;
  /** Set only when isClient is true. */
  clientId?: string;
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
// Clients
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

export interface Client {
  id: string;
  isSynthetic: true;
  businessId: string;
  name: string;
  industry: Industry;
  /**
   * "regulated" = industries (e.g. dental/medical) whose customer messages
   * may contain protected health info. Needs extra legal review before
   * any live data is connected.
   */
  dataSensitivity: "standard" | "regulated";
  primaryContact: {
    name: string;
    /** Always @example.com in fake data. */
    email: string;
    /** Always 555-01XX (reserved fictional range) in fake data. */
    phone: string;
  };
  clientSince: ISODate;
  health: {
    /** 0–100 */
    score: number;
    status: HealthStatus;
    /** Weekly scores, oldest first. */
    trend: number[];
  };
  metrics: Metric[];
  goals: string[];
  blockers: string[];
  whatChanged: string[];
  notes: Note[];
}

// ---------------------------------------------------------------------------
// Mission Control
// ---------------------------------------------------------------------------

export interface AgencyKpi extends Metric {
  id: string;
  /** Weekly values, oldest first. */
  trend: number[];
}

export interface FollowUp {
  id: string;
  isSynthetic: true;
  clientId: string;
  title: string;
  due: ISODate;
  priority: "high" | "medium" | "low";
}

export interface Alert {
  id: string;
  isSynthetic: true;
  clientId?: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
}

export type ActivityKind =
  | "appointment_booked"
  | "deal_won"
  | "deal_lost"
  | "lead_new"
  | "no_show"
  | "note_added";

export interface ActivityItem {
  id: string;
  isSynthetic: true;
  clientId?: string;
  kind: ActivityKind;
  title: string;
  at: ISODateTime;
}

export interface MissionControlData {
  weekLabel: string;
  kpis: AgencyKpi[];
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
  evidence: { label: string; recordType: "client" | "business"; recordId: string }[];
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
