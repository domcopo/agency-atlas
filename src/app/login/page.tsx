import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/cards/SignInForm";
import { usesDatabase } from "@/lib/data-source";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Without a database there is nothing to sign in to.
  if (!usesDatabase()) redirect("/");
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center px-4">
      <div className="glass rounded-3xl p-6">
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-violet/15 text-violet">
          <Lock aria-hidden className="size-5" />
        </span>
        <h1 className="font-display text-2xl font-bold">Agency Atlas</h1>
        <p className="mt-1 text-sm text-muted">Team members only. Accounts are added by the owner.</p>
        <SignInForm />
      </div>
    </main>
  );
}
