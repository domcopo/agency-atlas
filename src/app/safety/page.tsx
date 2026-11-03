import {
  CheckCircle2,
  Circle,
  CloudOff,
  Database,
  Lock,
  Power,
  ShieldCheck,
  ShieldX,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { DataModeBadge, Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getSafetyStatus } from "@/lib/data-source";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "Data Safety" };

const connectionIcon = {
  conn_supabase: Database,
  conn_ghl_api: CloudOff,
  conn_ghl_webhooks: Webhook,
} as Record<string, typeof Database>;

export default function SafetyPage() {
  const s = getSafetyStatus();
  const doneCount = s.checklist.filter((c) => c.done).length;

  return (
    <>
      <PageHeader title="Data Safety" subtitle="What this app can see, keep and touch." />

      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Data mode</p>
          <DataModeBadge mode={s.dataMode} />
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-lime/30 bg-lime/8 p-3.5">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-lime" />
          <div className="text-sm">
            <p className="font-semibold">GoHighLevel is read-only. Permanently.</p>
            <p className="mt-0.5 text-muted">
              This app has no code, keys or permissions that could create, edit, delete, send or
              schedule anything in GoHighLevel.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Places this app can write to in GHL</span>
          <span className="font-display text-lg font-bold text-lime">{s.ghlWriteTargets.length}</span>
        </div>
      </GlassCard>

      <SectionTitle>Source connections</SectionTitle>
      <div className="space-y-2.5">
        {s.connections.map((c) => {
          const Icon = connectionIcon[c.id] ?? Database;
          return (
            <GlassCard key={c.id} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  <Pill>Not connected</Pill>
                </div>
                <p className="mt-1 text-xs text-muted">{c.note}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  Planned for Phase {c.plannedPhase} · Scopes: {c.scopes.length ? c.scopes.join(", ") : "none"}
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <SectionTitle>Access restrictions</SectionTitle>
      <GlassCard className="space-y-2.5 text-sm">
        <p className="flex gap-2">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          <span>
            <span className="font-semibold">Runs on this computer only.</span>{" "}
            <span className="text-muted">No sign-in yet because there is no real data to protect.</span>
          </span>
        </p>
        <p className="flex gap-2">
          <ShieldX aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          <span className="text-muted">
            Phase 2 adds staff sign-in with MFA and per-client rules enforced by the database, not the screen.
          </span>
        </p>
      </GlassCard>

      <SectionTitle>Retention plan</SectionTitle>
      <GlassCard padding="none">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">How long each kind of data will be kept</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-faint">
              <th scope="col" className="px-4 pb-2 pt-3.5 font-semibold">Data</th>
              <th scope="col" className="px-4 pb-2 pt-3.5 font-semibold">Keep for</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.retention.map((r) => (
              <tr key={r.dataClass}>
                <td className="px-4 py-2.5 font-medium">{r.dataClass}</td>
                <td className="px-4 py-2.5 text-muted">{r.keepFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-faint">
          Planned, not active. Nothing is stored yet.
        </p>
      </GlassCard>

      <SectionTitle aside={`${doneCount} of ${s.checklist.length}`}>Safety checklist</SectionTitle>
      <GlassCard padding="none">
        <ul className="divide-y divide-line">
          {s.checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3">
              {c.done ? (
                <CheckCircle2 aria-label="Done" className="size-5 shrink-0 text-lime" />
              ) : (
                <Circle aria-label="Not done" className="size-5 shrink-0 text-faint" />
              )}
              <span className={cn("flex-1 text-sm", !c.done && "text-muted")}>{c.label}</span>
              <span className="text-[11px] text-faint">Phase {c.phase}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <SectionTitle>Kill switch</SectionTitle>
      <GlassCard className="flex items-center gap-3 opacity-70">
        <Power aria-hidden className="size-5 shrink-0 text-muted" />
        <p className="flex-1 text-sm text-muted">
          Stops all data imports instantly. Arrives in Phase 5. It only affects this app and never
          changes GoHighLevel.
        </p>
        <button
          type="button"
          disabled
          className="min-h-9 cursor-not-allowed rounded-full border border-line px-3 text-xs font-semibold text-faint"
        >
          Not yet
        </button>
      </GlassCard>
    </>
  );
}
