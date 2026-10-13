import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Penalty Hero: a private cash-out game of up to five penalties.
 *
 * The goal is split into 6 zones (two rows of three; zone = row * 3 + col,
 * top row first). Before each kick the keeper's covered zones are drawn from
 * the round's seeds: a uniformly random set of `cover` zones, so every zone is
 * equally likely to be covered and the player's pick never changes the odds.
 * A kick into a covered zone is saved and the stake is lost; otherwise it's a
 * goal and the multiplier rises. The player can cash out after any goal; the
 * fifth goal settles automatically.
 */

export type PenaltyDifficulty = "EASY" | "MEDIUM" | "HARD" | "EXPERT";

export const ZONES = 6;
export const KICKS = 5;
/** 12% house edge: the expected return of every cash-out point is 88%. */
export const RTP = 0.88;

/** How many of the 6 zones the keeper covers on each kick. */
export const COVER: Record<PenaltyDifficulty, number> = { EASY: 1, MEDIUM: 2, HARD: 3, EXPERT: 4 };

export type Shot = { zone: number; covered: number[]; dive: number; saved: boolean };

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Multiplier after `goals` goals: RTP / P(score)^goals, rounded down to the cent. */
export function multiplierAt(difficulty: PenaltyDifficulty, goals: number): number {
  if (goals <= 0) return 1;
  const p = (ZONES - COVER[difficulty]) / ZONES;
  return floor2(RTP / Math.pow(p, goals));
}

/**
 * The zones the keeper covers on kick `kick` (0-based): a seeded Fisher-Yates
 * shuffle of the 6 zones, keeping the first `cover`. `dive` is where the
 * keeper is shown diving: the kicked zone when it's covered (a save), or
 * else the first covered zone.
 */
export function keeperFor(serverSeed: string, clientSeed: string, nonce: number, kick: number, cover: number): number[] {
  const zones = [0, 1, 2, 3, 4, 5];
  for (let i = ZONES - 1; i > 0; i--) {
    const r = fairGameFloat(serverSeed, clientSeed, "penalty", nonce * 1000 + kick * 10 + i);
    const j = Math.floor(r * (i + 1));
    [zones[i], zones[j]] = [zones[j], zones[i]];
  }
  return zones.slice(0, cover).sort((a, b) => a - b);
}

export function getPenaltyConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: RTP * 100,
    zones: ZONES,
    kicks: KICKS,
    difficulties: (Object.keys(COVER) as PenaltyDifficulty[]).map((difficulty) => ({
      difficulty,
      cover: COVER[difficulty],
      multipliers: Array.from({ length: KICKS + 1 }, (_, g) => multiplierAt(difficulty, g)),
    })),
  };
}

type PenaltyRoundRow = Awaited<ReturnType<typeof prisma.penaltyRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed, so it never leaves the server here. */
function toPublicRound(round: PenaltyRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

export async function startPenaltyRound(userId: string, stake: number, difficulty: PenaltyDifficulty) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!COVER[difficulty]) throw new ApiError(400, "Invalid difficulty.");

  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.penaltyRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current shoot-out before starting a new one.");

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
    return tx.penaltyRound.create({ data: { userId, difficulty, stake, serverSeed, serverSeedHash, clientSeed, nonce } });
  });
  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.penaltyRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This shoot-out has already ended.");
  return round;
}

/** Updates the round only if it is still exactly as read (PENDING, same goal
 * count), so parallel kicks or cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: PenaltyRoundRow, data: Prisma.PenaltyRoundUpdateManyMutationInput) {
  const claimed = await tx.penaltyRound.updateMany({ where: { id: round.id, status: "PENDING", goals: round.goals }, data });
  if (claimed.count === 0) throw new ApiError(409, "This round was updated by another request. Please refresh and try again.");
  return tx.penaltyRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function kickPenalty(userId: string, roundId: string, zone: number) {
  if (!Number.isInteger(zone) || zone < 0 || zone >= ZONES) throw new ApiError(400, "Pick a zone of the goal.");
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const difficulty = round.difficulty as PenaltyDifficulty;
    const covered = keeperFor(round.serverSeed, round.clientSeed, round.nonce, round.goals, COVER[difficulty]);
    const saved = covered.includes(zone);
    const shot: Shot = { zone, covered, dive: saved ? zone : covered[0], saved };
    const shots = [...((round.shots as Shot[] | null) ?? []), shot];

    if (saved) {
      const updated = await claimRound(tx, round, { status: "LOST", multiplier: 0, payout: 0, shots, settledAt: new Date() });
      return { round: toPublicRound(updated), shot };
    }

    const goals = round.goals + 1;
    const multiplier = multiplierAt(difficulty, goals);
    // The last penalty, or the payout cap reached: nothing more to gain, so it settles as a win.
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (goals >= KICKS || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, { goals, multiplier, payout, shots, status: "WON", settledAt: new Date() });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), shot };
    }

    const updated = await claimRound(tx, round, { goals, multiplier, shots });
    return { round: toPublicRound(updated), shot };
  });
}

export async function cashOutPenalty(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.goals <= 0) throw new ApiError(400, "Score at least one penalty before cashing out.");
    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentPenaltyRound(userId: string) {
  const round = await prisma.penaltyRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyPenaltyHistory(userId: string, limit = 30) {
  const rounds = await prisma.penaltyRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
