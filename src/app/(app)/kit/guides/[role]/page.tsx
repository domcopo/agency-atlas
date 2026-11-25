import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GoalList, GuideFeatures, GuideHelpers, GuideSections } from "@/components/kit/RoleGuide";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { getGoals, getRoleGuides } from "@/lib/data-source";
import { asGuideRole, canEditGuide, mergeGuide, ROLE_LABELS, STARTER_GUIDES } from "@/lib/role-guides";

export const metadata: Metadata = { title: "Guide" };

export default async function RoleGuidePage({ params }: { params: Promise<{ role: string }> }) {
  const role = asGuideRole((await params).role);
  const view = await getRoleGuides();
  // Decided on the server from the database role: another role's guide is "not found".
  if (!role || !view.roles.includes(role)) notFound();
  const own = role === view.viewerRole && !view.preview;
  const goals = own ? await getGoals() : null;
  const canEdit = !view.preview && canEditGuide(view.viewerRole, role);
  const guide = STARTER_GUIDES[role];
  const sections = mergeGuide(role, view.edits);
  const others = view.roles.length > 1;

  return (
    <>
      <PageHeader title={guide.title} subtitle={guide.summary} backHref="/kit" backLabel="Kit" />
      {others && (
        <nav aria-label="Other guides" className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {view.roles.map((r) => (
            <Link
              key={r}
              href={`/kit/guides/${r}`}
              aria-current={r === role ? "page" : undefined}
              className={`pressable inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-xs font-semibold ${r === role ? "border-violet bg-violet/15 text-ink" : "border-line text-muted"}`}
            >
              {ROLE_LABELS[r]}
            </Link>
          ))}
        </nav>
      )}

      <Columns>
        <Column>
          <GuideSections role={role} sections={sections} canEdit={canEdit} ready={view.ready} />
        </Column>
        <Column>
          {goals && (
            <>
              <SectionTitle aside={goals.ready ? `${goals.mine.filter((g) => !g.doneAt).length} open` : undefined}>My goals</SectionTitle>
              {goals.numbers.length > 0 && (
                <ul className="glass mb-2 divide-y divide-line rounded-3xl">
                  {goals.numbers.map((n) => (
                    <li key={n.label} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                      <span className="flex-1 text-muted">{n.label}</span>
                      <span className="font-semibold">{n.value}</span>
                    </li>
                  ))}
                </ul>
              )}
              {goals.ready ? (
                <GoalList goals={goals.mine} canTick empty="No personal goals yet. The owner or a manager can add them." />
              ) : (
                <p className="glass rounded-3xl px-4 py-3 text-sm text-muted">Personal goals need one setup step (0036).</p>
              )}
            </>
          )}
          <SectionTitle>{own ? "Your features" : "Features for this job"}</SectionTitle>
          <GuideFeatures role={role} />
          <SectionTitle>{own ? "Your helpers (bots)" : "Helpers (bots) for this job"}</SectionTitle>
          <GuideHelpers role={role} />
          {!view.preview && (
            <p className="mt-4 px-1 text-sm">
              <Link href="/kit/ideas" className="font-semibold text-violet">
                Have an idea for Atlas? Send it →
              </Link>
            </p>
          )}
        </Column>
      </Columns>
    </>
  );
}
