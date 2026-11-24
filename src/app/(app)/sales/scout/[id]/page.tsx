// One Scout prospect: score and reasons (each signal with its source and date), where it
// is, "Open in Google Maps" (calls happen there; Atlas stores no phone numbers), the
// walk-in / call buttons and the visit log. Read through getScout(), so the database
// decides who may open it (a salesperson: their own or an unclaimed pool prospect).

import { ExternalLink, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignProspects, claimProspect, skipProspect } from "@/app/actions";
import { GlassCard } from "@/components/cards/GlassCard";
import { Pill } from "@/components/labels/labels";
import { milesFromBase, scoreTone } from "@/components/scout/ProspectRow";
import { VisitButtons } from "@/components/scout/VisitButtons";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getMember, getScout, usesDatabase } from "@/lib/data-source";
import { cn, formatShortDate } from "@/lib/format";
import { isLead } from "@/lib/roles";
import { mapsSearchUrl, outcomeLabel, safeMapsUrl, STATUS_LABEL, type ScoutSignals } from "@/lib/scout";

export const metadata: Metadata = { title: "Prospect" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every signal Scout checked, in plain words, with where it came from and when. */
function signalLines(s: ScoutSignals): { label: string; value: string; source: string; date: string }[] {
  const out: { label: string; value: string; source: string; date: string }[] = [];
  const yes = (v: boolean | null) => (v === null ? "not found" : v ? "yes" : "no");
  const push = (label: string, sig: { source: string; date: string } | undefined, value: string) => sig && out.push({ label, value, source: sig.source, date: sig.date });
  push("Seen in Google Ads", s.adsSeen, `${yes(s.adsSeen?.value ?? null)}${s.adsSeen?.keywords?.length ? ` (${s.adsSeen.keywords.join(", ")})` : ""}`);
  push("Paid clicks a month (estimate)", s.paidTraffic, s.paidTraffic?.value == null ? "not found" : String(Math.round(s.paidTraffic.value)));
  push("Ad goes to the home page", s.adToHomePage, yes(s.adToHomePage?.value ?? null));
  push("Ad page on phones", s.adPageMobileSeconds, s.adPageMobileSeconds?.value == null ? "not found" : `${s.adPageMobileSeconds.value} s`);
  push(`Google Maps position${s.mapsRank?.keyword ? ` for "${s.mapsRank.keyword}"` : ""}`, s.mapsRank, s.mapsRank?.value == null ? "not in the top 20" : `#${s.mapsRank.value}`);
  push("Top 3's average reviews", s.top3Reviews, s.top3Reviews?.value == null ? "not found" : String(Math.round(s.top3Reviews.value)));
  push("Website loads", s.siteLoads, yes(s.siteLoads?.value ?? null));
  push("Storefront", s.storefront, yes(s.storefront?.value ?? null));
  return out;
}

export default async function ProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const me = usesDatabase() ? await getMember() : null;
  if (!usesDatabase() || (!isLead(me?.role) && me?.role !== "sales")) return <RoleNotice title="Scout" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const scout = await getScout();
  const p = scout.prospects.find((x) => x.id === id);
  if (!p) notFound();
  const lead = isLead(me?.role);
  const owner = me?.role === "owner";
  const mine = p.assignedTo === scout.me;
  const inPool = p.assignedTo === null && p.status === "new";
  const canLog = lead || mine;
  const maps = safeMapsUrl(p.mapsUrl) ?? mapsSearchUrl(p);
  const miles = milesFromBase(p);
  const visits = scout.visits.filter((v) => v.prospectId === p.id);
  const who = (by: string) => (by === scout.me ? "you" : (scout.names.get(by) ?? null));
  const site = p.website && /^https?:\/\//.test(p.website) ? p.website : null;

  return (
    <>
      <PageHeader title={p.name} subtitle={[p.category, p.town].filter(Boolean).join(" · ") || "Prospect"} backHref="/sales/scout" backLabel="Scout" />
      <div className="mx-auto max-w-3xl">
        <GlassCard className="flex items-start gap-4">
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl border font-display text-xl font-bold", scoreTone(p.score))} aria-label={`Score ${p.score} out of 100`}>
            {p.score}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              <Pill color={p.status === "do_not_contact" ? "rose" : p.status === "interested" || p.status === "audit" ? "lime" : "neutral"}>{STATUS_LABEL[p.status]}</Pill>
              {inPool && <Pill color="violet">In the shared pool</Pill>}
              {p.nextOkOn && p.status === "not_interested" && <Pill>Try again after {formatShortDate(p.nextOkOn)}</Pill>}
            </div>
            <ul className="space-y-0.5 text-sm">
              {p.reasons.map((r) => (
                <li key={r}>• {r}</li>
              ))}
              {!p.reasons.length && <li className="text-muted">No strong signals found.</li>}
            </ul>
            <p className="text-[11px] text-faint">Score out of 100 from public signals. &quot;Not optimized&quot; points are signs, not proof: we can&apos;t see their ad account.</p>
          </div>
        </GlassCard>

        <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <a href={maps} target="_blank" rel="noopener noreferrer" className="pressable glass flex min-h-14 items-center gap-3 rounded-3xl px-4 py-3">
            <MapPin aria-hidden className="size-5 shrink-0 text-teal" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Open in Google Maps</span>
              <span className="block truncate text-[11px] text-faint">{[p.address, miles !== null ? `${miles} mi from the office` : null].filter(Boolean).join(" · ") || "Directions and the call button are there"}</span>
            </span>
          </a>
          {site ? (
            <a href={site} target="_blank" rel="noopener noreferrer nofollow" className="pressable glass flex min-h-14 items-center gap-3 rounded-3xl px-4 py-3">
              <ExternalLink aria-hidden className="size-5 shrink-0 text-violet" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Their website</span>
                <span className="block truncate text-[11px] text-faint">{site.replace(/^https?:\/\//, "")}</span>
              </span>
            </a>
          ) : (
            <p className="glass flex min-h-14 items-center rounded-3xl px-4 py-3 text-sm text-muted">No website found</p>
          )}
        </div>

        {inPool && !lead && (
          <form action={claimProspect} className="mt-2.5">
            <input type="hidden" name="prospectId" value={p.id} />
            <button type="submit" className="pressable min-h-12 w-full rounded-xl bg-violet-deep text-sm font-semibold">Claim it: make it mine</button>
          </form>
        )}

        {canLog && p.status !== "do_not_contact" && (
          <>
            <SectionTitle>After a walk-in or call</SectionTitle>
            <GlassCard>
              <VisitButtons prospectId={p.id} />
            </GlassCard>
          </>
        )}

        {(p.status === "audit" || p.status === "interested") && (
          <GlassCard className="mt-2.5 space-y-1.5 text-sm">
            <p className="font-semibold">Next: line up the audit</p>
            <p className="text-muted">Build it in Audits (business details aren&apos;t filled in from Scout yet; that&apos;s the next step). Then add them to GoHighLevel yourself so follow-ups and the deal are tracked there.</p>
            <Link href="/audits/seo/new" className="pressable inline-flex min-h-11 items-center rounded-xl bg-violet-deep px-4 text-sm font-semibold">Build an audit</Link>
          </GlassCard>
        )}

        <SectionTitle aside={`${visits.length}`}>Visits and calls</SectionTitle>
        {visits.length ? (
          <ul className="glass divide-y divide-line overflow-hidden rounded-3xl">
            {visits.map((v, i) => {
              const by = who(v.by);
              return (
                <li key={`${v.at}-${i}`} className="px-4 py-2.5 text-sm">
                  <p className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{outcomeLabel(v.outcome)}</span>
                    <span className="text-xs text-muted">
                      {v.kind === "call" ? "Call" : "Walk-in"} · {formatShortDate(v.at.slice(0, 10))}
                      {by ? ` · ${by}` : ""}
                    </span>
                  </p>
                  {v.note && <p className="mt-0.5 text-xs text-muted">{v.note}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No visits or calls logged yet.</p>
        )}

        <SectionTitle>Where this comes from</SectionTitle>
        <GlassCard>
          {signalLines(p.signals).length ? (
            <ul className="space-y-1.5 text-sm">
              {signalLines(p.signals).map((l) => (
                <li key={l.label} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-muted">{l.label}</span>
                  <span>
                    {l.value} <span className="text-[11px] text-faint">· {l.source}, {formatShortDate(l.date)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No signals were checked for this business.</p>
          )}
          <p className="mt-2 border-t border-line pt-2 text-[11px] text-faint">
            {p.rating !== null ? `${p.rating}★` : "No rating"} · {p.reviews ?? "?"} reviews (business listing). Public business facts only.
          </p>
        </GlassCard>

        {lead && (
          <>
            <SectionTitle>Manage</SectionTitle>
            <GlassCard className="space-y-3">
              {owner && scout.people.length > 0 && (
                <form action={assignProspects} className="flex flex-wrap gap-2">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <select name="to" defaultValue={p.assignedTo ?? ""} aria-label="Give to" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink">
                    <option value="">The shared pool</option>
                    {scout.people.map((x) => (
                      <option key={x.userId} value={x.userId}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="pressable min-h-11 rounded-xl border border-line bg-white/5 px-4 text-sm font-semibold">Assign</button>
                </form>
              )}
              {p.status !== "skipped" && (
                <form action={skipProspect} className="flex flex-wrap gap-2">
                  <input type="hidden" name="prospectId" value={p.id} />
                  <input name="reason" maxLength={120} placeholder="Not a fit because… (optional)" aria-label="Why skip" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white/5 px-3 text-sm text-ink" />
                  <button type="submit" className="pressable min-h-11 rounded-xl border border-line bg-white/5 px-4 text-sm font-semibold">Skip</button>
                </form>
              )}
            </GlassCard>
          </>
        )}
      </div>
    </>
  );
}
