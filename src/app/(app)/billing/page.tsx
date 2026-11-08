import { AlertTriangle, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BillingChip } from "@/components/cards/BillingChip";
import { MatchBillingForm, RefreshBillingButton } from "@/components/forms/BillingForms";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { BILLING_RULES, stateNote, suggestBillingMatch } from "@/lib/billing";
import { getBilling, getRoster } from "@/lib/data-source";
import { formatUsdExact } from "@/lib/format";

export const metadata: Metadata = { title: "Billing" };

const money = (v: number | null) => (v === null ? "Unknown" : formatUsdExact(v));
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Tile({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`font-display text-xl font-bold ${value === "Unknown" ? "text-faint" : (tone ?? "")}`}>{value}</p>
      {sub && <p className="text-[10px] text-faint">{sub}</p>}
    </div>
  );
}

export default async function BillingPage() {
  const billing = await getBilling();
  if (!billing) {
    // Owner only. Everyone else gets nothing from the database too (row-level security).
    return (
      <>
        <PageHeader title="Billing" />
        <div className="glass flex gap-3 rounded-3xl p-4 text-sm">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
          <p className="text-muted">Billing is visible to the owner only.</p>
        </div>
      </>
    );
  }
  const { state, totals, plan } = billing;
  const clients = (await getRoster()).filter((c) => c.dbId && c.status !== "incomplete_expired").map((c) => ({ slug: c.id, name: c.name }));
  const chips = [...billing.byClient.entries()].filter(([, b]) => b.chip && b.chip !== "paid");
  const nameOf = new Map(clients.map((c) => [c.slug, c.name]));
  // Exact, unique name matches are offered first; the owner still confirms each one.
  const unmatched = billing.unmatched
    .map((u) => ({ ...u, suggested: u.contactId ? suggestBillingMatch(u.label, clients) : null }))
    .sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  const suggestedCount = unmatched.filter((u) => u.suggested).length;

  return (
    <>
      <PageHeader title="Billing" subtitle="Owner only · read-only from GoHighLevel" />

      <p className={`mb-3 rounded-2xl border px-3 py-2 text-xs ${state.known ? "border-line text-muted" : "border-amber/40 bg-amber/5 text-amber"}`}>
        {stateNote(state)}
        {state.asOf ? ` · as of ${when(state.asOf)}` : ""}
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <Tile label="Collected this month" value={money(totals.collectedThisMonthUsd)} tone="text-lime" />
        <Tile label="Still open" value={money(totals.openUsd)} />
        <Tile
          label="Overdue"
          value={money(totals.overdueUsd)}
          tone={totals.overdueUsd ? "text-rose" : ""}
          sub={totals.overdueCount === null ? undefined : `${totals.overdueCount} invoice${totals.overdueCount === 1 ? "" : "s"}`}
        />
        <Tile label="Failed payments this month" value={totals.failedThisMonth === null ? "Unknown" : String(totals.failedThisMonth)} tone={totals.failedThisMonth ? "text-rose" : ""} />
      </div>

      <SectionTitle>Plan vs collected</SectionTitle>
      <div className="glass space-y-1 rounded-3xl p-4 text-sm">
        <p className="flex justify-between gap-2">
          <span className="text-muted">Plan MRR (your client list, not payments)</span>
          <span className="font-semibold">{formatUsdExact(plan.plan)}</span>
        </p>
        <p className="flex justify-between gap-2">
          <span className="text-muted">Collected this month</span>
          <span className="font-semibold">{money(plan.collected)}</span>
        </p>
        <p className="flex justify-between gap-2 border-t border-line pt-1">
          <span className="text-muted">Gap</span>
          <span className={`font-semibold ${plan.gap && plan.gap > 0 ? "text-amber" : ""}`}>{money(plan.gap)}</span>
        </p>
        <p className="text-[11px] text-faint">Early in the month the gap is naturally large: invoices may not be due yet.</p>
      </div>

      {billing.alerts.length > 0 && (
        <>
          <SectionTitle>Needs attention</SectionTitle>
          <ul className="space-y-2">
            {billing.alerts.map((a) => (
              <li key={a.clientDbId}>
                <Link href={`/clients/${a.slug}`} className={`pressable flex gap-2 rounded-2xl border p-3 text-sm ${a.severity === "urgent" ? "border-rose/50 bg-rose/10" : "border-amber/40 bg-amber/5"}`}>
                  <AlertTriangle aria-hidden className={`mt-0.5 size-4 shrink-0 ${a.severity === "urgent" ? "text-rose" : "text-amber"}`} />
                  <span>
                    <span className="font-semibold">{a.name}</span> <span className="text-muted">{a.problem}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-1 text-[11px] text-faint">
            Urgent: over {BILLING_RULES.urgentOverdueDays} days late or a failed payment. Only you see this; Atlas never contacts the client.
          </p>
        </>
      )}

      {chips.length > 0 && (
        <>
          <SectionTitle>Clients by payment status</SectionTitle>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {chips.map(([slug, b]) => (
              <li key={slug}>
                <Link href={`/clients/${slug}`} className="pressable flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{nameOf.get(slug) ?? slug}</span>
                    {b.detail && <span className="block text-[11px] text-muted">{b.detail}</span>}
                  </span>
                  {b.chip && <BillingChip chip={b.chip} />}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Unmatched {unmatched.length ? `(${unmatched.length})` : ""}</SectionTitle>
      {suggestedCount > 0 && (
        <p className="mb-2 px-1 text-xs text-muted">
          <span className="font-semibold text-violet">{suggestedCount} have the exact same name as one of your clients.</span> Check each and tap &ldquo;Yes, that&apos;s them&rdquo;.
        </p>
      )}
      {unmatched.length ? (
        <ul className="space-y-2">
          {unmatched.map((u, i) => (
            <li key={u.contactId ?? `none-${i}`} className="glass rounded-2xl p-3 text-sm">
              <p>
                <span className="font-semibold">{u.label ?? "No name on it"}</span>{" "}
                <span className="text-muted">
                  · {u.count} record{u.count === 1 ? "" : "s"} · {formatUsdExact(u.amountUsd)}
                </span>
              </p>
              {u.contactId ? (
                <MatchBillingForm contactId={u.contactId} clients={clients} suggested={u.suggested} />
              ) : (
                <p className="mt-1 text-[11px] text-faint">GoHighLevel didn&apos;t say which contact this is, so it can&apos;t be matched here.</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="glass rounded-2xl px-4 py-3 text-sm text-muted">{state.known ? "Everything is matched to a client." : "Nothing to match yet."}</p>
      )}
      <p className="mt-1 px-1 text-[11px] text-faint">Atlas never matches on its own: suggestions appear only when the name is exactly the same as one client&apos;s, and you confirm each. Once matched, the name on the invoice is cleared.</p>

      <div className="mt-4">
        <RefreshBillingButton disabled={!billing.configured || !billing.tablesReady} />
        <p className="mt-1 px-1 text-[11px] text-faint">
          Reads invoices and payments only. Atlas never creates, changes, voids or sends invoices, never charges or refunds, and never sends reminders. At most every {BILLING_RULES.refreshEveryMinutes} minutes.
        </p>
      </div>

      <div className="mt-4">
        <Fold label="Refresh history" title="Refresh history" summary={billing.syncs[0] ? `Last: ${when(billing.syncs[0].startedAt)}` : "No refreshes yet"}>
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl text-xs">
            {billing.syncs.map((s) => (
              <li key={s.startedAt} className="flex justify-between gap-2 px-4 py-2">
                <span>{when(s.startedAt)}</span>
                <span className={s.ok ? "text-lime" : s.ok === false ? "text-rose" : "text-faint"}>
                  {s.ok ? `${(s.invoicesRead ?? 0) + (s.paymentsRead ?? 0)} read · ${s.unmatched ?? 0} unmatched` : s.ok === false ? `Failed (${s.errorCode ?? "?"})` : "Running or stopped"}
                </span>
              </li>
            ))}
            {billing.syncs.length === 0 && <li className="px-4 py-2 text-muted">No refreshes yet.</li>}
          </ul>
        </Fold>
      </div>
    </>
  );
}
