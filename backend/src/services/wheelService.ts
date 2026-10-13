import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Lucky Wheel: one spin of a 30-segment wheel. Each risk level has its own
 * segments; the pointer stops on segment floor(r * 30), with r drawn from the
 * player's provably-fair seeds, and the stake is paid at that segment's
 * multiplier. Every risk level's segments add up to 26.4, so the return is
 * exactly 26.4 / 30 = 88% (a 12% house edge), whichever level is played.
 */

export type WheelRisk = "LOW" | "MEDIUM" | "HIGH";
export const RISKS: WheelRisk[] = ["LOW", "MEDIUM", "HIGH"];
export const SEGMENTS_PER_WHEEL = 30;

/** The segments clockwise from the top, per risk level. */
export const WHEELS: Record<WheelRisk, number[]> = {
  LOW: [1.2, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.2, 0, 1.5, 0, 1.2, 1.2, 1.5, 0, 1.2, 0, 1.2, 1.5, 2.1, 0],
  MEDIUM: [6.9, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 0, 3, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 0, 3, 0, 0, 1.5, 0, 2, 0, 0],
  HIGH: [20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6.4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Exact return of a risk level: the average segment. */
export function wheelRtp(risk: WheelRisk): number {
  const w = WHEELS[risk];
  return w.reduce((s, m) => s + m, 0) / w.length;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** The segment a spin stops on. */
export function wheelSegment(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(fairGameFloat(serverSeed, clientSeed, "wheel", nonce) * SEGMENTS_PER_WHEEL);
}

type SpinRow = Prisma.WheelSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(spin: SpinRow) {
  const { serverSeed: _hidden, ...rest } = spin;
  return rest;
}

export function getWheelConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(wheelRtp("LOW") * 10000) / 100,
    segments: SEGMENTS_PER_WHEEL,
    wheels: RISKS.map((risk) => ({ risk, segments: WHEELS[risk], rtpPercent: Math.round(wheelRtp(risk) * 10000) / 100 })),
  };
}

/** Spins once: debits the stake, picks the segment from the player's seeds and pays it, all in one transaction. */
export async function spinWheel(userId: string, stake: number, risk: WheelRisk) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!WHEELS[risk]) throw new ApiError(400, "Pick LOW, MEDIUM or HIGH risk.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const segment = wheelSegment(serverSeed, clientSeed, nonce);
  const multiplier = WHEELS[risk][segment];
  // Rounded down, so rounding never pays more than the wheel says.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: stake } }, data: { balance: { decrement: stake } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + stake;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: stake };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.wheelSpin.create({ data: { userId, risk, stake, segment, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicSpin(spin);
}

export async function getMyWheelHistory(userId: string, limit = 30) {
  const spins = await prisma.wheelSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return spins.map(toPublicSpin);
}
