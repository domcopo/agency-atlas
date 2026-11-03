// Runs before `npm run dev:phone`. Wi-Fi mode lets other devices on your network
// open the app, and the app has no sign-in yet. So if your REAL client list is
// present, refuse to start and explain why.
import { existsSync } from "node:fs";

if (existsSync("private-data/clients.json") || existsSync("private-data/team.json")) {
  console.error(
    "\nWi-Fi mode is blocked: your real client list is in private-data/ and the app has no sign-in yet.\n" +
      "Anyone on the same Wi-Fi could see it. Use `npm run dev` (this Mac only) instead.\n" +
      "Phone access will be allowed once sign-in exists (Phase 2).\n",
  );
  process.exit(1);
}
