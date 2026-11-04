"use client";

import { useActionState } from "react";
import { signIn } from "@/app/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, undefined);
  return (
    <form action={action} className="mt-5 space-y-3">
      <label className="block text-sm">
        <span className="text-muted">Email</span>
        <input name="email" type="email" autoComplete="email" required className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-ink" />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Password</span>
        <input name="password" type="password" autoComplete="current-password" required minLength={8} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-ink" />
      </label>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-rose/10 px-3 py-2 text-xs text-rose">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep font-semibold text-ink disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
