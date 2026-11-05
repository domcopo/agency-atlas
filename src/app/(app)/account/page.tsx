import type { Metadata } from "next";
import { signOut } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { PasswordForm } from "@/components/forms/PasswordForm";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getMember, usesDatabase } from "@/lib/data-source";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const me = usesDatabase() ? await getMember() : null;
  return (
    <>
      <PageHeader title="Account" subtitle={me ? `Signed in as ${me.name} (${me.role})` : undefined} backHref="/" backLabel="Home" />
      {me ? (
        <>
          <SectionTitle>Change password</SectionTitle>
          <GlassCard>
            <PasswordForm />
          </GlassCard>
          <p className="mt-2 px-1 text-[11px] text-faint">
            If you were given a temporary password, change it now. Never share it in chat or by text.
          </p>
          <SectionTitle>Sign out</SectionTitle>
          <form action={signOut}>
            <button type="submit" className="pressable glass min-h-11 w-full rounded-2xl text-sm font-semibold">
              Sign out of this device
            </button>
          </form>
        </>
      ) : (
        <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Accounts arrive once the database is connected.</p>
      )}
    </>
  );
}
