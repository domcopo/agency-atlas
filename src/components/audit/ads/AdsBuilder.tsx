"use client";

// The Google Ads audit builder (Audits → Google Ads audit → New). Same layout as the SEO
// builder: phones get one step per screen with Back / Next; wide areas get every step on
// one page with a sticky summary (and a live budget preview) on the right. Saving posts to
// saveAdsAudit; nothing is fetched and nothing costs money.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { saveAdsAudit } from "@/app/actions";
import { ADS_STEP_WORDS, errorStep, SectionToggle, SourceToggle } from "@/components/audit/AuditBuilder";
import { ADS_DEFAULTS, ADS_LIMITS, ADS_PAGE_LABEL, ADS_PRESETS, ADS_SECTIONS, adsDeckPages, type AdsIntake, type AdsSectionId } from "@/lib/audit/ads";
import { INTAKE_LIMITS } from "@/lib/audit/intake";
import { US_STATES } from "@/lib/audit/geo";
import { cn } from "@/lib/format";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink placeholder:text-faint";
const label = "block text-xs text-muted";
const STEPS = ["The business", "Area & money", "What to include", "Data & save"] as const;

export interface AdsBuilderProps {
  id?: string;
  leadId?: string;
  leadName?: string;
  intake?: Partial<AdsIntake>;
  sections: AdsSectionId[];
  capsLine: string | null;
  plansSet: boolean;
  /** false = 0023 or 0029 not run yet. */
  ready: boolean;
  setupNote: string | null;
}

const pct = (v: number | undefined, d: number) => String(Math.round((v ?? d) * 1000) / 10);

export function AdsBuilder({ id, leadId, leadName, intake, sections: initial, capsLine, plansSet, ready, setupNote }: AdsBuilderProps) {
  const [state, action, pending] = useActionState(saveAdsAudit, undefined);
  // Keep what the rep typed when a save is refused. React clears every box in a form
  // after an action runs (even a failed one), which wiped the hidden steps on phones.
  // Submitting by hand inside a transition skips that reset; the server still checks
  // everything (it always did).
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<Set<AdsSectionId>>(new Set(initial));
  const [compRows, setCompRows] = useState(Math.max(2, intake?.competitors?.length ?? 0));
  const i = intake ?? {};
  const budgets = i.budgetsUsd?.length ? i.budgetsUsd : [...ADS_DEFAULTS.budgetsUsd];
  const toggle = (sid: AdsSectionId) =>
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      next.add("ads_market");
      return next;
    });
  const list = [...sections];
  const pages = adsDeckPages(list);
  const show = (n: number) => cn(step === n ? "block" : "hidden", "@3xl:block");

  const nav = (n: number) => (
    <div className="mt-4 flex gap-2 @3xl:hidden">
      {n > 0 && (
        <button type="button" onClick={() => setStep(n - 1)} className="pressable glass inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl text-sm font-semibold">
          <ChevronLeft aria-hidden className="size-4" /> Back
        </button>
      )}
      {n < STEPS.length - 1 && (
        <button type="button" onClick={() => setStep(n + 1)} className="pressable inline-flex min-h-11 flex-[2] items-center justify-center gap-1 rounded-xl bg-violet-deep text-sm font-semibold">
          Next: {STEPS[n + 1]} <ChevronRight aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );

  const errors = state?.errors ?? (state?.error ? [state.error] : []);
  // Phones: jump to the step with the first problem, so the rep sees the box to fix.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const first = state?.errors?.[0];
    if (first) setStep(errorStep(first, ADS_STEP_WORDS));
  }
  const saveButton = (
    <button type="submit" disabled={pending || !ready} className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
      {pending ? "Saving…" : id ? "Save changes" : "Save Ads audit"}
    </button>
  );
  const errorBox = errors.length > 0 && (
    <div role="alert" className="rounded-2xl border border-rose/40 bg-rose/10 px-3 py-2 text-xs text-rose">
      <p className="font-semibold">Fix these first:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {errors.map((e) => (
          <li key={e}>{e}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <form onSubmit={submit} className="@container">
      {id && <input type="hidden" name="id" value={id} />}
      {leadId && <input type="hidden" name="leadId" value={leadId} />}

      {/* Phone stepper. Fields are checked on the server (hidden steps can't show browser warnings). */}
      <ol className="mb-4 grid grid-cols-4 gap-1.5 @3xl:hidden" aria-label="Steps">
        {STEPS.map((s, n) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(n)}
              aria-current={step === n ? "step" : undefined}
              className={cn("pressable flex w-full flex-col items-start gap-1 rounded-xl px-1 py-1 text-left", step === n ? "text-ink" : "text-faint")}
            >
              <span className={cn("h-1 w-full rounded-full", n <= step ? "bg-violet" : "bg-white/10")} />
              <span className="text-[10.5px] font-semibold leading-tight">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_18rem] @3xl:items-start @3xl:gap-6">
        <div className="min-w-0 space-y-3">
          <section className={show(0)} aria-label={STEPS[0]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">1 · The business</h2>
              {leadName && <p className="rounded-xl bg-white/5 px-3 py-2 text-xs text-muted">For the lead <span className="font-semibold text-ink">{leadName}</span>. Saved with that lead.</p>}
              <label className={label}>
                Website
                <input name="domain" inputMode="url" autoCapitalize="none" spellCheck={false} defaultValue={i.domain ?? ""} placeholder="example.com" className={field} />
              </label>
              <label className={label}>
                Business name
                <input name="company" maxLength={INTAKE_LIMITS.text} defaultValue={i.company ?? leadName ?? ""} className={field} />
              </label>
              <label className={label}>
                Type of business
                <input name="niche" maxLength={INTAKE_LIMITS.text} defaultValue={i.niche ?? ""} placeholder="e.g. Residential plumbing" className={field} />
              </label>
              <label className={label}>
                Services people search for <span className="text-faint">(comma between each; these become the money keywords)</span>
                <input name="services" defaultValue={(Array.isArray(i.services) ? i.services : []).join(", ")} placeholder="e.g. Plumber, Water heater repair, Drain cleaning" className={field} />
              </label>
              <fieldset>
                <legend className="text-xs text-muted">Competitors <span className="text-faint">(optional; the audit finds who shows ads if blank)</span></legend>
                <div className="mt-1 space-y-2">
                  {Array.from({ length: compRows }, (_, n) => (
                    <div key={n} className="grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.03] p-2 @md:grid-cols-[1fr_1fr_8rem]">
                      <input name={`comp_name_${n}`} aria-label={`Competitor ${n + 1} name`} defaultValue={i.competitors?.[n]?.name ?? ""} placeholder="Name" className={cn(field, "mt-0")} />
                      <input name={`comp_domain_${n}`} aria-label={`Competitor ${n + 1} website`} autoCapitalize="none" spellCheck={false} defaultValue={i.competitors?.[n]?.domain ?? ""} placeholder="website.com" className={cn(field, "mt-0")} />
                      <input name={`comp_town_${n}`} aria-label={`Competitor ${n + 1} town`} defaultValue={i.competitors?.[n]?.town ?? ""} placeholder="Town (optional)" className={cn(field, "col-span-2 mt-0 @md:col-span-1")} />
                    </div>
                  ))}
                </div>
                {compRows < INTAKE_LIMITS.competitors && (
                  <button type="button" onClick={() => setCompRows((n) => n + 1)} className="pressable mt-1 min-h-11 text-sm font-semibold text-violet">
                    + Add a competitor
                  </button>
                )}
              </fieldset>
            </div>
            {nav(0)}
          </section>

          <section className={show(1)} aria-label={STEPS[1]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">2 · Area & money</h2>
              <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                <label className={label}>
                  Home town
                  <input name="hqTown" maxLength={INTAKE_LIMITS.text} defaultValue={i.hqTown ?? ""} className={field} />
                </label>
                <label className={label}>
                  State
                  <select name="state" defaultValue={i.state ?? ""} className={field}>
                    <option value="" disabled>
                      Pick…
                    </option>
                    {Object.entries(US_STATES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} · {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className={label}>
                Other cities they serve <span className="text-faint">(comma between each, up to {INTAKE_LIMITS.cities})</span>
                <textarea name="cities" rows={2} defaultValue={(Array.isArray(i.cities) ? i.cities : []).join(", ")} placeholder="e.g. Dublin, Westerville" className={cn(field, "py-2")} />
              </label>
              <label className={label}>
                Average job ($)
                <input name="avgJobUsd" inputMode="numeric" defaultValue={i.avgJobUsd ?? ""} placeholder="650" className={field} />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="avgJobConfirmed" defaultChecked={i.avgJobConfirmed ?? false} className="size-5 accent-violet" />
                <span>
                  The client gave us this average job
                  <span className="block text-[11px] text-faint">Leave unticked and every page labels it &quot;assumption&quot;.</span>
                </span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  Clicks that become leads (%)
                  <input name="clickToLeadRate" inputMode="decimal" defaultValue={pct(i.clickToLeadRate, ADS_DEFAULTS.clickToLeadRate)} className={field} />
                </label>
                <label className={label}>
                  Leads that become jobs (%)
                  <input name="leadToJobRate" inputMode="decimal" defaultValue={pct(i.leadToJobRate, ADS_DEFAULTS.leadToJobRate)} className={field} />
                </label>
              </div>
              <p className="text-[11px] text-faint">10% = 1 in 10 clicks calls or fills in a form. Both rates are labeled &quot;assumption&quot; on the pages.</p>
              <fieldset>
                <legend className="text-xs text-muted">Monthly ad budgets to compare ($, up to {ADS_LIMITS.budgets})</legend>
                <div className="mt-1 grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((n) => (
                    <input key={n} name={`budget_${n}`} inputMode="numeric" aria-label={`Budget ${n + 1}`} defaultValue={budgets[n] ?? ""} placeholder={n === 0 ? "1500" : ""} className={cn(field, "mt-0")} />
                  ))}
                </div>
              </fieldset>
            </div>
            {nav(1)}
          </section>

          <section className={show(2)} aria-label={STEPS[2]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">3 · What to include</h2>
              <div>
                <p className="text-xs text-muted">Quick picks</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ADS_PRESETS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setSections(new Set(p.sections))} className="pressable min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-violet">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <fieldset>
                <legend className="text-xs text-muted">
                  Checkpoints ({pages.length} {pages.length === 1 ? "page" : "pages"})
                </legend>
                <ul className="mt-1 space-y-1.5">
                  {ADS_SECTIONS.map((s) => (
                    <SectionToggle key={s.id} id={s.id} label={s.label} detail={s.detail} on={sections.has(s.id)} locked={s.always} onToggle={toggle} />
                  ))}
                </ul>
              </fieldset>
              {sections.has("ads_plan") && !plansSet && <p className="text-[11px] text-amber">Google Ads prices aren&apos;t set yet, so the plan page will say &quot;prices not set&quot;. The owner adds them in Audits → Settings.</p>}
            </div>
            {nav(2)}
          </section>

          <section className={show(3)} aria-label={STEPS[3]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">4 · Data & save</h2>
              <fieldset className="space-y-1.5">
                <legend className="text-xs text-muted">Data sources</legend>
                <SourceToggle name="mod_dataforseo" label="DataForSEO" detail="Searches, cost per click, who shows ads, spend estimates." on={i.modules?.dataforseo ?? true} />
                <SourceToggle name="mod_semrush" label="Semrush" detail="Paid-search estimates side by side, never merged. Off unless needed." on={i.modules?.semrush ?? false} />
              </fieldset>
              <label className={label}>
                Notes for the audit <span className="text-faint">(optional; no emails or phone numbers)</span>
                <textarea name="notes" rows={3} maxLength={INTAKE_LIMITS.notes} defaultValue={i.notes ?? ""} placeholder="e.g. Tried ads before and stopped; wants more water heater jobs" className={cn(field, "py-2")} />
              </label>
              <p className="rounded-xl bg-lime/10 px-3 py-2 text-xs text-lime">Saving costs $0. Nothing is pulled until someone runs the prompt.{capsLine ? ` ${capsLine}` : ""}</p>
              {list.map((s) => (
                <input key={s} type="hidden" name="section" value={s} />
              ))}
              <div className="space-y-2 @3xl:hidden">
                {errorBox}
                {saveButton}
              </div>
            </div>
            {nav(3)}
          </section>
        </div>

        <aside className="hidden @3xl:sticky @3xl:top-6 @3xl:block" aria-label="Summary">
          <div className="glass space-y-3 rounded-3xl p-4">
            <h2 className="font-display text-base font-bold">This Ads audit</h2>
            <ol className="space-y-1 text-sm">
              {pages.map((p, k) => (
                <li key={p} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right text-faint">{k + 1}</span>
                  <span>{ADS_PAGE_LABEL[p]}</span>
                </li>
              ))}
            </ol>
            <p className="border-t border-line pt-2 text-xs text-muted">Costs $0 to save.{capsLine ? ` ${capsLine}` : ""}</p>
            {errorBox}
            {saveButton}
          </div>
        </aside>
      </div>
      {setupNote && <p className="mt-3 text-xs text-amber">{setupNote}</p>}
    </form>
  );
}
