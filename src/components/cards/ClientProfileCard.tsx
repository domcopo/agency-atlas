import { CheckCircle2, Sparkles } from "lucide-react";
import { markProfileReviewed } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import type { ClientProfile } from "@/lib/types";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** The AI's draft knowledge profile for one client. Plain text; the owner marks it reviewed. */
export function ClientProfileCard({
  profile,
  canReview,
}: {
  profile: { id: string; createdAt: string; reviewedAt: string | null; content: ClientProfile };
  canReview: boolean;
}) {
  const p = profile.content;
  const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(profile.createdAt));
  return (
    <GlassCard className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Sparkles aria-hidden className="size-3.5 text-violet" /> Drafted {when}
        </p>
        {profile.reviewedAt ? <Pill color="teal">Reviewed</Pill> : <Pill color="amber">AI draft</Pill>}
      </div>
      <p className="text-sm">{p.summary}</p>
      <div className="grid gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">What they buy</p>
          <p className="text-sm">{p.buys}</p>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted">How they&apos;re doing</p>
          <p className="text-sm">{p.howTheyAreDoing}</p>
        </div>
        <List title="What they care about" items={p.caresAbout} />
        <List title="Risks" items={p.risks} />
        <div className="rounded-2xl border border-lime/30 bg-lime/8 p-3">
          <p className="text-xs font-semibold text-lime">Next step</p>
          <p className="text-sm">{p.nextStep}</p>
        </div>
        <List title="Questions to ask" items={p.questionsToAsk} />
        {p.draftCheckIn && (
          <div className="rounded-2xl bg-white/5 p-3">
            <p className="text-xs text-muted">Draft check-in (copy only, never sent)</p>
            <p className="mt-1 whitespace-pre-line text-sm">{p.draftCheckIn}</p>
            <div className="mt-2">
              <CopyButton text={p.draftCheckIn} label="Copy message" />
            </div>
          </div>
        )}
      </div>
      {canReview && !profile.reviewedAt && (
        <form action={markProfileReviewed}>
          <input type="hidden" name="profileId" value={profile.id} />
          <button type="submit" className="pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold">
            <CheckCircle2 aria-hidden className="size-4" /> I&apos;ve checked this, mark reviewed
          </button>
        </form>
      )}
      <p className="text-[11px] text-faint">Written by AI from check-ins, health and records. It can be wrong.</p>
    </GlassCard>
  );
}
