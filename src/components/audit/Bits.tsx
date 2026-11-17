// Small shared pieces for the audit pages. Every number goes through these, so a
// missing figure always prints "not found" and an unconfirmed claim is flagged.

import type { Assumed } from "@/lib/audit/config";
import type { Fig, Grade } from "@/lib/audit/data";
import { fmtNum, NOT_FOUND } from "@/lib/audit/format";

/** A sourced figure: its value, or "not found", plus any "unverified" flag. */
export function FigValue({ fig, format = (v) => fmtNum(v) }: { fig: Fig | undefined; format?: (v: number) => string }) {
  if (!fig || fig.value === null) {
    return (
      <>
        <span className="audit-nf">{NOT_FOUND}</span>
        {fig?.unverified && <span className="audit-unverified">{fig.unverified}</span>}
      </>
    );
  }
  return (
    <>
      {format(fig.value)}
      {fig.unverified && <span className="audit-unverified">{fig.unverified}</span>}
    </>
  );
}

export function Missing() {
  return <span className="audit-nf">{NOT_FOUND}</span>;
}

/** Organic/Maps position badge: green 1–3, amber 4–10, red 11+; dash when not ranking. */
export function Pos({ p }: { p: number | null | undefined }) {
  if (p === null || p === undefined) return <span className="audit-dash">—</span>;
  return <span className={`audit-pos ${rankBand(p)}`}>{p}</span>;
}

export function rankBand(p: number): "top" | "mid" | "low" {
  return p <= 3 ? "top" : p <= 10 ? "mid" : "low";
}

export function GradeTag({ grade }: { grade: Grade }) {
  return <span className={`audit-tag ${grade}`}>{grade}</span>;
}

/** Shows "assumption" next to any input the client hasn't confirmed yet. */
export function BasisTag({ value }: { value: Assumed }) {
  return value.basis === "assumption" ? <span className="audit-tag assumption">assumption</span> : <span className="audit-tag good">client figure</span>;
}

export function ModelTag() {
  return <span className="audit-tag model">model</span>;
}
