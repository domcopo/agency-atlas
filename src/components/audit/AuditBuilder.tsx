"use client";

// The custom audit builder (Sales → Audits → New audit). Phones: one step per screen with
// Back / Next. Wide areas (container 48rem+): every step on one page and a sticky summary
// on the right. Saving posts to saveAudit; nothing is fetched and nothing costs money.

import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useActionState, useState } from "react";
import { saveAudit } from "@/app/actions";
import type { AuditIntake } from "@/lib/audit/intake";
import { INTAKE_DEFAULTS, INTAKE_LIMITS } from "@/lib/audit/intake";
import { US_STATES, STATES } from "@/lib/audit/geo";
import { AUDIT_PRESETS, AUDIT_SECTIONS, deckPages, type AuditSectionId } from "@/lib/audit/sections";
import { cn } from "@/lib/format";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink placeholder:text-faint";
const label = "block text-xs text-muted";
const STEPS = ["The business", "Area & money", "What to include", "Data & save"] as const;

const PAGE_LABEL: Record<string, string> = {
  summary: "Summary",
  rankings: "Demand & rankings",
  heatmap: "Heat map & region map",
  competitors: "Competitor analysis",
  fixes: "Top fixes",
  keywords: "Money keywords",
  revenue: "Revenue opportunity",
};

export interface BuilderProps {
  id?: string;
  leadId?: string;
  leadName?: string;
  intake?: Partial<AuditIntake>;
  sections: AuditSectionId[];
  /** "$0 of $10 used this week" etc. */
  capsLine: string | null;
  plansSet: boolean;
  ready: boolean;
}

export function AuditBuilder({ id, leadId, leadName, intake, sections: initial, capsLine, plansSet, ready }: BuilderProps) {
  const [state, action, pending] = useActionState(saveAudit, undefined);
  const [step, setStep] = useState(0);
  const [sections, setSections] = useState<Set<AuditSectionId>>(new Set(initial));
  const [compRows, setCompRows] = useState(Math.max(2, intake?.competitors?.length ?? 0));
  const i = intake ?? {};
  const toggle = (sid: AuditSectionId) =>
    setSections((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      next.add("summary");
      return next;
    });
  const list = [...sections];
  const pages = deckPages(list);
  const extras = AUDIT_SECTIONS.filter((s) => s.kind === "prompt" && sections.has(s.id));
  const pageNames = pages.map((p) => (p === "plan" ? [sections.has("timeline") && "SEO timeline", sections.has("investment") && "Investment"].filter(Boolean).join(" + ") : PAGE_LABEL[p]));
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
  const saveButton = (
    <button type="submit" disabled={pending || !ready} className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
      {pending ? "Saving…" : id ? "Save changes" : "Save audit"}
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
    <form action={action} className="@container">
      {id && <input type="hidden" name="id" value={id} />}
      {leadId && <input type="hidden" name="leadId" value={leadId} />}

      {/* Phone stepper. Fields are checked on the server (not by the browser), because fields on hidden steps can't show browser warnings. */}
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
          {/* Step 1 */}
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
                <input name="niche" maxLength={INTAKE_LIMITS.text} defaultValue={i.niche ?? ""} placeholder="e.g. Kitchen remodeling" className={field} />
              </label>
              <label className={label}>
                Services <span className="text-faint">(comma between each; optional)</span>
                <input name="services" defaultValue={(Array.isArray(i.services) ? i.services : []).join(", ")} placeholder="e.g. Kitchens, Bathrooms, Additions" className={field} />
              </label>
              <label className={label}>
                Google Business Profile link <span className="text-faint">(optional; the audit searches for it if blank)</span>
                <input name="gbpUrl" inputMode="url" autoCapitalize="none" spellCheck={false} defaultValue={i.gbpUrl ?? ""} placeholder="https://…" className={field} />
              </label>
            </div>
            {nav(0)}
          </section>

          {/* Step 2 */}
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
                <textarea name="cities" rows={2} defaultValue={(Array.isArray(i.cities) ? i.cities : []).join(", ")} placeholder="e.g. Folsom, Roseville, Davis" className={cn(field, "py-2")} />
              </label>
              <p className="text-[11px] text-faint">State outlines on the map so far: {Object.values(STATES).map((s) => s.name).join(", ")}. Other states still work; the map says the outline is coming.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className={label}>
                  Average job ($)
                  <input name="avgJobUsd" inputMode="numeric" defaultValue={i.avgJobUsd ?? ""} placeholder="10000" className={field} />
                </label>
                <label className={label}>
                  Visits that become jobs (%)
                  <input name="visitToJobRate" inputMode="decimal" defaultValue={((i.visitToJobRate ?? INTAKE_DEFAULTS.visitToJobRate) * 100).toString()} className={field} />
                </label>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" name="avgJobConfirmed" defaultChecked={i.avgJobConfirmed ?? false} className="size-5 accent-violet" />
                <span>
                  The client gave us this average job
                  <span className="block text-[11px] text-faint">Leave unticked and every page labels it &quot;assumption&quot;.</span>
                </span>
              </label>
              <fieldset>
                <legend className="text-xs text-muted">Competitors <span className="text-faint">(optional; the audit finds the top local ones if blank)</span></legend>
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
            {nav(1)}
          </section>

          {/* Step 3 */}
          <section className={show(2)} aria-label={STEPS[2]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">3 · What to include</h2>
              <fieldset>
                <legend className="text-xs text-muted">Audit type</legend>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-violet/50 bg-violet/10 px-3 text-sm font-semibold">
                    <Check aria-hidden className="size-4 text-violet" /> SEO audit
                  </label>
                  <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-line px-3 text-sm">
                    <input type="checkbox" name="wantsAds" defaultChecked={i.wantsAds ?? false} className="size-5 accent-violet" />
                    <span>
                      Google Ads <span className="block text-[10.5px] text-faint">Coming soon: noted for now</span>
                    </span>
                  </label>
                </div>
              </fieldset>
              <div>
                <p className="text-xs text-muted">Quick picks</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {AUDIT_PRESETS.map((p) => (
                    <button key={p.id} type="button" onClick={() => setSections(new Set(p.sections))} className="pressable min-h-10 rounded-full border border-line px-3 text-xs font-semibold text-violet">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <fieldset>
                <legend className="text-xs text-muted">Pages ({pages.length} {pages.length === 1 ? "page" : "pages"})</legend>
                <ul className="mt-1 space-y-1.5">
                  {AUDIT_SECTIONS.filter((s) => s.kind === "page").map((s) => (
                    <SectionToggle key={s.id} id={s.id} label={s.label} detail={s.detail} on={sections.has(s.id)} locked={s.always} onToggle={toggle} />
                  ))}
                </ul>
              </fieldset>
              <fieldset>
                <legend className="text-xs text-muted">Extra checks <span className="text-faint">(in the prompt now; their own pages come later)</span></legend>
                <ul className="mt-1 space-y-1.5">
                  {AUDIT_SECTIONS.filter((s) => s.kind === "prompt").map((s) => (
                    <SectionToggle key={s.id} id={s.id} label={s.label} detail={s.detail} on={sections.has(s.id)} onToggle={toggle} />
                  ))}
                </ul>
              </fieldset>
              {sections.has("investment") && !plansSet && <p className="text-[11px] text-amber">Plan prices aren&apos;t set yet, so the Investment page will say &quot;prices not set&quot;. The owner adds them in Audits → Settings.</p>}
            </div>
            {nav(2)}
          </section>

          {/* Step 4 */}
          <section className={show(3)} aria-label={STEPS[3]}>
            <div className="glass space-y-3 rounded-3xl p-4">
              <h2 className="font-display text-lg font-bold">4 · Data & save</h2>
              <fieldset className="space-y-1.5">
                <legend className="text-xs text-muted">Data sources</legend>
                <SourceToggle name="mod_dataforseo" label="DataForSEO" detail="Search volume, rankings, competitors, backlinks." on={i.modules?.dataforseo ?? true} />
                <SourceToggle name="mod_leadsnap" label="LeadSnap" detail="Maps heat-map grid, when an export is available." on={i.modules?.leadsnap ?? true} />
                <SourceToggle name="mod_semrush" label="Semrush" detail="Shown side by side with DataForSEO, never merged. Off unless needed." on={i.modules?.semrush ?? false} />
              </fieldset>
              <label className={label}>
                Notes for the audit <span className="text-faint">(optional; no emails or phone numbers)</span>
                <textarea name="notes" rows={3} maxLength={INTAKE_LIMITS.notes} defaultValue={i.notes ?? ""} placeholder="e.g. Wants more kitchen jobs in Folsom" className={cn(field, "py-2")} />
              </label>
              <p className="rounded-xl bg-lime/10 px-3 py-2 text-xs text-lime">Saving costs $0. Nothing is pulled until someone runs the prompt.{capsLine ? ` ${capsLine}` : ""}</p>
              {/* Checkpoints travel with the form */}
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

        {/* Wide screens: sticky summary */}
        <aside className="hidden @3xl:sticky @3xl:top-6 @3xl:block" aria-label="Summary">
          <div className="glass space-y-3 rounded-3xl p-4">
            <h2 className="font-display text-base font-bold">This audit</h2>
            <ol className="space-y-1 text-sm">
              {pageNames.map((n, k) => (
                <li key={n} className="flex gap-2">
                  <span className="w-5 shrink-0 text-right text-faint">{k + 1}</span>
                  <span>{n}</span>
                </li>
              ))}
            </ol>
            {extras.length > 0 && <p className="border-t border-line pt-2 text-xs text-muted">Also in the prompt: {extras.map((e) => e.label).join(", ")}</p>}
            <p className="border-t border-line pt-2 text-xs text-muted">Costs $0 to save.{capsLine ? ` ${capsLine}` : ""}</p>
            {errorBox}
            {saveButton}
          </div>
        </aside>
      </div>
      {!ready && <p className="mt-3 text-xs text-amber">Saving audits needs one setup step first (0023 SQL).</p>}
    </form>
  );
}

function SectionToggle({ id, label: name, detail, on, locked, onToggle }: { id: AuditSectionId; label: string; detail: string; on: boolean; locked?: boolean; onToggle: (id: AuditSectionId) => void }) {
  return (
    <li>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={locked}
        onClick={() => onToggle(id)}
        className={cn("pressable flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left", on ? "border-violet/50 bg-violet/10" : "border-line")}
      >
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-lg border", on ? "border-violet bg-violet text-white" : "border-line")}>{on && <Check aria-hidden className="size-4" />}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            {name}
            {locked && <span className="ml-1.5 text-[10.5px] font-normal text-faint">always included</span>}
          </span>
          <span className="block text-[11.5px] leading-snug text-muted">{detail}</span>
        </span>
      </button>
    </li>
  );
}

function SourceToggle({ name, label: title, detail, on }: { name: string; label: string; detail: string; on: boolean }) {
  return (
    <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-line px-3 py-2">
      <input type="checkbox" name={name} defaultChecked={on} className="size-5 accent-violet" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-[11.5px] leading-snug text-muted">{detail}</span>
      </span>
    </label>
  );
}
