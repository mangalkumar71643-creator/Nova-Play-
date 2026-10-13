import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "7 Up Down": two dice per shared round, bets on the total. Rounds sit on
 * fixed wall-clock slots (like Win Go) so every player sees the same
 * timer: betting, then the cup shakes, then the dice are revealed.
 */
export const ROUND_SECONDS = 20;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 13;
/** The dice are revealed this far into the round (the gap is the shake). */
export const RESULT_AT_SECONDS = 15;

export const AREAS = ["DOWN", "SEVEN", "UP", "N2", "N3", "N4", "N5", "N6", "N8", "N9", "N10", "N11", "N12"] as const;
export type Area = (typeof AREAS)[number];

/** Number of the 36 equally likely dice pairs that make each total. */
function waysFor(total: number): number {
  return 6 - Math.abs(total - 7);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function winningWays(area: Area): number {
  if (area === "DOWN") return 15; // totals 2-6
  if (area === "UP") return 15; // totals 8-12
  if (area === "SEVEN") return waysFor(7);
  return waysFor(Number(area.slice(1)));
}

/** Total return per unit staked (stake included), so that
 * multiplier * P(win) = sevenUpDownRtp on every box (this game carries
 * its own edge, separate from the other games). Rounded down so the edge
 * is never smaller than advertised. */
export function multiplierFor(area: Area): number {
  return floor2((env.games.sevenUpDownRtp * 36) / winningWays(area));
}

export function areaWins(area: Area, total: number): boolean {
  if (area === "DOWN") return total >= 2 && total <= 6;
  if (area === "UP") return total >= 8 && total <= 12;
  if (area === "SEVEN") return total === 7;
  return total === Number(area.slice(1));
}

/** Each die comes from its own HMAC draw on the round's server seed, so the
 * result is fixed the moment the round is created (commit-reveal: only the
 * seed hash is public until the dice are shown). */
export function diceFor(serverSeed: string, periodNumber: string): [number, number] {
  const d1 = Math.floor(fairRandomFloat(serverSeed, periodNumber, 0) * 6) + 1;
  const d2 = Math.floor(fairRandomFloat(serverSeed, periodNumber, 1) * 6) + 1;
  return [d1, d2];
}

/** IST has no DST, so a fixed offset is exact. Period = IST date + the
 * slot's 1-based index within that day (IST midnight falls on a slot
 * boundary since 19800 divides by ROUND_SECONDS). */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function periodNumberFor(startTime: Date): string {
  const ist = new Date(startTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const secondsSinceMidnight = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  return `${y}${m}${d}${String(Math.floor(secondsSinceMidnight / ROUND_SECONDS) + 1).padStart(5, "0")}`;
}

type Phase = "BETTING" | "ROLLING" | "RESULT";

type RoundRow = Prisma.SevenUpDownRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "ROLLING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.sevenUpDownRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const [dice1, dice2] = diceFor(serverSeed, periodNumber);
  try {
    return await prisma.sevenUpDownRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        dice1,
        dice2,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.sevenUpDownRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a round whose dice are revealed.
 * Each bet is claimed with a guarded PENDING -> WON/LOST update, so two
 * requests settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "SevenUpDownRound" WHERE id = ${round.id} FOR UPDATE`;
  const total = round.dice1 + round.dice2;
  const pending = await prisma.sevenUpDownBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const won = areaWins(bet.area as Area, total);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.sevenUpDownBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", payout },
      });
      if (claimed.count === 0) return;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: Prisma.WalletUpdateInput = {};
      if (won) data.balance = { increment: payout };
      // Wagering counts once the bet is actually decided (not when placed),
      // so placing and cancelling bets can't clear a bonus requirement.
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
      if (won) {
        await tx.transaction.create({
          data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
        });
      }
    });
  }

  await prisma.sevenUpDownRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose dice are already out — there is no always-on
 * worker on this serverless backend, so reads catch settlement up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.sevenUpDownRound.findMany({
    where: { settled: false, resultTime: { lte: now } },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  for (const round of due) await settleRound(round);
}

function toView(round: RoundRow, now: Date) {
  const phase = phaseFor(round, now);
  const revealed = phase === "RESULT";
  return {
    periodNumber: round.periodNumber,
    startTime: round.startTime,
    betEndTime: round.betEndTime,
    resultTime: round.resultTime,
    endTime: round.endTime,
    serverTime: now,
    phase,
    serverSeedHash: round.serverSeedHash,
    // The dice (and the seed that produced them) stay hidden until reveal.
    dice: revealed ? [round.dice1, round.dice2] : null,
    total: revealed ? round.dice1 + round.dice2 : null,
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getSevenUpDownConfig() {
  const multipliers = Object.fromEntries(AREAS.map((a) => [a, multiplierFor(a)]));
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    roundSeconds: ROUND_SECONDS,
    betSeconds: BET_SECONDS,
    resultAtSeconds: RESULT_AT_SECONDS,
    multipliers,
  };
}

export type BetInput = { area: Area; amount: number };

/** Places one or more chips on the current round in a single transaction.
 * Limits are per area: the total staked on one area must stay within
 * maxStake, and its potential win within maxPayout. */
export async function placeSevenUpDownBets(userId: string, bets: BetInput[]) {
  if (bets.length === 0) throw new ApiError(400, "No bets given.");
  for (const b of bets) {
    if (!AREAS.includes(b.area)) throw new ApiError(400, "Unknown bet area.");
    if (b.amount < env.games.minStake) throw new ApiError(400, `Minimum bet is ${env.games.minStake}.`);
  }

  await assertCanTransact(userId);

  const now = new Date();
  const round = await getOrCreateRound(now);
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }

  const total = round2(bets.reduce((sum, b) => sum + b.amount, 0));

  const created = await prisma.$transaction(async (tx) => {
    // Serialise this player's bet changes so parallel taps can't slip past
    // the per-box limits between the read below and the insert.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "SevenUpDownRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.sevenUpDownBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING" },
      select: { area: true, amount: true },
    });
    const perArea = new Map<string, number>();
    for (const b of mine) perArea.set(b.area, (perArea.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perArea.set(b.area, round2((perArea.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const areaTotal = perArea.get(b.area)!;
      if (areaTotal > env.games.maxStake) {
        throw new ApiError(400, `Max bet per box is ${env.games.maxStake}.`);
      }
      if (areaTotal * multiplierFor(b.area) > env.games.maxPayout) {
        throw new ApiError(400, `Max win per box is ${env.games.maxPayout}.`);
      }
    }

    // Conditional debit so simultaneous requests can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: total } },
      data: { balance: { decrement: total } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: total, status: "COMPLETED" } });

    const rows = [];
    for (const b of bets) {
      rows.push(
        await tx.sevenUpDownBet.create({
          data: { roundId: round.id, userId, area: b.area, amount: b.amount, multiplier: multiplierFor(b.area) },
        })
      );
    }
    return rows;
  });

  return { periodNumber: round.periodNumber, bets: created };
}

/** Takes chips back off the current round while betting is still open
 * (undo = one bet id, clear = all of them). Refunds are guarded the same
 * way as settlement so a bet can't be both refunded and paid. */
export async function cancelSevenUpDownBets(userId: string, betIds?: string[]) {
  const now = new Date();
  const round = await getOrCreateRound(now);
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed — bets can no longer be removed.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "SevenUpDownRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.sevenUpDownBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.sevenUpDownBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: "VOID" },
      });
      if (claimed.count === 0) continue;
      refund = round2(refund + Number(bet.amount));
      cancelled.push(bet.id);
    }
    if (refund > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: refund } } });
      await tx.transaction.create({ data: { userId, type: "BET_REFUND", amount: refund, status: "COMPLETED" } });
    }
    return { cancelled, refund };
  });
}

/** The player's bets on one round (defaults to the current one). */
export async function getMyRoundBets(userId: string, periodNumber?: string) {
  const now = new Date();
  const round = periodNumber
    ? await prisma.sevenUpDownRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.sevenUpDownBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getSevenUpDownHistory(limit = 100) {
  const rounds = await prisma.sevenUpDownRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, dice1: true, dice2: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({ ...r, total: r.dice1 + r.dice2 }));
}

export async function getMySevenUpDownBets(userId: string, limit = 50) {
  return prisma.sevenUpDownBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, dice1: true, dice2: true, settled: true } } },
  });
}
