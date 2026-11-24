import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/cards/SignInForm";
import { BrandLogo } from "@/components/shell/BrandLogo";
import { usesDatabase } from "@/lib/data-source";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // Without a database there is nothing to sign in to.
  if (!usesDatabase()) redirect("/");
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center px-4">
      <div className="glass rounded-3xl p-6">
        <BrandLogo variant="full" className="mx-auto mb-5 w-52" priority />
        <h1 className="flex items-center gap-2 font-display text-xl font-bold">
          <Lock aria-hidden className="size-4 text-violet" /> Sign in
        </h1>
        <p className="mt-1 text-sm text-muted">Team members only. Accounts are added by the owner.</p>
        <SignInForm />
      </div>
    </main>
  );
}
