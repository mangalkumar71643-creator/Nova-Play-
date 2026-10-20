import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { INSTANT_HOUSE_CHANCE, isInstantHouse } from "./lotteryHouse";

/**
 * Lucky Wheel: one spin of a 30-segment wheel. Each risk level has its own
 * segments, and six of the 30, evenly spaced, are ⭐ House segments. One spin
 * in five is a ⭐ House spin (lotteryHouse.ts, drawn from the player's
 * provably-fair seeds): the pointer stops on one of the six ⭐ segments and the
 * spin loses. Any other spin stops on one of the other 24 segments and pays
 * its multiplier. The spin's own float r picks which: the floor(r x 6)th ⭐
 * segment, or the floor(r x 24)th of the others, clockwise from the top. So
 * every segment comes up 1 time in 30, just as it looks on the wheel.
 *
 * Every risk level's 24 other segments add up to 24: fair odds on a spin that
 * is not House (100%), and 24 / 30 = 80% (a 20% house edge) with the House
 * spins, whichever level is played.
 */

export type WheelRisk = "LOW" | "MEDIUM" | "HIGH";
export const RISKS: WheelRisk[] = ["LOW", "MEDIUM", "HIGH"];
export const SEGMENTS_PER_WHEEL = 30;
/** The ⭐ House segments, clockwise from the top: every fifth, the same on every risk level. */
export const HOUSE_SEGMENTS = [2, 7, 12, 17, 22, 27];

/** The segments clockwise from the top, per risk level. A ⭐ House segment pays 0 (it is listed here as 0). */
export const WHEELS: Record<WheelRisk, number[]> = {
  LOW: [1.2, 0, 0, 1.2, 1.2, 0, 1.4, 0, 1.2, 1.2, 1.2, 0, 0, 1.4, 1.2, 1.2, 1.2, 0, 1.4, 0, 1.2, 1.2, 0, 1.4, 1.2, 0, 1.2, 0, 1.6, 1.2],
  MEDIUM: [6, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 0, 3, 0, 0, 1.5, 0, 2, 0, 0, 1.5, 0, 3, 0, 0, 0, 2, 0, 0, 0, 0],
  HIGH: [20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** The segments that are not ⭐ House, clockwise from the top. */
export const OTHER_SEGMENTS = Array.from({ length: SEGMENTS_PER_WHEEL }, (_, i) => i).filter((i) => !HOUSE_SEGMENTS.includes(i));

/** Exact return of a risk level, House spins included: the average segment. */
export function wheelRtp(risk: WheelRisk): number {
  const w = WHEELS[risk];
  return w.reduce((s, m) => s + m, 0) / w.length;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Whether a spin is ⭐ House: drawn from the spin's seeds, apart from where it stops. */
export function wheelHouse(serverSeed: string, clientSeed: string, nonce: number): boolean {
  return isInstantHouse(serverSeed, clientSeed, "lucky-wheel", nonce);
}

/** The segment a spin stops on: a ⭐ segment on a House spin, else one of the others. */
export function wheelSegment(serverSeed: string, clientSeed: string, nonce: number, house: boolean): number {
  const r = fairGameFloat(serverSeed, clientSeed, "wheel", nonce);
  const pool = house ? HOUSE_SEGMENTS : OTHER_SEGMENTS;
  return pool[Math.floor(r * pool.length)];
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
    houseChancePercent: Math.round(INSTANT_HOUSE_CHANCE * 10000) / 100,
    segments: SEGMENTS_PER_WHEEL,
    wheels: RISKS.map((risk) => ({ risk, segments: WHEELS[risk], houseSegments: HOUSE_SEGMENTS, rtpPercent: Math.round(wheelRtp(risk) * 10000) / 100 })),
  };
}

/** Spins once: debits the stake, draws whether the spin is House and the segment from the player's seeds and pays it, all in one transaction. */
export async function spinWheel(userId: string, stake: number, risk: WheelRisk) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!WHEELS[risk]) throw new ApiError(400, "Pick LOW, MEDIUM or HIGH risk.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  // Fixed (and stored) with the spin, from the same seeds.
  const house = wheelHouse(serverSeed, clientSeed, nonce);
  const segment = wheelSegment(serverSeed, clientSeed, nonce, house);
  const multiplier = house ? 0 : WHEELS[risk][segment];
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

    return tx.wheelSpin.create({ data: { userId, risk, stake, segment, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicSpin(spin);
}

export async function getMyWheelHistory(userId: string, limit = 30) {
  const spins = await prisma.wheelSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return spins.map(toPublicSpin);
}
