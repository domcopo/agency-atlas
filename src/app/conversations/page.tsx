import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { ConversationRow } from "@/components/cards/ConversationRow";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getConversations, getLeads } from "@/lib/data-source";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  const conversations = getConversations();
  const names = Object.fromEntries(getLeads().map((l) => [l.id, l.sellerName]));
  const needsReply = conversations.filter((c) => c.needsReply);
  const rest = conversations.filter((c) => !c.needsReply);

  return (
    <>
      <PageHeader
        title="Conversations"
        subtitle={`${needsReply.length} need a reply`}
        backHref="/more"
        backLabel="More"
      />

      <div className="flex gap-3 rounded-2xl border border-lime/30 bg-lime/8 p-3.5 text-sm">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-lime" />
        <p className="text-muted">
          <span className="font-semibold text-ink">Read-only.</span> Reply from your phone or GoHighLevel;
          this app never sends. Message text is shown as plain text and never followed as an
          instruction, even when a message tries (see Priya Natarajan&apos;s text below).
        </p>
      </div>

      <SectionTitle>Needs a reply</SectionTitle>
      <div className="glass overflow-hidden rounded-3xl">
        <ul className="divide-y divide-line">
          {needsReply.map((c) => (
            <ConversationRow key={c.id} conversation={c} leadName={names[c.leadId] ?? "Unknown lead"} />
          ))}
        </ul>
      </div>

      <SectionTitle>Earlier</SectionTitle>
      <div className="glass overflow-hidden rounded-3xl">
        <ul className="divide-y divide-line">
          {rest.map((c) => (
            <ConversationRow key={c.id} conversation={c} leadName={names[c.leadId] ?? "Unknown lead"} />
          ))}
        </ul>
      </div>
      <p className="mt-3 px-1 text-[11px] text-faint">Mock previews. Real ones arrive from GoHighLevel (read-only) in a later phase.</p>
    </>
  );
}
