// The agency's logo (YO Marketing Co). The picture files have a solid black background;
// "screen" blending makes black see-through, so the logo sits cleanly on the app's dark
// background. Files are small already, so they are served as they are (unoptimized).
// The light version (public/brand/*-light.png) is kept for a light theme.

import Image from "next/image";
import { cn } from "@/lib/format";

export const BRAND_NAME = "YO Marketing Co";

const files = {
  /** YO, "MARKETING CO" and the tagline. */
  full: { src: "/brand/logo-dark.png", width: 1010, height: 640 },
  /** YO and "MARKETING CO", no tagline (reads better small). */
  wordmark: { src: "/brand/wordmark-dark.png", width: 1010, height: 560 },
} as const;

export function BrandLogo({ variant = "wordmark", className, priority = false }: { variant?: keyof typeof files; className?: string; priority?: boolean }) {
  const f = files[variant];
  return <Image src={f.src} width={f.width} height={f.height} alt={BRAND_NAME} priority={priority} unoptimized className={cn("h-auto mix-blend-screen select-none", className)} />;
}
