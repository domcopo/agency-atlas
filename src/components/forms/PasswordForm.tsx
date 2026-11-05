"use client";

// Change your own password. Sent straight to Supabase over HTTPS; never stored or logged by this app.

import { useActionState } from "react";
import { changePassword } from "@/app/actions";

const field = "mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-sm text-ink";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="space-y-2.5">
      <label className="block text-xs text-muted">
        New password (12+ characters)
        <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} className={field} />
      </label>
      <label className="block text-xs text-muted">
        Type it again
        <input name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={72} className={field} />
      </label>
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Change password"}
      </button>
      {state?.ok && <p role="status" className="text-xs text-lime">Password changed. Use it next time you sign in.</p>}
      {state?.error && <p role="alert" className="text-xs text-rose">{state.error}</p>}
    </form>
  );
}
