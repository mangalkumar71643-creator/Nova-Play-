import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Jaguar Temple: a three-reel, three-row jungle-temple slot with five fixed lines (the three rows and the two diagonals).
 * A line pays when its three cells are the same symbol, from the first reel to the third; the pay is in stakes (the whole bet),
 * line by line, and a spin can win on several lines.
 *
 * The JAGUAR WILD stands in for any symbol and carries a multiplier (x2, x3 or x5): a line that has wilds pays its symbol's
 * pay times the wilds' multipliers added together. In the base game the wilds only land on the third reel; three wilds on a
 * line (free games only) pay WILD_LINE_PAY.
 *
 * SUN STONES: one on every reel (anywhere in the window) pays SCATTER_PAY and starts FREE_GAMES free games, which play on their
 * own, richer reels (wilds on every reel). The Jaguar Spirit starts at x1 and grows by one after every free game that wins; it
 * multiplies that game's win (so the free games' maths is exact too: the spins are independent, and a win does not depend on the
 * spirit). The BUY BONUS starts the same feature for BUY_PRICE stakes.
 *
 * STATS is exact: line wins are counted over every stop combination of the base reels and of the free-game reels.
 */
export const SYMBOLS = ["VASE", "DAGGER", "COIN", "RING", "HEAD", "CHEST", "WILD2", "WILD3", "WILD5", "SUN"] as const;
export type JaguarSymbol = (typeof SYMBOLS)[number];
const VA = 0, DA = 1, CO = 2, RI = 3, HE = 4, CH = 5, W2 = 6, W3 = 7, W5 = 8, SC = 9;

/** The multiplier each wild carries. */
export const WILD_VALUE: Record<number, number> = { [W2]: 2, [W3]: 3, [W5]: 5 };
const isWild = (s: number) => s === W2 || s === W3 || s === W5;

/** Reel strips, top to bottom and wrapping round. */
export const STRIPS: number[][] = [
  [VA, DA, CH, VA, VA, HE, HE, SC, DA, DA, VA, VA, RI, RI, DA, VA, VA, DA, CO, CO, RI, SC, RI, CO, CO, DA, VA, VA, HE, VA, VA, DA, DA, CO, DA, SC, DA, VA, VA, DA, DA, VA, CO],
  [SC, CH, VA, VA, CO, RI, RI, DA, DA, RI, RI, VA, DA, VA, SC, VA, DA, DA, VA, HE, HE, DA, CO, CO, VA, VA, CO, HE, SC, VA, VA, DA, DA, VA, DA, DA, VA, DA, DA, CO, CO, VA, VA],
  [DA, DA, VA, DA, VA, VA, DA, SC, DA, VA, VA, HE, CO, CO, VA, DA, DA, CO, CO, VA, VA, SC, CO, RI, DA, DA, VA, HE, HE, CH, W3, VA, CO, RI, VA, SC, VA, RI, DA, DA, W2, DA, RI],
];
/** The free games' reels: no sun stones, and wilds on every reel. */
export const FREE_STRIPS: number[][] = [
  [VA, VA, HE, VA, VA, CO, RI, CO, CO, DA, VA, VA, RI, RI, CH, DA, DA, VA, VA, CO, CO, VA, VA, DA, DA, VA, DA, DA, VA, HE, HE, W2, VA, VA, DA, VA, VA, CO, RI, RI, DA, DA, RI, RI],
  [VA, VA, W3, DA, DA, VA, DA, DA, VA, HE, HE, VA, VA, W2, CO, RI, CO, VA, VA, CO, CO, DA, VA, VA, RI, RI, DA, DA, CO, VA, VA, CO, HE, HE, DA, DA, HE, HE, DA, CH, CH, VA, RI, RI],
  [VA, W3, RI, HE, HE, DA, CO, CO, DA, DA, CO, HE, HE, VA, CO, RI, VA, VA, DA, VA, VA, CO, RI, W2, CO, CO, VA, RI, HE, DA, VA, CO, CO, DA, DA, CH, RI, RI, DA, DA, RI, CH, CH, W5],
];

/** Three of a kind on a line, in stakes (without wilds' multipliers). */
export const PAYS: Record<number, number> = { [VA]: 1, [DA]: 1, [CO]: 2, [RI]: 4, [HE]: 8, [CH]: 25 };
/** Three wilds on one line (only possible in the free games), in stakes. */
export const WILD_LINE_PAY = 20;
/** A sun stone on every reel, in stakes, on top of the free games. */
export const SCATTER_PAY = 9.8;
export const FREE_GAMES = 10;
/** The Jaguar Spirit's multiplier grows by one after every winning free game, up to this (it can reach it on the last free game). */
export const SPIRIT_MAX = 10;
/** What the BUY BONUS costs, in stakes. */
export const BUY_PRICE = 49;

/** Rows (0 top, 1 middle, 2 bottom) read on each reel, per line. */
export const LINES: number[][] = [
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

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

/** What one line pays (in stakes), the symbol it pays for (-1: none, -2: three wilds) and the multiplier its wilds add up to. */
export function linePay(cells: number[]): { pays: number; symbol: number; mult: number } {
  if (cells.includes(SC)) return { pays: 0, symbol: -1, mult: 1 };
  const base = cells.find((c) => !isWild(c));
  if (base === undefined) return { pays: WILD_LINE_PAY, symbol: -2, mult: 1 };
  if (!cells.every((c) => isWild(c) || c === base)) return { pays: 0, symbol: -1, mult: 1 };
  const mult = cells.reduce((sum, c) => sum + (WILD_VALUE[c] ?? 0), 0) || 1;
  return { pays: PAYS[base] * mult, symbol: base, mult };
}

export type LineWin = { line: number; symbol: JaguarSymbol | "WILD"; mult: number; pays: number };

/** Line wins (in stakes) of one window, and how many reels show a sun stone. */
export function evaluateWindow(win: number[][]) {
  const lines: LineWin[] = [];
  let total = 0;
  LINES.forEach((rows, line) => {
    const r = linePay(rows.map((row, reel) => win[reel][row]));
    if (r.pays > 0) {
      lines.push({ line, symbol: r.symbol === -2 ? "WILD" : SYMBOLS[r.symbol], mult: r.mult, pays: r.pays });
      total += r.pays;
    }
  });
  const sunReels = win.filter((reel) => reel.includes(SC)).length;
  return { lines, total, sunReels };
}

/** Exact statistics over every stop combination of a set of reels. */
function enumerate(strips: number[][]) {
  const [a, b, c] = strips;
  let sum = 0;
  let wins = 0;
  let sunTriples = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      for (let k = 0; k < c.length; k++) {
        const r = evaluateWindow(windowFor(strips, [i, j, k]));
        sum += r.total;
        if (r.total > 0) wins++;
        if (r.sunReels === 3) sunTriples++;
      }
  const n = a.length * b.length * c.length;
  return { mean: sum / n, hitRate: wins / n, sunChance: sunTriples / n };
}

let statsCache: {
  rtp: number;
  baseRtp: number;
  hitRate: number;
  featureChance: number;
  freeMean: number;
  freeHitRate: number;
  featureAverage: number;
  buyRtp: number;
} | null = null;

export function getStats() {
  if (statsCache) return statsCache;
  const base = enumerate(STRIPS);
  const free = enumerate(FREE_STRIPS);
  // Free game i is multiplied by 1 + (the free games that won before it); the games are independent, so its expected win is
  // free.mean x (1 + (i - 1) x hit rate). The spirit never passes SPIRIT_MAX because FREE_GAMES <= SPIRIT_MAX.
  let spiritSum = 0;
  for (let i = 1; i <= FREE_GAMES; i++) spiritSum += Math.min(SPIRIT_MAX, 1 + (i - 1) * free.hitRate);
  const featureAverage = free.mean * spiritSum;
  const baseRtp = base.mean + base.sunChance * SCATTER_PAY;
  statsCache = {
    rtp: baseRtp + base.sunChance * featureAverage,
    baseRtp,
    hitRate: base.hitRate,
    featureChance: base.sunChance,
    freeMean: free.mean,
    freeHitRate: free.hitRate,
    featureAverage,
    buyRtp: (SCATTER_PAY + featureAverage) / BUY_PRICE,
  };
  return statsCache;
}

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:jaguartemple:<nonce>:<block>"), read as 32-bit numbers. */
export function jaguarRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:jaguartemple:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export type FreeGame = {
  stops: number[];
  lines: LineWin[];
  /** The lines' win in stakes, before the Jaguar Spirit. */
  lineWin: number;
  /** The Jaguar Spirit's multiplier on this free game. */
  spirit: number;
  /** What this free game pays: lineWin x spirit. */
  win: number;
};

export type JaguarOutcome = {
  stops: number[];
  lines: LineWin[];
  /** The base game's line wins, in stakes. */
  lineWin: number;
  /** True when a sun stone shows on every reel (or the bonus was bought): the free games run. */
  feature: boolean;
  /** The pay for the sun stones, in stakes (0 without the feature). */
  scatterWin: number;
  bought: boolean;
  freeGames: FreeGame[];
  /** What the whole spin pays, in stakes. */
  totalWin: number;
};

/** One spin (or a bought bonus: the reels show a sun stone on each and no line is paid). */
export function playSpin(rng: Rng, bought = false): JaguarOutcome {
  let stops: number[];
  let lines: LineWin[] = [];
  let lineWin = 0;
  let feature: boolean;
  if (bought) {
    // A sun stone in the middle row of every reel.
    stops = STRIPS.map((s) => {
      const suns = s.map((x, i) => (x === SC ? i : -1)).filter((i) => i >= 0);
      return suns[Math.floor(rng() * suns.length)];
    });
    feature = true;
  } else {
    stops = STRIPS.map((s) => Math.floor(rng() * s.length));
    const r = evaluateWindow(windowFor(STRIPS, stops));
    lines = r.lines;
    lineWin = r.total;
    feature = r.sunReels === 3;
  }
  const freeGames: FreeGame[] = [];
  if (feature) {
    let spirit = 1;
    for (let g = 0; g < FREE_GAMES; g++) {
      const fStops = FREE_STRIPS.map((s) => Math.floor(rng() * s.length));
      const r = evaluateWindow(windowFor(FREE_STRIPS, fStops));
      freeGames.push({ stops: fStops, lines: r.lines, lineWin: r.total, spirit, win: r.total * spirit });
      if (r.total > 0) spirit = Math.min(SPIRIT_MAX, spirit + 1);
    }
  }
  const scatterWin = feature ? SCATTER_PAY : 0;
  const totalWin = Number((lineWin + scatterWin + freeGames.reduce((s, f) => s + f.win, 0)).toFixed(4));
  return { stops, lines, lineWin, feature, scatterWin, bought, freeGames, totalWin };
}

export function replayJaguarSpin(serverSeed: string, clientSeed: string, nonce: number, bought = false) {
  return playSpin(jaguarRng(serverSeed, clientSeed, nonce), bought);
}

type SpinRow = Prisma.JaguarTempleSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

const names = (strips: number[][]) => strips.map((s) => s.map((i) => SYMBOLS[i]));

export function getJaguarTempleConfig() {
  const stats = getStats();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    strips: names(STRIPS),
    freeStrips: names(FREE_STRIPS),
    lines: LINES,
    pays: Object.fromEntries(Object.entries(PAYS).map(([i, p]) => [SYMBOLS[Number(i)], p])),
    wildValues: Object.fromEntries(Object.entries(WILD_VALUE).map(([i, v]) => [SYMBOLS[Number(i)], v])),
    wildLinePay: WILD_LINE_PAY,
    scatterPay: SCATTER_PAY,
    freeGames: FREE_GAMES,
    spiritMax: SPIRIT_MAX,
    buyPrice: BUY_PRICE,
    hitRatePercent: round2(stats.hitRate * 100),
    featureChanceOneIn: Math.round(1 / stats.featureChance),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
    buyRtpPercent: Math.floor(stats.buyRtp * 10000) / 100,
  };
}

/** Spins once (free games included), or buys the bonus: debits the cost, plays from the player's provably-fair seeds and pays, in one transaction. */
export async function spinJaguarTemple(userId: string, stake: number, buy = false) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  // The bonus costs BUY_PRICE stakes, to the paisa.
  const cost = buy ? round2(stake * BUY_PRICE) : stake;

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayJaguarSpin(serverSeed, clientSeed, nonce, buy);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: cost } }, data: { balance: { decrement: cost } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + cost;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: cost };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: cost, status: "COMPLETED" } });
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.jaguarTempleSpin.create({
      data: {
        userId,
        stake,
        cost,
        bought: buy,
        totalWin: outcome.totalWin,
        payout,
        freeGames: outcome.freeGames.length,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyJaguarTempleHistory(userId: string, limit = 30) {
  const rows = await prisma.jaguarTempleSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
