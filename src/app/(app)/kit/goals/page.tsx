import type { Metadata } from "next";
import { GoalForm } from "@/components/forms/RoleGuideForms";
import { GoalList } from "@/components/kit/RoleGuide";
import { Column, Columns } from "@/components/shell/Columns";
import { PageHeader, SectionTitle } from "@/components/shell/PageHeader";
import { RoleNotice } from "@/components/shell/RoleNotice";
import { getDeveloperViewer, getGoals, getMember, usesDatabase } from "@/lib/data-source";
import { ROLE_LABELS } from "@/lib/role-guides";
import { isLead } from "@/lib/roles";

export const metadata: Metadata = { title: "Team goals" };

/** Owner and managers: everyone's personal goals. The database returns nothing more to anyone else. */
export default async function TeamGoalsPage() {
  const me = usesDatabase() ? await getMember() : null;
  if (!me || !isLead(me.role) || (await getDeveloperViewer())?.preview) return <RoleNotice title="Team goals" />;
  const goals = await getGoals();

  return (
    <>
      <PageHeader title="Team goals" subtitle="Personal goals. Each person sees only their own; you see everyone's." backHref="/kit" backLabel="Kit" />
      {!goals.ready ? (
        <p className="rounded-2xl border border-amber/40 bg-amber/10 p-3 text-sm text-muted">
          <span className="font-semibold text-amber">One setup step needed.</span> Run 0036 in Supabase to turn on personal goals.
        </p>
      ) : (
        <Columns>
          <Column>
            <SectionTitle>Add a goal</SectionTitle>
            <div className="glass rounded-3xl p-4">
              <GoalForm people={goals.team.map((p) => ({ userId: p.userId, name: `${p.name} (${ROLE_LABELS[p.role]})` }))} />
            </div>
          </Column>
          <Column>
            {goals.team.map((p) => (
              <section key={p.userId} aria-label={p.name}>
                <SectionTitle aside={`${p.goals.filter((g) => !g.doneAt).length} open`}>
                  {p.name} · {ROLE_LABELS[p.role]}
                </SectionTitle>
                <GoalList goals={p.goals} canTick={p.userId === me.userId} canArchive empty="No goals yet." />
              </section>
            ))}
          </Column>
        </Columns>
      )}
    </>
  );
}
