import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export const TILE_COUNT = 25;
export const MIN_MINES = 1;
export const MAX_MINES = 24;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fair-value multiplier after `safeRevealed` safe tiles, discounted by the
 * same `rtp` as the other games. The chance of surviving k picks with m
 * mines on 25 tiles is prod((25-m-i)/(25-i)) for i < k, so stake *
 * multiplier * that chance === stake * rtp whenever the player cashes out.
 */
export function multiplierFor(mineCount: number, safeRevealed: number): number {
  if (safeRevealed <= 0) return 1;
  let survive = 1;
  for (let i = 0; i < safeRevealed; i++) {
    survive *= (TILE_COUNT - mineCount - i) / (TILE_COUNT - i);
  }
  // A safe pick never pays back less than the stake: each one is worth at
  // least 1% more than the last (1.01x, 1.02x, ...). This only lifts the
  // first pick or two with 1-2 mines, where the fair value dips under 1x;
  // those few cash-out points return a bit more than rtp.
  return Math.max(round2(env.games.rtp / survive), round2(1 + 0.01 * safeRevealed));
}

/**
 * Picks the mine tiles with a partial Fisher-Yates shuffle driven by the
 * round's provably-fair seeds, so anyone holding the (later revealed)
 * server seed can recompute the exact board. nonce*1000 + i keeps each
 * round's draws in their own slice of the nonce space, same as Chicken Road.
 */
export function minePositionsFor(serverSeed: string, clientSeed: string, nonce: number, mineCount: number): number[] {
  const tiles = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (let i = 0; i < mineCount; i++) {
    const j = i + Math.floor(fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + i) * (TILE_COUNT - i));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles.slice(0, mineCount).sort((a, b) => a - b);
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(round2(stake * multiplier), env.games.maxPayout);
}

type MinesRoundRow = Prisma.MinesRoundGetPayload<Record<string, never>>;

/** What the app is allowed to see. The serverSeed is the player's live
 * fairness seed (shared by all their rounds until they rotate it) and is
 * never sent; the mine positions are only included once the round is over. */
function toPublicRound(round: MinesRoundRow) {
  const { serverSeed: _seed, minePositions, ...rest } = round;
  return round.status === "PENDING" ? rest : { ...rest, minePositions };
}

export function getMinesConfig() {
  const multipliers: Record<number, number[]> = {};
  for (let m = MIN_MINES; m <= MAX_MINES; m++) {
    multipliers[m] = Array.from({ length: TILE_COUNT - m + 1 }, (_, k) => multiplierFor(m, k));
  }
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    tiles: TILE_COUNT,
    minMines: MIN_MINES,
    maxMines: MAX_MINES,
    // multipliers[mineCount][safeTilesRevealed]
    multipliers,
  };
}

const ROUND_CHANGED = "This round was updated by another request. Please refresh and try again.";

export async function startMinesRound(userId: string, stake: number, mineCount: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!Number.isInteger(mineCount) || mineCount < MIN_MINES || mineCount > MAX_MINES) {
    throw new ApiError(400, `Mines must be a whole number between ${MIN_MINES} and ${MAX_MINES}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const minePositions = minePositionsFor(serverSeed, clientSeed, nonce, mineCount);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.minesRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current round before starting a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so two simultaneous starts can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const newProgress = Number(wallet.wageringProgress) + stake;
      await tx.wallet.update({
        where: { userId },
        data:
          newProgress >= Number(wallet.wageringRequired)
            ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 }
            : { wageringProgress: { increment: stake } },
      });
    }

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    return tx.minesRound.create({
      data: { userId, stake, mineCount, minePositions, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.minesRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** Pays out and closes a round inside `tx`. The update only matches while
 * the round is still exactly as it was read, so a double-tap or two
 * parallel requests can never pay the same round twice. */
async function settleWin(tx: Prisma.TransactionClient, round: MinesRoundRow, revealed: number[], multiplier: number) {
  const payout = cappedPayout(Number(round.stake), multiplier);
  const claimed = await tx.minesRound.updateMany({
    where: { id: round.id, status: "PENDING", revealed: { equals: round.revealed } },
    data: { revealed, multiplier, payout, status: "WON", settledAt: new Date() },
  });
  if (claimed.count === 0) throw new ApiError(409, ROUND_CHANGED);
  await tx.wallet.update({ where: { userId: round.userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({
    data: { userId: round.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
  });
  return tx.minesRound.findUniqueOrThrow({ where: { id: round.id } });
}

export async function revealMinesTile(userId: string, roundId: string, tile: number) {
  if (!Number.isInteger(tile) || tile < 0 || tile >= TILE_COUNT) {
    throw new ApiError(400, `Tile must be between 0 and ${TILE_COUNT - 1}.`);
  }

  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.revealed.includes(tile)) throw new ApiError(400, "That tile is already revealed.");
    const revealed = [...round.revealed, tile];

    if (round.minePositions.includes(tile)) {
      const lost = await tx.minesRound.updateMany({
        where: { id: round.id, status: "PENDING", revealed: { equals: round.revealed } },
        data: { revealed, multiplier: 0, payout: 0, status: "LOST", settledAt: new Date() },
      });
      if (lost.count === 0) throw new ApiError(409, ROUND_CHANGED);
      const updated = await tx.minesRound.findUniqueOrThrow({ where: { id: round.id } });
      return { round: toPublicRound(updated), hitMine: true };
    }

    const multiplier = multiplierFor(round.mineCount, revealed.length);
    const clearedBoard = revealed.length >= TILE_COUNT - round.mineCount;
    // Once the payout hits the cap there's nothing more to win, so it
    // cashes out automatically instead of letting the player keep risking
    // the stake for nothing.
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (clearedBoard || reachedCap) {
      const settled = await settleWin(tx, round, revealed, multiplier);
      return { round: toPublicRound(settled), hitMine: false };
    }

    const advanced = await tx.minesRound.updateMany({
      where: { id: round.id, status: "PENDING", revealed: { equals: round.revealed } },
      data: { revealed, multiplier },
    });
    if (advanced.count === 0) throw new ApiError(409, ROUND_CHANGED);
    const updated = await tx.minesRound.findUniqueOrThrow({ where: { id: round.id } });
    return { round: toPublicRound(updated), hitMine: false };
  });
}

export async function cashOutMinesRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.revealed.length === 0) {
      throw new ApiError(400, "Reveal at least one tile before cashing out.");
    }
    const settled = await settleWin(tx, round, round.revealed, Number(round.multiplier));
    return toPublicRound(settled);
  });
}

export async function getMyCurrentMinesRound(userId: string) {
  const round = await prisma.minesRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyMinesHistory(userId: string, limit = 30) {
  const rounds = await prisma.minesRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
