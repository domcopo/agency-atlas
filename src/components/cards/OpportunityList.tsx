// Growth: upsell, cross-sell and referral ideas, each tied to one client.
// "Make it a next action" is a person's tap (owner = the client's owner).

import { Check, Lightbulb, Plus } from "lucide-react";
import Link from "next/link";
import { addSuggestedAction } from "@/app/actions";
import { opportunityAction } from "@/lib/ops";

export function OpportunityList({
  items,
  canAdd,
}: {
  items: { slug: string; name: string; monthlyUsd: number; ownerName?: string; ideas: string[]; added: Set<string> }[];
  canAdd: boolean;
}) {
  if (!items.length)
    return <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No opportunities flagged right now. They show up as clients settle in (3+ months).</p>;
  return (
    <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
      {items.map((o) => (
        <li key={o.slug} className="space-y-1.5 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/clients/${o.slug}`} className="text-sm font-semibold hover:underline">
              {o.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">
              ${o.monthlyUsd.toLocaleString("en-US")}/mo · {o.ownerName ?? <span className="text-amber">no owner</span>}
            </span>
          </div>
          {o.ideas.map((idea) => {
            const action = opportunityAction(idea);
            return (
              <div key={idea} className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex min-w-0 flex-1 gap-1.5 text-xs text-muted">
                  <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-lime" />
                  {idea}
                </p>
                {canAdd &&
                  (o.added.has(action.toLowerCase()) ? (
                    <span className="flex items-center gap-1 text-[11px] text-lime">
                      <Check aria-hidden className="size-3" /> Next action added
                    </span>
                  ) : (
                    <form action={addSuggestedAction}>
                      <input type="hidden" name="slug" value={o.slug} />
                      <input type="hidden" name="title" value={action} />
                      <input type="hidden" name="when" value="this_week" />
                      <input type="hidden" name="priority" value="normal" />
                      <button type="submit" className="pressable inline-flex min-h-9 items-center gap-1 rounded-xl border border-violet/40 px-2.5 text-[11px] font-semibold text-violet">
                        <Plus aria-hidden className="size-3" /> {action}
                      </button>
                    </form>
                  ))}
              </div>
            );
          })}
        </li>
      ))}
    </ul>
  );
}
