import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export type ChickenRoadDifficultyKey = "EASY" | "MEDIUM" | "HARD" | "HARDCORE";

/**
 * One private round per play (no shared betting window like Aviator/
 * Win Go) — the player crosses lanes one at a time, each survived lane
 * raising the multiplier, until they cash out or the chicken gets hit.
 * Harder difficulties have fewer total lanes, a higher per-lane bust
 * chance, and a steeper multiplier curve as a result.
 */
const DIFFICULTY_CONFIG: Record<ChickenRoadDifficultyKey, { steps: number; surviveProb: number }> = {
  EASY: { steps: 20, surviveProb: 0.9 },
  MEDIUM: { steps: 17, surviveProb: 0.8 },
  HARD: { steps: 13, surviveProb: 0.65 },
  HARDCORE: { steps: 9, surviveProb: 0.45 },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fair-value multiplier at a given lane count, discounted by the same
 * `rtp` used elsewhere (dice/coinflip) so the expected return is
 * identical whichever lane a player cashes out on: stake * multiplier(n)
 * * surviveProb^n === stake * rtp for every n. Lane 0 (no lanes crossed
 * yet) is always exactly 1x — nothing risked, nothing gained.
 */
function multiplierAt(config: { surviveProb: number }, step: number): number {
  if (step <= 0) return 1;
  return round2(env.games.rtp / Math.pow(config.surviveProb, step));
}

export function getChickenRoadConfig() {
  const difficulties = Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => ({
    difficulty: key as ChickenRoadDifficultyKey,
    steps: config.steps,
    // Full ladder so the mobile UI can show every lane's payout before the
    // player even starts, without duplicating the multiplier formula.
    multipliers: Array.from({ length: config.steps + 1 }, (_, step) => multiplierAt(config, step)),
  }));
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    difficulties,
  };
}

type ChickenRoadRoundRow = Awaited<ReturnType<typeof prisma.chickenRoadRound.findUniqueOrThrow>>;

/** Strips the round's serverSeed before it leaves the server. It is the
 * player's live fairness seed — shared by every round until they rotate it
 * — so exposing it would let them compute where every lane busts ahead of
 * time. It's only ever revealed via rotateServerSeed. */
function toPublicRound(round: ChickenRoadRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(round2(stake * multiplier), env.games.maxPayout);
}

/** Per-lane provably-fair roll: the round's own serverSeed/clientSeed/nonce
 * (fixed at round start, so it's independently verifiable later the same
 * way as every other game here) combined with the lane index — nonce*1000
 * keeps every round's lanes in their own slice of the nonce space, well
 * clear of any other round's (steps never exceeds 20). */
function stepRoll(serverSeed: string, clientSeed: string, nonce: number, step: number): number {
  return fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + step);
}

export async function startChickenRoadRound(userId: string, stake: number, difficulty: ChickenRoadDifficultyKey) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  const config = DIFFICULTY_CONFIG[difficulty];
  if (!config) throw new ApiError(400, "Invalid difficulty.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.chickenRoadRound.findFirst({ where: { userId, status: "PENDING" } });
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
    return tx.chickenRoadRound.create({
      data: { userId, difficulty, stake, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.chickenRoadRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
  return round;
}

const ROUND_CHANGED = "This round was updated by another request. Please refresh and try again.";

/** Updates the round only if it is still exactly as it was read (PENDING,
 * same lane), so parallel requests can't both act on it — without this,
 * two simultaneous cash-outs each paid out in full. */
async function claimRound(
  tx: Prisma.TransactionClient,
  round: ChickenRoadRoundRow,
  data: Prisma.ChickenRoadRoundUpdateManyMutationInput
) {
  const claimed = await tx.chickenRoadRound.updateMany({
    where: { id: round.id, status: "PENDING", currentStep: round.currentStep },
    data,
  });
  if (claimed.count === 0) throw new ApiError(409, ROUND_CHANGED);
  return tx.chickenRoadRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function advanceChickenRoadStep(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const config = DIFFICULTY_CONFIG[round.difficulty as ChickenRoadDifficultyKey];

    const roll = stepRoll(round.serverSeed, round.clientSeed, round.nonce, round.currentStep);
    const busted = roll >= config.surviveProb;

    if (busted) {
      const updated = await claimRound(tx, round, {
        status: "LOST",
        multiplier: 0,
        payout: 0,
        settledAt: new Date(),
      });
      return { round: toPublicRound(updated), busted: true };
    }

    const nextStep = round.currentStep + 1;
    const multiplier = multiplierAt(config, nextStep);

    // Final lane survived, or the payout has hit the max-payout cap — there's
    // nothing left to gain by risking another lane, so it auto-settles as a
    // win instead of letting the player keep risking the stake for nothing.
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (nextStep >= config.steps || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, {
        currentStep: nextStep,
        multiplier,
        payout,
        status: "WON",
        settledAt: new Date(),
      });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), busted: false };
    }

    const updated = await claimRound(tx, round, { currentStep: nextStep, multiplier });
    return { round: toPublicRound(updated), busted: false };
  });
}

export async function cashOutChickenRoadRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.currentStep <= 0) {
      throw new ApiError(400, "Cross at least one lane before cashing out.");
    }

    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentChickenRoadRound(userId: string) {
  const round = await prisma.chickenRoadRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyChickenRoadHistory(userId: string, limit = 30) {
  const rounds = await prisma.chickenRoadRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
