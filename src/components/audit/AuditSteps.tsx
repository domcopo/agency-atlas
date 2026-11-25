// The saved audit page as numbered steps that tick themselves off (owner request
// 2026-11-25): 1 check the details, 2 pull the numbers (Run audit: DataForSEO + Claude,
// all inside Atlas), 3 look over the pages, 4 save as PDF and send. The old "copy the
// prompt into Claude and paste the answer back" route sits folded under "Advanced".

import { CheckCircle2, ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Fold } from "@/components/shell/Fold";
import { fmtDate } from "@/lib/audit/format";
import { cn } from "@/lib/format";

export interface AuditStepsProps {
  id: string;
  pageCount: number;
  canEdit: boolean;
  /** Saved details still pass the check. */
  detailsOk: boolean;
  /** Home town / cities Google doesn't know. */
  placeIssues: { name: string; suggest: string[] }[];
  hasResults: boolean;
  retrieved: string | null;
  /** The Run audit card. */
  run: ReactNode;
  /** The copy-prompt + Attach results backup. */
  advanced: ReactNode;
}

function Step({ n, title, done, current, children }: { n: number; title: string; done: boolean; current: boolean; children: ReactNode }) {
  return (
    <li className={cn("relative rounded-3xl border p-4", current ? "border-violet/50 bg-violet/[0.06]" : "border-line", done && !current && "opacity-90")}>
      <div className="flex items-center gap-2.5">
        {done ? (
          <CheckCircle2 aria-label="Done" className="size-6 shrink-0 text-lime" />
        ) : (
          <span aria-hidden className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", current ? "bg-violet text-white" : "bg-white/10 text-muted")}>
            {n}
          </span>
        )}
        <p className="text-sm font-semibold">
          <span className="sr-only">Step {n}: </span>
          {title}
        </p>
      </div>
      <div className="mt-2 pl-[34px] text-xs text-muted">{children}</div>
    </li>
  );
}

export function AuditSteps({ id, pageCount, canEdit, detailsOk, placeIssues, hasResults, retrieved, run, advanced }: AuditStepsProps) {
  const step1 = detailsOk && placeIssues.length === 0;
  const current = !step1 ? 1 : !hasResults ? 2 : 3;
  return (
    <section aria-label="Steps" className="space-y-3">
      <ol className="space-y-2.5">
        <Step n={1} title="Check the business details" done={step1} current={current === 1}>
          {!detailsOk ? (
            <p className="text-rose">The saved details need fixing. Tap Edit.</p>
          ) : placeIssues.length ? (
            <>
              <p className="text-amber">These aren&apos;t places Google knows, so they&apos;d come back empty. Tap Edit and put one town, township or county per entry, with commas between them:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink">
                {placeIssues.slice(0, 6).map((p) => (
                  <li key={p.name}>
                    &ldquo;{p.name}&rdquo;{p.suggest.length ? <span className="text-muted"> (did you mean {p.suggest.join(", ")}?)</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Website, town, cities and services look right. Change anything with Edit.</p>
          )}
          {canEdit && !step1 && (
            <Link href={`/audits/${id}/edit`} className="pressable mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white">
              <Pencil aria-hidden className="size-4" /> Edit details
            </Link>
          )}
        </Step>

        <Step n={2} title="Pull the numbers" done={hasResults} current={current === 2}>
          <p className="mb-2">One tap: Atlas gets the numbers from DataForSEO and Claude writes the notes, right here. No copying or pasting.{!step1 && " Fix step 1 first so every city gets numbers."}</p>
          {run}
        </Step>

        <Step n={3} title="Look over the pages" done={false} current={current === 3}>
          <p>{hasResults && retrieved ? `Numbers from ${fmtDate(retrieved)}. Open the pages and spot-check a few figures.` : "After step 2, the pages fill in with real numbers."}</p>
          <Link href={`/audit/${id}`} className={cn("pressable mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold", hasResults ? "bg-violet-deep text-white" : "glass text-violet")}>
            <ExternalLink aria-hidden className="size-4" /> Open the {pageCount} pages
          </Link>
        </Step>

        <Step n={4} title="Save as PDF and send" done={false} current={false}>
          <p>On the pages, tap <span className="font-semibold text-ink">Print / Save as PDF</span>, choose &ldquo;Save as PDF&rdquo;, and send it to the prospect.</p>
        </Step>
      </ol>

      <Fold title="Advanced: run it in Claude yourself" summary="Copy the prompt into a Claude chat, then paste Claude's answer back here" label="Advanced audit options">
        <div className="mt-2.5 space-y-3">{advanced}</div>
      </Fold>
    </section>
  );
}
