import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Coin Flip: the player calls heads or tails, one flip at a time, and can
 * cash out after any right call. A wrong call loses the bet. After n right
 * calls the multiplier is rtp x 2^n: the chance of n right calls is 2^-n and
 * the house edge is taken once, so cashing out after any number of flips
 * returns exactly the rtp (before rounding down and the payout cap). The
 * last flip, or reaching the max payout, cashes out automatically.
 */
export const MAX_FLIPS = 20;
export const SIDES = ["HEADS", "TAILS"] as const;
export type Side = (typeof SIDES)[number];
const ROUND_CHANGED = "This round changed in the meantime — please refresh.";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Rounds down after trimming float noise to 12 significant digits.
function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function floor4(n: number): number {
  return Math.floor(Number((n * 10000).toPrecision(12))) / 10000;
}

export function multiplierAt(wins: number): number {
  return wins <= 0 ? 0 : floor4(env.games.rtp * 2 ** wins);
}

function cashValue(stake: number, wins: number): number {
  return Math.min(floor2(stake * env.games.rtp * 2 ** wins), env.games.maxPayout);
}

/** Flip i lands floor(HMAC(serverSeed, "<clientSeed>:flip:<nonce>:<i>") x 2): 0 heads, 1 tails. */
export function sideAt(serverSeed: string, clientSeed: string, nonce: number, i: number): Side {
  return SIDES[Math.floor(fairGameFloat(serverSeed, clientSeed, `flip:${nonce}`, i) * 2)];
}

type RoundRow = Prisma.CoinFlipRoundGetPayload<Record<string, never>>;

/** Every flip made is public; the server seed stays hidden until it is rotated. */
function toPublicRound(row: RoundRow) {
  const { serverSeed: _hidden, version: _version, ...rest } = row;
  const live = row.status === "ACTIVE";
  return {
    ...rest,
    maxFlips: MAX_FLIPS,
    currentMultiplier: multiplierAt(row.wins),
    nextMultiplier: live && row.wins < MAX_FLIPS ? multiplierAt(row.wins + 1) : 0,
    cashOut: live && row.wins > 0 ? cashValue(Number(row.stake), row.wins) : 0,
  };
}

export function getCoinFlipConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    maxFlips: MAX_FLIPS,
    // multipliers[wins - 1]
    multipliers: Array.from({ length: MAX_FLIPS }, (_, i) => multiplierAt(i + 1)),
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** Starts a round: takes the bet; the flips come from the player's seeds. */
export async function startCoinFlip(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two starts can't both pass the one-round-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.coinFlipRound.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current round before starting a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel requests can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: stake } }, data: { balance: { decrement: stake } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + stake;
      await tx.wallet.update({
        where: { userId },
        data: progress >= Number(wallet.wageringRequired) ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 } : { wageringProgress: { increment: stake } },
      });
    }
    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    return tx.coinFlipRound.create({
      data: { userId, stake, status: "ACTIVE", wins: 0, picks: [], results: [], multiplier: 0, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicRound(row);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.coinFlipRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "ACTIVE") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** Moves a round on from the version it was read at; only one request can win. */
async function commit(tx: Prisma.TransactionClient, round: RoundRow, data: Prisma.CoinFlipRoundUpdateManyMutationInput) {
  const moved = await tx.coinFlipRound.updateMany({ where: { id: round.id, status: "ACTIVE", version: round.version }, data: { ...data, version: { increment: 1 } } });
  if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
  const payout = Number(data.payout ?? 0);
  if (payout > 0) {
    await tx.wallet.update({ where: { userId: round.userId }, data: { balance: { increment: payout } } });
    await tx.transaction.create({ data: { userId: round.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
  }
  return tx.coinFlipRound.findUniqueOrThrow({ where: { id: round.id } });
}

/** Calls a side and flips the coin. */
export async function flipCoin(userId: string, roundId: string, side: Side) {
  if (!SIDES.includes(side)) throw new ApiError(400, "Call HEADS or TAILS.");
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const landed = sideAt(round.serverSeed, round.clientSeed, round.nonce, round.results.length);
    const picks = [...round.picks, SIDES.indexOf(side)];
    const results = [...round.results, SIDES.indexOf(landed)];
    if (landed !== side) return commit(tx, round, { picks, results, status: "LOST", multiplier: 0, payout: 0 });
    const wins = round.wins + 1;
    const stake = Number(round.stake);
    // The last flip, or the max payout, cashes out automatically.
    if (wins >= MAX_FLIPS || cashValue(stake, wins) >= env.games.maxPayout) {
      return commit(tx, round, { picks, results, wins, status: "WON", multiplier: multiplierAt(wins), payout: cashValue(stake, wins) });
    }
    return commit(tx, round, { picks, results, wins });
  });
  return toPublicRound(row);
}

export async function cashOutCoinFlip(userId: string, roundId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.wins === 0) throw new ApiError(400, "Win at least one flip before cashing out.");
    return commit(tx, round, { status: "WON", multiplier: multiplierAt(round.wins), payout: cashValue(Number(round.stake), round.wins) });
  });
  return toPublicRound(row);
}

export async function getActiveCoinFlipRound(userId: string) {
  const row = await prisma.coinFlipRound.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicRound(row) : null;
}

export async function getMyCoinFlipHistory(userId: string, limit = 30) {
  const rows = await prisma.coinFlipRound.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicRound);
}
