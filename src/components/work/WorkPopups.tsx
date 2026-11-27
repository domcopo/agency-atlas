// Work hub pop-ups' content (Phase 3, docs/WORK_HUB_PLAN.md). Moved here from the folded
// "More" area, unchanged in how they work:
// * Smart add: the same QuickAddWorkOrders (AI outline → editable draft cards → Confirm),
//   "Add without AI", the cost line, and the full by-hand form.
// * Suggestions: the free rule suggestions and the saved AI drafts in one list, each with
//   its reason and Approve / Edit / Dismiss. Nothing is created without Approve or Add.

import { Lightbulb, Sparkles } from "lucide-react";
import { WorkOrderDraftsButton } from "@/components/forms/AiButtons";
import { QuickAddWorkOrders } from "@/components/forms/QuickAddWorkOrders";
import { WorkOrderForm } from "@/components/forms/WorkOrderForm";
import { HubDialog } from "@/components/work/HubDialog";
import { SuggestionActions } from "@/components/work/SuggestionActions";
import { minutesLabel, type SuggestedWorkOrder } from "@/lib/ops";
import type { WorkOrderDraft } from "@/lib/types";
import { PRIORITY_WORD } from "@/lib/work-orders";

type Clients = { slug: string; name: string }[];
type Staff = { id: string; name: string }[];

export interface AiStatusLine {
  ready: boolean;
  budget: string;
}

export function SmartAddPopup({
  clients,
  staff,
  today,
  myStaffId,
  ai,
  cancelReady,
  ordersReady,
  defaultOpen,
}: {
  clients: Clients;
  staff: Staff;
  today: string;
  myStaffId: string | null;
  ai: AiStatusLine;
  cancelReady: boolean;
  ordersReady: boolean;
  defaultOpen: boolean;
}) {
  return (
    <HubDialog name="new" title="New work" subtitle="Type, talk, drop screenshots or a PDF · Cmd/Ctrl+K" defaultOpen={defaultOpen} shortcut fileDrop={ordersReady}>
      {ordersReady ? (
        <>
          <QuickAddWorkOrders
            clients={clients}
            staff={staff}
            today={today}
            myStaffId={myStaffId}
            disabled={!ai.ready || !cancelReady}
            disabledNote={!cancelReady ? "Turns on after one setup step (0013 SQL)." : !ai.ready ? "The AI isn't available right now (not set up, or this month's budget is used up). Use Add without AI." : undefined}
          />
          <p className="mt-2 px-1 text-xs text-muted">About 2–5 cents per request (5–10 with screenshots, 1–3 cents a page for a PDF); budget {ai.budget}.</p>
        </>
      ) : (
        <p className="text-sm text-muted">Smart add turns on after one setup step (0010 SQL). Use the full form below.</p>
      )}
      <details className="mt-4 rounded-2xl border border-line">
        <summary className="pressable flex min-h-11 cursor-pointer list-none items-center px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">Full form: client, steps, dates and the GoHighLevel link</summary>
        <div className="border-t border-line p-4">
          <WorkOrderForm clients={clients} staff={staff} today={today} />
        </div>
      </details>
    </HubDialog>
  );
}

const ruleLabel = { risk: "Client at risk", onboarding: "New client", routine: "Routine check" } as const;

function Card({ label, labelTone, d, children }: { label: string; labelTone: string; d: WorkOrderDraft; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-line bg-white/[0.03] p-4">
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelTone}`}>{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{d.title}</p>
      <p className="mt-0.5 text-xs text-muted">
        {d.clientName ?? "No client"} · {PRIORITY_WORD[d.priority] ?? d.priority} · {d.estMinutes ? `~${minutesLabel(d.estMinutes)}` : "no estimate"} ·{" "}
        {d.assigneeName ? <span className="text-ink">suggested: {d.assigneeName}{d.assigneeWhy ? ` (${d.assigneeWhy})` : ""}</span> : "no one suggested"}
      </p>
      <p className="mt-2 text-sm">
        <span className="font-semibold text-muted">Why: </span>
        {d.why}
      </p>
      {d.steps.length > 0 && (
        <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-muted">
          {d.steps.map((st, j) => (
            <li key={`${j}-${st}`}>{st}</li>
          ))}
        </ol>
      )}
      {children}
    </article>
  );
}

export function SuggestionsPopup({
  rules,
  drafts,
  clients,
  staff,
  today,
  ai,
  dismissReady,
  hiddenCount,
  isOwner,
  defaultOpen,
}: {
  rules: SuggestedWorkOrder[];
  /** The latest saved AI drafts not yet added or dismissed (null = none saved in 14 days). */
  drafts: { createdAt: string; headline: string; orders: WorkOrderDraft[] } | null;
  clients: Clients;
  staff: Staff;
  today: string;
  ai: AiStatusLine;
  /** 0038 has been run (Dismiss is saved). */
  dismissReady: boolean;
  /** How many were left out because they were dismissed. */
  hiddenCount: number;
  isOwner: boolean;
  defaultOpen: boolean;
}) {
  const total = rules.length + (drafts?.orders.length ?? 0);
  return (
    <HubDialog name="suggest" side title={`Suggestions (${total})`} subtitle="Check each one: Approve adds it as shown, Edit lets you change it first" defaultOpen={defaultOpen}>
      {!dismissReady && <p className="mb-3 rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-muted">Dismiss turns on after one setup step (0038 SQL).</p>}

      <section aria-labelledby="sugg-rules">
        <h3 id="sugg-rules" className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Lightbulb aria-hidden className="size-4 text-amber" /> From your records <span className="font-normal text-muted">· free, no AI</span>
        </h3>
        {rules.length ? (
          <div className="space-y-3">
            {rules.map((d) => (
              <Card key={`${d.clientSlug}-${d.rule}-${d.title}`} label={ruleLabel[d.rule]} labelTone="text-amber" d={d}>
                <SuggestionActions d={d} rule={d.rule} clients={clients} staff={staff} today={today} canDismiss={dismissReady} />
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-line px-4 py-3 text-sm text-muted">Nothing to suggest right now.</p>
        )}
        <p className="mt-2 px-1 text-xs text-muted">
          Simple rules: at-risk clients with no open work, new clients with no work orders yet, and clients with no work in 30 days. Developer work goes to whoever has the least open hours.
          {isOwner ? " Canceling an added one keeps it from coming straight back." : ""}
        </p>
      </section>

      <section aria-labelledby="sugg-ai" className="mt-6">
        <h3 id="sugg-ai" className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="size-4 text-violet" /> AI drafts {drafts && <span className="font-normal text-muted">· from {drafts.createdAt.slice(0, 10)}</span>}
        </h3>
        {drafts?.headline && <p className="mb-2 px-1 text-sm">{drafts.headline}</p>}
        <div className="space-y-3">
          {drafts?.orders.map((d, i) => (
            <Card key={`${i}-${d.title}`} label="AI suggestion" labelTone="text-violet" d={d}>
              <SuggestionActions d={d} rule="ai" clients={clients} staff={staff} today={today} canDismiss={dismissReady} />
            </Card>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-line p-3">
          <WorkOrderDraftsButton label={drafts ? "Draft again with AI" : "Draft work orders with AI"} disabled={!ai.ready} />
          <p className="mt-2 text-xs text-muted">
            Reads coded facts (no client or team names leave the app): risks, overdue items, contact times, workload. A few cents per draft; budget {ai.budget}. The AI can be wrong: check each one.
          </p>
        </div>
      </section>

      {hiddenCount > 0 && <p className="mt-4 px-1 text-xs text-faint">{hiddenCount} dismissed {hiddenCount === 1 ? "suggestion is" : "suggestions are"} hidden. They come back only if the reason changes.</p>}
    </HubDialog>
  );
}
