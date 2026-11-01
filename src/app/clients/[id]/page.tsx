import {
  Ban,
  Flag,
  Layers,
  Lock,
  Mail,
  MessagesSquare,
  NotebookPen,
  Phone,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GlassCard } from "@/components/cards/GlassCard";
import { HealthRing, Sparkline, healthColor, healthLabel } from "@/components/labels/charts";
import { DeltaPill, EmptyState, Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getClient, getClients } from "@/lib/data-source";
import { formatDate, formatValue } from "@/lib/format";

type Props = { params: Promise<{ id: string }> };

// Pre-build a page for every demo client.
export function generateStaticParams() {
  return getClients().map((c) => ({ id: c.id }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: getClient(id)?.name ?? "Client" };
}

export default async function ClientProfilePage({ params }: Props) {
  const { id } = await params;
  const client = getClient(id);
  if (!client) notFound();

  return (
    <>
      <PageHeader title={client.name} subtitle={client.industry} backHref="/clients" backLabel="Clients" />

      <GlassCard className="flex items-center gap-5">
        <HealthRing score={client.health.score} status={client.health.status} size={88} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs text-muted">Client health</p>
          <p className="font-display text-xl font-bold">{healthLabel[client.health.status]}</p>
          <div className="flex items-center gap-2 text-[11px] text-faint">
            <Sparkline values={client.health.trend} color={healthColor[client.health.status]} width={90} height={24} />
            8-week trend
          </div>
        </div>
      </GlassCard>

      {client.dataSensitivity === "regulated" && (
        <div className="mt-3 flex gap-3 rounded-2xl border border-amber/35 bg-amber/8 p-3.5 text-sm">
          <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-amber" />
          <p>
            <span className="font-semibold">Regulated industry.</span>{" "}
            <span className="text-muted">
              Patient messages may contain protected health information. Legal and privacy review is
              required before any live data from this client is connected.
            </span>
          </p>
        </div>
      )}

      <SectionTitle aside="vs last month">Metrics</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {client.metrics.map((m) => (
          <GlassCard key={m.label} className="space-y-1.5">
            <p className="text-xs text-muted">{m.label}</p>
            <p className="font-display text-2xl font-bold tracking-tight">{formatValue(m.value, m.unit)}</p>
            <DeltaPill metric={m} />
          </GlassCard>
        ))}
      </div>

      <SectionTitle>What changed this week?</SectionTitle>
      <GlassCard>
        <ul className="space-y-2 text-sm">
          {client.whatChanged.map((w) => (
            <li key={w} className="flex gap-2">
              <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
              {w}
            </li>
          ))}
        </ul>
      </GlassCard>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GlassCard>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-teal">
            <Flag aria-hidden className="size-3.5" /> Goals
          </p>
          <ul className="space-y-1.5 text-sm">
            {client.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose">
            <Ban aria-hidden className="size-3.5" /> Blockers
          </p>
          <ul className="space-y-1.5 text-sm">
            {client.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </GlassCard>
      </div>

      <SectionTitle aside="Staff-entered">Notes</SectionTitle>
      {client.notes.length > 0 ? (
        <div className="space-y-2.5">
          {client.notes.map((n) => (
            <GlassCard key={n.id}>
              <p className="text-sm">{n.text}</p>
              <p className="mt-2 text-[11px] text-faint">
                {n.author} · {formatDate(n.createdAt)}
              </p>
            </GlassCard>
          ))}
        </div>
      ) : (
        <EmptyState icon={<NotebookPen className="size-5" />} title="No notes yet">
          Adding notes needs sign-in and a database, which arrive in Phase 2.
        </EmptyState>
      )}

      <SectionTitle>Conversations</SectionTitle>
      <EmptyState icon={<MessagesSquare className="size-5" />} title="Read-only viewer — coming later">
        In Phase 5, this shows message <em>metadata</em> first: time, channel, direction. It can
        never send, reply or schedule anything.
      </EmptyState>

      <SectionTitle>Primary contact</SectionTitle>
      <GlassCard className="space-y-2 text-sm">
        <p className="font-semibold">{client.primaryContact.name}</p>
        <p className="flex items-center gap-2 text-muted">
          <Mail aria-hidden className="size-4" /> {client.primaryContact.email}
        </p>
        <p className="flex items-center gap-2 text-muted">
          <Phone aria-hidden className="size-4" /> {client.primaryContact.phone}
        </p>
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-faint">
          <Lock aria-hidden className="size-3" /> Fictional contact. Shown as text only, never as a call or email link.
        </p>
      </GlassCard>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-faint">
        <span>Client since {formatDate(client.clientSince)}</span>
        <Link
          href={`/dex/${client.businessId}`}
          className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-white/5 px-3 font-semibold text-ink"
        >
          <Layers aria-hidden className="size-3.5 text-violet" /> Open Dex record
        </Link>
      </div>
      <div className="mt-3 px-1">
        <Pill color="amber">MOCK DATA</Pill>
      </div>
    </>
  );
}
