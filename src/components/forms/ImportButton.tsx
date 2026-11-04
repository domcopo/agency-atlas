"use client";

import { useActionState } from "react";
import { importPrivateData } from "@/app/actions";

export function ImportButton() {
  const [state, action, pending] = useActionState(importPrivateData, undefined);
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Importing…" : "Import client list from this Mac"}
      </button>
      {state?.message && <p role="status" className="text-xs text-lime">{state.message}</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
