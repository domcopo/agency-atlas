"use client";

// Second sign-in step. First time: shows a QR code to scan with an authenticator
// app (Google Authenticator, 1Password, Authy, Apple Passwords...), then asks for a
// code to confirm. After that: just asks for the current 6-digit code.

import { useActionState, useState, useTransition } from "react";
import { startTwoFactor, verifyTwoFactor } from "@/app/actions";

export function TwoFactorForm({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(verifyTwoFactor, undefined);
  const [setup, setSetup] = useState<{ qr?: string; secret?: string; error?: string } | null>(null);
  const [starting, startTransition] = useTransition();
  const showCode = enabled || Boolean(setup?.qr);

  return (
    <div className="mt-5 space-y-4">
      {!enabled && !setup?.qr && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            Protect your account with a second step: a 6-digit code from an authenticator app on your phone. Install one first
            (Google Authenticator, Authy, 1Password or Apple Passwords all work).
          </p>
          <button
            type="button"
            disabled={starting}
            onClick={() => startTransition(async () => setSetup(await startTwoFactor()))}
            className="pressable min-h-11 w-full rounded-xl bg-violet-deep font-semibold text-ink disabled:opacity-60"
          >
            {starting ? "Starting…" : "Set up two-factor"}
          </button>
          {setup?.error && (
            <p role="alert" className="rounded-xl bg-rose/10 px-3 py-2 text-xs text-rose">
              {setup.error}
            </p>
          )}
        </div>
      )}

      {setup?.qr && (
        <div className="space-y-2 text-sm">
          <p className="text-muted">1. In your authenticator app, add an account and scan this code:</p>
          <div className="mx-auto w-48 rounded-2xl bg-white p-3">
            {/* The QR code is an image made by Supabase for this setup only. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" className="h-auto w-full" />
          </div>
          <p className="text-xs text-faint">
            Can&apos;t scan? Type this key instead: <code className="break-all text-ink">{setup.secret}</code>
          </p>
          <p className="text-muted">2. Enter the 6-digit code the app shows:</p>
        </div>
      )}

      {showCode && (
        <form action={action} className="space-y-3">
          <label className="block text-sm">
            <span className="text-muted">{enabled ? "6-digit code from your authenticator app" : "Code"}</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              autoFocus
              className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white/5 px-3 text-center text-lg tracking-[0.3em] text-ink"
            />
          </label>
          {state?.error && (
            <p role="alert" className="rounded-xl bg-rose/10 px-3 py-2 text-xs text-rose">
              {state.error}
            </p>
          )}
          <button type="submit" disabled={pending} className="pressable min-h-11 w-full rounded-xl bg-violet-deep font-semibold text-ink disabled:opacity-60">
            {pending ? "Checking…" : enabled ? "Continue" : "Turn on two-factor"}
          </button>
        </form>
      )}
    </div>
  );
}
