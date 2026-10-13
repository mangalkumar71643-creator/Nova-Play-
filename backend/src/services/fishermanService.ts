import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Fisherman's Catch: a five-reel, three-row fishing slot with ten fixed
 * lines. The stake is spread evenly over the lines; line wins pay left to
 * right from the first reel, in line bets.
 *
 * Three or more BONUS boats anywhere start 10 / 15 / 20 free spins, played
 * on their own reels that carry the Fisherman WILD (reels 2–5). Every fish
 * shows a cash value; when Fishermen land, each one collects the value of
 * every fish on screen, times the current multiplier. Every fourth
 * Fisherman collected adds 10 free spins and raises the multiplier to 2x,
 * then 3x, then 10x.
 *
 * STATS is exact: line wins are counted over every symbol combination, the
 * boats over every stop, and the free spins through every state they can
 * reach (spins left x Fishermen collected).
 */
export const SYMBOLS = ["JACK", "QUEEN", "KING", "ACE", "LURE", "TACKLE", "ROD", "FISH", "BONUS", "WILD"] as const;
export type FishSymbol = (typeof SYMBOLS)[number];
const JA = 0, QU = 1, KI = 2, AC = 3, LU = 4, TB = 5, RO = 6, FI = 7, BO = 8, WI = 9;

/** Reel strips, top to bottom and wrapping round. */
export const BASE_STRIPS: number[][] = [
  [JA, KI, LU, AC, FI, QU, AC, KI, JA, BO, LU, JA, AC, QU, JA, QU, KI, QU, KI, AC, QU, AC, TB, KI, FI, QU, KI, RO, JA, FI, KI, RO, QU, AC, JA, FI, LU, JA, LU, TB, FI, JA, QU, LU, JA, BO, QU, AC, KI, TB, AC, TB, RO],
  [JA, AC, JA, FI, KI, LU, BO, JA, QU, AC, TB, AC, KI, JA, LU, QU, KI, AC, KI, RO, JA, KI, JA, TB, QU, KI, QU, RO, JA, LU, QU, AC, KI, AC, FI, LU, AC, BO, FI, QU, KI, FI, RO, JA, QU, LU, TB, QU, FI, JA, AC, TB, QU],
  [JA, QU, AC, TB, FI, JA, LU, AC, KI, QU, JA, LU, RO, KI, JA, QU, LU, FI, QU, JA, QU, FI, TB, AC, QU, AC, JA, RO, TB, FI, AC, QU, KI, AC, BO, JA, KI, QU, KI, AC, LU, QU, KI, BO, TB, KI, RO, LU, JA, FI, JA, KI, AC],
  [KI, TB, KI, JA, QU, AC, TB, KI, FI, BO, AC, LU, QU, TB, JA, FI, JA, RO, JA, TB, LU, QU, LU, JA, QU, KI, QU, BO, QU, KI, FI, JA, AC, RO, KI, LU, KI, FI, QU, JA, AC, JA, QU, AC, FI, QU, AC, RO, AC, LU, AC, KI, JA],
  [QU, AC, QU, KI, JA, LU, TB, QU, AC, LU, JA, RO, BO, FI, JA, TB, FI, RO, FI, KI, TB, QU, AC, QU, KI, AC, LU, QU, FI, QU, FI, AC, JA, AC, KI, JA, KI, QU, BO, TB, QU, LU, KI, AC, JA, KI, RO, KI, JA, LU, JA, AC, JA],
];

export const FREE_STRIPS: number[][] = [
  [KI, JA, QU, AC, JA, FI, QU, AC, RO, KI, AC, TB, JA, LU, KI, LU, FI, AC, FI, LU, JA, FI, QU, AC, QU, TB, QU, KI, JA, TB, KI, FI, AC, FI, TB, AC, JA, LU, QU, JA, KI, RO, KI, AC, JA, QU, RO, KI, QU, LU, QU, JA],
  [TB, QU, LU, AC, QU, KI, JA, KI, QU, KI, JA, AC, QU, KI, JA, FI, LU, JA, AC, KI, AC, QU, FI, QU, RO, TB, LU, FI, JA, FI, AC, WI, QU, TB, QU, KI, RO, AC, RO, JA, QU, LU, FI, AC, JA, FI, LU, JA, KI, TB, KI, AC, JA],
  [JA, KI, QU, AC, JA, LU, FI, JA, KI, FI, JA, AC, TB, RO, JA, QU, RO, FI, JA, AC, KI, TB, JA, AC, QU, KI, LU, AC, WI, FI, QU, RO, TB, KI, QU, JA, QU, JA, KI, TB, AC, QU, LU, KI, QU, LU, FI, AC, FI, AC, LU, KI, QU],
  [QU, TB, JA, KI, LU, JA, QU, AC, JA, KI, AC, FI, JA, AC, WI, FI, JA, KI, QU, KI, JA, KI, FI, QU, AC, TB, RO, QU, TB, FI, KI, JA, KI, RO, QU, KI, FI, LU, AC, QU, FI, RO, QU, JA, AC, LU, QU, TB, LU, AC, LU, AC, JA],
  [LU, KI, FI, KI, WI, JA, TB, AC, JA, LU, QU, FI, JA, FI, LU, QU, AC, RO, LU, FI, KI, AC, JA, FI, TB, AC, QU, JA, KI, RO, TB, AC, KI, AC, RO, AC, QU, KI, QU, KI, JA, QU, LU, JA, FI, AC, QU, JA, QU, TB, JA, KI, QU],
];

/** Three, four and five of a kind on a line, in line bets. */
export const PAYS: Partial<Record<FishSymbol, [number, number, number]>> = {
  ROD: [80, 400, 2000],
  TACKLE: [50, 200, 800],
  LURE: [40, 120, 480],
  FISH: [40, 120, 480],
  ACE: [18, 70, 220],
  KING: [18, 70, 220],
  QUEEN: [15, 50, 160],
  JACK: [15, 50, 160],
};
/** A line of nothing but Fishermen pays like rods. */
export const WILD_PAYS: [number, number, number] = [80, 400, 2000];
export const LINE_COUNT = 10;

/** Rows (0 top, 1 middle, 2 bottom) read on each reel, per line. */
export const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1],
];

/** Fish cash values, in stakes, with their weights. */
export const FISH_VALUES = [
  { value: 0.5, weight: 430 },
  { value: 1, weight: 260 },
  { value: 2, weight: 150 },
  { value: 3, weight: 84 },
  { value: 4, weight: 48 },
  { value: 5, weight: 18 },
  { value: 10, weight: 9 },
  { value: 50, weight: 5 },
];
/** Free spins for 3, 4 and 5 boats. */
export const FREE_SPINS_FOR: Record<number, number> = { 3: 10, 4: 15, 5: 20 };
export const MULTIPLIERS = [1, 2, 3, 10];
export const FISHERMEN_PER_LEVEL = 4;
export const RETRIGGER_SPINS = 10;
const MAX_LEVEL = MULTIPLIERS.length - 1;

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The three visible symbols of each reel (top, middle, bottom) for the given stops; the stop is the middle row. */
export function windowFor(strips: number[][], stops: number[]): number[][] {
  return stops.map((stop, reel) => {
    const s = strips[reel];
    return [-1, 0, 1].map((d) => s[(((stop + d) % s.length) + s.length) % s.length]);
  });
}

/** What one line pays (in line bets), the symbol it pays for and how many reels it covers. */
export function linePay(seq: number[]): { pays: number; symbol: number; count: number } {
  if (seq[0] === BO) return { pays: 0, symbol: -1, count: 0 };
  let w = 0;
  while (w < 5 && seq[w] === WI) w++;
  let best = { pays: w >= 3 ? WILD_PAYS[w - 3] : 0, symbol: WI, count: w };
  if (w === 5) return best;
  const x = seq[w];
  const table = PAYS[SYMBOLS[x]];
  if (!table) return best.pays > 0 ? best : { pays: 0, symbol: -1, count: 0 };
  let n = w;
  while (n < 5 && (seq[n] === x || seq[n] === WI)) n++;
  const p = n >= 3 ? table[n - 3] : 0;
  if (p > best.pays) best = { pays: p, symbol: x, count: n };
  return best.pays > 0 ? best : { pays: 0, symbol: -1, count: 0 };
}

export type LineWin = { line: number; symbol: FishSymbol; count: number; pays: number };

/** Every winning line in a window; `total` is in stakes. */
export function evaluateLines(win: number[][]): { lines: LineWin[]; total: number } {
  const lines: LineWin[] = [];
  let sum = 0;
  LINES.forEach((rows, line) => {
    const r = linePay(rows.map((row, reel) => win[reel][row]));
    if (r.pays > 0) {
      lines.push({ line, symbol: SYMBOLS[r.symbol], count: r.count, pays: r.pays });
      sum += r.pays;
    }
  });
  return { lines, total: sum / LINE_COUNT };
}

const FISH_TOTAL = FISH_VALUES.reduce((s, f) => s + f.weight, 0);
const FISH_MEAN = FISH_VALUES.reduce((s, f) => s + f.value * f.weight, 0) / FISH_TOTAL;

/** Exact expected line win (in stakes) on the given strips: every line reads one uniform stop per reel. */
function lineEv(strips: number[][]): number {
  const freq = strips.map((s) => {
    const m = new Map<number, number>();
    s.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1 / s.length));
    return [...m.entries()];
  });
  let ev = 0;
  const seq = [0, 0, 0, 0, 0];
  const walk = (reel: number, p: number) => {
    if (reel === 5) {
      ev += p * linePay(seq).pays;
      return;
    }
    for (const [x, q] of freq[reel]) {
      seq[reel] = x;
      walk(reel + 1, p * q);
    }
  };
  walk(0, 1);
  return ev;
}

let statsCache: { rtp: number; baseRtp: number; featureRtp: number; featureChance: number; averageFeature: number } | null = null;
export function getStats() {
  if (statsCache) return statsCache;
  const baseLine = lineEv(BASE_STRIPS);
  const freeLine = lineEv(FREE_STRIPS);
  // Boats: at most one per reel window (they're spaced on the strips).
  let boats = new Map<number, number>([[0, 1]]);
  for (const s of BASE_STRIPS) {
    const p = s.filter((_, i) => windowFor([s], [i])[0].includes(BO)).length / s.length;
    const next = new Map<number, number>();
    boats.forEach((q, k) => {
      next.set(k, (next.get(k) ?? 0) + q * (1 - p));
      next.set(k + 1, (next.get(k + 1) ?? 0) + q * p);
    });
    boats = next;
  }
  // Free spin: Fishermen F with its chance and E[fish count * 1{F}], over every stop of every reel.
  let joint = new Map<number, [number, number]>([[0, [1, 0]]]);
  for (const s of FREE_STRIPS) {
    const reel = new Map<number, [number, number]>();
    for (let i = 0; i < s.length; i++) {
      const w = windowFor([s], [i])[0];
      const f = w.filter((x) => x === WI).length;
      const c = w.filter((x) => x === FI).length;
      const cur = reel.get(f) ?? [0, 0];
      reel.set(f, [cur[0] + 1 / s.length, cur[1] + c / s.length]);
    }
    const next = new Map<number, [number, number]>();
    joint.forEach(([m, mc], F) =>
      reel.forEach(([rm, rmc], f) => {
        const cur = next.get(F + f) ?? [0, 0];
        next.set(F + f, [cur[0] + m * rm, cur[1] + mc * rm + m * rmc]);
      })
    );
    joint = next;
  }
  const memo = new Map<string, number>();
  const cap = MAX_LEVEL * FISHERMEN_PER_LEVEL;
  const value = (spins: number, collected: number): number => {
    if (spins === 0) return 0;
    const key = `${spins}:${collected}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const level = Math.min(Math.floor(collected / FISHERMEN_PER_LEVEL), MAX_LEVEL);
    let total = freeLine;
    joint.forEach(([m, mc], F) => {
      total += MULTIPLIERS[level] * F * FISH_MEAN * mc;
      const after = collected + F;
      const retriggers = Math.min(Math.floor(after / FISHERMEN_PER_LEVEL), MAX_LEVEL) - level;
      total += m * value(spins - 1 + retriggers * RETRIGGER_SPINS, Math.min(after, cap));
    });
    memo.set(key, total);
    return total;
  };
  let feature = 0;
  let featureChance = 0;
  boats.forEach((q, k) => {
    if (k >= 3) {
      feature += q * value(FREE_SPINS_FOR[Math.min(k, 5)], 0);
      featureChance += q;
    }
  });
  statsCache = { rtp: baseLine + feature, baseRtp: baseLine, featureRtp: feature, featureChance, averageFeature: feature / featureChance };
  return statsCache;
}

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:fisherman:<nonce>:<block>"), read as 32-bit numbers. */
export function fishermanRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:fisherman:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

function drawFish(rng: Rng): number {
  let roll = rng() * FISH_TOTAL;
  for (const f of FISH_VALUES) {
    if (roll < f.weight) return f.value;
    roll -= f.weight;
  }
  return FISH_VALUES[FISH_VALUES.length - 1].value;
}

/** Cash values for every fish on screen ([reel][row], 0 where there's no fish), in stakes. */
function fishValuesFor(win: number[][], rng: Rng): number[][] {
  return win.map((reel) => reel.map((s) => (s === FI ? drawFish(rng) : 0)));
}

export type FreeSpin = {
  stops: number[];
  fishValues: number[][];
  lines: LineWin[];
  /** Fishermen on screen. */
  fishermen: number;
  multiplier: number;
  /** Fishermen x fish on screen x multiplier, in stakes. */
  collect: number;
  /** This spin's lines and collect, in stakes. */
  win: number;
  /** Fishermen collected so far, after this spin. */
  collected: number;
  /** Free spins still to play after this one. */
  spinsLeft: number;
  /** Free spins this spin added (0 or 10, or more if it crossed several levels). */
  retrigger: number;
};

export type FishermanOutcome = {
  stops: number[];
  fishValues: number[][];
  lines: LineWin[];
  /** Base game line wins, in stakes. */
  baseWin: number;
  boats: number;
  freeSpinsAwarded: number;
  freeSpins: FreeSpin[];
  /** What the whole spin pays, in stakes. */
  totalWin: number;
};

export function playSpin(rng: Rng): FishermanOutcome {
  const stops = BASE_STRIPS.map((s) => Math.floor(rng() * s.length));
  const win = windowFor(BASE_STRIPS, stops);
  const fishValues = fishValuesFor(win, rng);
  const base = evaluateLines(win);
  const boats = win.filter((reel) => reel.includes(BO)).length;
  const freeSpinsAwarded = boats >= 3 ? FREE_SPINS_FOR[Math.min(boats, 5)] : 0;

  const freeSpins: FreeSpin[] = [];
  let spinsLeft = freeSpinsAwarded;
  let collected = 0;
  while (spinsLeft > 0) {
    spinsLeft--;
    const level = Math.min(Math.floor(collected / FISHERMEN_PER_LEVEL), MAX_LEVEL);
    const fStops = FREE_STRIPS.map((s) => Math.floor(rng() * s.length));
    const fWin = windowFor(FREE_STRIPS, fStops);
    const fValues = fishValuesFor(fWin, rng);
    const lines = evaluateLines(fWin);
    const fishermen = fWin.reduce((n, reel) => n + reel.filter((x) => x === WI).length, 0);
    const fishSum = fValues.reduce((s, reel) => s + reel.reduce((a, b) => a + b, 0), 0);
    const collect = fishermen > 0 ? fishermen * fishSum * MULTIPLIERS[level] : 0;
    const after = Math.min(collected + fishermen, MAX_LEVEL * FISHERMEN_PER_LEVEL);
    const retrigger = (Math.min(Math.floor(after / FISHERMEN_PER_LEVEL), MAX_LEVEL) - level) * RETRIGGER_SPINS;
    collected = after;
    spinsLeft += retrigger;
    freeSpins.push({
      stops: fStops,
      fishValues: fValues,
      lines: lines.lines,
      fishermen,
      multiplier: MULTIPLIERS[level],
      collect: Number(collect.toFixed(4)),
      win: Number((lines.total + collect).toFixed(4)),
      collected,
      spinsLeft,
      retrigger,
    });
  }
  const totalWin = Number((base.total + freeSpins.reduce((s, f) => s + f.win, 0)).toFixed(4));
  return { stops, fishValues, lines: base.lines, baseWin: Number(base.total.toFixed(4)), boats, freeSpinsAwarded, freeSpins, totalWin };
}

export function replayFishermanSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(fishermanRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.FishermanSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getFishermanConfig() {
  const stats = getStats();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    baseStrips: BASE_STRIPS.map((s) => s.map((i) => SYMBOLS[i])),
    freeStrips: FREE_STRIPS.map((s) => s.map((i) => SYMBOLS[i])),
    lines: LINES,
    lineCount: LINE_COUNT,
    pays: PAYS,
    wildPays: WILD_PAYS,
    fishValues: FISH_VALUES.map((f) => ({ value: f.value, chancePercent: round2((f.weight / FISH_TOTAL) * 100) })),
    freeSpinsFor: FREE_SPINS_FOR,
    multipliers: MULTIPLIERS,
    fishermenPerLevel: FISHERMEN_PER_LEVEL,
    retriggerSpins: RETRIGGER_SPINS,
    featureChancePercent: round2(stats.featureChance * 100),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
  };
}

/** Spins once (free spins included): debits the stake, plays from the player's provably-fair seeds and pays, in one transaction. */
export async function spinFisherman(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayFishermanSpin(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: stake } }, data: { balance: { decrement: stake } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + stake;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: stake };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.fishermanSpin.create({
      data: {
        userId,
        stake,
        totalWin: outcome.totalWin,
        payout,
        freeSpins: outcome.freeSpins.length,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyFishermanHistory(userId: string, limit = 30) {
  const rows = await prisma.fishermanSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
