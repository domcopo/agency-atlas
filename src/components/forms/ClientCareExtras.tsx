"use client";

// Client page (0032): contact preferences ("No texts" for STOP replies, preferred channel,
// best times) and the "Needs the owner" button. Owner or manager; the database checks too.

import { useActionState } from "react";
import { raiseEscalation, saveCareContact } from "@/app/actions";
import type { TouchChannel } from "@/lib/journey";

const field = "mt-0.5 block min-h-10 w-full rounded-xl border border-line bg-white/5 px-2 text-sm text-ink";

export function CareContactForm({ clientId, slug, noTexts, channel, bestTimes }: { clientId: string; slug: string; noTexts: boolean; channel: TouchChannel | null; bestTimes: string | null }) {
  const [state, action, pending] = useActionState(saveCareContact, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-line bg-white/5 px-3 text-sm">
        <input type="checkbox" name="noTexts" defaultChecked={noTexts} className="size-4 accent-violet-500" />
        No texts (they replied STOP): use email
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-muted">
          Preferred channel
          <select name="channel" defaultValue={channel ?? ""} className={field}>
            <option value="">Not known</option>
            <option value="call">Call</option>
            <option value="text">Text</option>
            <option value="email">Email</option>
            <option value="video">Video</option>
          </select>
        </label>
        <label className="block text-[11px] text-muted">
          Best times
          <input name="bestTimes" maxLength={80} defaultValue={bestTimes ?? ""} placeholder="Mornings before 10" className={field} />
        </label>
      </div>
      <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl bg-violet-deep px-4 text-xs font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-lime">
          Saved.
        </p>
      )}
    </form>
  );
}

export function NeedsOwnerForm({ clientId, slug }: { clientId: string; slug: string }) {
  const [state, action, pending] = useActionState(raiseEscalation, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block text-[11px] text-muted">
        What&apos;s going on? (one line)
        <input name="reason" required maxLength={200} placeholder="Upset about slow results, wants to talk to the owner" className={field} />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-10 rounded-xl border border-amber/50 px-4 text-xs font-semibold text-amber disabled:opacity-60">
        {pending ? "Sending…" : "Send to the owner"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-rose">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-xs text-lime">
          Sent. The owner sees it on their Home and in Notices.
        </p>
      )}
    </form>
  );
}
