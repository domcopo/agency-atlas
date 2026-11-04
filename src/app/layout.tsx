import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/shell/DemoBanner";
import { getMember, getRosterSource, usesDatabase } from "@/lib/data-source";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Agency Atlas", template: "%s · Agency Atlas" },
  description: "Internal agency command center.",
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const member = usesDatabase() ? await getMember() : null;
  return (
    <html lang="en">
      <body>
        <div aria-hidden className="app-glow" />
        <DemoBanner source={await getRosterSource()} memberName={member?.name} />
        {children}
      </body>
    </html>
  );
}
