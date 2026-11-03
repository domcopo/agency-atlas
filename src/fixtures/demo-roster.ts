// FICTIONAL fallback roster and team. Used only when private-data/ is missing
// (for example in automated tests or on another computer). Never put real
// client names here — real data lives in private-data/ (Git-ignored).

import type { TeamMember } from "@/lib/types";

export const demoRosterRaw = {
  clients: [
    { name: "Oakline Painting (fictional)", monthlyUsd: 750, startDate: "2026-07-20", status: "active", listedIn: ["demo"] },
    { name: "Blue Fern Spa (fictional)", monthlyUsd: 500, startDate: "2026-08-02", status: "active", listedIn: ["demo"] },
    { name: "Mesa Pest Control (fictional)", monthlyUsd: 297, startDate: "2026-10-20", status: "active", listedIn: ["demo"] },
    { name: "Corner Bakehouse (fictional)", monthlyUsd: 297, startDate: "2026-10-12", status: "active", listedIn: ["demo"] },
    { name: "Northgate Fitness (fictional)", monthlyUsd: 199, startDate: "2026-08-12", status: "active", listedIn: ["demo"] },
    { name: "Riverside Tutors (fictional)", monthlyUsd: 125, startDate: "2026-09-28", status: "active", listedIn: ["demo"] },
    { name: "Hilltop Detailing (fictional)", monthlyUsd: 85, startDate: "2026-06-05", status: "active", listedIn: ["demo"] },
    { name: "Pinecrest Roofing (fictional)", monthlyUsd: 430, startDate: "2026-07-23", status: "paused", listedIn: ["demo"] },
    { name: "Sunrise Cafe (fictional)", monthlyUsd: 100, startDate: "2026-06-22", status: "canceled", listedIn: ["demo"] },
  ],
};

export const demoTeam: TeamMember[] = [
  { id: "tm-owner", name: "Owner (fictional)", role: "founder", handles: ["Escalations", "Final decisions"] },
  { id: "tm-comms", name: "Comms lead (fictional)", role: "client_comms", handles: ["Client texts", "Assigns work orders"] },
  { id: "tm-manager", name: "Client manager (fictional)", role: "client_manager", handles: ["Assigns work orders", "Client calls"] },
  { id: "tm-dev1", name: "Developer 1 (fictional)", role: "seo_developer", handles: ["80% SEO", "20% misc"] },
  { id: "tm-dev2", name: "Developer 2 (fictional)", role: "seo_developer", handles: ["80% SEO", "20% misc"] },
];
