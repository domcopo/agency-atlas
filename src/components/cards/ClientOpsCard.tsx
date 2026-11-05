// Top of a client's page: "What is happening with this client, and what happens next?"

import { UserRound } from "lucide-react";
import Link from "next/link";
import { setClientOwner } from "@/app/actions";
import { healthTone } from "@/components/cards/ActionRow";
import { formatDate } from "@/lib/format";
import { dueLabel } from "@/lib/ops";
import type { ClientAction, GhlContactTimes, HealthSummary } from "@/lib/types";
import { cn } from "@/lib/format";

export function ClientOpsCard({
  clientDbId,
  slug,
  health,
  ownerId,
  ownerName,
  lastContact,
  next,
  openIssues,
  staff,
  canSetOwner,
  ready,
  today,
  ghl,
  plan,
}: {
  clientDbId?: string;
  slug: string;
  health: HealthSummary | null;
  ownerId?: string;
  ownerName?: string;
  lastContact?: string;
  next: ClientAction | null;
  openIssues: number;
  staff: { id: string; name: string }[];
  canSetOwner: boolean;
  ready: boolean;
  today: string;
  /** Call/message times from GoHighLevel (no message text). */
  ghl?: GhlContactTimes;
  /** "SEO + Google Ads · $750/mo" */
  plan?: string;
}) {
  const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10)) : "none");
  const tone = health ? healthTone[health.state] : null;
  return (
    <section aria-label="What's happening" className="glass space-y-3 rounded-3xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {tone ? (
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", tone.pill)}>{tone.label}</span>
        ) : (
          <span className="text-xs text-faint">Past client</span>
        )}
        {canSetOwner && clientDbId && ready ? (
          <form action={setClientOwner} className="flex items-center gap-1.5">
            <input type="hidden" name="clientId" value={clientDbId} />
            <input type="hidden" name="slug" value={slug} />
            <UserRound aria-hidden className="size-4 text-faint" />
            <select
              name="ownerId"
              defaultValue={ownerId ?? ""}
              aria-label="Client owner"
              className={cn("min-h-10 rounded-xl border bg-white/5 px-2 text-sm", ownerId ? "border-line text-ink" : "border-amber/50 text-amber")}
            >
              <option value="">No owner</option>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button type="submit" className="pressable min-h-10 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold">
              Save
            </button>
          </form>
        ) : (
          <span className="flex items-center gap-1 text-sm">
            <UserRound aria-hidden className="size-4 text-faint" />
            {ownerName ?? <span className="text-amber">No owner</span>}
          </span>
        )}
      </div>

      {plan && <p className="text-sm font-semibold">{plan}</p>}

      {health && health.reasons.length > 0 && health.state !== "healthy" && (
        <ul className="space-y-0.5 text-xs text-muted">
          {health.reasons.slice(0, 3).map((r) => (
            <li key={r}>• {r}</li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-xs text-muted">Last contact</dt>
          <dd className={lastContact ? "font-semibold" : "text-amber"}>{lastContact ? formatDate(lastContact) : "None logged"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Open issues</dt>
          <dd className={openIssues ? "font-semibold text-amber" : "font-semibold"}>{openIssues}</dd>
        </div>
        {ghl && (
          <div className="col-span-2 text-xs">
            <dt className="text-muted">From GoHighLevel (times only)</dt>
            <dd className="mt-0.5 space-y-0.5">
              <p>
                Client reached out: <span className="font-semibold">{day(ghl.lastInboundAt)}</span> · We reached out:{" "}
                <span className="font-semibold">{day(ghl.lastOutboundAt)}</span>
              </p>
              {ghl.lastCallAt && (
                <p>
                  Last call: <span className="font-semibold">{day(ghl.lastCallAt)}</span>
                  {ghl.lastCallSeconds ? ` · ${Math.max(1, Math.round(ghl.lastCallSeconds / 60))} min` : ""}
                </p>
              )}
              {ghl.unansweredOutbound >= 3 && <p className="text-amber">{ghl.unansweredOutbound} of our messages in a row have no reply</p>}
            </dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className="text-xs text-muted">Next action</dt>
          {next ? (
            <dd>
              <span className="font-semibold">{next.title}</span>
              <span className={cn("ml-1.5 text-xs", next.dueOn && next.dueOn <= today ? "font-semibold text-amber" : "text-muted")}>
                {dueLabel(next.dueOn, today)}
                {next.ownerName ? ` · ${next.ownerName}` : " · no owner"}
              </span>
            </dd>
          ) : (
            <dd>
              <Link href="#next" className="text-amber underline-offset-2 hover:underline">
                {ready ? "None yet: add one below" : "Available after one setup step (0006 SQL)"}
              </Link>
            </dd>
          )}
        </div>
      </dl>
    </section>
  );
}
