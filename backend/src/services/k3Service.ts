import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "K3 Lottery": three dice every round, on the same fixed wall-clock tracks
 * as Win Go (one independent chain of rounds per duration). Bets are on the
 * sum, big/small, odd/even, pairs, triples and combinations of different
 * numbers; every bet pays floor2(rtp / P(win)).
 */
export const K3_DURATIONS = [60, 180, 300, 600] as const;
export type K3Duration = (typeof K3_DURATIONS)[number];

/** No new bets in the last few seconds of a round (same as Win Go). */
export const LOCK_SECONDS = 5;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * Bet keys:
 *   SUM:3..18, BIG (11-18), SMALL (3-10), ODD, EVEN   on the total
 *   PAIR:n          at least two dice show n
 *   PAIRSINGLE:n-m  exactly n, n, m (m != n)
 *   TRIPLE:n        n, n, n          ANYTRIPLE  any three the same
 *   DIFF3:a-b-c     exactly a, b, c, all different (a < b < c)
 *   DIFF2:a-b       both a and b show (a < b)
 *   STRAIGHT        three consecutive numbers (123, 234, 345, 456)
 */
export function winsWith(key: string, dice: number[]): boolean {
  const sum = dice[0] + dice[1] + dice[2];
  const count = (n: number) => dice.filter((d) => d === n).length;
  const sorted = [...dice].sort((a, b) => a - b);
  const distinct = new Set(dice).size;
  const [kind, arg] = key.split(":");
  switch (kind) {
    case "SUM":
      return sum === Number(arg);
    case "BIG":
      return sum >= 11;
    case "SMALL":
      return sum <= 10;
    case "ODD":
      return sum % 2 === 1;
    case "EVEN":
      return sum % 2 === 0;
    case "PAIR":
      return count(Number(arg)) >= 2;
    case "PAIRSINGLE": {
      const [n, m] = arg.split("-").map(Number);
      return count(n) === 2 && count(m) === 1;
    }
    case "TRIPLE":
      return count(Number(arg)) === 3;
    case "ANYTRIPLE":
      return distinct === 1;
    case "DIFF3":
      return distinct === 3 && sorted.join("-") === arg;
    case "DIFF2": {
      const [a, b] = arg.split("-").map(Number);
      return count(a) >= 1 && count(b) >= 1;
    }
    case "STRAIGHT":
      return distinct === 3 && sorted[2] - sorted[0] === 2;
    default:
      return false;
  }
}

function buildKeys(): string[] {
  const keys: string[] = [];
  for (let s = 3; s <= 18; s++) keys.push(`SUM:${s}`);
  keys.push("BIG", "SMALL", "ODD", "EVEN", "ANYTRIPLE", "STRAIGHT");
  for (let n = 1; n <= 6; n++) {
    keys.push(`PAIR:${n}`, `TRIPLE:${n}`);
    for (let m = 1; m <= 6; m++) if (m !== n) keys.push(`PAIRSINGLE:${n}-${m}`);
    for (let b = n + 1; b <= 6; b++) {
      keys.push(`DIFF2:${n}-${b}`);
      for (let c = b + 1; c <= 6; c++) keys.push(`DIFF3:${n}-${b}-${c}`);
    }
  }
  return keys;
}

/** Winning throws out of the 216 equally likely ones, per bet key. */
const WIN_COUNTS: Map<string, number> = (() => {
  const m = new Map<string, number>();
  const all: number[][] = [];
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) all.push([a, b, c]);
  for (const key of buildKeys()) m.set(key, all.filter((d) => winsWith(key, d)).length);
  return m;
})();

export function isValidKey(key: string): boolean {
  return WIN_COUNTS.has(key);
}

/** Total return per unit staked (stake included): multiplier * P(win) =
 * the shared rtp, rounded down so the edge is never smaller than stated. */
export function multiplierFor(key: string): number {
  return floor2((env.games.rtp * 216) / WIN_COUNTS.get(key)!);
}

/** The three dice, fixed when the round is created from its server seed
 * (commit-reveal: only the seed hash is public until the round ends). */
export function diceFor(serverSeed: string, periodNumber: string): number[] {
  return [0, 1, 2].map((i) => 1 + Math.floor(fairRandomFloat(serverSeed, periodNumber, i) * 6));
}

function describe(dice: number[]) {
  const sum = dice[0] + dice[1] + dice[2];
  return { dice, sum, size: sum >= 11 ? "BIG" : "SMALL", parity: sum % 2 ? "ODD" : "EVEN" };
}

function assertValidDuration(durationSeconds: number): asserts durationSeconds is K3Duration {
  if (!K3_DURATIONS.includes(durationSeconds as K3Duration)) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${K3_DURATIONS.join(", ")}`);
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

type RoundRow = Prisma.K3RoundGetPayload<Record<string, never>>;

async function getOrCreateRound(durationSeconds: number, now: Date): Promise<RoundRow> {
  const ms = durationSeconds * 1000;
  const startTime = new Date(Math.floor(now.getTime() / ms) * ms);
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const key = { durationSeconds_periodNumber: { durationSeconds, periodNumber } };
  const existing = await prisma.k3Round.findUnique({ where: key });
  if (existing) return existing;
  const serverSeed = generateServerSeed();
  try {
    return await prisma.k3Round.create({
      data: {
        durationSeconds,
        periodNumber,
        startTime,
        endTime: new Date(startTime.getTime() + ms),
        dice: diceFor(serverSeed, periodNumber),
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // Deterministic period per slot: a unique-constraint failure means a
    // concurrent request created this round first.
    return prisma.k3Round.findUniqueOrThrow({ where: key });
  }
}

/** Pays every still-pending bet on an ended round. Each bet is claimed with
 * a guarded PENDING -> WON/LOST update, so two requests settling at once can
 * never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "K3Round" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.k3Bet.findMany({ where: { roundId: round.id, status: "PENDING" } });
  for (const bet of pending) {
    const won = winsWith(bet.area, round.dice);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.k3Bet.updateMany({ where: { id: bet.id, status: "PENDING" }, data: { status: won ? "WON" : "LOST", payout } });
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
  await prisma.k3Round.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** No always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date, durationSeconds?: number) {
  const due = await prisma.k3Round.findMany({
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
    // The dice (and the seed) stay hidden until the round has ended.
    locked: msLeft <= LOCK_SECONDS * 1000,
  };
}

export function getK3Config() {
  return {
    durations: K3_DURATIONS,
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    lockSeconds: LOCK_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    multipliers: Object.fromEntries([...WIN_COUNTS.keys()].map((k) => [k, multiplierFor(k)])),
  };
}

export type K3BetInput = { area: string; amount: number };

/** Places one or more bets (e.g. every combination a player picked) on the
 * current round in one transaction. Each key's total on the round must stay
 * within maxStake, and its win within maxPayout. */
export async function placeK3Bets(userId: string, durationSeconds: number, bets: K3BetInput[]) {
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
    await tx.$queryRaw`SELECT id FROM "K3Round" WHERE id = ${round.id} FOR SHARE`;
    if (round.endTime.getTime() - Date.now() <= LOCK_SECONDS * 1000) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.k3Bet.findMany({ where: { roundId: round.id, userId, status: "PENDING" }, select: { area: true, amount: true } });
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
      rows.push(await tx.k3Bet.create({ data: { roundId: round.id, userId, area: b.area, amount: b.amount, multiplier: multiplierFor(b.area) } }));
    }
    return rows;
  });
  return { periodNumber: round.periodNumber, bets: created };
}

export async function getK3History(durationSeconds: number, limit = 50) {
  assertValidDuration(durationSeconds);
  await settleDueRounds(new Date(), durationSeconds);
  const rounds = await prisma.k3Round.findMany({
    where: { durationSeconds, settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, dice: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({ periodNumber: r.periodNumber, ...describe(r.dice), serverSeed: r.serverSeed, serverSeedHash: r.serverSeedHash }));
}

export async function getMyK3Bets(userId: string, limit = 50) {
  await settleDueRounds(new Date());
  const bets = await prisma.k3Bet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, durationSeconds: true, dice: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    durationSeconds: round.durationSeconds,
    result: round.settled ? describe(round.dice) : null,
  }));
}
