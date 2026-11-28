// The prioritized fixes, numbered.

export function FixesList({ fixes }: { fixes: { title: string; detail: string }[] }) {
  // Five long fixes (up to ~320 characters each) don't fit the card at full size: step down.
  const chars = fixes.reduce((n, f) => n + f.title.length + f.detail.length, 0);
  const size = chars > 1100 ? 12 : chars > 850 ? 13 : 14;
  return (
    <ol className="audit-fixes" style={{ fontSize: size, lineHeight: size < 14 ? 1.4 : 1.5 }}>
      {fixes.map((f) => (
        <li key={f.title}>
          <b>{f.title}</b> — {f.detail}
        </li>
      ))}
    </ol>
  );
}
