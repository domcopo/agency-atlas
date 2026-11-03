// Shared search box and filter chips for the Leads and Buyers lists.

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function SearchBox({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="glass flex min-h-12 items-center gap-2 rounded-2xl px-3.5">
      <Search aria-hidden className="size-4 text-muted" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={80}
        autoComplete="off"
        className="w-full bg-transparent py-3 text-[16px] text-ink placeholder:text-faint focus:outline-none"
      />
    </label>
  );
}

export function Chip({
  active,
  onClick,
  children,
  count,
  tone = "violet",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  tone?: "violet" | "teal" | "amber";
}) {
  const activeStyle = {
    violet: "border-violet/60 bg-violet/20 text-ink",
    teal: "border-teal/60 bg-teal/15 text-teal",
    amber: "border-amber/60 bg-amber/15 text-amber",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "pressable flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold",
        active ? activeStyle : "border-line bg-white/5 text-muted hover:text-ink",
      )}
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-ink">{count}</span>
      )}
      {active && tone !== "violet" && <X aria-hidden className="size-3" />}
    </button>
  );
}

export function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}
