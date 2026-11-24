// The agency's logo (YO Marketing Co), in a dark and a light version. The picture files
// have solid backgrounds: "screen" blending hides the black one on the dark look and
// "multiply" hides the white one on the light look. Both are in the page; globals.css shows
// the light one only when the light theme is on (computers only). Files are small already,
// so they are served as they are (unoptimized).

import Image from "next/image";
import { cn } from "@/lib/format";

export const BRAND_NAME = "YO Marketing Co";

const files = {
  /** YO, "MARKETING CO" and the tagline. */
  full: { name: "logo", width: 1010, height: 640 },
  /** YO and "MARKETING CO", no tagline (reads better small). */
  wordmark: { name: "wordmark", width: 1010, height: 560 },
} as const;

export function BrandLogo({ variant = "wordmark", className, priority = false }: { variant?: keyof typeof files; className?: string; priority?: boolean }) {
  const f = files[variant];
  return (
    <>
      <Image
        src={`/brand/${f.name}-dark.png`}
        width={f.width}
        height={f.height}
        alt={BRAND_NAME}
        priority={priority}
        unoptimized
        className={cn("brand-dark h-auto mix-blend-screen select-none", className)}
      />
      <Image
        src={`/brand/${f.name}-light.png`}
        width={f.width}
        height={f.height}
        alt={BRAND_NAME}
        unoptimized
        className={cn("brand-light hidden h-auto mix-blend-multiply select-none", className)}
      />
    </>
  );
}
