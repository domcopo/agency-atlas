// Work hub (docs/WORK_HUB_PLAN.md Phase 5): shown the instant you open Work, while the list
// loads. Placeholder shapes in the hub's layout (header, chips, filters, rows); the pulse
// turns off for people who prefer reduced motion.

export default function WorkLoading() {
  const pulse = "motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Loading work" className="pt-4 lg:pt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`mr-auto h-8 w-24 rounded-xl bg-white/8 lg:h-10 ${pulse}`} />
        <div className={`h-10 w-48 rounded-xl bg-white/5 ${pulse}`} />
        <div className={`h-10 w-24 rounded-xl bg-violet/20 ${pulse}`} />
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`h-10 w-28 shrink-0 rounded-full bg-white/5 ${pulse}`} />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-10 w-36 rounded-xl bg-white/5 ${pulse}`} />
        ))}
      </div>
      <div className="glass mt-4 overflow-hidden rounded-2xl">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 border-t border-line px-4 py-4 first:border-t-0">
            <div className={`size-5 shrink-0 rounded-md bg-white/8 ${pulse}`} />
            <div className={`h-4 flex-1 rounded-lg bg-white/8 ${pulse}`} />
            <div className={`hidden h-4 w-32 rounded-lg bg-white/5 lg:block ${pulse}`} />
            <div className={`hidden h-4 w-24 rounded-lg bg-white/5 lg:block ${pulse}`} />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading work…</span>
    </div>
  );
}
