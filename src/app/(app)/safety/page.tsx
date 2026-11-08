import {
  CheckCircle2,
  Circle,
  CloudOff,
  Database,
  Lock,
  Power,
  ShieldCheck,
  ShieldX,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getAiStatus, getGhlSummary, getMember, getOwnerSummaryStatus, getRosterSummary, getSafetyStatus, usesDatabase } from "@/lib/data-source";
import { PublishSummaryButton } from "@/components/forms/PublishSummaryButton";
import { hasPrivateRoster } from "@/lib/private-data";
import { ImportButton } from "@/components/forms/ImportButton";
import { SyncButton } from "@/components/forms/SyncButton";
import { AiMeter } from "@/components/cards/AiMeter";
import { BudgetForm } from "@/components/forms/AiButtons";
import { cn } from "@/lib/format";

export const metadata: Metadata = { title: "Data Safety" };

const connectionIcon = {
  conn_supabase: Database,
  conn_ghl_api: CloudOff,
  conn_ghl_webhooks: Webhook,
} as Record<string, typeof Database>;

export default async function SafetyPage() {
  const s = getSafetyStatus();
  const doneCount = s.checklist.filter((c) => c.done).length;
  const roster = await getRosterSummary();
  const real = roster.source !== "demo";
  const db = usesDatabase();
  const member = db ? await getMember() : null;
  const privateFile = hasPrivateRoster();
  const ghl = await getGhlSummary();
  const ai = await getAiStatus();
  const ownerSummary = member?.role === "owner" ? await getOwnerSummaryStatus() : null;
  const nyTime = (at: string) => new Date(at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ghlStatus = !ghl.configured ? "Not connected" : !db ? "Needs the database" : !ghl.tablesReady ? "Run setup SQL (0003)" : ghl.lastSync ? "Connected · read-only" : "Ready to sync";

  return (
    <>
      <PageHeader title="Data Safety" subtitle="What this app can see, keep and touch." backHref="/" backLabel="Home" />

      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">GoHighLevel</p>
          <Pill color={ghl.lastSync ? "teal" : "neutral"}>{ghlStatus}</Pill>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-lime/30 bg-lime/8 p-3.5">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-lime" />
          <div className="text-sm">
            <p className="font-semibold">GoHighLevel is read-only. Permanently.</p>
            <p className="mt-0.5 text-muted">
              This app has no code, keys or permissions that could create, edit, delete, send or
              schedule anything in GoHighLevel.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Places this app can write to in GHL</span>
          <span className="font-display text-lg font-bold text-lime">{s.ghlWriteTargets.length}</span>
        </div>
        {ghl.configured && (
          <ul className="space-y-1 text-xs text-muted">
            <li>• Reads only: pipeline (opportunities), appointment times, and <span className="text-ink">when</span> matched clients were last called or messaged. Never message text, recordings, emails or phone numbers.</li>
            <li>
              • Which GoHighLevel contact is which client:{" "}
              <Link href="/clients/ghl-matches" className="font-semibold text-violet underline-offset-2 hover:underline">
                Match contacts
              </Link>{" "}
              (owner).
            </li>
            <li>• Every request is a GET to a short allowed list; the token only has read-only permissions.</li>
            {ghl.lastSync && (
              <li>
                • Last sync: {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(ghl.lastSync.ranAt))}
                {ghl.lastSync.locationName ? ` from ${ghl.lastSync.locationName}` : ""}: {ghl.lastSync.opportunities} opportunities, {ghl.lastSync.appointments} appointments.
              </li>
            )}
          </ul>
        )}
        {db && member?.role === "owner" && ghl.configured && ghl.tablesReady && <SyncButton />}
      </GlassCard>

      <SectionTitle>Database</SectionTitle>
      <GlassCard className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{db ? "Supabase · connected" : "Not connected"}</span>
          <Pill color={db ? "teal" : "neutral"}>{db ? "Sign-in required" : "Local only"}</Pill>
        </div>
        {db && member && (
          <p className="text-muted">
            Signed in as <span className="text-ink">{member.name}</span> ({member.role}). Everything you see is filtered
            by the database&apos;s security rules for your role. <a href="/account" className="font-semibold text-violet underline-offset-2 hover:underline">Change password</a>
          </p>
        )}
        <ul className="space-y-1 text-xs text-muted">
          <li>• Signed-out visitors and people not on the team get nothing (break-in tested on a local copy).</li>
          <li>• Owner: everything. Managers: read clients, log check-ins. Developers: nothing yet.</li>
          <li>• No admin key in the app. Nothing can be deleted through the app.</li>
        </ul>
        {db && member?.role === "owner" && privateFile && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs text-muted">
              Your private client file is still on this Mac. Import it once, check the numbers match, then ask Claude
              to delete the file. Running it twice updates instead of duplicating.
            </p>
            <ImportButton />
          </div>
        )}
      </GlassCard>

      <SectionTitle>AI spend</SectionTitle>
      <section id="ai" className="scroll-mt-4">
        <GlassCard className="space-y-3 text-sm">
          {!ai.configured ? (
            <p className="text-muted">AI isn&apos;t connected yet. Setup steps: docs/PHASE4_SETUP.md.</p>
          ) : !ai.tablesReady ? (
            <p className="text-muted">AI key found. One more step: run 0005 in the Supabase SQL Editor.</p>
          ) : (
            <>
              <AiMeter ai={ai} />
              {ai.recent.length > 0 && (
                <ul className="space-y-1 border-t border-line pt-2 text-xs text-muted">
                  {ai.recent.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>
                        {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(r.at))} ·{" "}
                        {r.feature === "briefing" ? "Briefing" : "Client profile"}
                        {r.outcome !== "ok" ? ` (${r.outcome})` : ""}
                      </span>
                      <span className="shrink-0">${r.costUsd.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {member?.role === "owner" && <BudgetForm current={ai.budgetUsd} />}
            </>
          )}
          <ul className="space-y-1 text-xs text-muted">
            <li>• Model: Claude Opus 5.5 ($4 in / $20 out per million tokens). Every request&apos;s exact cost is logged; the log can&apos;t be edited.</li>
            <li>• The AI gets no tools: it can only write text. It can&apos;t change, send or delete anything.</li>
            <li>• Client names are swapped for codes before anything leaves this Mac.</li>
            <li>• Second lock: set the same monthly limit in your Anthropic account.</li>
          </ul>
        </GlassCard>
      </section>

      {member?.role === "owner" && (
        <>
          <SectionTitle>Owner summary</SectionTitle>
          <section id="owner-summary" className="scroll-mt-4">
            <GlassCard className="space-y-3 text-sm">
              <p className="text-muted">
                Totals for your personal dashboard: weekly numbers, at-risk and win-back names, counts by person, alerts and AI bots. No notes,
                messages, contact details or work order titles.
              </p>
              {ownerSummary ? (
                <ul className="space-y-1 text-xs">
                  <li>
                    <span className="text-muted">Last published:</span> {ownerSummary.publishedAt ? `${nyTime(ownerSummary.publishedAt)} (New York)` : "not yet"}
                  </li>
                  <li>
                    <span className="text-muted">Last read by your dashboard:</span> {ownerSummary.lastReadAt ? `${nyTime(ownerSummary.lastReadAt)} (New York)` : "never"} ·{" "}
                    {ownerSummary.readsThisWeek} {ownerSummary.readsThisWeek === 1 ? "read" : "reads"} this week
                    {ownerSummary.limitedThisWeek ? <span className="text-amber"> · {ownerSummary.limitedThisWeek} refused by the rate limit</span> : null}
                  </li>
                </ul>
              ) : (
                <p className="text-xs text-amber">Needs one setup step (0012 SQL).</p>
              )}
              {ownerSummary && <PublishSummaryButton />}
              <ul className="space-y-1 text-xs text-muted">
                <li>• Refreshes on its own at most once an hour when you open Home.</li>
                <li>• Your dashboard reads it at /api/owner-summary with its key. Only the key&apos;s fingerprint is stored here.</li>
                <li>• Read-only: reading it never syncs GoHighLevel, runs AI, or changes anything.</li>
              </ul>
            </GlassCard>
          </section>
        </>
      )}

      <SectionTitle>Your client list</SectionTitle>
      <GlassCard className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{roster.source === "database" ? "Real · from your database" : real ? "Real · private file on this Mac" : "Demo list (no private file found)"}</span>
          <Pill color={real ? "teal" : "amber"}>{real ? "Loaded" : "Demo"}</Pill>
        </div>
        <p className="text-muted">
          {roster.total} records loaded{roster.skipped > 0 ? `, ${roster.skipped} skipped because they failed checks` : ", none skipped"}.
          {" "}{roster.needsCheck} marked for you to confirm.
        </p>
        {roster.source === "database" ? (
          <ul className="space-y-1 text-xs text-muted">
            <li>• Stored in your own Supabase project, read as the signed-in person so the security rules apply.</li>
            <li>• A test fails if any real client name shows up in the app&apos;s code, docs or tests.</li>
            <li>• Free Supabase plans have no automatic backups. Supabase Pro adds daily backups.</li>
          </ul>
        ) : (
          <ul className="space-y-1 text-xs text-muted">
            <li>• Kept in <code className="text-ink">private-data/</code>, which Git ignores, so it never reaches GitHub.</li>
            <li>• A test fails if any real client name shows up in the app&apos;s code, docs or tests.</li>
            <li>• Read only by the server on this Mac. Wi-Fi (phone) mode refuses to start while it exists.</li>
            <li>• Not encrypted by the app: keep FileVault on.</li>
          </ul>
        )}
      </GlassCard>

      <SectionTitle>Source connections</SectionTitle>
      <div className="space-y-2.5">
        {s.connections.map((c) => {
          const Icon = connectionIcon[c.id] ?? Database;
          const connected = (c.id === "conn_supabase" && roster.source === "database") || (c.id === "conn_ghl_api" && Boolean(ghl.lastSync));
          return (
            <GlassCard key={c.id} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-muted">
                <Icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{c.name}</p>
                  {connected ? <Pill color="teal">Connected</Pill> : <Pill>Not connected</Pill>}
                </div>
                <p className="mt-1 text-xs text-muted">{c.note}</p>
                <p className="mt-1.5 text-[11px] text-faint">
                  {connected ? (c.id === "conn_ghl_api" ? "Phase 3 · GET only · .readonly scopes" : "Phase 2 · sign-in required, no admin key") : <>Planned for Phase {c.plannedPhase} · Scopes: {c.scopes.length ? c.scopes.join(", ") : "none"}</>}
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <SectionTitle>Access restrictions</SectionTitle>
      <GlassCard className="space-y-2.5 text-sm">
        <p className="flex gap-2">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          <span>
            <span className="font-semibold">Runs on this computer only.</span>{" "}
            <span className="text-muted">
              {roster.source === "database"
                ? "Sign-in requires a password and a two-factor code. Keep it on this Mac until it's properly hosted (Phase 5)."
                : "There's no sign-in yet, so real data must never leave this Mac."}
            </span>
          </span>
        </p>
        <p className="flex gap-2">
          <ShieldX aria-hidden className="mt-0.5 size-4 shrink-0 text-violet" />
          <span className="text-muted">
            Access rules are enforced by the database, not by the screen: owner sees everything, managers read clients and log check-ins, developers see nothing yet.
          </span>
        </p>
      </GlassCard>

      <SectionTitle>Retention plan</SectionTitle>
      <GlassCard padding="none">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">How long each kind of data will be kept</caption>
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-faint">
              <th scope="col" className="px-4 pb-2 pt-3.5 font-semibold">Data</th>
              <th scope="col" className="px-4 pb-2 pt-3.5 font-semibold">Keep for</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {s.retention.map((r) => (
              <tr key={r.dataClass}>
                <td className="px-4 py-2.5 font-medium">{r.dataClass}</td>
                <td className="px-4 py-2.5 text-muted">{r.keepFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line px-4 py-2.5 text-[11px] text-faint">
          Planned, not active. Nothing is stored yet.
        </p>
      </GlassCard>

      <SectionTitle aside={`${doneCount} of ${s.checklist.length}`}>Safety checklist</SectionTitle>
      <GlassCard padding="none">
        <ul className="divide-y divide-line">
          {s.checklist.map((c) => (
            <li key={c.label} className="flex items-center gap-3 px-4 py-3">
              {c.done ? (
                <CheckCircle2 aria-label="Done" className="size-5 shrink-0 text-lime" />
              ) : (
                <Circle aria-label="Not done" className="size-5 shrink-0 text-faint" />
              )}
              <span className={cn("flex-1 text-sm", !c.done && "text-muted")}>{c.label}</span>
              <span className="text-[11px] text-faint">Phase {c.phase}</span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <SectionTitle>Kill switch</SectionTitle>
      <GlassCard className="flex items-center gap-3 opacity-70">
        <Power aria-hidden className="size-5 shrink-0 text-muted" />
        <p className="flex-1 text-sm text-muted">
          Stops all data imports instantly. Arrives in Phase 5. It only affects this app and never
          changes GoHighLevel.
        </p>
        <button
          type="button"
          disabled
          className="min-h-9 cursor-not-allowed rounded-full border border-line px-3 text-xs font-semibold text-faint"
        >
          Not yet
        </button>
      </GlassCard>
    </>
  );
}
