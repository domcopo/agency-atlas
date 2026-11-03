// One conversation preview. The preview text is UNTRUSTED (it was written by
// someone outside the team), so it is rendered as plain text only — React
// escapes it, and nothing in this app reads it as an instruction.

import { Mail, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { cn, formatShortDate } from "@/lib/format";
import type { Channel, Conversation } from "@/lib/types";

const channelIcon: Record<Channel, { icon: typeof Mail; label: string }> = {
  sms: { icon: MessageSquare, label: "Text" },
  call: { icon: Phone, label: "Call" },
  email: { icon: Mail, label: "Email" },
};

export function ConversationRow({ conversation: c, leadName }: { conversation: Conversation; leadName: string }) {
  const { icon: Icon, label } = channelIcon[c.channel];
  return (
    <li>
      <Link href={`/leads/${c.leadId}`} className="pressable flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03]">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            c.needsReply ? "bg-amber/12 text-amber" : "bg-white/5 text-muted",
          )}
        >
          <Icon aria-hidden className="size-4" />
          <span className="sr-only">{label}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm">
            <span className={cn("truncate", c.unread ? "font-semibold" : "font-medium")}>{leadName}</span>
            {c.unread && <span aria-label="Unread" className="size-2 shrink-0 rounded-full bg-violet" />}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted">
            <span className="text-faint">
              {c.channel === "call" ? "Call note: " : c.lastDirection === "inbound" ? "Them: " : "Us: "}
            </span>
            {c.preview}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <time dateTime={c.at} className="text-[11px] text-faint">
            {formatShortDate(c.at)}
          </time>
          {c.needsReply && <span className="text-[10px] font-semibold text-amber">Needs reply</span>}
        </div>
      </Link>
    </li>
  );
}
