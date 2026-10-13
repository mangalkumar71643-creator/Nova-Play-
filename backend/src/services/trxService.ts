import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { PAYOUTS, colorsOf, headlineFor, isValidKey, payoutMultiplier, periodNumberFor, sizeOf } from "./winGoService";
import { firstBlockAtOrAfter, lastDigitOf } from "./tronBlocks";

/**
 * Trx Win Go: Win Go's bets and odds on 1/3/5/10 minute tracks, with each
 * round's number taken from the TRON blockchain instead of a server seed:
 * the last decimal digit of the hash of the first block produced at or after
 * the round's end. Betting closes before that block exists, and the block is
 * public, so neither side can know or choose the number in advance and
 * anyone can check it on a TRON explorer.
 */
export const TRX_DURATIONS = [60, 180, 300, 600] as const;
export type TrxDuration = (typeof TRX_DURATIONS)[number];

/** No new bets in the last few seconds of a round. */
export const LOCK_SECONDS = 5;

/** If the result block still can't be read this long after the draw, the
 * round is voided and every stake refunded. */
const VOID_AFTER_MS = 60 * 60 * 1000;

/** At most this many draws are looked up on the chain per request, so a
 * backlog can't stall a request; the rest are picked up by later ones. */
const LOOKUPS_PER_REQUEST = 4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function describe(n: number) {
  return { number: n, size: sizeOf(n), colors: colorsOf(n) };
}

function assertValidDuration(d: number): asserts d is TrxDuration {
  if (!TRX_DURATIONS.includes(d as TrxDuration)) {
    throw new ApiError(400, `Invalid duration. Choose one of: ${TRX_DURATIONS.join(", ")}`);
  }
}

type RoundRow = Prisma.TrxRoundGetPayload<Record<string, never>>;

async function getOrCreateRound(durationSeconds: number, now: Date): Promise<RoundRow> {
  const ms = durationSeconds * 1000;
  const startTime = new Date(Math.floor(now.getTime() / ms) * ms);
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const key = { durationSeconds_periodNumber: { durationSeconds, periodNumber } };
  const existing = await prisma.trxRound.findUnique({ where: key });
  if (existing) return existing;
  try {
    return await prisma.trxRound.create({ data: { durationSeconds, periodNumber, startTime, endTime: new Date(startTime.getTime() + ms) } });
  } catch {
    // Deterministic period per slot: a concurrent request created it first.
    return prisma.trxRound.findUniqueOrThrow({ where: key });
  }
}

/**
 * Fills in an ended round's block and number, or voids it once the block has
 * been unreadable for VOID_AFTER_MS. Both are guarded claims on an unresolved
 * round, so exactly one outcome sticks however many requests race here.
 * Returns false when the block isn't available yet.
 */
async function resolveRound(round: RoundRow, now: Date, budget: { lookups: number }): Promise<boolean> {
  if (round.result !== null || round.voided) return true;
  const drawAt = round.endTime.getTime();
  // Rounds sharing an end time (e.g. 1 and 3 minute at a 3 minute mark)
  // share the block; reuse one already read.
  const twin = await prisma.trxRound.findFirst({ where: { endTime: round.endTime, result: { not: null } } });
  let block = twin && twin.blockHash && twin.blockNumber !== null && twin.blockTime
    ? { number: twin.blockNumber, hash: twin.blockHash, timestamp: twin.blockTime.getTime() }
    : null;
  if (!block) {
    if (budget.lookups <= 0) return false;
    budget.lookups -= 1;
    try {
      block = await firstBlockAtOrAfter(drawAt);
    } catch (err) {
      console.error("[trx] block lookup failed", round.periodNumber, err);
    }
  }
  const digit = block ? lastDigitOf(block.hash) : null;
  if (block && digit !== null) {
    await prisma.trxRound.updateMany({
      where: { id: round.id, result: null, voided: false },
      data: { result: digit, blockNumber: block.number, blockHash: block.hash, blockTime: new Date(block.timestamp) },
    });
    return true;
  }
  if (now.getTime() - drawAt < VOID_AFTER_MS) return false;
  await prisma.trxRound.updateMany({ where: { id: round.id, result: null, voided: false }, data: { voided: true } });
  return true;
}

/** Pays (or refunds) every pending bet on a resolved round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST/VOID update, so concurrent
 * settlers can never pay the same bet twice. */
async function settleRound(roundId: string) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "TrxRound" WHERE id = ${roundId} FOR UPDATE`;
  const round = await prisma.trxRound.findUniqueOrThrow({ where: { id: roundId } });
  if (round.result === null && !round.voided) return;
  const pending = await prisma.trxBet.findMany({ where: { roundId: round.id, status: "PENDING" } });
  for (const bet of pending) {
    await prisma.$transaction(async (tx) => {
      if (round.voided) {
        const claimed = await tx.trxBet.updateMany({ where: { id: bet.id, status: "PENDING" }, data: { status: "VOID" } });
        if (claimed.count === 0) return;
        await tx.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: Number(bet.amount) } } });
        await tx.transaction.create({ data: { userId: bet.userId, type: "BET_REFUND", amount: Number(bet.amount), status: "COMPLETED" } });
        return;
      }
      const rate = payoutMultiplier(bet.area, round.result!);
      const won = rate > 0;
      const payout = won ? Math.min(floor2(Number(bet.amount) * rate), env.games.maxPayout) : 0;
      const claimed = await tx.trxBet.updateMany({
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
  await prisma.trxRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** No always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date, durationSeconds?: number) {
  const due = await prisma.trxRound.findMany({
    where: { settled: false, endTime: { lte: now }, ...(durationSeconds ? { durationSeconds } : {}) },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  const budget = { lookups: LOOKUPS_PER_REQUEST };
  for (const round of due) {
    if (await resolveRound(round, now, budget)) await settleRound(round.id);
  }
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
    locked: round.endTime.getTime() - now.getTime() <= LOCK_SECONDS * 1000,
  };
}

export function getTrxConfig() {
  return {
    durations: TRX_DURATIONS,
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    lockSeconds: LOCK_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    payouts: PAYOUTS,
    voidAfterMinutes: VOID_AFTER_MS / 60000,
  };
}

/** Places one or more bets on the current round in one transaction; each
 * key's total on the round stays within maxStake and its win within
 * maxPayout. */
export async function placeTrxBets(userId: string, durationSeconds: number, bets: { area: string; amount: number }[]) {
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
    await tx.$queryRaw`SELECT id FROM "TrxRound" WHERE id = ${round.id} FOR SHARE`;
    if (round.endTime.getTime() - Date.now() <= LOCK_SECONDS * 1000) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.trxBet.findMany({ where: { roundId: round.id, userId, status: "PENDING" }, select: { area: true, amount: true } });
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
    for (const b of bets) rows.push(await tx.trxBet.create({ data: { roundId: round.id, userId, area: b.area, amount: b.amount } }));
    return rows;
  });
  return { periodNumber: round.periodNumber, bets: created };
}

function blockOf(r: { blockNumber: number | null; blockHash: string | null; blockTime: Date | null }) {
  return r.blockNumber !== null && r.blockHash && r.blockTime ? { blockNumber: r.blockNumber, blockHash: r.blockHash, blockTime: r.blockTime } : null;
}

export async function getTrxHistory(durationSeconds: number, limit = 100) {
  assertValidDuration(durationSeconds);
  await settleDueRounds(new Date(), durationSeconds);
  const rounds = await prisma.trxRound.findMany({
    where: { durationSeconds, settled: true, voided: false },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, endTime: true, result: true, blockNumber: true, blockHash: true, blockTime: true },
  });
  return rounds.map((r) => ({ periodNumber: r.periodNumber, drawAt: r.endTime, ...describe(r.result!), ...blockOf(r)! }));
}

export async function getMyTrxBets(userId: string, limit = 50) {
  await settleDueRounds(new Date());
  const bets = await prisma.trxBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, durationSeconds: true, result: true, settled: true, voided: true, blockNumber: true, blockHash: true, blockTime: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    durationSeconds: round.durationSeconds,
    result: round.settled && round.result !== null ? { ...describe(round.result), ...blockOf(round)! } : null,
  }));
}
