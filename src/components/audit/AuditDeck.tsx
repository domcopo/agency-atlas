// The audit pages in order (all eight, or only the checkpoints picked for this audit). On screen each page is scaled to fit; printing gives one
// 1280×720 page per slide (browser "Save as PDF").

import type { AuditBundle } from "@/lib/audit/data";
import { AUDIT_SECTION_IDS, deckPages, type AuditSectionId, type DeckPageKey } from "@/lib/audit/sections";
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

const PAGE_BY_KEY: Record<DeckPageKey, (typeof AUDIT_PAGES)[number]> = {
  summary: SummaryPage,
  rankings: RankingsPage,
  heatmap: FootprintPage,
  competitors: CompetitorsPage,
  fixes: FixesPage,
  keywords: KeywordsPage,
  revenue: RevenuePage,
  plan: PlanPage,
};

/** The chosen pages (all of them when `sections` is left out), numbered 1…N. */
export function AuditDeck({ bundle, sections }: { bundle: AuditBundle; sections?: readonly AuditSectionId[] }) {
  const keys = deckPages(sections ?? AUDIT_SECTION_IDS);
  const on = new Set(sections ?? AUDIT_SECTION_IDS);
  const show = { timeline: on.has("timeline"), investment: on.has("investment") };
  return (
    <>
      {keys.map((key, i) => {
        const Page = PAGE_BY_KEY[key];
        return (
          <ScaledSlide key={key}>
            <Page bundle={bundle} pageNo={i + 1} pageCount={keys.length} show={show} />
          </ScaledSlide>
        );
      })}
    </>
  );
}
