// Growth Lab content.
// - Survey questions: real content (questions you can ask businesses).
// - Trends, monthly histories and survey answers: SAMPLE, about the fictional
//   Business Dex records. Real case studies need the business's consent first.

import type { MonthlyPoint, SurveyQuestion, SurveyResponse, Trend } from "@/lib/types";

const MONTHS = [
  "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04",
  "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
];

/** Simple, repeatable sample history: a start level, monthly growth and a seasonal bump. */
function history(startLeads: number, growth: number, peakMonth: number, bookRate: number): MonthlyPoint[] {
  const raw = MONTHS.map((month, i) => {
    const seasonal = 1 + 0.25 * Math.cos(((i - peakMonth) / 12) * 2 * Math.PI);
    const leads = Math.round(startLeads * Math.pow(1 + growth, i) * seasonal);
    return { month, leads, bookedCalls: Math.round(leads * bookRate), rev: Math.pow(1 + growth * 0.8, i) * (0.9 + 0.1 * seasonal) };
  });
  const base = raw[0]?.rev ?? 1;
  // Revenue as an index: the first month is exactly 100.
  return raw.map(({ rev, ...p }) => ({ ...p, revenueIndex: Math.round((rev / base) * 100) }));
}

export const caseStudyHistory: Record<string, MonthlyPoint[]> = {
  biz_001: history(55, 0.01, 8, 0.42),
  biz_002: history(70, 0.06, 7, 0.38),
  biz_003: history(30, 0.02, 5, 0.3),
  biz_004: history(40, 0.04, 0, 0.35),
  biz_005: history(80, 0.05, 6, 0.4),
  biz_006: history(20, 0.03, 2, 0.5),
  biz_007: history(35, 0.0, 11, 0.25),
  biz_008: history(45, 0.04, 5, 0.33),
  biz_009: history(25, 0.03, 8, 0.45),
  biz_010: history(30, 0.05, 6, 0.28),
};

export const trends: Trend[] = [
  {
    id: "tr_speed",
    isSynthetic: true,
    title: "Fast replies grow faster",
    finding: "The four fastest-growing businesses answer new leads in under 15 minutes. The slowest grower takes hours on weekends.",
    businessIds: ["biz_002", "biz_005", "biz_006", "biz_003"],
    confidence: "medium",
    caveat: "Correlation, not proof. Fast responders may also have bigger teams.",
  },
  {
    id: "tr_membership",
    isSynthetic: true,
    title: "Memberships smooth out slow months",
    finding: "Businesses with monthly plans (yoga, HVAC, auto detail) dip less in their off-season.",
    businessIds: ["biz_004", "biz_005", "biz_008"],
    confidence: "medium",
    caveat: "Three businesses only; revenue figures are estimates.",
  },
  {
    id: "tr_reviews",
    isSynthetic: true,
    title: "Review volume tracks booked calls",
    finding: "Businesses that ask every customer for a review book more calls from Google each month.",
    businessIds: ["biz_001", "biz_004", "biz_007"],
    confidence: "low",
    caveat: "Review counts are public numbers; booking data is sample data.",
  },
  {
    id: "tr_season",
    isSynthetic: true,
    title: "Seasonal businesses need to start ads early",
    finding: "Roofing, HVAC and tutoring leads peak in different months. The ones that launched ads 4–6 weeks before the peak grew most.",
    businessIds: ["biz_002", "biz_005", "biz_009"],
    confidence: "low",
    caveat: "Timing of ad launches is self-reported.",
  },
];

export const surveyQuestions: SurveyQuestion[] = [
  { id: "q01", topic: "Getting customers", question: "Where did your last 10 customers find you?", why: "Shows which channels actually bring paying customers.", answerType: "multiple choice", options: ["Google", "Facebook/Instagram", "Referral", "Repeat customer", "Other"] },
  { id: "q02", topic: "Getting customers", question: "About how many new inquiries do you get in a normal week?", why: "Gives a baseline to measure growth against.", answerType: "number" },
  { id: "q03", topic: "Getting customers", question: "Which month is your busiest, and which is your slowest?", why: "Tells us when to start ads before the busy season.", answerType: "short text" },
  { id: "q04", topic: "Sales process", question: "How fast do you usually reply to a new inquiry?", why: "Reply speed is one of the strongest growth patterns we track.", answerType: "multiple choice", options: ["Under 5 min", "Under 1 hour", "Same day", "Next day or later"] },
  { id: "q05", topic: "Sales process", question: "Out of 10 people who ask for a quote, how many buy?", why: "Close rate shows whether the problem is leads or sales.", answerType: "number" },
  { id: "q06", topic: "Sales process", question: "Who answers calls and messages, and when?", why: "Finds coverage gaps (evenings, weekends) that lose leads.", answerType: "short text" },
  { id: "q07", topic: "Pricing & offers", question: "What does an average customer spend with you in a year?", why: "Helps decide how much it's worth paying to get one customer.", answerType: "number" },
  { id: "q08", topic: "Pricing & offers", question: "Do you offer a membership, plan or package?", why: "Recurring plans steady revenue in slow months.", answerType: "multiple choice", options: ["Yes", "No", "Thinking about it"] },
  { id: "q09", topic: "Pricing & offers", question: "What's your best-selling offer right now?", why: "Our ads and pages should lead with what already sells.", answerType: "short text" },
  { id: "q10", topic: "Keeping customers", question: "How many customers come back or buy again?", why: "Repeat business is cheaper growth than new leads.", answerType: "multiple choice", options: ["Most", "About half", "A few", "Almost none"] },
  { id: "q11", topic: "Keeping customers", question: "Do you ask every customer for a review?", why: "Review volume tracks with booked calls in our data.", answerType: "multiple choice", options: ["Always", "Sometimes", "Never"] },
  { id: "q12", topic: "Keeping customers", question: "What's the most common complaint you hear?", why: "Fixing it can matter more than more marketing.", answerType: "short text" },
  { id: "q13", topic: "Operations", question: "If leads doubled next month, could you handle them?", why: "Stops us from growing leads faster than the business can serve.", answerType: "1–5 scale" },
  { id: "q14", topic: "Operations", question: "What tool do you use to track customers (CRM, notebook, nothing)?", why: "Shows how much we can measure and automate.", answerType: "short text" },
  { id: "q15", topic: "Operations", question: "What slows you down most each week?", why: "Points to quick wins beyond marketing.", answerType: "short text" },
  { id: "q16", topic: "Goals", question: "What would make the next 12 months a great year?", why: "Sets the goal we report against.", answerType: "short text" },
  { id: "q17", topic: "Goals", question: "How many new customers a month would you like?", why: "Turns the goal into a number we can track.", answerType: "number" },
  { id: "q18", topic: "Goals", question: "How confident are you about next year's growth?", why: "Tracks owner confidence over time alongside the numbers.", answerType: "1–5 scale" },
  { id: "q19", topic: "Getting customers", question: "Have you tried paid ads before? What happened?", why: "Avoids repeating what already failed.", answerType: "short text" },
  { id: "q20", topic: "Goals", question: "May we use your anonymized numbers to learn what helps businesses grow?", why: "Consent: we only include businesses that say yes.", answerType: "multiple choice", options: ["Yes", "Yes, but keep my name out", "No"] },
];

export const surveyResponses: SurveyResponse[] = [
  { id: "sr_01", isSynthetic: true, businessId: "biz_002", questionId: "q04", answer: "Under 5 min", answeredAt: "2026-09-12" },
  { id: "sr_02", isSynthetic: true, businessId: "biz_002", questionId: "q03", answer: "Busiest after spring storms; slowest in January.", answeredAt: "2026-09-12" },
  { id: "sr_03", isSynthetic: true, businessId: "biz_003", questionId: "q04", answer: "Next day or later", answeredAt: "2026-09-14" },
  { id: "sr_04", isSynthetic: true, businessId: "biz_003", questionId: "q06", answer: "Just me. Nobody covers weekends.", answeredAt: "2026-09-14" },
  { id: "sr_05", isSynthetic: true, businessId: "biz_001", questionId: "q11", answer: "Always", answeredAt: "2026-09-20" },
  { id: "sr_06", isSynthetic: true, businessId: "biz_004", questionId: "q08", answer: "Yes", answeredAt: "2026-10-02" },
  { id: "sr_07", isSynthetic: true, businessId: "biz_005", questionId: "q08", answer: "Yes", answeredAt: "2026-10-03" },
  { id: "sr_08", isSynthetic: true, businessId: "biz_002", questionId: "q20", answer: "Yes, but keep my name out", answeredAt: "2026-09-12" },
  { id: "sr_09", isSynthetic: true, businessId: "biz_001", questionId: "q20", answer: "Yes", answeredAt: "2026-09-20" },
];
