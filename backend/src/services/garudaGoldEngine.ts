import { createHmac } from "crypto";

/**
 * Garuda Gold: the maths of the game, with no database in it, so the check script (scripts/check-garuda-gold.ts) can
 * prove the return exactly.
 *
 * Three reels show three rows each and pay on five fixed lines (the three rows and the two diagonals): three of a kind
 * from the first reel to the third. The WILD (the golden Garuda mask) stands in for every symbol, and three WILDs on a
 * line pay WILD_PAY. Line wins are in stakes (the whole bet) and add up.
 *
 * A fourth reel, the MULTIPLIER REEL, spins with them. The coin in its centre window multiplies the spin's line wins
 * (1x to 100x; it does nothing on a spin without a line win). A NUDGE coin in the centre nudges the reel, on a winning
 * spin, to a big multiplier: 10x to 500x, with the weights of the nudge table.
 *
 * EX (the extra bet) costs EX_COST stakes a spin instead of one and spins its own multiplier reel: no 1x coin, more NUDGE
 * coins and a richer nudge table. Both ways the return is 90% (see getStats and the check script).
 */

export const SYMBOLS = ["WILD", "RUBY", "SAPPHIRE", "EMERALD", "A", "K", "Q", "J"] as const;
export type GarudaSymbol = (typeof SYMBOLS)[number];
const WI = 0;

/** Three of a kind on a line, in stakes. */
export const PAYS: Record<GarudaSymbol, number> = { WILD: 25, RUBY: 10, SAPPHIRE: 5, EMERALD: 3, A: 1, K: 0.8, Q: 0.5, J: 0.3 };
export const WILD_PAY = PAYS.WILD;

/** The rows each line reads on reels 1, 2 and 3 (0 top, 1 middle, 2 bottom). */
export const LINES: number[][] = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

/** The three reels, top to bottom and wrapping round (W = WILD, R = RUBY, S = SAPPHIRE, E = EMERALD). Reel 1 has a stack of three WILDs. */
const LETTER: Record<string, number> = { W: 0, R: 1, S: 2, E: 3, A: 4, K: 5, Q: 6, J: 7 };
const strip = (s: string) => s.split("").map((c) => LETTER[c]);
export const STRIPS: number[][] = [
  strip("AJQKWWWEAJJRJQQQEESJASQJQKKJEJAJJJQRKQKJQSKJ"),
  strip("JKAQERAJJJRJAASWESJQQKQJKJQJKKJQEJJQKQQJSWE"),
  strip("EKKKWRKEJQQQJKAQJJSSJKAQEJSJQJQJJARAJQWJEQJ"),
];

// ---------------------------------------------------------------------------------------------------------------------
// The multiplier reel

export const COINS = ["X1", "X2", "X3", "X5", "X10", "X15", "X20", "X25", "X50", "X100", "X500", "NUDGE"] as const;
export type Coin = (typeof COINS)[number];
export const COIN_VALUE: Record<Exclude<Coin, "NUDGE">, number> = { X1: 1, X2: 2, X3: 3, X5: 5, X10: 10, X15: 15, X20: 20, X25: 25, X50: 50, X100: 100, X500: 500 };

/** What one EX spin costs, in stakes. */
export const EX_COST = 1.5;
/** How many coins of each kind the multiplier reel holds (1000 stops), normal and EX. 500x only comes from a nudge. */
export const COIN_COUNTS: Record<"normal" | "ex", Partial<Record<Coin, number>>> = {
  normal: { X1: 505, X2: 241, X3: 115, X5: 65, X10: 31, X15: 14, X20: 9, X25: 5, X50: 2, X100: 1, NUDGE: 12 },
  ex: { X2: 590, X3: 196, X5: 100, X10: 45, X15: 22, X20: 13, X25: 8, X50: 4, X100: 1, NUDGE: 21 },
};
/** Where a NUDGE takes the reel on a winning spin (weights out of 10,000), normal and EX. */
export const NUDGE_WEIGHTS: Record<"normal" | "ex", Partial<Record<Coin, number>>> = {
  normal: { X10: 3414, X15: 2386, X20: 1600, X25: 1200, X50: 900, X100: 400, X500: 100 },
  ex: { X10: 2964, X15: 2336, X20: 1700, X25: 1300, X50: 1000, X100: 500, X500: 200 },
};

/** Deterministic 32-bit generator, only to lay the multiplier reels out in the same order everywhere. */
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

/** A multiplier reel: the counts spread over the stops, the rarer coins first, each at evenly spaced places (moved on to the next free stop). */
function buildCoinStrip(counts: Partial<Record<Coin, number>>, seed: number): Coin[] {
  const total = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  const out: (Coin | null)[] = new Array(total).fill(null);
  const rnd = mulberry32(seed);
  const order = (Object.keys(counts) as Coin[]).sort((a, b) => (counts[a] ?? 0) - (counts[b] ?? 0));
  const commonest = order[order.length - 1];
  for (const coin of order.slice(0, -1)) {
    const n = counts[coin] ?? 0;
    const offset = Math.floor(rnd() * (total / n));
    for (let i = 0; i < n; i++) {
      let pos = (Math.floor((i * total) / n) + offset) % total;
      while (out[pos] !== null) pos = (pos + 1) % total;
      out[pos] = coin;
    }
  }
  return out.map((c) => c ?? commonest);
}
export const COIN_STRIPS: Record<"normal" | "ex", Coin[]> = {
  normal: buildCoinStrip(COIN_COUNTS.normal, 4096),
  ex: buildCoinStrip(COIN_COUNTS.ex, 5150),
};

/** The coin a nudge lands on, for a roll in [0, 1). */
export function nudgeCoin(mode: "normal" | "ex", roll: number): Coin {
  const table = NUDGE_WEIGHTS[mode];
  const entries = Object.entries(table) as [Coin, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let acc = 0;
  for (const [coin, w] of entries) {
    acc += w / total;
    if (roll < acc) return coin;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------------------------------------------------------------
// One spin

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:garudagold:<nonce>:<block>"), read as 32-bit numbers. */
export function garudaRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:garudagold:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export function windowFor(strips: number[][], stops: number[]): number[][] {
  return strips.map((s, r) => {
    const n = s.length;
    return [s[(stops[r] - 1 + n) % n], s[stops[r]], s[(stops[r] + 1) % n]];
  });
}

/** What one line pays (in stakes) and the symbol it pays for. */
export function linePay(cells: number[]): { pay: number; symbol: number } {
  const base = cells.find((c) => c !== WI);
  if (base === undefined) return { pay: WILD_PAY, symbol: WI };
  if (!cells.every((c) => c === WI || c === base)) return { pay: 0, symbol: -1 };
  return { pay: PAYS[SYMBOLS[base]], symbol: base };
}

export interface LineWin {
  /** 0 top row, 1 middle, 2 bottom, 3 the diagonal from the top left, 4 the one from the bottom left. */
  line: number;
  symbol: GarudaSymbol;
  /** In stakes, before the multiplier. */
  pay: number;
}

/** The line wins of a window of reels 1 to 3 (window[reel][row]). */
export function evaluateWindow(win: number[][]): { lines: LineWin[]; linePay: number } {
  const lines: LineWin[] = [];
  let total = 0;
  LINES.forEach((rows, line) => {
    const r = linePay(rows.map((row, reel) => win[reel][row]));
    if (r.pay > 0) {
      lines.push({ line, symbol: SYMBOLS[r.symbol], pay: r.pay });
      total += r.pay;
    }
  });
  return { lines, linePay: round4(total) };
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export interface GarudaOutcome {
  ex: boolean;
  /** Stop of each of reels 1 to 3 (its middle row) and what they show: window[reel] = [top, middle, bottom]. */
  stops: number[];
  window: GarudaSymbol[][];
  /** The multiplier reel's stop and the five coins in sight, top to bottom; the middle one counts. */
  coinStop: number;
  coinWindow: Coin[];
  coin: Coin;
  /** Where the NUDGE took the reel (only when the centre coin was a NUDGE and the spin won). */
  nudge: Coin | null;
  lines: LineWin[];
  /** Line wins in stakes, before the multiplier. */
  linePay: number;
  /** What multiplied the line wins (1 when nothing won). */
  multiplier: number;
  /** The spin's win in stakes: linePay x multiplier. */
  totalWin: number;
}

/** The outcome of given stops (the play code and the check script both use this). */
export function outcomeFor(stops: number[], coinStop: number, nudgeRoll: number, ex: boolean): GarudaOutcome {
  const mode = ex ? "ex" : "normal";
  const coins = COIN_STRIPS[mode];
  const n = coins.length;
  const win = windowFor(STRIPS, stops);
  const { lines, linePay } = evaluateWindow(win);
  const coin = coins[coinStop];
  const nudge = coin === "NUDGE" && linePay > 0 ? nudgeCoin(mode, nudgeRoll) : null;
  const landed = nudge ?? coin;
  const multiplier = linePay > 0 && landed !== "NUDGE" ? COIN_VALUE[landed] : 1;
  return {
    ex,
    stops,
    window: win.map((col) => col.map((s) => SYMBOLS[s])),
    coinStop,
    coinWindow: [-2, -1, 0, 1, 2].map((d) => coins[(coinStop + d + n) % n]),
    coin,
    nudge,
    lines,
    linePay,
    multiplier,
    totalWin: round4(linePay * multiplier),
  };
}

/** One spin from a random stream. The nudge roll is always drawn, so a spin uses the same numbers whatever it shows. */
export function playSpin(rng: Rng, ex: boolean): GarudaOutcome {
  const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
  const coinStop = Math.floor(rng() * COIN_STRIPS[ex ? "ex" : "normal"].length);
  const nudgeRoll = rng();
  return outcomeFor(stops, coinStop, nudgeRoll, ex);
}

export function replayGarudaSpin(serverSeed: string, clientSeed: string, nonce: number, ex: boolean): GarudaOutcome {
  return playSpin(garudaRng(serverSeed, clientSeed, nonce), ex);
}

// ---------------------------------------------------------------------------------------------------------------------
// Exact statistics: every stop combination of reels 1 to 3, and every stop of the multiplier reels.

export interface Stats {
  /** Expected line win of one spin, in stakes, before the multiplier. */
  lineEv: number;
  /** Chance that a spin has a line win. */
  hitRate: number;
  combos: number;
  /** The most the lines of one spin can pay, in stakes, before the multiplier. */
  maxLinePay: number;
  /** Average multiplier (a NUDGE counted as the average of its table), normal and EX. */
  multMean: { normal: number; ex: number };
  nudgeMean: { normal: number; ex: number };
  nudgeChance: { normal: number; ex: number };
  /** Return to player: lineEv x multMean, divided by EX_COST for EX. */
  rtp: number;
  exRtp: number;
}

let cached: Stats | null = null;

export function getStats(): Stats {
  if (cached) return cached;
  const [a, b, c] = STRIPS;
  let sum = 0;
  let hits = 0;
  let combos = 0;
  let maxLinePay = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      for (let k = 0; k < c.length; k++) {
        const { linePay: pay } = evaluateWindow(windowFor(STRIPS, [i, j, k]));
        sum += pay;
        if (pay > 0) hits++;
        if (pay > maxLinePay) maxLinePay = pay;
        combos++;
      }
  const lineEv = sum / combos;
  const nudgeMean = { normal: 0, ex: 0 };
  const multMean = { normal: 0, ex: 0 };
  const nudgeChance = { normal: 0, ex: 0 };
  for (const mode of ["normal", "ex"] as const) {
    const table = Object.entries(NUDGE_WEIGHTS[mode]) as [Exclude<Coin, "NUDGE">, number][];
    const tw = table.reduce((s, [, w]) => s + w, 0);
    nudgeMean[mode] = table.reduce((s, [coin, w]) => s + (COIN_VALUE[coin] * w) / tw, 0);
    const counts = Object.entries(COIN_COUNTS[mode]) as [Coin, number][];
    const total = counts.reduce((s, [, n]) => s + n, 0);
    multMean[mode] = counts.reduce((s, [coin, n]) => s + ((coin === "NUDGE" ? nudgeMean[mode] : COIN_VALUE[coin]) * n) / total, 0);
    nudgeChance[mode] = (COIN_COUNTS[mode].NUDGE ?? 0) / total;
  }
  // The multiplier reel does not depend on reels 1 to 3, so the expected win is the line win times the average multiplier
  // (the check script also counts every combination of the four reels and the nudge table to prove it).
  cached = {
    lineEv,
    hitRate: hits / combos,
    combos,
    maxLinePay,
    multMean,
    nudgeMean,
    nudgeChance,
    rtp: lineEv * multMean.normal,
    exRtp: (lineEv * multMean.ex) / EX_COST,
  };
  return cached;
}
