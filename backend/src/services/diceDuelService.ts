import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Dice Duel: the player and the house each roll two dice; the higher total
 * wins. The player backs PLAYER, HOUSE or TIE before the roll. All four dice
 * come from the player's provably-fair seeds, so each of the 6^4 = 1296 rolls
 * is equally likely: PLAYER and HOUSE each win 575 of them and TIE 146. Each
 * pick pays floor2(0.88 / its chance), so every pick returns just under 88%
 * (a 12% house edge; the rounding down never favours the player).
 */

export type DuelPick = "PLAYER" | "HOUSE" | "TIE";
export const PICKS: DuelPick[] = ["PLAYER", "HOUSE", "TIE"];
export const TARGET_RTP = 0.88;
const ROLLS = 1296;

/** Of the 1296 equally likely rolls, how many each pick wins. */
export const WAYS: Record<DuelPick, number> = { PLAYER: 575, HOUSE: 575, TIE: 146 };

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** What a winning pick pays, stake included. */
export const PAYS: Record<DuelPick, number> = {
  PLAYER: floor2((TARGET_RTP * ROLLS) / WAYS.PLAYER),
  HOUSE: floor2((TARGET_RTP * ROLLS) / WAYS.HOUSE),
  TIE: floor2((TARGET_RTP * ROLLS) / WAYS.TIE),
};

/** Exact return of a pick. */
export function duelRtp(pick: DuelPick): number {
  return (WAYS[pick] * PAYS[pick]) / ROLLS;
}

/** The four dice of a roll: the player's two, then the house's two. */
export function duelDice(serverSeed: string, clientSeed: string, nonce: number): number[] {
  return [0, 1, 2, 3].map((i) => Math.floor(fairGameFloat(serverSeed, clientSeed, "diceduel", nonce * 10 + i) * 6) + 1);
}

export function duelOutcome(dice: number[]): DuelPick {
  const p = dice[0] + dice[1];
  const h = dice[2] + dice[3];
  return p > h ? "PLAYER" : h > p ? "HOUSE" : "TIE";
}

type BetRow = Prisma.DiceDuelBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: BetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getDiceDuelConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    picks: PICKS.map((pick) => ({ pick, multiplier: PAYS[pick], chance: WAYS[pick] / ROLLS, rtpPercent: Math.round(duelRtp(pick) * 10000) / 100 })),
  };
}

/** One duel: debits the stake, rolls the four dice from the player's seeds and pays a winning pick, all in one transaction. */
export async function playDiceDuel(userId: string, stake: number, pick: DuelPick) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!PICKS.includes(pick)) throw new ApiError(400, "Pick PLAYER, HOUSE or TIE.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const dice = duelDice(serverSeed, clientSeed, nonce);
  const outcome = duelOutcome(dice);
  const multiplier = outcome === pick ? PAYS[pick] : 0;
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel duels can't overdraw the wallet.
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

    return tx.diceDuelBet.create({
      data: { userId, stake, pick, playerDice: dice.slice(0, 2), houseDice: dice.slice(2), outcome, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyDiceDuelHistory(userId: string, limit = 30) {
  const bets = await prisma.diceDuelBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
