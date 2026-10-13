import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "5D Lottery": five digits A-E (each 0-9) every round, on the same fixed
 * wall-clock tracks as Win Go / K3 (one independent chain per duration).
 * Bets on one position (exact digit, big 5-9 / small 0-4, odd / even) or
 * on the sum of all five (big 23-45 / small 0-22, odd / even). Every bet
 * pays floor2(rtp / P(win)).
 */
export const FIVED_DURATIONS = [60, 180, 300, 600] as const;
export type FiveDDuration = (typeof FIVED_DURATIONS)[number];

/** No new bets in the last few seconds of a round (same as Win Go). */
export const LOCK_SECONDS = 5;

export const POSITIONS = ["A", "B", "C", "D", "E"] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * Bet keys:
 *   A:0 .. E:9                          exact digit at a position
 *   A:BIG / A:SMALL / A:ODD / A:EVEN    that position's digit (big = 5-9)
 *   SUM:BIG / SUM:SMALL / SUM:ODD / SUM:EVEN   the sum of all five (big = 23-45)
 */
export function winsWith(key: string, digits: number[]): boolean {
  const [pos, what] = key.split(":");
  const value = pos === "SUM" ? digits.reduce((s, d) => s + d, 0) : digits[POSITIONS.indexOf(pos as (typeof POSITIONS)[number])];
  const bigFrom = pos === "SUM" ? 23 : 5;
  switch (what) {
    case "BIG":
      return value >= bigFrom;
    case "SMALL":
      return value < bigFrom;
    case "ODD":
      return value % 2 === 1;
    case "EVEN":
      return value % 2 === 0;
    default:
      return value === Number(what);
  }
}

const KEYS: string[] = [
  ...POSITIONS.flatMap((p) => [...["BIG", "SMALL", "ODD", "EVEN"].map((w) => `${p}:${w}`), ...Array.from({ length: 10 }, (_, d) => `${p}:${d}`)]),
  "SUM:BIG",
  "SUM:SMALL",
  "SUM:ODD",
  "SUM:EVEN",
];

/** Chance of winning, per key: a single digit is uniform, and the sum of
 * five uniform digits is symmetric about 22.5 with a uniform parity, so
 * every big/small/odd/even bet is exactly 1 in 2. */
function winChance(key: string): number {
  const what = key.split(":")[1];
  return ["BIG", "SMALL", "ODD", "EVEN"].includes(what) ? 0.5 : 0.1;
}

export function isValidKey(key: string): boolean {
  return KEYS.includes(key);
}

/** Total return per unit staked (stake included): multiplier * P(win) =
 * the shared rtp, rounded down so the edge is never smaller than stated. */
export function multiplierFor(key: string): number {
  return floor2(env.games.rtp / winChance(key));
}

/** The five digits, fixed when the round is created from its server seed
 * (commit-reveal: only the seed hash is public until the round ends). */
export function digitsFor(serverSeed: string, periodNumber: string): number[] {
  return POSITIONS.map((_, i) => Math.floor(fairRandomFloat(serverSeed, periodNumber, i) * 10));
}

function describe(digits: number[]) {
  const sum = digits.reduce((s, d) => s + d, 0);
  return { digits, sum, sumSize: sum >= 23 ? "BIG" : "SMALL", sumParity: sum % 2 ? "ODD" : "EVEN" };
}

function assertValidDuration(durationSeconds: number): asserts durationSeconds is FiveDDuration {
  if (!FIVED_DURATIONS.includes(durationSeconds as FiveDDuration)) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${FIVED_DURATIONS.join(", ")}`);
  }
}

/** Same period numbering as Win Go: IST date (YYMMDD) + that duration's
 * 1-based round index for the day. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function periodNumberFor(durationSeconds: number, startTime: Date): string {
  const ist = new Date(startTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const secondsSinceMidnight = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  return `${y}${m}${d}${String(Math.floor(secondsSinceMidnight / durationSeconds) + 1).padStart(6, "0")}`;
}

type RoundRow = Prisma.FiveDRoundGetPayload<Record<string, never>>;

async function getOrCreateRound(durationSeconds: number, now: Date): Promise<RoundRow> {
  const ms = durationSeconds * 1000;
  const startTime = new Date(Math.floor(now.getTime() / ms) * ms);
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const key = { durationSeconds_periodNumber: { durationSeconds, periodNumber } };
  const existing = await prisma.fiveDRound.findUnique({ where: key });
  if (existing) return existing;
  const serverSeed = generateServerSeed();
  try {
    return await prisma.fiveDRound.create({
      data: {
        durationSeconds,
        periodNumber,
        startTime,
        endTime: new Date(startTime.getTime() + ms),
        digits: digitsFor(serverSeed, periodNumber),
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // Deterministic period per slot: a unique-constraint failure means a
    // concurrent request created this round first.
    return prisma.fiveDRound.findUniqueOrThrow({ where: key });
  }
}

/** Pays every still-pending bet on an ended round. Each bet is claimed with
 * a guarded PENDING -> WON/LOST update, so two requests settling at once can
 * never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "FiveDRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.fiveDBet.findMany({ where: { roundId: round.id, status: "PENDING" } });
  for (const bet of pending) {
    const won = winsWith(bet.area, round.digits);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.fiveDBet.updateMany({ where: { id: bet.id, status: "PENDING" }, data: { status: won ? "WON" : "LOST", payout } });
      if (claimed.count === 0) return;
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: Prisma.WalletUpdateInput = {};
      if (won) data.balance = { increment: payout };
      // Wagering counts once the bet is decided, as in the other table games.
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
  await prisma.fiveDRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** No always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date, durationSeconds?: number) {
  const due = await prisma.fiveDRound.findMany({
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
  const msLeft = round.endTime.getTime() - now.getTime();
  return {
    periodNumber: round.periodNumber,
    durationSeconds,
    startTime: round.startTime,
    endTime: round.endTime,
    serverTime: now,
    serverSeedHash: round.serverSeedHash,
    // The digits (and the seed) stay hidden until the round has ended.
    locked: msLeft <= LOCK_SECONDS * 1000,
  };
}

export function getFiveDConfig() {
  return {
    durations: FIVED_DURATIONS,
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    lockSeconds: LOCK_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    multipliers: Object.fromEntries(KEYS.map((k) => [k, multiplierFor(k)])),
  };
}

export type FiveDBetInput = { area: string; amount: number };

/** Places one or more bets (e.g. every digit a player picked) on the
 * current round in one transaction. Each key's total on the round must stay
 * within maxStake, and its win within maxPayout. */
export async function placeFiveDBets(userId: string, durationSeconds: number, bets: FiveDBetInput[]) {
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
    // Serialise this player's bets so parallel taps can't slip past the
    // per-bet limits between the read below and the insert.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "FiveDRound" WHERE id = ${round.id} FOR SHARE`;
    if (round.endTime.getTime() - Date.now() <= LOCK_SECONDS * 1000) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.fiveDBet.findMany({ where: { roundId: round.id, userId, status: "PENDING" }, select: { area: true, amount: true } });
    const perKey = new Map<string, number>();
    for (const b of mine) perKey.set(b.area, (perKey.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perKey.set(b.area, round2((perKey.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const t = perKey.get(b.area)!;
      if (t > env.games.maxStake) throw new ApiError(400, `Max bet per selection is ${env.games.maxStake}.`);
      if (t * multiplierFor(b.area) > env.games.maxPayout) throw new ApiError(400, `Max win per selection is ${env.games.maxPayout}.`);
    }
    // Conditional debit so simultaneous requests can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: total } }, data: { balance: { decrement: total } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: total, status: "COMPLETED" } });
    const rows = [];
    for (const b of bets) {
      rows.push(await tx.fiveDBet.create({ data: { roundId: round.id, userId, area: b.area, amount: b.amount, multiplier: multiplierFor(b.area) } }));
    }
    return rows;
  });
  return { periodNumber: round.periodNumber, bets: created };
}

export async function getFiveDHistory(durationSeconds: number, limit = 50) {
  assertValidDuration(durationSeconds);
  await settleDueRounds(new Date(), durationSeconds);
  const rounds = await prisma.fiveDRound.findMany({
    where: { durationSeconds, settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, digits: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({ periodNumber: r.periodNumber, ...describe(r.digits), serverSeed: r.serverSeed, serverSeedHash: r.serverSeedHash }));
}

export async function getMyFiveDBets(userId: string, limit = 50) {
  await settleDueRounds(new Date());
  const bets = await prisma.fiveDBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, durationSeconds: true, digits: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    durationSeconds: round.durationSeconds,
    result: round.settled ? describe(round.digits) : null,
  }));
}
