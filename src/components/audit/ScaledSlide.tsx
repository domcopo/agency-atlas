"use client";

// Shrinks a 1280×720 page to fit narrow screens (phones). Printing ignores the scale.

import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScaledSlide({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 1280)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="audit-scale" style={{ height: 720 * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: 1280, height: 720 }}>{children}</div>
    </div>
  );
}
