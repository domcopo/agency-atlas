"use client";

// Search and group the client roster. The server already decided what this page
// may show; this only narrows it down on screen.

import { AlertCircle, ChevronRight, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cn, formatDate, formatUsdExact } from "@/lib/format";
import type { RosterClient, SubscriptionStatus } from "@/lib/types";
import { EmptyState, StatusPill } from "@/components/labels/labels";
import { Chip, ChipRow, SearchBox } from "./Filters";

export interface RosterRow extends RosterClient {
  tenure: string;
  tier: "high" | "mid" | "low";
}

const groups: { id: string; title: string; hint: string; match: (c: RosterRow) => boolean }[] = [
  { id: "high", title: "$500+ high tier", hint: "Active, $500 or more a month", match: (c) => c.status === "active" && c.tier === "high" },
  { id: "mid", title: "$150–499 mid tier", hint: "Active, $150–$499 a month", match: (c) => c.status === "active" && c.tier === "mid" },
  { id: "low", title: "Under $150 low tier", hint: "Active, under $150 a month", match: (c) => c.status === "active" && c.tier === "low" },
  { id: "paused", title: "Paused or unpaid", hint: "Win-back opportunities", match: (c) => c.status === "paused" },
  { id: "canceled", title: "Canceled & expired", hint: "Past clients", match: (c) => c.status === "canceled" || c.status === "incomplete_expired" },
];

type Filter = "all" | SubscriptionStatus | "check";

export function RosterBrowser({ clients }: { clients: RosterRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clients.filter((c) => {
      if (filter === "check" && !c.check) return false;
      if (filter !== "all" && filter !== "check" && c.status !== filter) return false;
      return !q || c.name.toLowerCase().includes(q);
    });
  }, [clients, query, filter]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
    { id: "canceled", label: "Canceled" },
    { id: "check", label: "Needs check" },
  ];

  return (
    <div>
      <SearchBox value={query} onChange={setQuery} label="Search clients" placeholder="Search client name…" />
      <div className="mt-3">
        <ChipRow label="Filter clients">
          {filters.map((f) => (
            <Chip
              key={f.id}
              active={filter === f.id}
              onClick={() => setFilter(f.id)}
              count={f.id === "check" ? clients.filter((c) => c.check).length : undefined}
            >
              {f.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {results.length === 0 && (
        <div className="mt-5">
          <EmptyState icon={<SearchX className="size-5" />} title="No matches">
            Try a different name, or clear the filter.
          </EmptyState>
        </div>
      )}

      {groups.map((g) => {
        const rows = results.filter(g.match);
        if (rows.length === 0) return null;
        const total = rows.reduce((n, c) => n + c.monthlyUsd, 0);
        return (
          <section key={g.id} id={g.id} aria-labelledby={`h-${g.id}`} className="mt-6 scroll-mt-16">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 id={`h-${g.id}`} className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                {g.title} <span className="text-faint">· {rows.length}</span>
              </h2>
              <span className={cn("text-xs font-semibold", g.id === "canceled" ? "text-faint" : "text-ink")}>
                {formatUsdExact(Math.round(total * 100) / 100)}/mo
              </span>
            </div>
            <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="pressable flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        <span className="truncate">{c.name}</span>
                        {c.check && <AlertCircle aria-label="Needs checking" className="size-3.5 shrink-0 text-amber" />}
                      </p>
                      <p className="text-xs text-muted">
                        {c.tenure} · since {formatDate(c.startDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formatUsdExact(c.monthlyUsd)}</span>
                      <StatusPill status={c.status} />
                    </div>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-faint" />
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1.5 px-1 text-[11px] text-faint">{g.hint}</p>
          </section>
        );
      })}
    </div>
  );
}
