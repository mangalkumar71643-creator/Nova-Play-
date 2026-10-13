import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Treasure Dig: dig an island's sand mounds for treasure without finding a crab.
 *
 * The island has 16 mounds (a 4x4 grid) and `crabs` of them (3, 5 or 8) hide a
 * crab. The crab mounds are a uniformly random set drawn from the round's seeds
 * when the round starts, so every mound is equally likely to hide one. Each
 * treasure raises the multiplier; dig up a crab and the stake is lost. Cash out
 * after any treasure; digging the last treasure clears the island and settles.
 */

export const MOUNDS = 16;
export const CRAB_OPTIONS = [3, 5, 8] as const;
/** 12% house edge: the expected return of every cash-out point is 88%. */
export const RTP = 0.88;

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Chance of no crab in `digs` digs: C(16 - crabs, digs) / C(16, digs). */
export function surviveChance(crabs: number, digs: number): number {
  let p = 1;
  for (let i = 0; i < digs; i++) p *= (MOUNDS - crabs - i) / (MOUNDS - i);
  return p;
}

/** Multiplier after `treasures` treasures: RTP / P(no crab), rounded down to the cent. */
export function multiplierAt(crabs: number, treasures: number): number {
  if (treasures <= 0) return 1;
  return floor2(RTP / surviveChance(crabs, treasures));
}

/** The crab mounds of a round: a seeded Fisher-Yates shuffle of the 16 mounds, keeping the first `crabs`. */
export function crabMoundsFor(serverSeed: string, clientSeed: string, nonce: number, crabs: number): number[] {
  const mounds = Array.from({ length: MOUNDS }, (_, i) => i);
  for (let i = MOUNDS - 1; i > 0; i--) {
    const r = fairGameFloat(serverSeed, clientSeed, "treasure", nonce * 1000 + i);
    const j = Math.floor(r * (i + 1));
    [mounds[i], mounds[j]] = [mounds[j], mounds[i]];
  }
  return mounds.slice(0, crabs).sort((a, b) => a - b);
}

export function getTreasureConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: RTP * 100,
    mounds: MOUNDS,
    modes: CRAB_OPTIONS.map((crabs) => ({ crabs, multipliers: Array.from({ length: MOUNDS - crabs + 1 }, (_, k) => multiplierAt(crabs, k)) })),
  };
}

type TreasureRoundRow = Awaited<ReturnType<typeof prisma.treasureRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed, so it never leaves the
 * server here. The crab mounds are shown only once the round is over. */
function toPublicRound(round: TreasureRoundRow) {
  const { serverSeed, ...rest } = round;
  return round.status === "PENDING" ? rest : { ...rest, crabMounds: crabMoundsFor(serverSeed, round.clientSeed, round.nonce, round.crabs) };
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

export async function startTreasureRound(userId: string, stake: number, crabs: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!(CRAB_OPTIONS as readonly number[]).includes(crabs)) throw new ApiError(400, "Pick 3, 5 or 8 crabs.");

  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.treasureRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current dig before starting a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so two simultaneous starts can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

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
    return tx.treasureRound.create({ data: { userId, crabs, stake, serverSeed, serverSeedHash, clientSeed, nonce } });
  });
  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.treasureRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This dig has already ended.");
  return round;
}

/** Updates the round only if it is still exactly as read (PENDING, same number
 * of treasures), so parallel digs or cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: TreasureRoundRow, data: Prisma.TreasureRoundUpdateManyMutationInput) {
  const claimed = await tx.treasureRound.updateMany({ where: { id: round.id, status: "PENDING", treasures: round.treasures }, data });
  if (claimed.count === 0) throw new ApiError(409, "This round was updated by another request. Please refresh and try again.");
  return tx.treasureRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function digMound(userId: string, roundId: string, mound: number) {
  if (!Number.isInteger(mound) || mound < 0 || mound >= MOUNDS) throw new ApiError(400, "Pick one of the mounds.");
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const digs = (round.digs as number[] | null) ?? [];
    if (digs.includes(mound)) throw new ApiError(400, "That mound is already dug.");
    const crabMounds = crabMoundsFor(round.serverSeed, round.clientSeed, round.nonce, round.crabs);
    const crab = crabMounds.includes(mound);
    const nextDigs = [...digs, mound];

    if (crab) {
      const updated = await claimRound(tx, round, { digs: nextDigs, status: "LOST", multiplier: 0, payout: 0, settledAt: new Date() });
      return { round: toPublicRound(updated), crab: true };
    }

    const treasures = round.treasures + 1;
    const multiplier = multiplierAt(round.crabs, treasures);
    // Every treasure dug (island cleared), or the payout cap reached: nothing more to gain, so it settles as a win.
    const cleared = treasures >= MOUNDS - round.crabs;
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (cleared || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, { digs: nextDigs, treasures, multiplier, payout, status: "WON", settledAt: new Date() });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), crab: false };
    }

    const updated = await claimRound(tx, round, { digs: nextDigs, treasures, multiplier });
    return { round: toPublicRound(updated), crab: false };
  });
}

export async function cashOutTreasure(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.treasures <= 0) throw new ApiError(400, "Dig up at least one treasure before cashing out.");
    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentTreasureRound(userId: string) {
  const round = await prisma.treasureRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyTreasureHistory(userId: string, limit = 30) {
  const rounds = await prisma.treasureRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
