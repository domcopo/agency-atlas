import type { Metadata } from "next";
import { cookies } from "next/headers";
import { signOut } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { PasswordForm } from "@/components/forms/PasswordForm";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { ToadModePicker } from "@/components/toad/ToadModePicker";
import { getMember, usesDatabase } from "@/lib/data-source";
import { parseToadMode, TOAD_COOKIE } from "@/lib/toad";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const me = usesDatabase() ? await getMember() : null;
  const toadMode = parseToadMode((await cookies()).get(TOAD_COOKIE)?.value);
  // Wide screens: kept to a comfortable reading width.
  return (
    <div className="lg:max-w-4xl">
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
      <SectionTitle>BizToad</SectionTitle>
      <ToadModePicker initial={toadMode} />
      <p className="mt-2 px-1 text-[11px] text-faint">
        The frog in the corner (top bar on phones). &ldquo;Stay still&rdquo; stops his eyes and little moves; &ldquo;Tucked away&rdquo; sinks him into the corner until you tap him. Saved on this device only.
      </p>
    </div>
  );
}
