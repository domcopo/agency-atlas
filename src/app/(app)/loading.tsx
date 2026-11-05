// Shown the instant you tap a tab or link, while the next screen loads.
// Plain placeholder shapes; the pulse turns off for people who prefer reduced motion.

export default function Loading() {
  const block = "glass rounded-3xl motion-safe:animate-pulse";
  return (
    <div role="status" aria-label="Loading" className="space-y-3 pt-6">
      <div className="h-8 w-40 rounded-xl bg-white/8 motion-safe:animate-pulse" />
      <div className="h-4 w-56 rounded-lg bg-white/5 motion-safe:animate-pulse" />
      <div className="grid grid-cols-4 gap-2 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-20 ${block}`} />
        ))}
      </div>
      <div className={`h-24 ${block}`} />
      <div className={`h-40 ${block}`} />
      <div className={`h-32 ${block}`} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
