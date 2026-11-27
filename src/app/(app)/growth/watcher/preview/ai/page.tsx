// AI Search Watch on the fictional sample (docs/AI_VISIBILITY_PLAN.md, Phase G1): do
// ChatGPT, Gemini and Google's AI Overview name each client? Every number is computed in
// src/lib/watch/ai.ts from made-up answers; nothing is fetched and nothing costs money.

import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { AiSearchBoard } from "@/components/watcher/AiSearch";
import { SampleNotice, WATCH_BASE, WatchTabs } from "@/components/watcher/Bits";
import { getMember, getWatchAiPreview, usesDatabase } from "@/lib/data-source";
import { isLead } from "@/lib/roles";
import { aiRoundCost, buildAiBoard } from "@/lib/watch/ai";

export const metadata: Metadata = { title: "AI search (sample)" };

export default async function WatcherAiPage() {
  if (usesDatabase() && !isLead((await getMember())?.role)) return <RoleNotice title="SEO Watcher" />;
  const preview = getWatchAiPreview();
  const board = buildAiBoard(preview.clients, preview.ai);
  const cost = aiRoundCost(preview.ai.questions.length, preview.ai.engines);
  const costLine = `A real round this size (${preview.ai.questions.length} questions, ${cost.answers} answers) would cost about $${cost.usd.toFixed(2)} at DataForSEO's prices checked 2026-11-25.`;

  return (
    <>
      <PageHeader title="AI search" subtitle="Do ChatGPT, Gemini and Google's AI Overview name our clients?" backHref={WATCH_BASE} backLabel="Board" />
      <SampleNotice />
      <WatchTabs active="AI search" />
      <AiSearchBoard board={board} costLine={costLine} />
    </>
  );
}
