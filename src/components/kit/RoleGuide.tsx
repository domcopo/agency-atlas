// Shows one role guide: the starter text (with any saved edits), the features and helpers
// that role really has, and edit controls for the owner/managers. Plain text only (KitText).
// It only displays what the page passes in; the page decides who may see which guide.

import { BookMarked, Bot, CheckCircle2, Circle, Lightbulb, Sparkles, Target } from "lucide-react";
import Link from "next/link";
import { goalOp, resetGuidePart } from "@/app/actions";
import { GuidePartForm } from "@/components/forms/RoleGuideForms";
import { KitText } from "@/components/kit/KitText";
import type { PersonGoal } from "@/lib/ideas";
import { featuresFor, helpersFor, ROLE_LABELS, type GuideSection } from "@/lib/role-guides";
import type { MemberRole } from "@/lib/roles";

const small = "pressable min-h-9 rounded-lg border border-line px-2.5 text-xs";

export function GuideSections({ role, sections, canEdit, ready }: { role: MemberRole; sections: GuideSection[]; canEdit: boolean; ready: boolean }) {
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <section key={s.key} aria-label={s.title} className="glass rounded-3xl px-4 py-3">
          <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
            <span className="flex-1">{s.title}</span>
            {canEdit && s.edited && <span className="text-[11px] font-normal text-faint">edited</span>}
          </h2>
          <KitText body={s.body} />
          {canEdit && ready && (
            <details className="mt-2">
              <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit</summary>
              <div className="mt-2 space-y-2">
                <GuidePartForm role={role} part={s.part} id={s.editId} title={s.part === "extra" ? s.title : undefined} body={s.body} isExtra={s.part === "extra"} />
                {s.editId && (
                  <form action={resetGuidePart}>
                    <input type="hidden" name="role" value={role} />
                    <input type="hidden" name="id" value={s.editId} />
                    <button type="submit" className={`${small} text-muted`}>
                      {s.part === "extra" ? "Remove this section" : "Reset to the starter text"}
                    </button>
                  </form>
                )}
              </div>
            </details>
          )}
        </section>
      ))}
      {canEdit && !ready && <p className="px-1 text-[11px] text-faint">Editing guides needs one setup step: run 0036 in Supabase.</p>}
      {canEdit && ready && (
        <details className="glass rounded-3xl px-4 py-3">
          <summary className="pressable flex min-h-9 cursor-pointer list-none items-center text-sm font-semibold text-violet">+ Add a section</summary>
          <div className="mt-2">
            <GuidePartForm role={role} part="extra" isExtra />
          </div>
        </details>
      )}
    </div>
  );
}

export function GuideFeatures({ role }: { role: MemberRole }) {
  return (
    <ul className="glass divide-y divide-line rounded-3xl">
      {featuresFor(role).map((f) => (
        <li key={f.id} className="px-4 py-2.5">
          <p className="text-sm font-semibold">
            {f.href ? (
              <Link href={f.href} className="pressable text-ink hover:text-violet">
                {f.name}
              </Link>
            ) : (
              f.name
            )}
          </p>
          <p className="text-xs text-muted">{f.what}</p>
          {f.note?.[role] && <p className="text-[11px] text-faint">{f.note[role]}</p>}
        </li>
      ))}
    </ul>
  );
}

export function GuideHelpers({ role }: { role: MemberRole }) {
  const list = helpersFor(role);
  if (!list.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No AI helpers or bots for this job. Everything you do is by hand, and Atlas never sends anything for you.</p>;
  return (
    <>
      <ul className="glass divide-y divide-line rounded-3xl">
        {list.map((h) => (
          <li key={h.id} className="px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              {h.usesAi ? <Sparkles aria-hidden className="size-3.5 text-violet" /> : <Bot aria-hidden className="size-3.5 text-teal" />}
              {h.name}
            </p>
            <p className="text-xs text-muted">{h.what}</p>
            <p className="text-[11px] text-faint">{h.limits}</p>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 px-1 text-[11px] text-faint">
        <Sparkles aria-hidden className="inline size-3 text-violet" /> asks the AI from Atlas (cost logged, monthly budget). Every helper suggests; a person decides. None of them sends anything.
      </p>
    </>
  );
}

export function GoalList({ goals, canTick, canArchive, empty }: { goals: PersonGoal[]; canTick: boolean; canArchive?: boolean; empty: string }) {
  if (!goals.length) return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">{empty}</p>;
  return (
    <ul className="glass divide-y divide-line rounded-3xl">
      {goals.map((g) => (
        <li key={g.id} className="flex items-center gap-2 px-4 py-2">
          {canTick ? (
            <form action={goalOp}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="op" value={g.doneAt ? "undo" : "done"} />
              <button type="submit" aria-label={g.doneAt ? `Mark "${g.goal}" not done` : `Mark "${g.goal}" done`} className="pressable inline-flex min-h-11 min-w-11 items-center justify-center">
                {g.doneAt ? <CheckCircle2 aria-hidden className="size-5 text-lime" /> : <Circle aria-hidden className="size-5 text-faint" />}
              </button>
            </form>
          ) : g.doneAt ? (
            <CheckCircle2 aria-label="Done" className="size-5 shrink-0 text-lime" />
          ) : (
            <Circle aria-label="Not done yet" className="size-5 shrink-0 text-faint" />
          )}
          <span className="min-w-0 flex-1">
            <span className={`block text-sm ${g.doneAt ? "text-muted line-through" : ""}`}>{g.goal}</span>
            {g.dueOn && <span className="block text-[11px] text-faint">by {g.dueOn}</span>}
          </span>
          {canArchive && (
            <form action={goalOp}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="op" value="archive" />
              <button type="submit" className={`${small} text-muted`}>
                Remove
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The block at the top of Kit: your guide (or all five for owner/managers), goals and ideas. */
export function GuideCard({
  roles,
  viewerRole,
  openGoals,
  newIdeas,
  lead,
  preview,
}: {
  roles: MemberRole[];
  viewerRole: MemberRole | null;
  openGoals: number | null;
  newIdeas: number | null;
  lead: boolean;
  preview: boolean;
}) {
  if (!roles.length) return null;
  const own = viewerRole && roles.includes(viewerRole) ? viewerRole : roles[0]!;
  const row = "pressable flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04]";
  return (
    <section aria-label="Your guide" className="mb-4">
      <ul className="glass divide-y divide-line rounded-3xl">
        <li>
          <Link href={`/kit/guides/${own}`} className={row}>
            <BookMarked aria-hidden className="size-4 shrink-0 text-violet" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{preview ? "Developer guide" : "Your guide"}</span>
              <span className="block text-[11px] text-faint">What you do, your goals, how to use Atlas, your features and helpers</span>
            </span>
            {openGoals ? <span className="text-[11px] font-semibold text-teal">{openGoals} goal{openGoals === 1 ? "" : "s"} open</span> : null}
            <span aria-hidden className="text-faint">›</span>
          </Link>
        </li>
        {roles.length > 1 && (
          <li className="flex flex-wrap gap-1.5 px-4 py-2.5">
            <span className="w-full text-[11px] text-faint">Every role&apos;s guide (you can see all of them)</span>
            {roles.map((r) => (
              <Link key={r} href={`/kit/guides/${r}`} className="pressable inline-flex min-h-10 items-center rounded-full border border-line px-3 text-xs font-semibold text-muted hover:text-ink">
                {ROLE_LABELS[r]}
              </Link>
            ))}
          </li>
        )}
        {lead && !preview && (
          <li>
            <Link href="/kit/goals" className={row}>
              <Target aria-hidden className="size-4 shrink-0 text-teal" />
              <span className="min-w-0 flex-1 text-sm font-semibold">Team goals</span>
              <span aria-hidden className="text-faint">›</span>
            </Link>
          </li>
        )}
        {!preview && (
          <li>
            <Link href="/kit/ideas" className={row}>
              <Lightbulb aria-hidden className="size-4 shrink-0 text-amber" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{viewerRole === "owner" ? "Ideas inbox" : "Send an idea"}</span>
                <span className="block text-[11px] text-faint">{viewerRole === "owner" ? "Feature ideas and requests from the team" : "Ask for a feature or tell us what's hard. Only the owner reads it."}</span>
              </span>
              {newIdeas ? <span className="text-[11px] font-semibold text-amber">{newIdeas} new</span> : null}
              <span aria-hidden className="text-faint">›</span>
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}
