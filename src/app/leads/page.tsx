import type { Metadata } from "next";
import { LeadBrowser } from "@/components/cards/LeadBrowser";
import { PageHeader } from "@/components/shell/PageHeader";
import { getLeads, getLeadsToWork, getMissionControl } from "@/lib/data-source";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  const { today } = getMissionControl();
  const leads = getLeads();
  const toWork = getLeadsToWork(today);
  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${toWork.all.length} to work today · ${toWork.overdue.length} overdue`}
      />
      <LeadBrowser leads={leads} today={today} />
    </>
  );
}
