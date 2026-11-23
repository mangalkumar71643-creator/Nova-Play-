import { createHmac } from "crypto";

/**
 * Turbo Sevens: the maths of the game, with no database in it, so the check script (scripts/check-turbo-sevens.ts) can
 * prove the return exactly.
 *
 * Three reels show three rows each, and only the MIDDLE row pays (one payline). A fourth, gold-framed BONUS REEL spins with
 * them and decides what the win is worth:
 *   - x2, x5, x10 multiply the payline's win (they do nothing on a spin that has no line win);
 *   - $+ pays 2 stakes and $$+ pays 20 stakes, line win or not;
 *   - RESPIN opens the bonus wheel, which awards 1 to 5 respins; every respin spins all four reels again (the RESPIN stop
 *     counts as an empty one inside the respins, so they cannot start more of themselves) and its win is added to the spin.
 *
 * Payline wins are in stakes (the whole bet): three of a kind pays its price, and three different symbols of one family pay
 * the "any" prices (any 7s, any BARs, any 7 and BAR mix). A blank anywhere on the payline pays nothing.
 */

export const SYMBOLS = ["FLAME7", "RED7", "GOLD7", "GREEN2BAR", "BLUE1BAR", "BLANK"] as const;
export type ReelSymbol = (typeof SYMBOLS)[number];
const F7 = 0, R7 = 1, G7 = 2, GB = 3, BB = 4, BL = 5;

export const BONUS_SYMBOLS = ["EMPTY", "X2", "X5", "X10", "CASH2", "CASH20", "RESPIN"] as const;
export type BonusSymbol = (typeof BONUS_SYMBOLS)[number];

/** Three of a kind on the payline, in stakes. */
export const PAYS: Record<number, number> = { [F7]: 200, [R7]: 40, [G7]: 20, [GB]: 8, [BB]: 4 };
/** Three different symbols of one family. */
export const ANY7_PAY = 8;
export const ANY_BAR_PAY = 2;
/** A mix of 7s and BARs. */
export const ANY_PAY = 0.8;

export type LineKind = "FLAME7" | "RED7" | "GOLD7" | "GREEN2BAR" | "BLUE1BAR" | "ANY7" | "ANYBAR" | "ANY" | "NONE";

/** What the bonus reel's cash symbols pay, in stakes. */
export const CASH_PAY: Record<string, number> = { CASH2: 2, CASH20: 20 };
export const MULTIPLIERS: Record<string, number> = { X2: 2, X5: 5, X10: 10 };

/** The three main reels: 24 stops each, the same symbols in a different order. */
const REEL_A = [GB, BL, BB, GB, BL, GB, BL, BB, R7, GB, BL, BB, BL, BL, BB, GB, BL, G7, GB, R7, BL, BL, F7, BB];
const REEL_B = [BL, GB, BL, BB, GB, BL, GB, BL, BL, F7, BL, BB, R7, BL, GB, BB, GB, G7, BL, BL, GB, BB, R7, BB];
const REEL_C = [BL, GB, R7, BL, BL, GB, BB, BL, GB, R7, BL, GB, BB, GB, BL, BL, G7, GB, BB, F7, BB, BL, BB, BL];
export const STRIPS: number[][] = [REEL_A, REEL_B, REEL_C];

/** The bonus reel's stops (out of 200) per symbol. */
export const BONUS_COUNTS: Record<BonusSymbol, number> = { EMPTY: 158, X2: 14, X5: 6, X10: 1, CASH2: 14, CASH20: 1, RESPIN: 6 };

/** Deterministic 32-bit generator, only to lay the bonus reel out in the same order everywhere. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The bonus reel: the counts above spread over 200 stops, the rarer symbols kept apart. */
function buildBonusStrip(): BonusSymbol[] {
  const total = Object.values(BONUS_COUNTS).reduce((s, n) => s + n, 0);
  const strip: (BonusSymbol | null)[] = new Array(total).fill(null);
  const rnd = mulberry32(777);
  // Rarest first, each at an evenly spaced place, moved to the next free stop.
  const order = (Object.keys(BONUS_COUNTS) as BonusSymbol[]).filter((k) => k !== "EMPTY").sort((a, b) => BONUS_COUNTS[a] - BONUS_COUNTS[b]);
  for (const sym of order) {
    const n = BONUS_COUNTS[sym];
    const offset = Math.floor(rnd() * (total / n));
    for (let i = 0; i < n; i++) {
      let pos = (Math.floor((i * total) / n) + offset) % total;
      while (strip[pos] !== null) pos = (pos + 1) % total;
      strip[pos] = sym;
    }
  }
  return strip.map((s) => s ?? "EMPTY");
}
export const BONUS_STRIP: BonusSymbol[] = buildBonusStrip();

/** How many respins the wheel awards, with its weights (out of 100). */
export const WHEEL: { respins: number; weight: number }[] = [
  { respins: 1, weight: 35 },
  { respins: 2, weight: 30 },
  { respins: 3, weight: 20 },
  { respins: 4, weight: 10 },
  { respins: 5, weight: 5 },
];
export const MAX_RESPINS = 5;

export function windowFor(strips: number[][], stops: number[]): number[][] {
  return strips.map((strip, r) => {
    const n = strip.length;
    const s = stops[r];
    return [strip[(s + n - 1) % n], strip[s], strip[(s + 1) % n]];
  });
}

/** What the payline (the three middle cells) pays, in stakes. */
export function evaluateLine(cells: number[]): { kind: LineKind; pay: number } {
  if (cells.some((c) => c === BL)) return { kind: "NONE", pay: 0 };
  if (cells[0] === cells[1] && cells[1] === cells[2]) {
    const sym = cells[0];
    return { kind: SYMBOLS[sym] as LineKind, pay: PAYS[sym] };
  }
  const sevens = cells.every((c) => c === F7 || c === R7 || c === G7);
  if (sevens) return { kind: "ANY7", pay: ANY7_PAY };
  const bars = cells.every((c) => c === GB || c === BB);
  if (bars) return { kind: "ANYBAR", pay: ANY_BAR_PAY };
  return { kind: "ANY", pay: ANY_PAY };
}

export interface SpinStep {
  /** Stop of each main reel (the middle row) and of the bonus reel. */
  stops: number[];
  bonusStop: number;
  /** What each main reel shows: [top, middle, bottom]. */
  window: ReelSymbol[][];
  /** The bonus reel: [top, middle, bottom]; the middle one counts. */
  bonusWindow: BonusSymbol[];
  bonus: BonusSymbol;
  line: LineKind;
  /** Payline win in stakes, before the multiplier. */
  linePay: number;
  /** The bonus reel's multiplier when it applied (1 otherwise). */
  multiplier: number;
  /** Cash symbol win in stakes. */
  cash: number;
  /** This spin's win in stakes: linePay x multiplier + cash. */
  win: number;
}

export interface TurboOutcome {
  /** The paid spin first, then the respins the wheel awarded. */
  spins: SpinStep[];
  /** Respins the wheel awarded (0 when the RESPIN stop did not come). */
  respins: number;
  /** The whole spin's win in stakes. */
  totalWin: number;
}

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:turbosevens:<nonce>:<block>"), read as 32-bit numbers. */
export function turboRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:turbosevens:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function stepFor(stops: number[], bonusStop: number, inRespin: boolean): SpinStep {
  const win = windowFor(STRIPS, stops);
  const n = BONUS_STRIP.length;
  // A RESPIN stop inside a respin counts as an empty one: respins can't start respins.
  const sym = (i: number): BonusSymbol => {
    const s = BONUS_STRIP[(i + n) % n];
    return inRespin && s === "RESPIN" ? "EMPTY" : s;
  };
  const bonus = sym(bonusStop);
  const { kind, pay } = evaluateLine(win.map((col) => col[1]));
  const multiplier = pay > 0 && MULTIPLIERS[bonus] ? MULTIPLIERS[bonus] : 1;
  const cash = CASH_PAY[bonus] ?? 0;
  return {
    stops,
    bonusStop,
    window: win.map((col) => col.map((s) => SYMBOLS[s])),
    bonusWindow: [sym(bonusStop - 1), bonus, sym(bonusStop + 1)],
    bonus,
    line: kind,
    linePay: pay,
    multiplier,
    cash,
    win: round4(pay * multiplier + cash),
  };
}

function drawStep(rng: Rng, inRespin: boolean): SpinStep {
  const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
  const bonusStop = Math.floor(rng() * BONUS_STRIP.length);
  return stepFor(stops, bonusStop, inRespin);
}

/** The wheel's award for a roll in [0, 1). */
export function wheelRespins(roll: number): number {
  const total = WHEEL.reduce((s, w) => s + w.weight, 0);
  let acc = 0;
  for (const w of WHEEL) {
    acc += w.weight / total;
    if (roll < acc) return w.respins;
  }
  return WHEEL[WHEEL.length - 1].respins;
}

/** One whole spin from a random stream: the paid spin, the wheel and the respins when the RESPIN stop comes. */
export function playSpin(rng: Rng): TurboOutcome {
  const first = drawStep(rng, false);
  const spins = [first];
  let respins = 0;
  if (first.bonus === "RESPIN") {
    respins = wheelRespins(rng());
    for (let i = 0; i < respins; i++) spins.push(drawStep(rng, true));
  }
  return { spins, respins, totalWin: round4(spins.reduce((s, x) => s + x.win, 0)) };
}

export function replayTurboSpin(serverSeed: string, clientSeed: string, nonce: number): TurboOutcome {
  return playSpin(turboRng(serverSeed, clientSeed, nonce));
}

// ---------------------------------------------------------------------------------------------------------------------
// Exact statistics: every stop combination of the three main reels, and every stop of the bonus reel.

export interface Stats {
  /** Expected line win of one spin, in stakes (before the bonus reel). */
  lineEv: number;
  /** Chance that the payline pays. */
  lineHit: number;
  /** Number of stop combinations per line kind. */
  lineCounts: Record<LineKind, number>;
  combos: number;
  /** Chance of each bonus reel symbol. */
  bonusChance: Record<BonusSymbol, number>;
  /** Expected win of one spin without its respins, and with them: the return to player. */
  spinEv: number;
  rtp: number;
  /** Chance that a spin pays something (payline or cash) on its own, and that it starts the respins. */
  hitRate: number;
  respinChance: number;
  /** Average respins the wheel awards. */
  respinsMean: number;
}

let cached: Stats | null = null;

export function getStats(): Stats {
  if (cached) return cached;
  const counts: Record<LineKind, number> = { FLAME7: 0, RED7: 0, GOLD7: 0, GREEN2BAR: 0, BLUE1BAR: 0, ANY7: 0, ANYBAR: 0, ANY: 0, NONE: 0 };
  let linePaySum = 0;
  let combos = 0;
  for (let a = 0; a < STRIPS[0].length; a++) {
    for (let b = 0; b < STRIPS[1].length; b++) {
      for (let c = 0; c < STRIPS[2].length; c++) {
        const { kind, pay } = evaluateLine([STRIPS[0][a], STRIPS[1][b], STRIPS[2][c]]);
        counts[kind]++;
        linePaySum += pay;
        combos++;
      }
    }
  }
  const lineEv = linePaySum / combos;
  const lineHit = 1 - counts.NONE / combos;

  const n = BONUS_STRIP.length;
  const bonusChance = Object.fromEntries(BONUS_SYMBOLS.map((s) => [s, BONUS_STRIP.filter((x) => x === s).length / n])) as Record<BonusSymbol, number>;
  // The bonus reel does not depend on the main reels, so the expected win is the line win times the multiplier's average,
  // plus the cash symbols (the check script also enumerates every combination of the four reels to prove it).
  const multMean = BONUS_SYMBOLS.reduce((s, sym) => s + bonusChance[sym] * (MULTIPLIERS[sym] ?? 1), 0);
  const cashMean = BONUS_SYMBOLS.reduce((s, sym) => s + bonusChance[sym] * (CASH_PAY[sym] ?? 0), 0);
  const spinEv = lineEv * multMean + cashMean;
  const respinsMean = WHEEL.reduce((s, w) => s + (w.respins * w.weight) / 100, 0);
  // A respin is worth the same as the paid spin: its bonus reel has the RESPIN stops as empty ones, which pay nothing either way.
  const rtp = spinEv * (1 + bonusChance.RESPIN * respinsMean);
  const cashHit = bonusChance.CASH2 + bonusChance.CASH20;
  const hitRate = 1 - (1 - lineHit) * (1 - cashHit);
  cached = { lineEv, lineHit, lineCounts: counts, combos, bonusChance, spinEv, rtp, hitRate, respinChance: bonusChance.RESPIN, respinsMean };
  return cached;
}
