/**
 * Ring Gauntlet: the maths of the game, with no database in it, so the check
 * script (scripts/check-ring-gauntlet.ts) can prove the return exactly.
 *
 * Three rings are climbed one segment at a time. Every press of PLAY tries the
 * next segment: survive it and the cash-out value goes up to that segment's
 * multiplier, fail and the round is lost. The outer ring (square) has 8
 * segments and the biggest numbers, the middle ring (triangle) 6, the inner
 * ring (circle) 4 and the smallest. The last segment of each ring is a bonus
 * ("+7X", "+20.5X", "BONUS"), and reaching it ends the round with a win.
 *
 * The chance of surviving each segment is set so that, whichever segment a
 * player stops on, the expected return is exactly `rtp` of the stake:
 *     multiplier(k) x chanceToReach(k) = rtp          for every k of every ring
 * so no ring, no stopping point and no part cash-out can beat the others.
 */

export type RingKey = "OUTER" | "MIDDLE" | "INNER";
export const RING_KEYS: RingKey[] = ["OUTER", "MIDDLE", "INNER"];

export type SegmentKind = "x" | "plus" | "bonus";

interface RingSpec {
  /** Badge on the ring, and the guard standing in the middle. */
  shape: "SQUARE" | "TRIANGLE" | "CIRCLE";
  /** Plain segments, in the order they are climbed (clockwise from 12 o'clock). */
  plain: number[];
  /** Last segment: a fixed amount added to the last plain multiplier ("+7X")... */
  add?: number;
  /** ...or the bonus wheel of the outer ring: what is added to the last plain multiplier, with its weight (out of 100). */
  wheel?: { add: number; weight: number }[];
}

const RINGS: Record<RingKey, RingSpec> = {
  OUTER: {
    shape: "SQUARE",
    plain: [3.9, 12.5, 28, 52, 85, 133, 200],
    wheel: [
      { add: 50, weight: 50 },
      { add: 100, weight: 30 },
      { add: 300, weight: 15 },
      { add: 1000, weight: 5 },
    ],
  },
  MIDDLE: { shape: "TRIANGLE", plain: [2.5, 7.7, 16, 27.5, 44], add: 20.5 },
  INNER: { shape: "CIRCLE", plain: [1.55, 4.85, 10], add: 7 },
};

/** The most part cash-outs in one round (each takes half of what the player still has in play). */
export const MAX_PART_CASHOUTS = 3;

/** Weighted average of what the bonus wheel adds (0 for the rings that add a fixed amount). */
function expectedWheelAdd(spec: RingSpec): number {
  if (!spec.wheel) return spec.add ?? 0;
  const total = spec.wheel.reduce((s, w) => s + w.weight, 0);
  return spec.wheel.reduce((s, w) => s + (w.add * w.weight) / total, 0);
}

export function ringSteps(ring: RingKey): number {
  return RINGS[ring].plain.length + 1;
}

export function ringShape(ring: RingKey): RingSpec["shape"] {
  return RINGS[ring].shape;
}

export interface SegmentInfo {
  /** 1-based number of the segment. */
  step: number;
  kind: SegmentKind;
  /** What the segment shows on the ring: "3.9X", "+7X", "BONUS". */
  label: string;
  /** Multiplier of a cash-out here (the average one for the BONUS segment, which pays by the wheel). */
  multiplier: number;
  /** Chance that a round reaches this segment (1 for no segment yet). */
  reach: number;
  /** Chance of surviving this segment, given that the round got to it. */
  survive: number;
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Every segment of a ring with its odds, for a given return-to-player. */
export function ringTable(ring: RingKey, rtp: number): SegmentInfo[] {
  const spec = RINGS[ring];
  const out: SegmentInfo[] = [];
  let previousReach = 1;
  const lastPlain = spec.plain[spec.plain.length - 1];
  const all: { kind: SegmentKind; label: string; multiplier: number }[] = [
    ...spec.plain.map((m) => ({ kind: "x" as const, label: `${trim(m)}X`, multiplier: m })),
    spec.wheel
      ? { kind: "bonus" as const, label: "BONUS", multiplier: lastPlain + expectedWheelAdd(spec) }
      : { kind: "plus" as const, label: `+${trim(spec.add ?? 0)}X`, multiplier: lastPlain + (spec.add ?? 0) },
  ];
  all.forEach((seg, i) => {
    const reach = Math.min(1, rtp / seg.multiplier);
    out.push({ step: i + 1, kind: seg.kind, label: seg.label, multiplier: seg.multiplier, reach, survive: Math.min(1, reach / previousReach) });
    previousReach = reach;
  });
  return out;
}

/** Last segment of the outer ring: what the wheel adds for a roll in [0, 1). */
export function wheelAdd(ring: RingKey, roll: number): number {
  const spec = RINGS[ring];
  if (!spec.wheel) return spec.add ?? 0;
  const total = spec.wheel.reduce((s, w) => s + w.weight, 0);
  let acc = 0;
  for (const w of spec.wheel) {
    acc += w.weight / total;
    if (roll < acc) return w.add;
  }
  return spec.wheel[spec.wheel.length - 1].add;
}

/** The bonus wheel's segments, for the app to show. */
export function wheelSegments(ring: RingKey): { add: number; weight: number }[] {
  return RINGS[ring].wheel ?? [];
}

/** Multiplier a player holds after surviving `step` segments (the last one pays the plain multiplier plus what the wheel/bonus added). */
export function multiplierAfter(ring: RingKey, step: number, bonusAddOnLast: number): number {
  const spec = RINGS[ring];
  if (step <= 0) return 0;
  const lastPlain = spec.plain[spec.plain.length - 1];
  if (step > spec.plain.length) return Math.round((lastPlain + bonusAddOnLast) * 100) / 100;
  return spec.plain[step - 1];
}

export interface RingOutcome {
  /** Segments survived. */
  survived: number;
  /** True when a segment was failed (so the round is lost), false when every segment up to `target` was survived. */
  eliminated: boolean;
  /** Added by the bonus wheel / bonus segment when the last segment was reached (0 otherwise). */
  bonus: number;
}

/**
 * Plays segments 1..target of a ring with the round's own random numbers:
 * rolls[k] is the draw for segment k+1 (a float in [0, 1)); `bonusRoll` is the
 * wheel's. A segment is survived when its roll is under its survive chance.
 */
export function playRing(ring: RingKey, rtp: number, target: number, rolls: (step: number) => number, bonusRoll: () => number): RingOutcome {
  const table = ringTable(ring, rtp);
  const last = Math.min(target, table.length);
  let survived = 0;
  for (let step = 1; step <= last; step++) {
    if (rolls(step) >= table[step - 1].survive) return { survived, eliminated: true, bonus: 0 };
    survived = step;
  }
  const bonus = survived === table.length ? wheelAdd(ring, bonusRoll()) : 0;
  return { survived, eliminated: false, bonus };
}
