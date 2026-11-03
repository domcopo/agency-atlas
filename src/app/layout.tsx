import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BottomNav } from "@/components/shell/BottomNav";
import { DemoBanner } from "@/components/shell/DemoBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Agency Atlas (Demo)", template: "%s · Agency Atlas" },
  description: "Internal agency command center — demo with mock data only.",
  // Internal tool: ask search engines not to index it.
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Atlas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07060d",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div aria-hidden className="app-glow" />
        <DemoBanner />
        <main className="mx-auto max-w-lg px-4 pb-32">{children}</main>
        <BottomNav />
      </body>
    </html>
  );
}
