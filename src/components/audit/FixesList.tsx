// The prioritized fixes, numbered.

export function FixesList({ fixes }: { fixes: { title: string; detail: string }[] }) {
  return (
    <ol className="audit-fixes">
      {fixes.map((f) => (
        <li key={f.title}>
          <b>{f.title}</b> — {f.detail}
        </li>
      ))}
    </ol>
  );
}
