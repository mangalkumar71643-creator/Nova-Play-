import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import {
  ANY7_PAY,
  ANY_BAR_PAY,
  ANY_PAY,
  BONUS_STRIP,
  CASH_PAY,
  MAX_RESPINS,
  MULTIPLIERS,
  PAYS,
  STRIPS,
  SYMBOLS,
  WHEEL,
  getStats,
  replayTurboSpin,
} from "./turboSevensEngine";

/**
 * Turbo Sevens: a one-payline 777 slot with a fourth bonus reel (multipliers, cash symbols and a respin wheel).
 * The reels, the paytable and the exact return are in turboSevensEngine.ts.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

type SpinRow = Prisma.TurboSevensSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent: only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return { ...rest, stake: Number(rest.stake), totalWin: Number(rest.totalWin), payout: Number(rest.payout) };
}

export function getTurboSevensConfig() {
  const stats = getStats();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    // The three main reels as symbols, so the app can spin them the way they really are.
    strips: STRIPS.map((strip) => strip.map((i) => SYMBOLS[i])),
    bonusStrip: BONUS_STRIP,
    pays: Object.fromEntries(Object.entries(PAYS).map(([i, p]) => [SYMBOLS[Number(i)], p])),
    anyPays: { ANY7: ANY7_PAY, ANYBAR: ANY_BAR_PAY, ANY: ANY_PAY },
    multipliers: MULTIPLIERS,
    cashPays: CASH_PAY,
    wheel: WHEEL,
    maxRespins: MAX_RESPINS,
    hitRatePercent: round2(stats.hitRate * 100),
    respinChanceOneIn: Math.round(1 / stats.respinChance),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
  };
}

/** Spins once (respins included): debits the stake, plays from the player's provably-fair seeds and pays, in one transaction. */
export async function spinTurboSevens(userId: string, stake: number) {
  if (!Number.isFinite(stake) || stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-9) throw new ApiError(400, "The stake can have two decimals at most.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayTurboSpin(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);

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

    return tx.turboSevensSpin.create({
      data: {
        userId,
        stake,
        totalWin: outcome.totalWin,
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

export async function getMyTurboSevensHistory(userId: string, limit = 30) {
  const rows = await prisma.turboSevensSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
