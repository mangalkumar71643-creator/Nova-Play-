import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { INSTANT_HOUSE_CHANCE, isInstantHouse } from "./lotteryHouse";

/**
 * Diamonds: each play drops five gems, each one of seven colours with equal
 * chance, and pays for how many share a colour, like a poker hand. Out of the
 * 7^5 = 16,807 equally likely rows: five of a kind 7, four of a kind 210, full
 * house 420, three of a kind 2,100, two pair 3,150, one pair 8,400 and no
 * match 2,520. On a play that is not House, PAYTABLE returns
 * 16,800 / 16,807 = 99.96% (fair odds, never above 100%).
 *
 * One play in five is a ⭐ House play (lotteryHouse.ts, drawn from the same
 * seeds), which loses whatever the gems show, so a play returns
 * 0.8 x 99.96% = 79.97% (a 20% house edge), before the per-bet max payout.
 */
export const COLORS = 7;
export const GEMS = 5;
export const RESULTS = ["NONE", "PAIR", "TWO_PAIR", "THREE_OF_A_KIND", "FULL_HOUSE", "FOUR_OF_A_KIND", "FIVE_OF_A_KIND"] as const;
export type DiamondsResult = (typeof RESULTS)[number];

/** What a play that is not House pays (stake included) for each result. */
export const PAYTABLE: Record<DiamondsResult, number> = {
  NONE: 0,
  PAIR: 0.1,
  TWO_PAIR: 2.1,
  THREE_OF_A_KIND: 2.7,
  FULL_HOUSE: 4.75,
  FOUR_OF_A_KIND: 6,
  FIVE_OF_A_KIND: 60,
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

/** Exact return of a play that is not House. */
export const PAYTABLE_RTP = RESULTS.reduce((s, r) => s + CHANCES[r] * PAYTABLE[r], 0);
/** Exact return of a play, House plays included (before the per-bet max payout). */
export const RTP = (1 - INSTANT_HOUSE_CHANCE) * PAYTABLE_RTP;

/** Gem i is floor(HMAC(serverSeed, "<clientSeed>:diamonds:<nonce>:<i>") x 7). */
export function gemsFor(serverSeed: string, clientSeed: string, nonce: number): number[] {
  return Array.from({ length: GEMS }, (_, i) => Math.floor(fairGameFloat(serverSeed, clientSeed, `diamonds:${nonce}`, i) * COLORS));
}

type DiamondsBetRow = Prisma.DiamondsBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. A House
 * play is sent as NONE (the row keeps what the gems made), so older app
 * builds that read only `result` don't light a winning hand on it; the gems
 * still go out, for checking the seeds. */
function toPublicBet(bet: DiamondsBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return { ...rest, result: bet.house ? "NONE" : bet.result };
}

export function getDiamondsConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    colors: COLORS,
    // Best result first. `chancePercent` is the chance a play wins that pay:
    // that result and not House, so with houseChancePercent they add up to 100.
    paytable: [...RESULTS]
      .reverse()
      .map((result) => ({ result, multiplier: PAYTABLE[result], chancePercent: round2((1 - INSTANT_HOUSE_CHANCE) * CHANCES[result] * 100) })),
    rtpPercent: round2(RTP * 100),
    houseChancePercent: round2(INSTANT_HOUSE_CHANCE * 100),
  };
}

/** Plays once: debits the stake, drops five gems (and draws whether the play
 * is House) from the player's provably-fair seeds and pays the result of a
 * play that is not House, in one transaction. */
export async function playDiamonds(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const gems = gemsFor(serverSeed, clientSeed, nonce);
  const result = resultOf(gems);
  // Fixed (and stored) with the play, from the same seeds. The gems are still
  // dropped and kept, so the seeds can be checked against them.
  const house = isInstantHouse(serverSeed, clientSeed, "diamonds", nonce);
  const multiplier = house ? 0 : PAYTABLE[result];
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
      data: { userId, stake, gems, result, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyDiamondsHistory(userId: string, limit = 30) {
  const bets = await prisma.diamondsBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
