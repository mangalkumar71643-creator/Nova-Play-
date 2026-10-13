import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Limbo: the player picks a target multiplier, the round draws a result
 * multiplier and the bet wins stake x target when the result reaches the
 * target. The result is rtp / (1 - r) for a fair float r, so
 * P(result >= t) = rtp / t and every target returns exactly rtp.
 * About 10% of results land under 1.00x and show as 1.00x.
 */
export const MIN_TARGET = 1.01;
/** Highest a result is shown as; far above any target that can be bet. */
export const MAX_RESULT = 1_000_000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/** Top target: the max payout at the minimum stake. */
export function maxTarget(): number {
  return Math.floor(env.games.maxPayout / env.games.minStake);
}

/** The result multiplier for these seeds, rounded down to 2 decimals. */
export function resultFor(serverSeed: string, clientSeed: string, nonce: number): number {
  const r = fairGameFloat(serverSeed, clientSeed, "limbo", nonce);
  const x = env.games.rtp / (1 - r);
  return Math.min(Math.max(Math.floor(x * 100) / 100, 1), MAX_RESULT);
}

type LimboBetRow = Prisma.LimboBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: LimboBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getLimboConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    minTarget: MIN_TARGET,
    maxTarget: maxTarget(),
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** Plays once: debits the stake, draws the result from the player's
 * provably-fair seeds and pays stake x target on a win, in one transaction. */
export async function playLimbo(userId: string, stake: number, target: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(target * 100 - Math.round(target * 100)) > 1e-6) {
    throw new ApiError(400, "Target can have at most 2 decimals.");
  }
  if (target < MIN_TARGET || target > maxTarget()) {
    throw new ApiError(400, `Target must be between ${MIN_TARGET}x and ${maxTarget()}x.`);
  }
  if (floor2(stake * target) > env.games.maxPayout) {
    throw new ApiError(400, `A single bet can win at most ${env.games.maxPayout}. Lower the bet or the target.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const result = resultFor(serverSeed, clientSeed, nonce);
  const won = result >= target;
  const payout = won ? floor2(stake * target) : 0;

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel bets can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
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
    if (payout > 0) {
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }

    return tx.limboBet.create({
      data: { userId, stake, target, result, won, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyLimboHistory(userId: string, limit = 30) {
  const bets = await prisma.limboBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
