import type { Metadata } from "next";
import { ClientCard } from "@/components/cards/ClientCard";
import { PageHeader } from "@/components/shell/PageHeader";
import { getClients } from "@/lib/data-source";

export const metadata: Metadata = { title: "Clients" };

export default function ClientsPage() {
  // Lowest health first, so clients needing attention are at the top.
  const clients = [...getClients()].sort((a, b) => a.health.score - b.health.score);

  return (
    <>
      <PageHeader title="Clients" subtitle={`${clients.length} demo clients · sorted by health`} />
      <ul className="space-y-3">
        {clients.map((c) => (
          <li key={c.id}>
            <ClientCard client={c} />
          </li>
        ))}
      </ul>
    </>
  );
}
