// The developer's status buttons, shared by the Work card and the work order page so the
// two places can't drift apart (DEVELOPER_SIMPLIFY_PLAN, 2026-11-17): Start / Back to it,
// Ready for review (or Done for plain follow-ups), I'm stuck (says on what), and,
// optionally, Waiting on client. Plain buttons, no dropdowns. Every form posts to the
// existing updateAction; the server and database decide what's allowed (a developer's
// "done" on a work order or issue becomes "review").

import type { ReactNode } from "react";
import { updateAction } from "@/app/actions";
import { cn } from "@/lib/format";
import { needsReview } from "@/lib/ops";
import type { ClientAction } from "@/lib/types";

const bigBtn = "pressable inline-flex min-h-11 flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink disabled:opacity-50";

export function DeveloperButtons({ a, disabled = false, showWaiting = false }: { a: ClientAction; disabled?: boolean; showWaiting?: boolean }) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <div className="flex gap-2">
        {a.status !== "in_progress" && (
          <StatusButton a={a} status="in_progress" className="bg-violet-deep">
            {a.status === "blocked" || a.status === "waiting" ? "Back to it" : "Start"}
          </StatusButton>
        )}
        <form action={updateAction} className="flex flex-1">
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value="done" />
          <button type="submit" className={cn(bigBtn, "border border-lime/40 bg-lime/10 text-lime")}>
            {needsReview(a) ? "Ready for review" : "Done"}
          </button>
        </form>
      </div>
      {a.status !== "blocked" && (
        <form action={updateAction} className="flex gap-2">
          <input type="hidden" name="actionId" value={a.id} />
          <input type="hidden" name="op" value="status" />
          <input type="hidden" name="status" value="blocked" />
          <input name="reason" required maxLength={200} placeholder="I'm stuck on…" aria-label={`What you're stuck on for "${a.title}"`} className={input} />
          <button type="submit" className={cn(bigBtn, "flex-none border border-rose/40 bg-rose/10 text-rose")}>
            I&apos;m stuck
          </button>
        </form>
      )}
      {showWaiting && a.status !== "waiting" && (
        <StatusButton a={a} status="waiting" className="flex-none border border-line bg-white/5 text-xs text-muted">
          Waiting on client
        </StatusButton>
      )}
    </fieldset>
  );
}

export function StatusButton({ a, status, className, children }: { a: ClientAction; status: ClientAction["status"]; className?: string; children: ReactNode }) {
  return (
    <form action={updateAction} className="flex flex-1">
      <input type="hidden" name="actionId" value={a.id} />
      <input type="hidden" name="op" value="status" />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={cn(bigBtn, className)}>
        {children}
      </button>
    </form>
  );
}
