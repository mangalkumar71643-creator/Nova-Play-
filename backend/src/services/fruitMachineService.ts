import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Fruit Machine: a British pub-style three-reel, three-row slot with five
 * fixed lines (the three rows and both diagonals). The stake is spread
 * evenly over the lines, so a line paying P returns P / 5 of the stake.
 *
 *   three 7s 500, three BARs 200, three bells 100, melons 50, grapes 40,
 *   plums 30, oranges 20, lemons 15, cherries 10, and two cherries from the
 *   left 4 (per line, in line bets).
 *
 * Two features from the pub machines, both decided by the spin's seed and
 * never by the player, so the RTP is exact and identical for everyone:
 *  - Auto Nudge: a spin that wins nothing may be awarded 1–3 nudges. Each
 *    nudge drops one reel by one position, and the machine spends them on
 *    the best result they can reach (it may still be nothing).
 *  - Cash Ladder: a STAR showing on all three reels starts the ladder at
 *    2x the stake; each rung is climbed or banked by a draw, up to 250x.
 *
 * STATS counts every stop combination (and every nudge for each one) to
 * give the exact RTP shown to players.
 */
export const SYMBOLS = ["CHERRY", "LEMON", "ORANGE", "PLUM", "GRAPES", "MELON", "BELL", "BAR", "SEVEN", "STAR"] as const;
export type FruitSymbol = (typeof SYMBOLS)[number];
const CH = 0, LE = 1, OR = 2, PL = 3, GR = 4, ME = 5, BE = 6, BA = 7, SE = 8, ST = 9;

/** Reel strips, top to bottom and wrapping round. */
export const STRIPS: number[][] = [
  [SE, CH, GR, ST, OR, LE, ME, LE, CH, PL, LE, PL, ME, BE, ME, OR, BE, BA, LE, PL, BA, GR, OR, CH, PL, CH, ST, GR, OR, LE, OR],
  [ME, LE, OR, BE, GR, ST, OR, BE, GR, LE, OR, PL, LE, PL, ME, CH, OR, SE, BA, PL, ST, BA, CH, PL, ME, LE, GR, OR, CH, LE],
  [LE, BA, ME, BE, ME, GR, ME, LE, OR, ST, LE, PL, LE, SE, GR, OR, CH, BE, CH, ST, PL, OR, CH, BA, LE, PL, OR, GR, OR, PL],
];

/** Three of a kind on a line, in line bets. */
export const THREE_PAYS: Partial<Record<FruitSymbol, number>> = {
  SEVEN: 500, BAR: 200, BELL: 100, MELON: 50, GRAPES: 40, PLUM: 30, ORANGE: 20, LEMON: 15, CHERRY: 10,
};
/** Two cherries from the left on a line, in line bets. */
export const TWO_CHERRIES = 4;
export const LINE_COUNT = 5;

/** Rows (0 top, 1 middle, 2 bottom) read on each reel, per line. */
export const LINES: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

/** Nudges awarded to a losing spin, with weights out of 100. */
export const NUDGE_TABLE = [
  { nudges: 0, weight: 82 },
  { nudges: 1, weight: 10 },
  { nudges: 2, weight: 5 },
  { nudges: 3, weight: 3 },
];

/** Cash Ladder rungs, in stakes, and the chance (out of 100) to climb from each rung to the next. */
export const LADDER = [2, 5, 10, 20, 50, 100, 250];
export const CLIMB_CHANCE = [55, 45, 40, 33, 25, 15];

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The three visible symbols of each reel (top, middle, bottom) for the given stops; the stop is the middle row. */
export function windowFor(stops: number[]): number[][] {
  return stops.map((stop, reel) => {
    const s = STRIPS[reel];
    return [-1, 0, 1].map((d) => s[(((stop + d) % s.length) + s.length) % s.length]);
  });
}

function linePays(a: number, b: number, c: number): number {
  if (a === b && b === c) return THREE_PAYS[SYMBOLS[a]] ?? 0;
  if (a === CH && b === CH) return TWO_CHERRIES;
  return 0;
}

export type LineWin = { line: number; symbol: FruitSymbol; count: number; pays: number };

/** Every winning line in a window, and whether it starts the Cash Ladder. */
export function evaluateWindow(win: number[][]): { lines: LineWin[]; lineTotal: number; ladder: boolean } {
  const lines: LineWin[] = [];
  let lineTotal = 0;
  LINES.forEach((rows, line) => {
    const [a, b, c] = rows.map((row, reel) => win[reel][row]);
    const pays = linePays(a, b, c);
    if (pays > 0) {
      lines.push({ line, symbol: SYMBOLS[a], count: a === b && b === c ? 3 : 2, pays });
      lineTotal += pays;
    }
  });
  const ladder = win.every((reel) => reel.includes(ST));
  return { lines, lineTotal: lineTotal / LINE_COUNT, ladder };
}

/** Expected Cash Ladder prize, in stakes. */
export const LADDER_EV = (() => {
  let ev = 0;
  let reach = 1;
  LADDER.forEach((prize, i) => {
    const climb = i < CLIMB_CHANCE.length ? CLIMB_CHANCE[i] / 100 : 0;
    ev += reach * (1 - climb) * prize;
    reach *= climb;
  });
  return ev;
})();

/**
 * The best nudge plan using at most `nudges` drops: [reel 1, reel 2, reel 3]
 * counts, chosen by line wins plus the ladder's expected value (a fixed
 * number, so the plan never depends on what the ladder later draws). Ties
 * go to the first plan found, so the choice is deterministic.
 */
export function bestNudgePlan(stops: number[], nudges: number): { plan: number[]; value: number } {
  let best = { plan: [0, 0, 0], value: 0 };
  for (let a = 0; a <= nudges; a++)
    for (let b = 0; a + b <= nudges; b++)
      for (let c = 0; a + b + c <= nudges; c++) {
        if (a + b + c === 0) continue;
        const ev = evaluateWindow(windowFor([stops[0] - a, stops[1] - b, stops[2] - c]));
        const value = ev.lineTotal + (ev.ladder ? LADDER_EV : 0);
        if (value > best.value) best = { plan: [a, b, c], value };
      }
  return best;
}

/** Exact statistics over every stop combination, nudges and ladder included. Computed once, on first use. */
let statsCache: { rtp: number; hitRate: number; ladderChance: number } | null = null;
export function getStats() {
  if (statsCache) return statsCache;
  const nudgeTotal = NUDGE_TABLE.reduce((s, x) => s + x.weight, 0);
  let sum = 0;
  let hits = 0;
  let ladders = 0;
  let n = 0;
  for (let i = 0; i < STRIPS[0].length; i++)
    for (let j = 0; j < STRIPS[1].length; j++)
      for (let k = 0; k < STRIPS[2].length; k++) {
        n++;
        const stops = [i, j, k];
        const ev = evaluateWindow(windowFor(stops));
        const value = ev.lineTotal + (ev.ladder ? LADDER_EV : 0);
        if (value > 0) {
          sum += value;
          hits++;
          if (ev.ladder) ladders++;
          continue;
        }
        for (const x of NUDGE_TABLE) {
          if (x.nudges === 0) continue;
          const q = x.weight / nudgeTotal;
          const best = bestNudgePlan(stops, x.nudges).value;
          sum += q * best;
          if (best > 0) hits += q;
        }
      }
  statsCache = { rtp: sum / n, hitRate: hits / n, ladderChance: ladders / n };
  return statsCache;
}

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:fruitmachine:<nonce>:<block>"), read as 32-bit numbers. */
export function fruitRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:fruitmachine:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export type FruitOutcome = {
  /** Where the reels first stop. */
  stops: number[];
  /** Nudges awarded (0 unless the first stop won nothing). */
  nudges: number;
  /** Drops spent on each reel, in the order they're shown. */
  nudgePlan: number[];
  /** Where the reels end up after any nudges. */
  finalStops: number[];
  lines: LineWin[];
  /** The ladder's top rung reached (index into LADDER), or -1 if it didn't start. */
  ladderRung: number;
  /** What the spin pays, in stakes. */
  totalWin: number;
};

export function playSpin(rng: Rng): FruitOutcome {
  const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
  let finalStops = stops;
  let nudges = 0;
  let nudgePlan = [0, 0, 0];
  let ev = evaluateWindow(windowFor(stops));
  if (ev.lineTotal === 0 && !ev.ladder) {
    let roll = rng() * NUDGE_TABLE.reduce((s, x) => s + x.weight, 0);
    let pick = 0;
    while (pick < NUDGE_TABLE.length - 1 && roll >= NUDGE_TABLE[pick].weight) roll -= NUDGE_TABLE[pick++].weight;
    nudges = NUDGE_TABLE[pick].nudges;
    if (nudges > 0) {
      const best = bestNudgePlan(stops, nudges);
      if (best.value > 0) {
        nudgePlan = best.plan;
        finalStops = stops.map((s, r) => (((s - best.plan[r]) % STRIPS[r].length) + STRIPS[r].length) % STRIPS[r].length);
        ev = evaluateWindow(windowFor(finalStops));
      }
    }
  }
  let ladderRung = -1;
  if (ev.ladder) {
    ladderRung = 0;
    while (ladderRung < CLIMB_CHANCE.length && rng() * 100 < CLIMB_CHANCE[ladderRung]) ladderRung++;
  }
  const totalWin = Number((ev.lineTotal + (ladderRung >= 0 ? LADDER[ladderRung] : 0)).toFixed(4));
  return { stops, nudges, nudgePlan, finalStops, lines: ev.lines, ladderRung, totalWin };
}

export function replayFruitSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(fruitRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.FruitMachineSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getFruitMachineConfig() {
  const stats = getStats();
  const nudgeTotal = NUDGE_TABLE.reduce((s, x) => s + x.weight, 0);
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    strips: STRIPS.map((s) => s.map((i) => SYMBOLS[i])),
    lines: LINES,
    threePays: THREE_PAYS,
    twoCherries: TWO_CHERRIES,
    lineCount: LINE_COUNT,
    nudgeChances: NUDGE_TABLE.map((x) => ({ nudges: x.nudges, chancePercent: round2((x.weight / nudgeTotal) * 100) })),
    ladder: LADDER,
    climbChancePercent: CLIMB_CHANCE,
    hitRatePercent: round2(stats.hitRate * 100),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
  };
}

/** Spins once: debits the stake, spins from the player's provably-fair seeds and pays, in one transaction. */
export async function spinFruitMachine(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayFruitSpin(serverSeed, clientSeed, nonce);
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

    return tx.fruitMachineSpin.create({
      data: {
        userId,
        stake,
        totalWin: outcome.totalWin,
        payout,
        nudges: outcome.nudges,
        ladderRung: outcome.ladderRung,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyFruitMachineHistory(userId: string, limit = 30) {
  const rows = await prisma.fruitMachineSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
