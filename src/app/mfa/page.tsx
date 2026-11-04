import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { TwoFactorForm } from "@/components/forms/TwoFactorForm";
import { getTwoFactorStatus, usesDatabase } from "@/lib/data-source";

export const metadata: Metadata = { title: "Two-factor" };

// Second sign-in step. src/proxy.ts sends every signed-in person here until they
// have passed two-factor in this session; the database rules require it too.
export default async function TwoFactorPage() {
  if (!usesDatabase()) redirect("/");
  const enabled = (await getTwoFactorStatus()) === "enabled";
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-sm flex-col justify-center px-4">
      <div className="glass rounded-3xl p-6">
        <span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-teal/15 text-teal">
          <ShieldCheck aria-hidden className="size-5" />
        </span>
        <h1 className="font-display text-2xl font-bold">{enabled ? "Enter your code" : "Turn on two-factor"}</h1>
        <p className="mt-1 text-sm text-muted">
          {enabled ? "One more step to keep client data safe." : "Required once for every team member before the app opens."}
        </p>
        <TwoFactorForm enabled={enabled} />
        <form action={signOut} className="mt-4 text-center">
          <button type="submit" className="min-h-11 text-xs text-faint underline">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
