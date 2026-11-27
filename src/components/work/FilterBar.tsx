"use client";

// Work filters: person, client, type and priority. Changing one reloads the list with
// the new address (a plain GET form, so the back button and bookmarks work). The view,
// chip and search words ride along as hidden fields.

import type { ReactNode } from "react";

const select = "min-h-10 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function FilterBar({
  hidden,
  who,
  client,
  type,
  prio,
  staff,
  clients,
  types,
  children,
}: {
  hidden: Record<string, string | undefined>;
  who: string;
  client: string;
  type: string;
  prio: string;
  staff: { id: string; name: string }[];
  clients: { slug: string; name: string }[];
  types: { id: string; label: string }[];
  /** Saved views and "Clear all", shown beside the filters. */
  children?: ReactNode;
}) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <form method="get" action="/work" className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="w-[calc(50%-0.25rem)] sm:w-40">
        <span className="sr-only">Person</span>
        <select name="who" defaultValue={who} onChange={submit} className={select}>
          <option value="">Everyone</option>
          {staff.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="none">No one assigned</option>
        </select>
      </label>
      <label className="w-[calc(50%-0.25rem)] sm:w-44">
        <span className="sr-only">Client</span>
        <select name="client" defaultValue={client} onChange={submit} className={select}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="w-[calc(50%-0.25rem)] sm:w-36">
        <span className="sr-only">Type</span>
        <select name="type" defaultValue={type} onChange={submit} className={select}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="w-[calc(50%-0.25rem)] sm:w-32">
        <span className="sr-only">Priority</span>
        <select name="prio" defaultValue={prio} onChange={submit} className={select}>
          <option value="">Any priority</option>
          <option value="critical">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>
      <button type="submit" className="sr-only">
        Apply filters
      </button>
      {children}
    </form>
  );
}
