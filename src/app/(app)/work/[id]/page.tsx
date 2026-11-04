import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { priorityStyle, statusStyle } from "@/components/cards/WorkOrderCard";
import { Pill, Provenance } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getSampleDevelopers, getToday, getWorkOrder, getWorkOrders } from "@/lib/data-source";
import { describeDue, formatDate } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return getWorkOrders().map((w) => ({ id: w.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: getWorkOrder(id)?.title ?? "Work order" };
}

export default async function WorkOrderPage({ params }: Props) {
  const { id } = await params;
  const w = getWorkOrder(id);
  if (!w) notFound();
  const today = getToday();
  const dev = getSampleDevelopers().find((d) => d.id === w.assignee);
  const doneCount = w.checklist.filter((c) => c.done).length;

  const rows = [
    { label: "Client", value: w.clientLabel },
    { label: "Service", value: w.service },
    { label: "Assigned to", value: dev?.name ?? "Unassigned" },
    { label: "Requested by", value: w.requestedByClient ? "Client" : "Our team" },
    { label: "Created", value: formatDate(w.createdAt) },
    { label: "Due", value: w.status === "done" ? formatDate(w.due) : `${formatDate(w.due)} (${describeDue(w.due, today)})` },
    { label: "Last touched", value: w.lastTouched < today && w.status !== "done" ? `${formatDate(w.lastTouched)} · not today` : formatDate(w.lastTouched) },
  ];

  return (
    <>
      <PageHeader title={w.title} backHref="/work" backLabel="Work" action={<Provenance kind="sample" />} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Pill color={priorityStyle[w.priority].color}>{priorityStyle[w.priority].label} priority</Pill>
        <Pill color={statusStyle[w.status].color}>{statusStyle[w.status].label}</Pill>
      </div>

      <GlassCard>
        <dl className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-3 py-2.5 text-sm">
              <dt className="text-muted">{r.label}</dt>
              <dd className="text-right">{r.value}</dd>
            </div>
          ))}
        </dl>
      </GlassCard>

      <SectionTitle aside={`${doneCount} of ${w.checklist.length}`}>Checklist</SectionTitle>
      <GlassCard padding="none">
        <ul className="divide-y divide-line">
          {w.checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3 text-sm">
              {c.done ? (
                <CheckCircle2 aria-label="Done" className="size-5 shrink-0 text-lime" />
              ) : (
                <Circle aria-label="Not done" className="size-5 shrink-0 text-faint" />
              )}
              <span className={c.done ? "text-muted line-through" : undefined}>{c.label}</span>
            </li>
          ))}
        </ul>
      </GlassCard>
      <p className="mt-3 px-1 text-[11px] text-faint">
        View only. Work orders are updated in GoHighLevel; this app never changes them.
      </p>
    </>
  );
}
