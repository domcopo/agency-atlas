// One lead from the sales pipelines (SALES_SIMPLIFY_PLAN, 2026-11-17): the facts copied from
// GoHighLevel, big reach-out buttons, this lead's follow-ups, and recent reach-outs.
// Read through getSales(), as the signed-in person: the database decides which leads come
// back (salespeople: open leads in the sales pipelines only), so anything else is
// "not found". Every button posts to an existing server action. GoHighLevel is never changed.

import { FileSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriorityList } from "@/components/cards/ActionRow";
import { LeadActionForm } from "@/components/forms/LeadActionForm";
import { Pill } from "@/components/labels/labels";
import { ago } from "@/components/sales/LeadRow";
import { SalesFollowUps } from "@/components/sales/SalesFollowUps";
import { TouchButtons } from "@/components/sales/TouchButtons";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getOps, getSales, getTeam, usesDatabase } from "@/lib/data-source";
import { formatUsdExact } from "@/lib/format";
import { isLead } from "@/lib/roles";
import { isHot, leadDetail, nyDay, touchLabel } from "@/lib/sales";

export const metadata: Metadata = { title: "Lead" };

/** GoHighLevel ids are short letters and digits; anything else is never looked up. */
const LEAD_ID = /^[A-Za-z0-9_-]{1,64}$/;

const STATUS_LABEL = { won: "Won", lost: "Lost", abandoned: "Abandoned" } as const;

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  // Real leads only exist with the database; the fictional samples live at /sales/[id].
  if (!usesDatabase()) notFound();
  const me = await getMember();
  if (!me || (!isLead(me.role) && me.role !== "sales")) return <RoleNotice title="Sales" />;
  const id = decodeURIComponent((await params).id);
  if (!LEAD_ID.test(id)) notFound();
  const sales = await getSales();
  const d = leadDetail({ id, leads: sales.leads, followUps: sales.followUps, touches: sales.touches });
  if (!d) notFound();
  const { lead } = d;
  const today = nyDay(new Date().toISOString());
  const manage = isLead(me.role);
  // Owner and managers: the same follow-up rows as the Sales tab (Done · Reschedule · Assign · Edit).
  const [ops, team] = manage ? await Promise.all([getOps(), getTeam()]) : [null, null];
  const staff = team ? team.members.map((m) => ({ id: m.id, name: m.name })) : [];
  const leadItems = ops ? ops.priorities.filter((p) => p.action?.leadGhlId === lead.ghlId) : [];
  const owner = lead.assignedUserId ? (sales.users.get(lead.assignedUserId) ?? "someone in GoHighLevel") : null;
  const people = new Map(sales.people.map((p) => [p.userId, p.name]));
  const who = (by: string) => (by === me.userId ? "you" : (people.get(by) ?? null));

  const facts: [string, string][] = [
    ["Stage", lead.stage ?? "No stage"],
    ["Value", lead.value ? formatUsdExact(lead.value) : "Not set"],
    ["Source", lead.source ?? "Unknown"],
    ["Added", lead.createdAt ? ago(lead.createdAt, today) : "Unknown"],
    ["Assigned to", owner ?? "Unassigned"],
  ];

  return (
    <>
      <PageHeader title={lead.name} subtitle={lead.pipelineName ?? "Sales lead"} backHref="/sales" backLabel="Sales" />

      <div className="glass rounded-3xl p-4">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {isHot(lead, sales.pipelines) && <Pill color="amber">Hot stage</Pill>}
          {lead.status !== "open" && <Pill color={lead.status === "won" ? "lime" : "rose"}>{STATUS_LABEL[lead.status]}</Pill>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-line pt-2 text-[11px] text-faint">Copied read-only from GoHighLevel. Call and text there; Atlas never contacts anyone or changes GoHighLevel.</p>
      </div>

      {lead.status === "open" && (
        <>
          <SectionTitle>Log a reach-out</SectionTitle>
          <div className="glass rounded-3xl p-4">
            <TouchButtons leadId={lead.ghlId} size="big" />
          </div>
        </>
      )}

      {lead.status === "open" && (
        <Link href={`/sales/audits/new?lead=${encodeURIComponent(lead.ghlId)}`} className="pressable glass mt-2.5 flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-violet">
          <FileSearch aria-hidden className="size-4" /> Audit this lead
        </Link>
      )}

      <SectionTitle aside={`${d.followUps.length} open`}>Follow-ups</SectionTitle>
      {manage ? (
        <PriorityList items={leadItems} staff={staff} canEdit limit={10} empty="No follow-ups on this lead yet." />
      ) : (
        <SalesFollowUps items={d.followUps} leadNames={new Map([[lead.ghlId, lead.name]])} today={today} empty="No follow-ups on this lead yet." />
      )}
      <details className="glass mt-2.5 rounded-3xl px-4 py-1" open={d.followUps.length === 0}>
        <summary className="pressable flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-violet">+ Add a follow-up</summary>
        <div className="pb-3">
          <LeadActionForm deals={[]} fixedLeadId={lead.ghlId} staff={staff} today={today} />
        </div>
      </details>

      <SectionTitle aside="Last 30 days">Reach-outs</SectionTitle>
      {d.touches.length ? (
        <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
          {d.touches.map((t, i) => {
            const by = who(t.by);
            return (
              <li key={`${t.at}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-semibold">{touchLabel(t.kind)}</span>
                <span className="text-xs text-muted">
                  {ago(t.at, today)}
                  {by ? ` · ${by}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No reach-outs logged yet.</p>
      )}
    </>
  );
}
