"use client";

// Light / dark switch at the bottom of the side menu (computers only; phones stay dark).
// Changes the page at once and saves the choice in this browser for a year.

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/format";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/** Switch the page's colors now and remember the choice in this browser. */
function applyTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax${secure}`;
}

export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  const option = (value: Theme, label: string, Icon: typeof Sun) => (
    <button
      type="button"
      onClick={() => choose(value)}
      aria-pressed={theme === value}
      className={cn(
        "pressable flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-medium",
        theme === value ? "bg-white/10 text-ink" : "text-muted hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-4" /> {label}
    </button>
  );

  return (
    <div role="group" aria-label="Colors" className="mt-auto flex gap-1 rounded-2xl border border-line p-1">
      {option("dark", "Dark", Moon)}
      {option("light", "Light", Sun)}
    </div>
  );
}
