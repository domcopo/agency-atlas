import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { DemoBanner } from "@/components/shell/DemoBanner";
import { getMember, getRosterSource, usesDatabase } from "@/lib/data-source";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "YO Marketing Co", template: "%s · YO Marketing Co" },
  description: "Internal agency command center.",
  // Internal tool: ask search engines not to index it.
  robots: { index: false, follow: false },
  icons: { icon: "/brand/icon-512.png", apple: "/brand/apple-icon.png" },
  appleWebApp: { capable: true, title: "YO Marketing", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07060d",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const member = usesDatabase() ? await getMember() : null;
  // Light look applies on computers inside the app only (see globals.css).
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <div aria-hidden className="app-glow" />
        <DemoBanner source={await getRosterSource()} memberName={member?.name} />
        {children}
      </body>
    </html>
  );
}
