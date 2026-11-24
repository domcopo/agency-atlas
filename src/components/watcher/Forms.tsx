"use client";

// SEO Watcher forms (Phase B). Every save goes through a server action that checks the
// person's role and the input, and the database checks again (0027). Nothing here sends
// anything anywhere; the round prompt is copy-only.

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  addWatchCompetitor,
  addWatchKeyword,
  addWatchMarket,
  attachWatchResults,
  importWatchFromAudit,
  saveWatchSettings,
  startWatchRound,
  watchClient,
  type WatchFormState,
} from "@/app/actions";
import { US_STATES } from "@/lib/watch/lists";
import { roundEstimate } from "@/lib/watch/rounds";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";
const button = "pressable min-h-11 rounded-xl bg-violet-deep px-4 text-sm font-semibold disabled:opacity-60";

function Status({ state }: { state: WatchFormState }) {
  if (state?.error) return <p role="alert" className="text-xs text-rose">{state.message ? `${state.message} ` : ""}{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-xs text-lime">{state.message ?? "Saved."}</p>;
  return null;
}

/** Start (or resume) watching one client: website + what they do. */
export function WatchClientForm({ clientId, domain, niche, submitLabel }: { clientId: string; domain?: string; niche?: string; submitLabel: string }) {
  const [state, action, pending] = useActionState(watchClient, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          Website
          <input name="domain" required defaultValue={domain} placeholder="example.com" autoComplete="off" className={field} />
        </label>
        <label className="block text-xs text-muted">
          What they do
          <input name="niche" required defaultValue={niche} placeholder="e.g. Home buyers" maxLength={60} className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <Status state={state} />
    </form>
  );
}

export function AddKeywordsForm({ clientId, left }: { clientId: string; left: number }) {
  const [state, action, pending] = useActionState(addWatchKeyword, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="block text-xs text-muted">
        Add keywords (one per line, or separated by commas) · {left} spot{left === 1 ? "" : "s"} left
        <textarea name="keywords" rows={3} maxLength={2000} placeholder={"sell my house fast\nwe buy houses"} className="mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 text-sm text-ink" />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
        <input type="checkbox" name="money" className="size-5 accent-violet" /> These are money keywords (the ones that bring paying jobs)
      </label>
      <button type="submit" disabled={pending || left <= 0} className={button}>
        {pending ? "Adding…" : "Add keywords"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function AddCityForm({ clientId, left }: { clientId: string; left: number }) {
  const [state, action, pending] = useActionState(addWatchMarket, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <label className="block text-xs text-muted">
          City · {left} spot{left === 1 ? "" : "s"} left
          <input name="city" required maxLength={60} placeholder="e.g. Providence" className={field} />
        </label>
        <label className="block text-xs text-muted">
          State
          <select name="state" required defaultValue="" className={field}>
            <option value="" disabled>
              —
            </option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="text-xs text-muted">
        <summary className="pressable flex min-h-11 cursor-pointer list-none items-center">Map position (optional; the first round fills it in)</summary>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            Latitude
            <input name="lat" inputMode="decimal" placeholder="41.82" className={field} />
          </label>
          <label className="block">
            Longitude
            <input name="lng" inputMode="decimal" placeholder="-71.41" className={field} />
          </label>
        </div>
      </details>
      <button type="submit" disabled={pending || left <= 0} className={button}>
        {pending ? "Adding…" : "Add city"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function AddCompetitorForm({ clientId, left }: { clientId: string; left: number }) {
  const [state, action, pending] = useActionState(addWatchCompetitor, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="block text-xs text-muted">
        Competitor website · {left} spot{left === 1 ? "" : "s"} left
        <input name="domain" required placeholder="competitor.com" autoComplete="off" className={field} />
      </label>
      <button type="submit" disabled={pending || left <= 0} className={button}>
        {pending ? "Adding…" : "Add competitor"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function ImportAuditForm({ clientId, audits }: { clientId: string; audits: { id: string; title: string; retrieved: string | null }[] }) {
  const [state, action, pending] = useActionState(importWatchFromAudit, undefined);
  if (!audits.length) return <p className="text-xs text-muted">No saved SEO audits yet. Audits you save in Audits → SEO can fill these lists in one tap.</p>;
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <label className="block text-xs text-muted">
        Copy from a saved SEO audit (towns, competitors, and keywords + starting positions if it has results)
        <select name="auditId" required defaultValue="" className={field}>
          <option value="" disabled>
            Pick an audit
          </option>
          {audits.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
              {a.retrieved ? ` (results ${a.retrieved})` : " (no results yet)"}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={button}>
        {pending ? "Copying…" : "Copy into the lists"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function WatchSettingsForm({ capUsd, keywords, markets, competitors }: { capUsd: number; keywords: number; markets: number; competitors: number }) {
  const [state, action, pending] = useActionState(saveWatchSettings, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="block text-xs text-muted">
          Monthly cap ($)
          <input name="capUsd" type="number" min={0} max={1000} step="0.01" defaultValue={capUsd} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Keywords / client
          <input name="keywords" type="number" min={1} max={200} defaultValue={keywords} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Cities / client
          <input name="markets" type="number" min={1} max={50} defaultValue={markets} className={field} />
        </label>
        <label className="block text-xs text-muted">
          Competitors / client
          <input name="competitors" type="number" min={1} max={50} defaultValue={competitors} className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className={`${button} w-full`}>
        {pending ? "Saving…" : "Save cap and limits"}
      </button>
      <Status state={state} />
    </form>
  );
}

export interface RoundChoice {
  id: string;
  name: string;
  pairs: number;
  cities: number;
}

/** Pick the clients for a round; the estimate updates as you tick (the server works it out again). */
export function StartRoundForm({ clients, volumes, leftUsd, capUsd }: { clients: RoundChoice[]; volumes: boolean; leftUsd: number; capUsd: number }) {
  const [state, action, pending] = useActionState(startWatchRound, undefined);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(clients.filter((c) => c.pairs > 0).map((c) => c.id)));
  const { pairs, est } = useMemo(() => {
    const chosen = clients.filter((c) => picked.has(c.id));
    const p = chosen.reduce((t, c) => t + c.pairs, 0);
    const cities = chosen.reduce((t, c) => t + c.cities, 0);
    return { pairs: p, est: p ? roundEstimate(p, volumes ? cities : 0) : 0 };
  }, [clients, picked, volumes]);
  const over = est > leftUsd;
  return (
    <form action={action} className="space-y-3">
      <ul className="space-y-1.5">
        {clients.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm">
              <input
                type="checkbox"
                name="clientId"
                value={c.id}
                checked={picked.has(c.id)}
                disabled={c.pairs === 0}
                onChange={(e) => {
                  const next = new Set(picked);
                  if (e.target.checked) next.add(c.id);
                  else next.delete(c.id);
                  setPicked(next);
                }}
                className="size-5 accent-violet"
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="shrink-0 text-xs text-muted">{c.pairs ? `${c.pairs} checks` : "needs keywords + a city"}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className={`text-sm ${over ? "text-rose" : "text-muted"}`}>
        {pairs} checks{volumes ? " + this month's search volumes" : ""} · estimate <span className="font-semibold text-ink">${est.toFixed(2)}</span> · ${leftUsd.toFixed(2)} of ${capUsd.toFixed(2)} left this month
        {over && ". Over what's left: pick fewer clients, or the owner can raise the cap."}
      </p>
      <button type="submit" disabled={pending || !pairs || over} className={`${button} w-full`}>
        {pending ? "Starting…" : "Start the round"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function AttachWatchResultsForm({ runId }: { runId: string }) {
  const [state, action, pending] = useActionState(attachWatchResults, undefined);
  if (state?.ok) {
    return (
      <div className="space-y-2">
        <p role="status" className="text-sm text-lime">{state.message}</p>
        <Link href="/growth/watcher" className="pressable inline-flex min-h-11 items-center rounded-xl bg-violet-deep px-4 text-sm font-semibold">
          See the board
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-2.5">
      <input type="hidden" name="runId" value={runId} />
      <label className="block text-xs text-muted">
        Results file
        <input type="file" name="file" accept="application/json,.json" className="mt-1 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-line file:bg-white/5 file:px-3 file:text-sm file:font-semibold file:text-ink" />
      </label>
      <label className="block text-xs text-muted">
        …or paste the results
        <textarea name="results" rows={5} spellCheck={false} className="mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 font-mono text-xs text-ink" />
      </label>
      <button type="submit" disabled={pending} className={`${button} w-full`}>
        {pending ? "Checking…" : "Attach results"}
      </button>
      <Status state={state} />
    </form>
  );
}
