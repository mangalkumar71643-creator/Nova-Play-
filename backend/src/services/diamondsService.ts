import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Diamonds: each play drops five gems, each one of seven colours with equal
 * chance, and pays for how many share a colour, like a poker hand. Out of the
 * 7^5 = 16,807 equally likely rows: five of a kind 7, four of a kind 210, full
 * house 420, three of a kind 2,100, two pair 3,150, one pair 8,400 and no
 * match 2,520. With PAYTABLE that returns 15,102.5 / 16,807 = 89.86%.
 */
export const COLORS = 7;
export const GEMS = 5;
export const RESULTS = ["NONE", "PAIR", "TWO_PAIR", "THREE_OF_A_KIND", "FULL_HOUSE", "FOUR_OF_A_KIND", "FIVE_OF_A_KIND"] as const;
export type DiamondsResult = (typeof RESULTS)[number];

export const PAYTABLE: Record<DiamondsResult, number> = {
  NONE: 0,
  PAIR: 0.1,
  TWO_PAIR: 1.75,
  THREE_OF_A_KIND: 2.7,
  FULL_HOUSE: 4,
  FOUR_OF_A_KIND: 5,
  FIVE_OF_A_KIND: 50,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

export function resultOf(gems: number[]): DiamondsResult {
  const counts = new Array<number>(COLORS).fill(0);
  for (const g of gems) counts[g]++;
  const groups = counts.filter((n) => n > 1).sort((a, b) => b - a);
  if (groups[0] === 5) return "FIVE_OF_A_KIND";
  if (groups[0] === 4) return "FOUR_OF_A_KIND";
  if (groups[0] === 3) return groups[1] === 2 ? "FULL_HOUSE" : "THREE_OF_A_KIND";
  if (groups[0] === 2) return groups[1] === 2 ? "TWO_PAIR" : "PAIR";
  return "NONE";
}

/** Exact chance of each result, counted over all 7^5 rows. */
export const CHANCES: Record<DiamondsResult, number> = (() => {
  const counts = Object.fromEntries(RESULTS.map((r) => [r, 0])) as Record<DiamondsResult, number>;
  const total = COLORS ** GEMS;
  for (let n = 0; n < total; n++) {
    const gems = Array.from({ length: GEMS }, (_, i) => Math.floor(n / COLORS ** i) % COLORS);
    counts[resultOf(gems)]++;
  }
  return Object.fromEntries(RESULTS.map((r) => [r, counts[r] / total])) as Record<DiamondsResult, number>;
})();

export const RTP = RESULTS.reduce((s, r) => s + CHANCES[r] * PAYTABLE[r], 0);

/** Gem i is floor(HMAC(serverSeed, "<clientSeed>:diamonds:<nonce>:<i>") x 7). */
export function gemsFor(serverSeed: string, clientSeed: string, nonce: number): number[] {
  return Array.from({ length: GEMS }, (_, i) => Math.floor(fairGameFloat(serverSeed, clientSeed, `diamonds:${nonce}`, i) * COLORS));
}

type DiamondsBetRow = Prisma.DiamondsBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: DiamondsBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getDiamondsConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    colors: COLORS,
    // Best result first.
    paytable: [...RESULTS]
      .reverse()
      .map((result) => ({ result, multiplier: PAYTABLE[result], chancePercent: round2(CHANCES[result] * 100) })),
    rtpPercent: round2(RTP * 100),
  };
}

/** Plays once: debits the stake, drops five gems from the player's
 * provably-fair seeds and pays the result, in one transaction. */
export async function playDiamonds(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const gems = gemsFor(serverSeed, clientSeed, nonce);
  const result = resultOf(gems);
  const multiplier = PAYTABLE[result];
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

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

    return tx.diamondsBet.create({
      data: { userId, stake, gems, result, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyDiamondsHistory(userId: string, limit = 30) {
  const bets = await prisma.diamondsBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
