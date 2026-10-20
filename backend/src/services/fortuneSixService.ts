import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { HOUSE_CHANCE, isHouseTicket } from "./lotteryHouse";

/**
 * Fortune 6: the player picks 6 of 48 numbers, then 35 balls are drawn in
 * order (a seeded shuffle of all 48 from the player's provably-fair seeds,
 * keeping the first 35). If all 6 picks are drawn, the ticket pays by the
 * position of the ball that completed it: the sooner, the bigger. One ticket
 * in ten is a ⭐ House ticket (lotteryHouse.ts, drawn from the same seeds),
 * which loses whatever the balls do.
 *
 * The chance the 6th pick lands on position k is C(k-1, 5) / C(48, 6), so on
 * a ticket that is not House the table below returns
 * sum(PAYS[k] * C(k-1, 5)) / C(48, 6) = 99.99% (fair odds, never above 100%),
 * and with the House tickets 89.99%, just under the 90% lottery rtp. The top
 * pays (balls 6-10) are the ones the per-ticket maxPayout trims at bigger
 * stakes, so the return sits in the positions below them: a 5-rupee ticket
 * still returns 89.02%.
 */

export const NUMBERS = 48;
export const DRAWN = 35;
export const PICKS = 6;

/** What a ticket that is not House pays (stake included) when its 6th number is drawn at this position. */
export const PAYS: Record<number, number> = {
  6: 10000, 7: 7500, 8: 5000, 9: 2500, 10: 1000, 11: 550, 12: 325, 13: 220, 14: 160, 15: 110,
  16: 88, 17: 76, 18: 65, 19: 54, 20: 44, 21: 37, 22: 30, 23: 24, 24: 17.5, 25: 13,
  26: 11, 27: 9.8, 28: 8.2, 29: 7, 30: 6, 31: 4.8, 32: 3.75, 33: 2.7, 34: 2.25, 35: 1.2,
};

function comb(n: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/** Chance that a ticket's 6th number lands exactly at position k. */
export function positionChance(k: number): number {
  return comb(k - 1, PICKS - 1) / comb(NUMBERS, PICKS);
}

/** Exact return of a ticket that is not House (before the per-ticket payout cap). */
export function paytableReturn(): number {
  return Object.entries(PAYS).reduce((s, [k, m]) => s + m * positionChance(Number(k)), 0);
}

/** Exact return of a ticket, House tickets included (before the per-ticket payout cap). */
export function fortuneSixRtp(): number {
  return (1 - HOUSE_CHANCE) * paytableReturn();
}

/** What a ticket pays per unit staked: nothing on a House ticket or one that was not completed. */
export function payMultiplier(position: number | null, house: boolean): number {
  return position && !house ? PAYS[position] : 0;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** The 35 balls in the order they are drawn. */
export function fortuneSixDraw(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const balls = Array.from({ length: NUMBERS }, (_, i) => i + 1);
  for (let i = NUMBERS - 1; i > 0; i--) {
    const j = Math.floor(fairGameFloat(serverSeed, clientSeed, "fortune6", nonce * 100 + i) * (i + 1));
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  return balls.slice(0, DRAWN);
}

/** The position (6-35) of the ball that completed the ticket, or null if a pick was not drawn. */
export function completedAt(picks: number[], drawn: number[]): number | null {
  let last = 0;
  for (const p of picks) {
    const at = drawn.indexOf(p);
    if (at < 0) return null;
    last = Math.max(last, at + 1);
  }
  return last;
}

type BetRow = Prisma.FortuneSixBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. A House
 * ticket is sent without its completing position (the row keeps it), so
 * older app builds that read only `position` don't show it as a win; the
 * picks and balls still go out, for checking the seeds. */
function toPublicBet(bet: BetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return { ...rest, position: bet.house ? null : bet.position };
}

export function getFortuneSixConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    numbers: NUMBERS,
    drawn: DRAWN,
    picks: PICKS,
    rtpPercent: Math.round(fortuneSixRtp() * 10000) / 100,
    houseChancePercent: Math.round(HOUSE_CHANCE * 10000) / 100,
    // `chance` is the chance a ticket wins that pay: completed at that ball
    // and not House, so the chances add up to the ticket's real win chance.
    pays: Object.entries(PAYS).map(([k, m]) => ({ position: Number(k), multiplier: m, chance: (1 - HOUSE_CHANCE) * positionChance(Number(k)) })),
  };
}

/** One ticket: debits the stake, draws the 35 balls (and whether it is House) from the player's seeds and pays a completed ticket that is not House, all in one transaction. */
export async function playFortuneSix(userId: string, stake: number, picks: number[]) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-6) {
    throw new ApiError(400, "Stake can have at most 2 decimals.");
  }
  const unique = [...new Set(picks)];
  if (unique.length !== PICKS || unique.some((n) => !Number.isInteger(n) || n < 1 || n > NUMBERS)) {
    throw new ApiError(400, `Pick ${PICKS} different numbers from 1 to ${NUMBERS}.`);
  }
  const chosen = unique.sort((a, b) => a - b);

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const drawn = fortuneSixDraw(serverSeed, clientSeed, nonce);
  // Fixed (and stored) with the ticket, from the same seeds. The balls are
  // still drawn and kept, so the seeds can be checked against them.
  const house = isHouseTicket(serverSeed, clientSeed, "fortune-six", nonce);
  const position = completedAt(chosen, drawn);
  const multiplier = payMultiplier(position, house);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel tickets can't overdraw the wallet.
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

    return tx.fortuneSixBet.create({ data: { userId, stake, picks: chosen, drawn, position, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicBet(bet);
}

export async function getMyFortuneSixHistory(userId: string, limit = 30) {
  const bets = await prisma.fortuneSixBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
