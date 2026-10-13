import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * Win Go: one number 0-9 per round on fixed wall-clock tracks (one chain of
 * rounds per duration). Bets on the number, its colour and its size.
 */
export const WINGO_DURATIONS = [30, 60, 180, 300, 600] as const;
export type WinGoDuration = (typeof WINGO_DURATIONS)[number];

/** No new bets in the last few seconds of a round. */
export const LOCK_SECONDS = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * Fixed odds, each returning the shared rtp:
 *  - number (1 in 10): 10 x rtp
 *  - big 5-9 / small 0-4 (5 in 10): 2 x rtp
 *  - violet (0 and 5): 5 x rtp
 *  - green (1,3,7,9 + 5) / red (2,4,6,8 + 0): `color` on the four plain
 *    numbers and 0.5 less on the shared violet one, so 4c + (c - 0.5) = 10 x rtp.
 */
export const PAYOUTS = (() => {
  const rtp = env.games.rtp;
  const color = floor2((10 * rtp + 0.5) / 5);
  return { number: floor2(10 * rtp), size: floor2(2 * rtp), violet: floor2(5 * rtp), color, colorMixed: floor2(color - 0.5) };
})();

export function colorsOf(n: number): ("GREEN" | "RED" | "VIOLET")[] {
  if (n === 0) return ["RED", "VIOLET"];
  if (n === 5) return ["GREEN", "VIOLET"];
  return n % 2 === 0 ? ["RED"] : ["GREEN"];
}

export function sizeOf(n: number): "BIG" | "SMALL" {
  return n >= 5 ? "BIG" : "SMALL";
}

const KEYS = ["GREEN", "RED", "VIOLET", "BIG", "SMALL", ...Array.from({ length: 10 }, (_, i) => `NUM:${i}`)];

export function isValidKey(key: string): boolean {
  return KEYS.includes(key);
}

/** The headline rate shown for a bet (the most it can pay per unit). */
export function headlineFor(key: string): number {
  if (key.startsWith("NUM:")) return PAYOUTS.number;
  if (key === "BIG" || key === "SMALL") return PAYOUTS.size;
  if (key === "VIOLET") return PAYOUTS.violet;
  return PAYOUTS.color;
}

/** What a bet returns per unit once the number is known (0 = lost). */
export function payoutMultiplier(key: string, n: number): number {
  if (key.startsWith("NUM:")) return Number(key.slice(4)) === n ? PAYOUTS.number : 0;
  if (key === "BIG" || key === "SMALL") return sizeOf(n) === key ? PAYOUTS.size : 0;
  if (key === "VIOLET") return colorsOf(n).includes("VIOLET") ? PAYOUTS.violet : 0;
  if (!colorsOf(n).includes(key as "GREEN" | "RED")) return 0;
  return n === 0 || n === 5 ? PAYOUTS.colorMixed : PAYOUTS.color;
}

/** Fixed when the round is created from its server seed (commit-reveal:
 * only the hash is public until the round has ended). */
export function numberFor(serverSeed: string, periodNumber: string): number {
  return Math.floor(fairRandomFloat(serverSeed, periodNumber, 0) * 10);
}

function describe(n: number) {
  return { number: n, size: sizeOf(n), colors: colorsOf(n) };
}

function assertValidDuration(d: number): asserts d is WinGoDuration {
  if (!WINGO_DURATIONS.includes(d as WinGoDuration)) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${WINGO_DURATIONS.join(", ")}`);
  }
}

/** IST date (YYMMDD) + the duration's 1-based round index for the day. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function periodNumberFor(durationSeconds: number, startTime: Date): string {
  const ist = new Date(startTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const secondsSinceMidnight = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  return `${y}${m}${d}${String(Math.floor(secondsSinceMidnight / durationSeconds) + 1).padStart(6, "0")}`;
}

type RoundRow = Prisma.WinGoRoundGetPayload<Record<string, never>>;

async function getOrCreateRound(durationSeconds: number, now: Date): Promise<RoundRow> {
  const ms = durationSeconds * 1000;
  const startTime = new Date(Math.floor(now.getTime() / ms) * ms);
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const key = { durationSeconds_periodNumber: { durationSeconds, periodNumber } };
  const existing = await prisma.winGoRound.findUnique({ where: key });
  if (existing) return existing;
  const serverSeed = generateServerSeed();
  try {
    return await prisma.winGoRound.create({
      data: {
        durationSeconds,
        periodNumber,
        startTime,
        endTime: new Date(startTime.getTime() + ms),
        result: numberFor(serverSeed, periodNumber),
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // Deterministic period per slot: a concurrent request created it first.
    return prisma.winGoRound.findUniqueOrThrow({ where: key });
  }
}

/** Pays every pending bet on an ended round. Each bet is claimed with a
 * guarded PENDING -> WON/LOST update, so concurrent settlers can never pay
 * the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "WinGoRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.winGoBet.findMany({ where: { roundId: round.id, status: "PENDING" } });
  for (const bet of pending) {
    const rate = payoutMultiplier(bet.area, round.result);
    const won = rate > 0;
    const payout = won ? Math.min(floor2(Number(bet.amount) * rate), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.winGoBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", payout, paidMultiplier: rate },
      });
      if (claimed.count === 0) return;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: Prisma.WalletUpdateInput = {};
      if (won) data.balance = { increment: payout };
      if (Number(wallet.lockedBonus) > 0) {
        const progress = Number(wallet.wageringProgress) + Number(bet.amount);
        if (progress >= Number(wallet.wageringRequired)) {
          data.lockedBonus = 0;
          data.wageringRequired = 0;
          data.wageringProgress = 0;
        } else {
          data.wageringProgress = { increment: Number(bet.amount) };
        }
      }
      if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId: bet.userId }, data });
      if (won) await tx.transaction.create({ data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    });
  }
  await prisma.winGoRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** No always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date, durationSeconds?: number) {
  const due = await prisma.winGoRound.findMany({
    where: { settled: false, endTime: { lte: now }, ...(durationSeconds ? { durationSeconds } : {}) },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  for (const round of due) await settleRound(round);
}

export async function getCurrentRoundView(durationSeconds: number) {
  assertValidDuration(durationSeconds);
  const now = new Date();
  const round = await getOrCreateRound(durationSeconds, now);
  await settleDueRounds(now, durationSeconds);
  return {
    periodNumber: round.periodNumber,
    durationSeconds,
    startTime: round.startTime,
    endTime: round.endTime,
    serverTime: now,
    serverSeedHash: round.serverSeedHash,
    // The number (and its seed) stay hidden until the round has ended.
    locked: round.endTime.getTime() - now.getTime() <= LOCK_SECONDS * 1000,
  };
}

export function getWinGoConfig() {
  return {
    durations: WINGO_DURATIONS,
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    lockSeconds: LOCK_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    payouts: PAYOUTS,
  };
}

/** Places one or more bets on the current round in one transaction; each
 * key's total on the round stays within maxStake and its win within
 * maxPayout. */
export async function placeWinGoBets(userId: string, durationSeconds: number, bets: { area: string; amount: number }[]) {
  assertValidDuration(durationSeconds);
  if (bets.length === 0) throw new ApiError(400, "No bets given.");
  for (const b of bets) {
    if (!isValidKey(b.area)) throw new ApiError(400, "Unknown bet.");
    if (b.amount < env.games.minStake) throw new ApiError(400, `Minimum bet is ${env.games.minStake}.`);
  }
  await assertCanTransact(userId);

  const now = new Date();
  const round = await getOrCreateRound(durationSeconds, now);
  if (round.endTime.getTime() - now.getTime() <= LOCK_SECONDS * 1000) {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }
  const total = round2(bets.reduce((s, b) => s + b.amount, 0));

  const created = await prisma.$transaction(async (tx) => {
    // Serialise this player's bets so parallel taps can't slip past limits.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "WinGoRound" WHERE id = ${round.id} FOR SHARE`;
    if (round.endTime.getTime() - Date.now() <= LOCK_SECONDS * 1000) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.winGoBet.findMany({ where: { roundId: round.id, userId, status: "PENDING" }, select: { area: true, amount: true } });
    const perKey = new Map<string, number>();
    for (const b of mine) perKey.set(b.area, (perKey.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perKey.set(b.area, round2((perKey.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const t = perKey.get(b.area)!;
      if (t > env.games.maxStake) throw new ApiError(400, `Max bet per selection is ${env.games.maxStake}.`);
      if (t * headlineFor(b.area) > env.games.maxPayout) throw new ApiError(400, `Max win per selection is ${env.games.maxPayout}.`);
    }
    // Conditional debit: simultaneous requests can never overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: total } }, data: { balance: { decrement: total } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: total, status: "COMPLETED" } });
    const rows = [];
    for (const b of bets) rows.push(await tx.winGoBet.create({ data: { roundId: round.id, userId, area: b.area, amount: b.amount } }));
    return rows;
  });
  return { periodNumber: round.periodNumber, bets: created };
}

export async function getWinGoHistory(durationSeconds: number, limit = 100) {
  assertValidDuration(durationSeconds);
  await settleDueRounds(new Date(), durationSeconds);
  const rounds = await prisma.winGoRound.findMany({
    where: { durationSeconds, settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, result: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({ periodNumber: r.periodNumber, ...describe(r.result), serverSeed: r.serverSeed, serverSeedHash: r.serverSeedHash }));
}

export async function getMyWinGoBets(userId: string, limit = 50) {
  await settleDueRounds(new Date());
  const bets = await prisma.winGoBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, durationSeconds: true, result: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    durationSeconds: round.durationSeconds,
    result: round.settled ? describe(round.result) : null,
  }));
}
