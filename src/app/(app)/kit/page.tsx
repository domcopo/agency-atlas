import { BookOpen, ExternalLink, FileText, HelpCircle, KeyRound, ListChecks, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { kitDocOp, kitToolOp } from "@/app/actions";
import { CopyButton } from "@/components/cards/CopyButton";
import { KitDocForm } from "@/components/forms/KitDocForm";
import { KitToolForm } from "@/components/forms/KitToolForm";
import { KitText } from "@/components/kit/KitText";
import { Fold } from "@/components/shell/Fold";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getKit, getDeveloperViewer, getMember, getTeam, getToday, usesDatabase } from "@/lib/data-source";
import { KIT_RULES, kitKindLabel, plainText, renewsIn, reviewNote, searchKit, type KitDoc } from "@/lib/kit";

export const metadata: Metadata = { title: "Kit" };

const row = "pressable flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04]";

function DocLink({ d, today }: { d: KitDoc; today: string }) {
  const stale = reviewNote(d, today);
  return (
    <li>
      <Link href={`/kit/${d.id}`} className={row}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{d.title}</span>
          <span className="block text-[11px] text-faint">
            {kitKindLabel(d.kind)}
            {d.category ? ` · ${d.category}` : ""}
            {!d.audience.includes("developer") ? " · managers only" : ""}
            {stale ? <span className="text-amber"> · {stale}</span> : null}
          </span>
        </span>
        <span aria-hidden className="text-faint">›</span>
      </Link>
    </li>
  );
}

export default async function KitPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const member = usesDatabase() ? await getMember() : null;
  // Previewing a developer: no editing (look only), like the developer sees it.
  const editor = (member?.role === "owner" || member?.role === "manager") && !(await getDeveloperViewer())?.preview;
  const kit = await getKit();
  const today = getToday();
  const q = ((await searchParams).q ?? "").slice(0, 80).trim();

  if (!kit.ready) {
    return (
      <>
        <PageHeader title="Kit" subtitle="Handbook, SOPs, FAQ, templates and tools" />
        <p className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm">
          {editor ? (
            <>
              <span className="font-semibold text-amber">One setup step needed.</span> <span className="text-muted">Run 0014 in Supabase to turn on Kit.</span>
            </>
          ) : (
            <span className="text-muted">Kit isn&apos;t set up yet. Ask your manager.</span>
          )}
        </p>
      </>
    );
  }

  const live = kit.docs.filter((d) => !d.archived);
  const archived = kit.docs.filter((d) => d.archived);
  const of = (k: KitDoc["kind"]) => live.filter((d) => d.kind === k);
  const sops = of("sop");
  const sopGroups = [...new Set(sops.map((d) => d.category ?? "Other"))].sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  const staleCount = live.filter((d) => reviewNote(d, today)).length;
  const results = q ? searchKit(live, q) : [];
  const staff = editor ? (await getTeam()).members.map((m) => ({ id: m.id, name: m.name })) : [];
  const nameOf = new Map(staff.map((m) => [m.id, m.name]));
  const tools = kit.tools.filter((t) => !t.archived);
  const monthly = tools.reduce((n, t) => n + (t.monthlyUsd ?? 0), 0);
  const renewing = tools.filter((t) => {
    const d = renewsIn(t, today);
    return d !== null && d >= 0 && d <= KIT_RULES.renewSoonDays;
  });

  return (
    <>
      <PageHeader title="Kit" subtitle="Handbook, SOPs, FAQ, templates and tools" />

      <form method="get" role="search" className="glass flex items-center gap-2 rounded-2xl px-3">
        <Search aria-hidden className="size-4 shrink-0 text-faint" />
        <input name="q" defaultValue={q} maxLength={80} placeholder="Search SOPs, FAQ, templates…" aria-label="Search Kit" className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none" />
        {q && (
          <Link href="/kit" className="pressable min-h-9 rounded-lg px-2 py-2 text-xs text-muted">
            Clear
          </Link>
        )}
      </form>

      {q ? (
        <>
          <SectionTitle aside={`${results.length} found`}>Results for &ldquo;{q}&rdquo;</SectionTitle>
          {results.length ? (
            <ul className="glass divide-y divide-line rounded-3xl">
              {results.map((d) => (
                <DocLink key={d.id} d={d} today={today} />
              ))}
            </ul>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Nothing matches. Try fewer words.</p>
          )}
        </>
      ) : (
        <>
          <SectionTitle>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen aria-hidden className="size-3.5" /> Start here
            </span>
          </SectionTitle>
          {of("readme").length ? (
            <ul className="glass divide-y divide-line rounded-3xl">
              {of("readme").map((d) => (
                <DocLink key={d.id} d={d} today={today} />
              ))}
            </ul>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No handbook page yet.</p>
          )}

          <SectionTitle aside={staleCount && editor ? <span className="text-amber">{staleCount} need a review</span> : `${sops.length}`}>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks aria-hidden className="size-3.5" /> SOPs
            </span>
          </SectionTitle>
          {sops.length ? (
            <div className="space-y-2.5">
              {sopGroups.map((g) => (
                <section key={g} aria-label={g}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{g}</p>
                  <ul className="glass divide-y divide-line rounded-3xl">
                    {sops
                      .filter((d) => (d.category ?? "Other") === g)
                      .map((d) => (
                        <DocLink key={d.id} d={d} today={today} />
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">{editor ? "No SOPs yet. Add your first one below (paste it in)." : "No SOPs for your role yet."}</p>
          )}

          <SectionTitle aside={`${of("faq").length}`}>
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle aria-hidden className="size-3.5" /> FAQ
            </span>
          </SectionTitle>
          {of("faq").length ? (
            <div className="glass divide-y divide-line rounded-3xl">
              {of("faq").map((d) => (
                <details key={d.id} className="group px-4 py-1">
                  <summary className="pressable flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                    <span className="flex-1">{d.title}</span>
                    <span aria-hidden className="text-faint transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="pb-3">
                    <KitText body={d.body} />
                    {editor && (
                      <Link href={`/kit/${d.id}`} className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-violet">
                        Edit
                      </Link>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No questions yet.</p>
          )}

          <SectionTitle aside={`${of("template").length}`}>
            <span className="inline-flex items-center gap-1.5">
              <FileText aria-hidden className="size-3.5" /> Templates
            </span>
          </SectionTitle>
          {of("template").length ? (
            <ul className="glass divide-y divide-line rounded-3xl">
              {of("template").map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                  <Link href={`/kit/${d.id}`} className="pressable min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{d.title}</span>
                    <span className="block truncate text-[11px] text-faint">{plainText(d.body).split("\n")[0] || "Empty"}</span>
                  </Link>
                  <CopyButton text={plainText(d.body)} label={`Copy "${d.title}"`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No templates yet. Client messages, report outlines and checklists go here.</p>
          )}
          <p className="mt-1.5 px-1 text-[11px] text-faint">Copy puts the text on your phone&apos;s clipboard to paste yourself. Atlas never sends anything.</p>

          <SectionTitle aside={editor && tools.length ? `~$${monthly.toLocaleString("en-US", { maximumFractionDigits: 2 })}/mo` : undefined}>
            <span className="inline-flex items-center gap-1.5">
              <KeyRound aria-hidden className="size-3.5" /> Tools and accounts
            </span>
          </SectionTitle>
          {editor ? (
            <>
              {renewing.length > 0 && (
                <p className="mb-2 rounded-2xl border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-muted">
                  <span className="font-semibold text-amber">Renewing soon:</span> {renewing.map((t) => `${t.name} (${t.renewsOn})`).join(", ")}
                </p>
              )}
              {tools.length ? (
                <ul className="glass divide-y divide-line rounded-3xl">
                  {tools.map((t) => {
                    const days = renewsIn(t, today);
                    return (
                      <li key={t.id} className="px-4 py-2.5">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {t.name}
                              {t.forDevelopers && <span className="ml-1.5 text-[11px] font-normal text-teal">developers see it</span>}
                            </p>
                            {t.purpose && <p className="text-xs text-muted">{t.purpose}</p>}
                            <p className="text-[11px] text-faint">
                              {t.loginWhere ? `Login: ${t.loginWhere}` : "Login location not noted"}
                              {t.managerId ? ` · managed by ${nameOf.get(t.managerId) ?? "a former teammate"}` : ""}
                              {t.accessNote ? ` · access: ${t.accessNote}` : ""}
                            </p>
                            <p className="text-[11px] text-faint">
                              {t.monthlyUsd !== null ? `$${t.monthlyUsd}/mo` : "cost not noted"}
                              {t.renewsOn ? <span className={days !== null && days >= 0 && days <= KIT_RULES.renewSoonDays ? "font-semibold text-amber" : ""}> · renews {t.renewsOn}</span> : ""}
                            </p>
                          </div>
                          {t.url && (
                            <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Open ${t.name}`} className="pressable inline-flex min-h-11 min-w-11 items-center justify-center text-violet">
                              <ExternalLink aria-hidden className="size-4" />
                            </a>
                          )}
                        </div>
                        <details className="mt-1">
                          <summary className="pressable inline-flex min-h-9 cursor-pointer list-none items-center text-xs font-semibold text-violet">Edit</summary>
                          <div className="mt-2 space-y-2">
                            <KitToolForm tool={t} staff={staff} />
                            <form action={kitToolOp}>
                              <input type="hidden" name="id" value={t.id} />
                              <input type="hidden" name="op" value="archive" />
                              <button type="submit" className="pressable min-h-9 rounded-lg border border-line px-2.5 text-xs text-muted">
                                Archive (no longer used)
                              </button>
                            </form>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No tools listed yet.</p>
              )}
              <div className="mt-2.5">
                <Fold label="Add a tool" title="Add a tool" summary="Name, what it's for, where the login is kept, cost and renewal">
                  <div className="glass rounded-3xl p-4">
                    <KitToolForm staff={staff} />
                  </div>
                </Fold>
              </div>
              {kit.tools.some((t) => t.archived) && (
                <Fold label="Archived tools" title="Archived tools" summary={`${kit.tools.filter((t) => t.archived).length} no longer used`}>
                  <ul className="glass divide-y divide-line rounded-3xl">
                    {kit.tools
                      .filter((t) => t.archived)
                      .map((t) => (
                        <li key={t.id} className="flex items-center gap-2 px-4 py-2.5">
                          <span className="min-w-0 flex-1 truncate text-sm text-muted">{t.name}</span>
                          <form action={kitToolOp}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="op" value="unarchive" />
                            <button type="submit" className="pressable min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold">
                              Bring back
                            </button>
                          </form>
                        </li>
                      ))}
                  </ul>
                </Fold>
              )}
            </>
          ) : kit.teamTools.length ? (
            <ul className="glass divide-y divide-line rounded-3xl">
              {kit.teamTools.map((t) => (
                <li key={t.id} className="flex items-start gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t.name}</p>
                    {t.purpose && <p className="text-xs text-muted">{t.purpose}</p>}
                    <p className="text-[11px] text-faint">{t.loginWhere ? `Login: ${t.loginWhere}` : "Ask your manager for access"}</p>
                  </div>
                  {t.url && (
                    <a href={t.url} target="_blank" rel="noopener noreferrer nofollow" aria-label={`Open ${t.name}`} className="pressable inline-flex min-h-11 min-w-11 items-center justify-center text-violet">
                      <ExternalLink aria-hidden className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">No tools listed for you yet.</p>
          )}
          <p className="mt-1.5 px-1 text-[11px] text-faint">Never a password here: only where each login is kept. Atlas refuses anything that looks like a password or key.</p>

          {editor && (
            <>
              <div className="mt-6">
                <Fold label="Add a page" title="Add a page" summary="Paste an SOP, a FAQ answer, a template or a handbook page">
                  <div className="glass rounded-3xl p-4">
                    <KitDocForm />
                  </div>
                </Fold>
              </div>
              {archived.length > 0 && (
                <Fold label="Archived pages" title="Archived pages" summary={`${archived.length} hidden from the team`}>
                  <ul className="glass divide-y divide-line rounded-3xl">
                    {archived.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                        <Link href={`/kit/${d.id}`} className="min-w-0 flex-1 truncate text-sm text-muted">
                          {d.title}
                        </Link>
                        <form action={kitDocOp}>
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="op" value="unarchive" />
                          <button type="submit" className="pressable min-h-9 rounded-lg border border-line px-2.5 text-xs font-semibold">
                            Bring back
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </Fold>
              )}
              <p className="mt-4 px-1 text-[11px] text-faint">Coming later in Kit: SEO and website audit tools, reports, and SOPs as checklists on work orders.</p>
            </>
          )}
        </>
      )}
    </>
  );
}
