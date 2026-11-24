// BizToad motion rules (docs/BIZTOAD_PLAN.md, Phase 1).
import { describe, expect, it } from "vitest";
import { mayMove, nextIdleDelay, parseToadMode, pickIdleMove, pupilOffset, TOAD_RULES } from "@/lib/toad";

const eye = { x: 100, y: 100 };

describe("eyes follow the mouse only when it's close", () => {
  it("stays in the middle with no mouse", () => {
    expect(pupilOffset(eye, null)).toEqual({ dx: 0, dy: 0 });
  });

  it("does not follow past 200 px", () => {
    expect(pupilOffset(eye, { x: 100 + TOAD_RULES.followRadiusPx + 1, y: 100 })).toEqual({ dx: 0, dy: 0 });
    expect(pupilOffset(eye, { x: 400, y: 400 })).toEqual({ dx: 0, dy: 0 });
  });

  it("looks toward the mouse inside 200 px", () => {
    const right = pupilOffset(eye, { x: 250, y: 100 });
    expect(right.dx).toBeCloseTo(TOAD_RULES.maxPupilPx);
    expect(right.dy).toBeCloseTo(0);
    const up = pupilOffset(eye, { x: 100, y: 0 });
    expect(up.dy).toBeCloseTo(-TOAD_RULES.maxPupilPx);
  });

  it("never slides further than 4 px, wherever the mouse is", () => {
    for (let i = 0; i < 500; i++) {
      const p = { x: 100 + (Math.random() - 0.5) * 500, y: 100 + (Math.random() - 0.5) * 500 };
      const { dx, dy } = pupilOffset(eye, p);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(TOAD_RULES.maxPupilPx + 0.01);
    }
  });

  it("moves only part way when the mouse is right on the eye, and ignores bad numbers", () => {
    expect(pupilOffset(eye, eye)).toEqual({ dx: 0, dy: 0 });
    const near = pupilOffset(eye, { x: 110, y: 100 });
    expect(near.dx).toBeGreaterThan(0);
    expect(near.dx).toBeLessThan(TOAD_RULES.maxPupilPx);
    expect(pupilOffset(eye, { x: Number.NaN, y: 100 })).toEqual({ dx: 0, dy: 0 });
  });
});

describe("idle moves are rare", () => {
  it("always waits between 1 and 2 minutes", () => {
    for (const r of [0, 0.25, 0.5, 0.999, 1, -3, 7, Number.NaN]) {
      const ms = nextIdleDelay(r);
      expect(ms).toBeGreaterThanOrEqual(60_000);
      expect(ms).toBeLessThanOrEqual(120_000);
    }
  });

  it("blinks most often", () => {
    expect(pickIdleMove(0)).toBe("blink");
    expect(pickIdleMove(0.49)).toBe("blink");
    expect(["glance", "hop", "wiggle"]).toContain(pickIdleMove(0.9));
  });
});

describe("when the toad may move", () => {
  const calm = { mode: "on" as const, reducedMotion: false, tabHidden: false, typing: false, dialogOpen: false };

  it("moves normally", () => expect(mayMove(calm)).toBe(true));

  it("stays still with reduce motion, calm mode, a hidden tab, typing or an open dialog", () => {
    expect(mayMove({ ...calm, reducedMotion: true })).toBe(false);
    expect(mayMove({ ...calm, mode: "calm" })).toBe(false);
    expect(mayMove({ ...calm, mode: "hidden" })).toBe(false);
    expect(mayMove({ ...calm, tabHidden: true })).toBe(false);
    expect(mayMove({ ...calm, typing: true })).toBe(false);
    expect(mayMove({ ...calm, dialogOpen: true })).toBe(false);
  });

  it("reads the saved choice safely", () => {
    expect(parseToadMode("calm")).toBe("calm");
    expect(parseToadMode("hidden")).toBe("hidden");
    expect(parseToadMode(undefined)).toBe("on");
    expect(parseToadMode("<script>")).toBe("on");
  });
});
