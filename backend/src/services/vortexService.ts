import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export type VortexElement = "WATER" | "EARTH" | "FIRE";
export type VortexOutcome = VortexElement | "CRASH";

/**
 * The wheel: 20 equal segments — 8 Water, 5 Earth, 2 Fire, 5 vortex
 * (crash). A spin lands on floor(roll * 20).
 */
const W = "WATER" as const;
const E = "EARTH" as const;
const F = "FIRE" as const;
const C = "CRASH" as const;
export const WHEEL: VortexOutcome[] = [W, E, W, C, W, F, W, E, C, W, E, W, C, W, E, C, F, W, E, C];

/**
 * Each element multiplies the round by its factor every time it lands, and
 * has a ring of `sections`; filling the last section cashes out on its own.
 *
 * The factors satisfy  P(water)*1.2 + P(earth)*1.4 + P(fire)*1.7 = 1
 * (0.40*1.2 + 0.25*1.4 + 0.10*1.7 = 1), i.e. one more spin is worth exactly
 * what the round is worth now (the vortex pays 0). So whenever a player
 * cashes out, the expected return is the starting value, `rtp` x stake —
 * no cash-out strategy beats the house edge, and rounding down only lowers
 * it further.
 */
export const ELEMENTS: Record<VortexElement, { factor: number; sections: number }> = {
  WATER: { factor: 1.2, sections: 10 },
  EARTH: { factor: 1.4, sections: 8 },
  FIRE: { factor: 1.7, sections: 5 },
};

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

type Fill = { water: number; earth: number; fire: number };

export function vortexMultiplier(fill: Fill): number {
  return floor2(
    env.games.rtp *
      ELEMENTS.WATER.factor ** fill.water *
      ELEMENTS.EARTH.factor ** fill.earth *
      ELEMENTS.FIRE.factor ** fill.fire
  );
}

export function getVortexConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(env.games.rtp * 100),
    wheel: WHEEL,
    elements: (Object.keys(ELEMENTS) as VortexElement[]).map((element) => {
      const { factor, sections } = ELEMENTS[element];
      return {
        element,
        factor,
        sections,
        chancePercent: (WHEEL.filter((s) => s === element).length / WHEEL.length) * 100,
        // What this ring alone multiplies the round by at each fill level.
        ladder: Array.from({ length: sections + 1 }, (_, k) => floor2(factor ** k)),
      };
    }),
    crashChancePercent: (WHEEL.filter((s) => s === "CRASH").length / WHEEL.length) * 100,
  };
}

type VortexRoundRow = Awaited<ReturnType<typeof prisma.vortexRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed (revealed only when
 * they rotate it), so it never leaves the server with a round. */
function toPublicRound(round: VortexRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

/** Spin i of a round: nonce*1000 keeps each round's spins in their own
 * slice of the nonce space (a round can't last more than 21 spins). */
export function spinSegment(serverSeed: string, clientSeed: string, nonce: number, spin: number): number {
  return Math.floor(fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + spin) * WHEEL.length);
}

const ROUND_CHANGED = "This round was updated by another request. Please refresh and try again.";

/** Updates the round only if it is still exactly as read (PENDING, same
 * spin count), so parallel spins / cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: VortexRoundRow, data: Prisma.VortexRoundUpdateManyMutationInput) {
  const claimed = await tx.vortexRound.updateMany({
    where: { id: round.id, status: "PENDING", spins: round.spins },
    data,
  });
  if (claimed.count === 0) throw new ApiError(409, ROUND_CHANGED);
  return tx.vortexRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

/** Lands the next spin of a PENDING round and settles it when it ends. */
async function spinRound(tx: Prisma.TransactionClient, round: VortexRoundRow) {
  const segment = spinSegment(round.serverSeed, round.clientSeed, round.nonce, round.spins);
  const outcome = WHEEL[segment];
  const segments = [...round.segments, segment];
  const spins = round.spins + 1;

  if (outcome === "CRASH") {
    const updated = await claimRound(tx, round, {
      spins,
      segments,
      multiplier: 0,
      payout: 0,
      status: "LOST",
      endReason: "CRASH",
      settledAt: new Date(),
    });
    return { round: toPublicRound(updated), segment, outcome };
  }

  const fill: Fill = { water: round.water, earth: round.earth, fire: round.fire };
  const key = outcome.toLowerCase() as keyof Fill;
  fill[key] += 1;
  const multiplier = vortexMultiplier(fill);
  const stake = Number(round.stake);

  // A full ring cashes out on its own; so does reaching the payout cap —
  // there is nothing left to win by risking the stake again.
  const fullRing = fill[key] >= ELEMENTS[outcome].sections;
  const capped = stake * multiplier >= env.games.maxPayout;
  if (fullRing || capped) {
    const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);
    const updated = await claimRound(tx, round, {
      ...fill,
      spins,
      segments,
      multiplier,
      payout,
      status: "WON",
      endReason: fullRing ? `FULL_${outcome}` : "MAX_PAYOUT",
      settledAt: new Date(),
    });
    await creditPayout(tx, round.userId, payout);
    return { round: toPublicRound(updated), segment, outcome };
  }

  const updated = await claimRound(tx, round, { ...fill, spins, segments, multiplier });
  return { round: toPublicRound(updated), segment, outcome };
}

/** Takes the stake and lands the round's first spin in one go. */
export async function startVortexRound(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.vortexRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current round before starting a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
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
    const round = await tx.vortexRound.create({
      data: { userId, stake, serverSeed, serverSeedHash, clientSeed, nonce, segments: [] },
    });
    return spinRound(tx, round);
  });
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.vortexRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
  return round;
}

export async function spinVortexRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => spinRound(tx, await loadActiveRound(tx, userId, roundId)));
}

export async function cashOutVortexRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.spins <= 0) throw new ApiError(400, "Spin at least once before cashing out.");
    const payout = Math.min(floor2(Number(round.stake) * Number(round.multiplier)), env.games.maxPayout);
    const updated = await claimRound(tx, round, { payout, status: "WON", endReason: "CASHOUT", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentVortexRound(userId: string) {
  const round = await prisma.vortexRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyVortexHistory(userId: string, limit = 30) {
  const rounds = await prisma.vortexRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
