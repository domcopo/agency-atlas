// Shows a Kit page's text. Everything is rendered as plain React text (never as HTML),
// with only headings, lists, bold and https links recognized (src/lib/kit.ts).

import { parseKitText, type Inline } from "@/lib/kit";

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.t === "bold" ? (
          <strong key={i} className="font-semibold text-ink">
            {p.v}
          </strong>
        ) : p.t === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-violet underline-offset-2 hover:underline">
            {p.v}
          </a>
        ) : (
          <span key={i}>{p.v}</span>
        ),
      )}
    </>
  );
}

export function KitText({ body }: { body: string }) {
  const blocks = parseKitText(body);
  if (!blocks.length) return <p className="text-sm text-faint">Nothing written yet.</p>;
  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-muted">
      {blocks.map((b, i) =>
        b.t === "h1" ? (
          <h2 key={i} className="pt-1 font-display text-lg font-bold text-ink">
            <Parts parts={b.parts} />
          </h2>
        ) : b.t === "h2" ? (
          <h3 key={i} className="pt-1 text-sm font-semibold text-ink">
            <Parts parts={b.parts} />
          </h3>
        ) : b.t === "p" ? (
          <p key={i}>
            <Parts parts={b.parts} />
          </p>
        ) : b.t === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Parts parts={it} />
              </li>
            ))}
          </ul>
        ) : b.t === "ol" ? (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((it, j) => (
              <li key={j}>
                <Parts parts={it} />
              </li>
            ))}
          </ol>
        ) : null,
      )}
    </div>
  );
}
