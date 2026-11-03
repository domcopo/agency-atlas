import { ChevronRight, Layers, Lightbulb, MessagesSquare, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { GlassCard } from "@/components/cards/GlassCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { getBuyers, getConversations, getInsights } from "@/lib/data-source";

export const metadata: Metadata = { title: "More" };

export default function MorePage() {
  const items = [
    {
      href: "/buyers",
      label: "Buyers Dex",
      detail: `${getBuyers().length} cash buyers, buy boxes and reliability`,
      icon: Layers,
      color: "text-violet bg-violet/12",
    },
    {
      href: "/conversations",
      label: "Conversations",
      detail: `${getConversations().filter((c) => c.needsReply).length} need a reply · read-only`,
      icon: MessagesSquare,
      color: "text-amber bg-amber/12",
    },
    {
      href: "/insights",
      label: "Insights",
      detail: `${getInsights().length} patterns for a person to review`,
      icon: Lightbulb,
      color: "text-teal bg-teal/12",
    },
    {
      href: "/safety",
      label: "Data Safety",
      detail: "What's connected, what's kept, and the GoHighLevel read-only lock",
      icon: ShieldCheck,
      color: "text-lime bg-lime/12",
    },
  ];

  return (
    <>
      <PageHeader title="More" />
      <ul className="space-y-2.5">
        {items.map(({ href, label, detail, icon: Icon, color }) => (
          <li key={href}>
            <GlassCard href={href} label={`Open ${label}`} className="flex items-center gap-3">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${color}`}>
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="block text-xs text-muted">{detail}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 shrink-0 text-faint" />
            </GlassCard>
          </li>
        ))}
      </ul>
    </>
  );
}
