// BizToad (Phase 1, docs/BIZTOAD_PLAN.md): the rules for how the toad moves.
// Pure functions, no browser or network, tested in tests/toad.test.ts.
// Tune the numbers in TOAD_RULES; the component reads nothing else.

export const TOAD_RULES = {
  /** Eyes follow the mouse only when it's this close to an eye (CSS pixels). */
  followRadiusPx: 200,
  /** Furthest a pupil can slide from the middle of its eye (drawing units = px at 64 px). */
  maxPupilPx: 4,
  /** Closer than this, the pupil slides only part of the way (so it doesn't jitter on top of the eye). */
  rampPx: 40,
  /** Wait between idle moves: random, from 1 to 2 minutes. */
  idleMinMs: 60_000,
  idleMaxMs: 120_000,
  /** How long one idle move lasts (each is under a second). */
  moveMs: 900,
} as const;

/** Saved per device in a plain cookie, like the light/dark theme. */
export const TOAD_COOKIE = "toad";
export type ToadMode = "on" | "calm" | "hidden";

/** Anything unknown means the normal toad. */
export function parseToadMode(value: string | undefined | null): ToadMode {
  return value === "calm" || value === "hidden" ? value : "on";
}

/**
 * Where a pupil should sit, as an offset from the middle of its eye.
 * No pointer, or a pointer further than followRadiusPx: back to the middle.
 */
export function pupilOffset(
  eye: { x: number; y: number },
  pointer: { x: number; y: number } | null,
  rules: Pick<typeof TOAD_RULES, "followRadiusPx" | "maxPupilPx" | "rampPx"> = TOAD_RULES,
): { dx: number; dy: number } {
  if (!pointer) return { dx: 0, dy: 0 };
  const x = pointer.x - eye.x;
  const y = pointer.y - eye.y;
  const dist = Math.hypot(x, y);
  if (!Number.isFinite(dist) || dist === 0 || dist > rules.followRadiusPx) return { dx: 0, dy: 0 };
  const reach = rules.maxPupilPx * Math.min(1, dist / rules.rampPx);
  return { dx: round((x / dist) * reach), dy: round((y / dist) * reach) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Milliseconds until the next idle move. `random` is Math.random() (0 up to 1). */
export function nextIdleDelay(random: number, rules: Pick<typeof TOAD_RULES, "idleMinMs" | "idleMaxMs"> = TOAD_RULES): number {
  const r = Number.isFinite(random) ? Math.min(Math.max(random, 0), 0.999_999) : 0.5;
  return Math.round(rules.idleMinMs + r * (rules.idleMaxMs - rules.idleMinMs));
}

export type IdleMove = "blink" | "glance" | "hop" | "wiggle";

/** Blinks are the most common move; the others are rarer. */
export function pickIdleMove(random: number): IdleMove {
  const r = Number.isFinite(random) ? random : 0;
  if (r < 0.5) return "blink";
  if (r < 0.7) return "glance";
  if (r < 0.85) return "hop";
  return "wiggle";
}

/** Whether the toad may move right now (eyes or idle moves). */
export function mayMove(s: {
  mode: ToadMode;
  reducedMotion: boolean;
  tabHidden: boolean;
  typing: boolean;
  dialogOpen: boolean;
}): boolean {
  return s.mode === "on" && !s.reducedMotion && !s.tabHidden && !s.typing && !s.dialogOpen;
}

/** Things the toad must never sit on top of. If one is underneath, it tucks away. */
export const CONTROL_SELECTOR = "a[href], button, input, select, textarea, summary, label, [role=button], [role=link], [role=tab], [role=checkbox], [contenteditable=true]";
