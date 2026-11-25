"use client";

// "Run audit" (docs/AUDIT_RUN_PLAN.md, Phase E1): the cost first, then one tap. While a run is
// going, the page refreshes itself every few seconds to show the steps; the rep can leave and
// come back. All the work and every check happen on the server.

import { CheckCircle2, Circle, Loader2, Play, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, type FormEvent } from "react";
import { startAuditRun } from "@/app/actions";
import type { AuditRunView } from "@/lib/data-source";

export interface RunAuditProps {
  id: string;
  /** false = DataForSEO's login isn't set on the server yet. */
  configured: boolean;
  /** false = 0035 not run yet. */
  ready: boolean;
  estimateUsd: number;
  capsLine: string | null;
  run: AuditRunView | null;
  hasResults: boolean;
  /** Inside the steps card: no heading or frame of its own. */
  compact?: boolean;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function RunAudit({ id, configured, ready, estimateUsd, capsLine, run, hasResults, compact = false }: RunAuditProps) {
  const [state, action, pending] = useActionState(startAuditRun, undefined);
  const router = useRouter();
  const running = (run?.status === "running" && !run.stale) || (pending && !state);

  // While a run is going, look again every 4 seconds (stops by itself when it ends).
  useEffect(() => {
    if (run?.status !== "running" || run.stale) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [run?.status, run?.stale, router]);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className={compact ? "space-y-3" : "glass space-y-3 rounded-3xl p-4"}>
      <input type="hidden" name="id" value={id} />
      {compact ? (
        <p className="text-[11px] text-faint">Takes 1–3 minutes; you can leave this page and come back.</p>
      ) : (
        <div>
          <p className="text-sm font-semibold">Run audit</p>
          <p className="text-xs text-muted">Atlas pulls the numbers from DataForSEO and fills the pages. Takes 1–3 minutes; you can leave this page and come back.</p>
        </div>
      )}

      {!configured ? (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-muted">Not connected yet: the owner adds the DataForSEO login in Vercel&apos;s settings. Until then, use the prompt and Attach results below.</p>
      ) : !ready ? (
        <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-muted">Running audits needs one setup step first (0035 SQL).</p>
      ) : (
        <>
          <p className="rounded-xl bg-white/5 px-3 py-2 text-xs">
            Costs up to <span className="font-semibold">{usd(estimateUsd)}</span> of DataForSEO (usually less), plus a few cents of AI for the notes.
            {capsLine ? <span className="text-muted"> {capsLine}</span> : null}
          </p>
          <button type="submit" disabled={running} className="pressable inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-deep text-sm font-semibold text-white disabled:opacity-60">
            {running ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <Play aria-hidden className="size-4" />}
            {running ? "Running…" : hasResults ? `Run again (up to ${usd(estimateUsd)})` : `Run audit (up to ${usd(estimateUsd)})`}
          </button>
        </>
      )}

      {state?.error && (
        <p role="alert" className="rounded-2xl border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
          {state.error}
        </p>
      )}

      {run && (
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-xs font-semibold">
            {run.status === "running" && !run.stale ? "Working on it…" : run.status === "done" ? "Last run finished" : run.stale ? "The last run stopped before finishing" : "The last run didn't finish"}
            <span className="font-normal text-faint"> · {new Date(run.startedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          </p>
          <ul className="space-y-1" aria-live="polite">
            {run.steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-xs">
                {s.state === "done" ? <CheckCircle2 aria-hidden className="size-4 text-lime" /> : s.state === "working" && run.status === "running" ? <Loader2 aria-hidden className="size-4 animate-spin text-violet motion-reduce:animate-none" /> : s.state === "skipped" ? <XCircle aria-hidden className="size-4 text-faint" /> : <Circle aria-hidden className="size-4 text-faint" />}
                <span className={s.state === "skipped" ? "text-faint" : ""}>{s.label}</span>
              </li>
            ))}
          </ul>
          {run.error && <p className={`text-xs ${run.status === "failed" ? "text-rose" : "text-amber"}`}>{run.error}</p>}
          {run.status !== "running" && <p className="text-[11px] text-faint">Cost: {run.actualUsd !== null ? usd(run.actualUsd) : "not known"} of DataForSEO (up to {usd(run.estUsd)} was set aside).</p>}
        </div>
      )}
    </form>
  );
}
