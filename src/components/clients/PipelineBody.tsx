// Full pipeline (Clients page → "Open full pipeline"): every client grouped by stage, then by
// touch, with filters. Plain GET filters in the address bar; no data leaves the page.

import Link from "next/link";
import { healthStyle } from "@/components/labels/labels";
import { cn } from "@/lib/format";
import type { PipelineFilters, PipelineStage } from "@/lib/journey-line";
import { dotClasses, StateBadge, STAGE_COLORS, TIMING_WORDS } from "./dot-style";

const field = "min-h-10 rounded-xl border border-line bg-bg-raised px-2 text-sm text-ink";

export function pipelineQuery(f: PipelineFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ view: "pipeline", ...extra });
  if (f.service) q.set("service", f.service);
  if (f.owner) q.set("owner", f.owner);
  if (f.health) q.set("health", f.health);
  if (f.overdueOnly) q.set("overdue", "1");
  return `/clients?${q.toString()}`;
}

export function PipelineBody({ stages, filters, staff, sample }: { stages: PipelineStage[]; filters: PipelineFilters; staff: { id: string; name: string }[]; sample: boolean }) {
  const total = stages.reduce((n, s) => n + s.count, 0);
  const filtered = Boolean(filters.service || filters.owner || filters.health || filters.overdueOnly);
  return (
    <div className="mx-auto max-w-[100rem]">
      <form method="get" action="/clients" className="flex flex-wrap items-end gap-2" aria-label="Filter the pipeline">
        <input type="hidden" name="view" value="pipeline" />
        <label className="text-[11px] text-muted">
          Service
          <select name="service" defaultValue={filters.service ?? ""} className={cn(field, "mt-0.5 block")}>
            <option value="">All</option>
            <option value="SEO">SEO</option>
            <option value="Ads">Ads</option>
            <option value="Website">Website</option>
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Main person
          <select name="owner" defaultValue={filters.owner ?? ""} className={cn(field, "mt-0.5 block")}>
            <option value="">Anyone</option>
            <option value="none">No one set</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-muted">
          Health
          <select name="health" defaultValue={filters.health ?? ""} className={cn(field, "mt-0.5 block")}>
            <option value="">Any</option>
            <option value="healthy">Healthy</option>
            <option value="watch">Watch</option>
            <option value="at_risk">At risk</option>
          </select>
        </label>
        <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm">
          <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdueOnly} className="size-4 accent-violet" />
          Overdue only
        </label>
        <button type="submit" className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-sm font-semibold text-white">
          Apply
        </button>
        {filtered && (
          <Link href="/clients?view=pipeline" scroll={false} className="pressable flex min-h-10 items-center px-2 text-sm text-violet">
            Clear
          </Link>
        )}
      </form>
      <p className="mt-2 text-xs text-faint">
        {total} client{total === 1 ? "" : "s"}
        {filtered ? " match" : " on the journey (active clients)"}
        {sample ? " · sample data" : ""}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stages.map((s) => (
          <section key={s.stage} id={`stage-${s.stage}`} aria-labelledby={`stage-h-${s.stage}`} className="glass scroll-mt-4 rounded-3xl p-4">
            <h3 id={`stage-h-${s.stage}`} className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn("h-2 w-5 rounded-full", STAGE_COLORS[s.stage])} />
                {s.label}
              </span>
              <span className="text-xs font-normal text-faint">{s.count}</span>
            </h3>
            {s.touches.length === 0 ? (
              <p className="mt-2 text-xs text-faint">No one here{filtered ? " with these filters" : ""}.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {s.touches.map((t) => (
                  <div key={t.step}>
                    <p className="text-[11px] font-semibold text-muted">
                      {t.step <= 27 ? `Touch ${t.step} · ` : ""}
                      {t.title}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {t.clients.map((c) => (
                        <li key={c.slug}>
                          <Link href={pipelineQuery(filters, { client: c.slug })} scroll={false} className="pressable flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-white/5">
                            <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", dotClasses(c.timing, c.reachedOut))}>
                              {c.initials}
                              <StateBadge timing={c.timing} reachedOut={c.reachedOut} className="absolute -right-1 -top-1" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{c.name}</span>
                              <span className="block truncate text-[11px] text-muted">
                                <span className={c.timing === "overdue" ? "text-rose" : c.timing === "today" ? "text-amber" : undefined}>{TIMING_WORDS[c.timing]}</span>
                                {c.reachedOut ? " · reached out" : ""}
                                {c.ownerName ? ` · ${c.ownerName}` : ""}
                                {c.health ? (
                                  <>
                                    {" · "}
                                    <span className={healthStyle[c.health].text}>{healthStyle[c.health].label}</span>
                                  </>
                                ) : null}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
