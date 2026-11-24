// One 1280×720 audit page: title block, body, and the footer with sources and page number.

import type { ReactNode } from "react";
import type { AuditBundle } from "@/lib/audit/data";
import { SOURCE_LABELS } from "@/lib/audit/data";
import { fmtDate } from "@/lib/audit/format";

export const AUDIT_PAGE_COUNT = 8;

/** What every page component takes. Page number and count change when checkpoints are off. */
export interface AuditPageProps {
  bundle: AuditBundle;
  pageNo?: number;
  pageCount?: number;
  /** Last page only: which halves to show (SEO timeline, Investment). */
  show?: { timeline: boolean; investment: boolean };
}

interface SlideProps {
  bundle: AuditBundle;
  page: number;
  pageCount?: number;
  title: string;
  aside?: string;
  kicker?: string;
  subtitle?: string;
  children: ReactNode;
}

export function Slide({ bundle, page, pageCount = AUDIT_PAGE_COUNT, title, aside, kicker, subtitle, children }: SlideProps) {
  const { config, data } = bundle;
  const sources = data.sourcesUsed.map((s) => SOURCE_LABELS[s]).join(" · ") || "not pulled yet";
  return (
    <section className="audit-slide" aria-label={`Page ${page}: ${title}`}>
      {bundle.sample && <span className="audit-sample-chip">SAMPLE · FICTIONAL BUSINESS · DRY RUN $0</span>}
      {kicker && <p className="audit-kicker">{kicker}</p>}
      <h2 className="audit-title">
        {title}
        {aside && <small>/ {aside}</small>}
      </h2>
      {subtitle && <p className="audit-sub">{subtitle}</p>}
      <div className="audit-body">{children}</div>
      <footer className="audit-footer">
        <b>{config.agency.name.toUpperCase()}</b>
        <span>
          Custom SEO Audit · {config.company.domain} · Data retrieved {fmtDate(data.retrieved)} ({sources})
        </span>
        <span>
          Page {page} / {pageCount}
        </span>
      </footer>
    </section>
  );
}
