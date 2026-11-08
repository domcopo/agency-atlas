"use client";

// Quick add: type (or tap the keyboard's microphone and talk), and/or add a photo or
// screenshot. The AI outlines draft work orders; nothing is saved until a person taps
// Add on each one. The photo is shrunk here on the phone first (which also drops its
// location data), sent once with the request, and never stored.

import { ImagePlus, Mic, Sparkles, X } from "lucide-react";
import { startTransition, useActionState, useEffect, useState } from "react";
import { quickAddWorkOrders, type QuickAddState } from "@/app/actions";
import { WorkOrderForm } from "@/components/forms/WorkOrderForm";
import { minutesLabel } from "@/lib/ops";

const field = "mt-1 w-full rounded-xl border border-line bg-white/5 px-3 py-2 text-sm text-ink";
const MAX_SIDE = 1568; // the AI reads pictures best up to this size

/** Shrink a picture to JPEG (max 1568px on the long side). Drawing it fresh drops location and camera data. */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error("no image");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

export function QuickAddWorkOrders({
  clients,
  staff,
  today,
  disabled,
  disabledNote,
}: {
  clients: { slug: string; name: string }[];
  staff: { id: string; name: string }[];
  today: string;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [state, run, pending] = useActionState<QuickAddState | undefined, FormData>(quickAddWorkOrders, undefined);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const f = e.target.files?.[0];
    e.target.value = ""; // the shrunk copy is what gets sent
    if (!f) return;
    try {
      const small = await shrink(f);
      setPhoto(small);
      setPreview(URL.createObjectURL(small));
    } catch {
      setPhotoError("Couldn't read that photo here. Try a screenshot instead.");
    }
  }

  function clearPhoto() {
    setPhoto(null);
    setPreview(null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.delete("pick");
    if (photo) fd.set("image", photo);
    startTransition(() => run(fd));
  }

  return (
    <div className="space-y-2.5">
      <form onSubmit={submit} className="glass space-y-2.5 rounded-3xl p-4">
        <label className="block text-xs text-muted">
          What needs doing?
          <textarea
            name="note"
            rows={4}
            maxLength={3000}
            disabled={disabled}
            placeholder={"e.g. Client texted that the contact form on their site is broken and they want new photos on the homepage by Friday."}
            className={field}
          />
        </label>
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <Mic aria-hidden className="size-3.5" /> To talk instead of type, tap the microphone on your phone&apos;s keyboard.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input name="pick" type="file" accept="image/*" onChange={pick} disabled={disabled} className="sr-only" id="quick-add-photo" />
          <label htmlFor="quick-add-photo" className="pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3 text-xs font-semibold">
            <ImagePlus aria-hidden className="size-4" /> {photo ? "Change photo" : "Add a photo or screenshot"}
          </label>
          {preview && (
            <span className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:), not a page image */}
              <img src={preview} alt="Photo to send with this request" className="size-11 rounded-lg object-cover" />
              <button type="button" onClick={clearPhoto} className="pressable inline-flex min-h-11 items-center gap-1 rounded-xl px-2 text-xs text-muted" aria-label="Remove the photo">
                <X aria-hidden className="size-4" /> Remove
              </button>
            </span>
          )}
        </div>
        {photoError && <p role="alert" className="text-xs text-rose">{photoError}</p>}
        <p className="rounded-xl border border-amber/30 bg-amber/5 px-3 py-2 text-[11px] text-muted">
          <span className="font-semibold text-amber">About photos:</span> typed names are swapped for codes before anything is sent, but a picture goes to the AI (Anthropic) as it is. Crop out phone numbers, emails and addresses first. The photo isn&apos;t saved anywhere.
        </p>

        <button type="submit" disabled={pending || disabled} className="pressable inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
          <Sparkles aria-hidden className="size-4" />
          {pending ? "Outlining…" : "Turn it into work orders"}
        </button>
        {disabled && disabledNote && <p className="text-[11px] text-faint">{disabledNote}</p>}
        {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
      </form>

      {state?.drafts && (
        <div className="space-y-2.5" aria-live="polite">
          <p className="px-1 text-sm">{state.drafts.headline || "Here's the outline."}</p>
          {state.drafts.orders.length === 0 && <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No work found in that. Try adding a bit more detail.</p>}
          {state.drafts.orders.map((d, i) => (
            <article key={`${i}-${d.title}`} className="glass animate-rise-in rounded-3xl p-3.5" style={{ animationDelay: `${i * 60}ms` }}>
              <p className="text-sm font-semibold">{d.title}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {d.clientName ?? <span className="text-amber">pick the client</span>} · {d.priority} · {d.estMinutes ? `~${minutesLabel(d.estMinutes)}` : "no estimate"} ·{" "}
                {d.assigneeName ? <span className="text-violet">suggested: {d.assigneeName}{d.assigneeWhy ? ` (${d.assigneeWhy})` : ""}</span> : "no one suggested"}
              </p>
              {d.why && <p className="mt-1 text-xs text-muted">{d.why}</p>}
              {d.steps.length > 0 && (
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-muted">
                  {d.steps.map((s, j) => (
                    <li key={`${j}-${s}`}>{s}</li>
                  ))}
                </ol>
              )}
              <details className="mt-2">
                <summary className="pressable inline-flex min-h-10 cursor-pointer list-none items-center rounded-xl border border-violet/40 bg-violet/10 px-3 text-xs font-semibold">Review and add</summary>
                <div className="mt-2">
                  <WorkOrderForm
                    clients={clients}
                    staff={staff}
                    today={today}
                    fromDraft
                    submitLabel="Add this work order"
                    defaults={{ slug: d.clientSlug ?? undefined, title: d.title, steps: d.steps.join("\n"), priority: d.priority, ownerId: d.assigneeId ?? undefined, est: d.estMinutes, notes: d.why.slice(0, 500) }}
                  />
                </div>
              </details>
            </article>
          ))}
          <p className="px-1 text-[11px] text-faint">
            AI outline: check each one before adding; it can be wrong. Not saved: leaving this page clears it.
            {state.costUsd !== undefined ? ` Cost: $${state.costUsd.toFixed(3)}.` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
