// Journey steps (owner and managers, 0038): edit the 27 first-90-day touches and the Grow
// rhythm without code: words, day, channel, deliverable, copy-only draft. Step numbers and
// stages are fixed so saved history and daily points keep working.

import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { JourneyStepForm } from "@/components/forms/JourneyStepForm";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { PageHeader } from "@/components/shell/PageHeader";
import { getJourneySteps, getMember, usesDatabase } from "@/lib/data-source";
import { formatDate } from "@/lib/format";
import { deliverableLabel, JOURNEY_STAGES } from "@/lib/journey";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Journey steps" };

export default async function JourneyStepsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (usesDatabase() && !(me && isLead(me.role))) return <RoleNotice title="Journey steps" />;
  const { ready, steps, editedAt } = await getJourneySteps();
  const canSave = ready && Boolean(me);

  return (
    <div className="lg:max-w-4xl">
      <PageHeader title="Journey steps" subtitle="The 27 touches and the ongoing rhythm" backHref="/clients" backLabel="Clients" />
      {!ready ? (
        <p className="glass mb-4 rounded-3xl px-4 py-3 text-sm text-muted">
          {usesDatabase() ? (
            <>
              Editing needs one setup step first: run <span className="font-mono text-xs">0038_journey_steps.sql</span> in Supabase. Until then the steps below come from the app and can&apos;t be saved.
            </>
          ) : (
            "Demo: these are the starting steps. Saving needs the database."
          )}
        </p>
      ) : (
        <p className="mb-4 px-1 text-xs text-muted">
          Changes apply to every client straight away (for example, a new day moves everyone&apos;s due date for that touch).
          {editedAt ? ` Last saved ${formatDate(editedAt.slice(0, 10))}.` : ""}
        </p>
      )}

      {[0, 1, 2, 3, 4, 5].map((stage) => {
        const list = stage === 5 ? steps.grow : steps.touches.filter((t) => t.stage === stage);
        return (
          <section key={stage} aria-labelledby={`js-${stage}`} className="mb-5">
            <h2 id={`js-${stage}`} className="mb-2 px-1 text-sm font-semibold">
              {JOURNEY_STAGES[stage]} {stage === 5 && <span className="font-normal text-faint">· after day 90, repeating</span>}
            </h2>
            <GlassCard padding="none">
              <ul className="divide-y divide-line">
                {list.map((t) => {
                  const i = steps.touches.findIndex((x) => x.step === t.step);
                  const minDay = i > 0 ? steps.touches[i - 1]!.day : 0;
                  const maxDay = i >= 0 && i < steps.touches.length - 1 ? steps.touches[i + 1]!.day : 120;
                  return (
                    <li key={t.step}>
                      <details className="group px-4 py-3">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">
                              {t.step <= 27 ? <span className="text-faint">{t.step}. </span> : null}
                              {t.title}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {t.step <= 27 ? `Day ${t.day} · ` : ""}
                              {t.how} · {deliverableLabel(t.deliverable)}
                            </span>
                          </span>
                          <span aria-hidden className="text-xs text-violet group-open:hidden">
                            Edit
                          </span>
                        </summary>
                        <JourneyStepForm t={t} minDay={minDay} maxDay={maxDay} canSave={canSave} />
                      </details>
                    </li>
                  );
                })}
              </ul>
            </GlassCard>
          </section>
        );
      })}
      <p className="px-1 text-[11px] text-faint">Drafts are copy-only: the rep copies them into GoHighLevel or their phone. Atlas never sends anything.</p>
    </div>
  );
}
