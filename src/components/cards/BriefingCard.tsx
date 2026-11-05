import { AlertTriangle, ArrowUpRight, HelpCircle, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import type { Briefing, ClientLink } from "@/lib/types";

function Clients({ clients }: { clients: ClientLink[] }) {
  if (!clients.length) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {clients.map((c) => (
        <Link key={c.slug} href={`/clients/${c.slug}`} className="rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-ink underline-offset-2 hover:underline">
          {c.name}
        </Link>
      ))}
    </span>
  );
}

function Block({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted">
        {icon}
        {title}
      </p>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

/** The AI's daily briefing. Plain text only; every client mention links to the record it's about. */
export function BriefingCard({ briefing, createdAt, isToday }: { briefing: Briefing; createdAt: string; isToday: boolean }) {
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(createdAt));
  return (
    <GlassCard className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <p className="flex gap-2 text-sm font-semibold">
          <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          {briefing.headline}
        </p>
        <Pill color={isToday ? "violet" : "neutral"}>{isToday ? "Today" : when}</Pill>
      </div>

      {briefing.priorities.length > 0 && (
        <Block icon={<ListChecks aria-hidden className="size-3.5" />} title="Priorities">
          {briefing.priorities.map((p, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold">{p.title}</span>
              {p.when === "today" && <span className="ml-1.5 text-[11px] text-amber">today</span>}
              <span className="block text-xs text-muted">{p.why}</span>
              <Clients clients={p.clients} />
            </li>
          ))}
        </Block>
      )}

      {briefing.risks.length > 0 && (
        <Block icon={<AlertTriangle aria-hidden className="size-3.5 text-rose" />} title="Risks">
          {briefing.risks.map((r, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold">{r.title}</span>
              <span className="block text-xs text-muted">{r.why}</span>
              <Clients clients={r.clients} />
            </li>
          ))}
        </Block>
      )}

      {briefing.upsells.length > 0 && (
        <Block icon={<ArrowUpRight aria-hidden className="size-3.5 text-lime" />} title="Upsell ideas">
          {briefing.upsells.map((u, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold">{u.title}</span>
              <span className="block text-xs text-muted">{u.why}</span>
              <Clients clients={u.clients} />
            </li>
          ))}
        </Block>
      )}

      {briefing.questions.length > 0 && (
        <Block icon={<HelpCircle aria-hidden className="size-3.5" />} title="Worth finding out">
          {briefing.questions.map((q, i) => (
            <li key={i} className="text-sm">
              {q.question}
              <span className="block text-xs text-muted">{q.why}</span>
              <Clients clients={q.clients} />
            </li>
          ))}
        </Block>
      )}

      {briefing.drafts.length > 0 && (
        <Block icon={<Sparkles aria-hidden className="size-3.5" />} title="Draft messages (copy only, never sent)">
          {briefing.drafts.map((d, i) => (
            <li key={i} className="rounded-2xl bg-white/5 p-3 text-sm">
              <span className="text-xs text-muted">
                {d.client ? `${d.client.name} · ` : ""}
                {d.purpose}
              </span>
              <span className="mt-1 block whitespace-pre-line">{d.message}</span>
              <span className="mt-2 block">
                <CopyButton text={d.message} label="Copy message" />
              </span>
            </li>
          ))}
        </Block>
      )}

      <p className="text-[11px] text-faint">Written by AI from your data. It can be wrong: check before acting. It can&apos;t change or send anything.</p>
    </GlassCard>
  );
}
