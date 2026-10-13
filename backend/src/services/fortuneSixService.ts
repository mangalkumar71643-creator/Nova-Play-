import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Fortune 6: the player picks 6 of 48 numbers, then 35 balls are drawn in
 * order (a seeded shuffle of all 48 from the player's provably-fair seeds,
 * keeping the first 35). If all 6 picks are drawn, the ticket pays by the
 * position of the ball that completed it: the sooner, the bigger.
 *
 * The chance the 6th pick lands on position k is C(k-1, 5) / C(48, 6), so the
 * table below returns sum(PAYS[k] * C(k-1, 5)) / C(48, 6) = 87.98%, just under
 * an 88% target (a 12% house edge).
 */

export const NUMBERS = 48;
export const DRAWN = 35;
export const PICKS = 6;

/** What a ticket pays (stake included) when its 6th number is drawn at this position. */
export const PAYS: Record<number, number> = {
  6: 10000, 7: 7500, 8: 5000, 9: 2500, 10: 1000, 11: 500, 12: 300, 13: 200, 14: 150, 15: 100,
  16: 80, 17: 70, 18: 60, 19: 50, 20: 40, 21: 34, 22: 27.5, 23: 22, 24: 16, 25: 12,
  26: 10, 27: 9, 28: 7.5, 29: 6, 30: 5, 31: 4, 32: 3, 33: 2, 34: 1.5, 35: 1,
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

/** Exact return of a ticket (before the per-ticket payout cap). */
export function fortuneSixRtp(): number {
  return Object.entries(PAYS).reduce((s, [k, m]) => s + m * positionChance(Number(k)), 0);
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

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: BetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
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
    pays: Object.entries(PAYS).map(([k, m]) => ({ position: Number(k), multiplier: m, chance: positionChance(Number(k)) })),
  };
}

/** One ticket: debits the stake, draws the 35 balls from the player's seeds and pays a completed ticket, all in one transaction. */
export async function playFortuneSix(userId: string, stake: number, picks: number[]) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  const unique = [...new Set(picks)];
  if (unique.length !== PICKS || unique.some((n) => !Number.isInteger(n) || n < 1 || n > NUMBERS)) {
    throw new ApiError(400, `Pick ${PICKS} different numbers from 1 to ${NUMBERS}.`);
  }
  const chosen = unique.sort((a, b) => a - b);

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const drawn = fortuneSixDraw(serverSeed, clientSeed, nonce);
  const position = completedAt(chosen, drawn);
  const multiplier = position ? PAYS[position] : 0;
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

    return tx.fortuneSixBet.create({ data: { userId, stake, picks: chosen, drawn, position, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicBet(bet);
}

export async function getMyFortuneSixHistory(userId: string, limit = 30) {
  const bets = await prisma.fortuneSixBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
