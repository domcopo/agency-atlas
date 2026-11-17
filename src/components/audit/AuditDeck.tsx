// All eight pages in order. On screen each page is scaled to fit; printing gives one
// 1280×720 page per slide (browser "Save as PDF").

import type { AuditBundle } from "@/lib/audit/data";
import { CompetitorsPage } from "./pages/CompetitorsPage";
import { FixesPage } from "./pages/FixesPage";
import { FootprintPage } from "./pages/FootprintPage";
import { KeywordsPage } from "./pages/KeywordsPage";
import { PlanPage } from "./pages/PlanPage";
import { RankingsPage } from "./pages/RankingsPage";
import { RevenuePage } from "./pages/RevenuePage";
import { SummaryPage } from "./pages/SummaryPage";
import { ScaledSlide } from "./ScaledSlide";

export const AUDIT_PAGES = [SummaryPage, RankingsPage, FootprintPage, CompetitorsPage, FixesPage, KeywordsPage, RevenuePage, PlanPage];

export function AuditDeck({ bundle }: { bundle: AuditBundle }) {
  return (
    <>
      {AUDIT_PAGES.map((Page, i) => (
        <ScaledSlide key={i}>
          <Page bundle={bundle} />
        </ScaledSlide>
      ))}
    </>
  );
}
