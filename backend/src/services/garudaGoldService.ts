import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { COIN_COUNTS, COIN_STRIPS, COIN_VALUE, EX_COST, LINES, NUDGE_WEIGHTS, PAYS, STRIPS, SYMBOLS, getStats, replayGarudaSpin } from "./garudaGoldEngine";

/**
 * Garuda Gold: a 3-reel, five-line slot with a fourth MULTIPLIER REEL (1x to 100x, and NUDGE coins that take a winning
 * spin to 10x to 500x), and an EX bet that costs 1.5 stakes for a richer multiplier reel. The reels, the paytable and the
 * exact return are in garudaGoldEngine.ts.
 */

/**
 * Most one Garuda Gold spin pays, in rupees (owner's request, 2026-11-24: a 5 lakh limit for this game). A spin can be worth up to
 * 20,400 stakes with a 500x nudge, so this bounds the house's worst spin; the admin's "Max win per bet" for all games still applies
 * when it is lower. The rules screen shows it (the config's maxPayout).
 */
export const GARUDA_MAX_PAYOUT = 500_000;

export function garudaMaxPayout(): number {
  return Math.min(env.games.maxPayout, GARUDA_MAX_PAYOUT);
}

/** What a spin pays: stake x its win, rounded down to the paisa (never more than the table says), at most garudaMaxPayout(). */
export function garudaPayout(stake: number, totalWin: number): number {
  return Math.min(floor2(stake * totalWin), garudaMaxPayout());
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

type SpinRow = Prisma.GarudaGoldSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent: only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return { ...rest, stake: Number(rest.stake), cost: Number(rest.cost), totalWin: Number(rest.totalWin), payout: Number(rest.payout) };
}

export function getGarudaGoldConfig() {
  const stats = getStats();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: garudaMaxPayout(),
    symbols: SYMBOLS,
    // The three reels as symbols, so the app can spin them the way they really are.
    strips: STRIPS.map((strip) => strip.map((i) => SYMBOLS[i])),
    lines: LINES,
    pays: PAYS,
    coinStrips: COIN_STRIPS,
    coinValues: COIN_VALUE,
    coinCounts: COIN_COUNTS,
    nudgeWeights: NUDGE_WEIGHTS,
    exCost: EX_COST,
    hitRatePercent: round2(stats.hitRate * 100),
    nudgeChanceOneIn: { normal: Math.round(1 / stats.nudgeChance.normal), ex: Math.round(1 / stats.nudgeChance.ex) },
    maxWinStakes: round2(stats.maxLinePay * COIN_VALUE.X500),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
    exRtpPercent: Math.floor(stats.exRtp * 10000) / 100,
  };
}

/** Spins once: debits the stake (x1.5 with EX), plays from the player's provably-fair seeds and pays, in one transaction. */
export async function spinGarudaGold(userId: string, stake: number, ex = false) {
  if (!Number.isFinite(stake) || stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-9) throw new ApiError(400, "The stake can have two decimals at most.");
  // With EX the spin costs 1.5 stakes, to the paisa (so a stake like 1.01 is not allowed with EX).
  const cost = ex ? round2(stake * EX_COST) : stake;
  if (ex && Math.abs(stake * EX_COST * 100 - Math.round(stake * EX_COST * 100)) > 1e-9) {
    throw new ApiError(400, "With EX the stake must be a whole number of 2 paise.");
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayGarudaSpin(serverSeed, clientSeed, nonce, ex);
  const payout = garudaPayout(stake, outcome.totalWin);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: cost } }, data: { balance: { decrement: cost } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + cost;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: cost };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: cost, status: "COMPLETED" } });
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.garudaGoldSpin.create({
      data: {
        userId,
        stake,
        cost,
        extraBet: ex,
        totalWin: outcome.totalWin,
        multiplier: outcome.multiplier,
        payout,
        detail: JSON.parse(JSON.stringify(outcome)) as Prisma.InputJsonValue,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyGarudaGoldHistory(userId: string, limit = 30) {
  const rows = await prisma.garudaGoldSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
