// Runs before `npm run dev:phone`. Wi-Fi mode lets other devices on your network
// open the app over plain (unencrypted) http. So refuse to start while:
//  - your REAL client list is in private-data/, or
//  - the app is connected to your database (.env.local exists): sign-in cookies and
//    client data would cross the Wi-Fi unencrypted.
// Phone access comes with proper hosting over https (a later phase).
// Checks file NAMES only; never opens them.
import { existsSync } from "node:fs";

const reasons = [];
if (existsSync("private-data/clients.json") || existsSync("private-data/team.json"))
  reasons.push("your real client list is in private-data/");
if (existsSync(".env.local")) reasons.push("the app is connected to your database (.env.local exists)");

if (reasons.length) {
  console.error(
    `\nWi-Fi mode is blocked: ${reasons.join(" and ")}.\n` +
      "On Wi-Fi the app runs without encryption, so others on the network could see data or sign-in cookies.\n" +
      "Use `npm run dev` (this Mac only). Phone access will come with https hosting.\n",
  );
  process.exit(1);
}
