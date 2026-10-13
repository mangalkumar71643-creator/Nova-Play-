import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Dice: a roll from 0.00 to 100.00 (10,001 equally likely results). The
 * player picks a target and Roll Over (win if the roll is above it) or
 * Roll Under (win if below). Win chance is the share of the bar that wins
 * and the multiplier is rtp x 100 / chance, so every target returns the
 * same rtp: 90 / chance x (100 x chance) / 10,001 = 89.99%.
 */
export const OUTCOMES = 10001;
/** Win chance limits, in percent. The top keeps the multiplier above 1.01x. */
export const MIN_CHANCE = 0.01;
export const MAX_CHANCE = 89;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function floor4(n: number): number {
  return Math.floor(n * 10000 + 1e-9) / 10000;
}

/** The roll for these seeds: 0.00 to 100.00 in steps of 0.01. */
export function rollFor(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(fairGameFloat(serverSeed, clientSeed, "dice", nonce) * OUTCOMES) / 100;
}

export function winChance(target: number, rollOver: boolean): number {
  return round2(rollOver ? 100 - target : target);
}

export function multiplierFor(chance: number): number {
  return floor4((env.games.rtp * 100) / chance);
}

type DiceBetRow = Prisma.DiceBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: DiceBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getDiceConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    minChance: MIN_CHANCE,
    maxChance: MAX_CHANCE,
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** Rolls once: debits the stake, rolls from the player's provably-fair
 * seeds and pays stake x multiplier on a win, all in one transaction. */
export async function rollDice(userId: string, stake: number, target: number, rollOver: boolean) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(target * 100 - Math.round(target * 100)) > 1e-6) {
    throw new ApiError(400, "Target can have at most 2 decimals.");
  }
  const chance = winChance(target, rollOver);
  if (chance < MIN_CHANCE || chance > MAX_CHANCE) {
    throw new ApiError(400, `Win chance must be between ${MIN_CHANCE}% and ${MAX_CHANCE}%.`);
  }
  const multiplier = multiplierFor(chance);
  if (floor2(stake * multiplier) > env.games.maxPayout) {
    throw new ApiError(400, `A single roll can win at most ${env.games.maxPayout}. Lower the bet or the multiplier.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const result = rollFor(serverSeed, clientSeed, nonce);
  const won = rollOver ? result > target : result < target;
  // Rounded down, so rounding never pays more than the multiplier says.
  const payout = won ? floor2(stake * multiplier) : 0;

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel rolls can't overdraw the wallet.
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

    return tx.diceBet.create({
      data: { userId, stake, target, rollOver, multiplier, result, won, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyDiceHistory(userId: string, limit = 30) {
  const bets = await prisma.diceBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
