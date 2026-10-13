import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Scratch Card: an instant ticket with nine hidden panels. Three matching
 * symbols win that symbol's prize. The ticket's prize is drawn first, from
 * weights out of 1,000,000 whose expected return is exactly 0.88 (88% RTP, a
 * 12% house edge); the nine panels are then dealt to show it: the prize
 * symbol three times on a win, and every other symbol at most twice, so a
 * ticket never shows more than one three-of-a-kind. Everything comes from the
 * player's provably-fair seeds.
 */

export const PRIZE_WEIGHT_TOTAL = 1_000_000;

/** The symbols, lowest prize first; `weight` is the chance of that prize in a million. */
export const SYMBOLS = [
  { key: "COIN", multiplier: 1, weight: 200_000 },
  { key: "CHERRY", multiplier: 2, weight: 120_000 },
  { key: "BELL", multiplier: 5, weight: 30_000 },
  { key: "CLOVER", multiplier: 10, weight: 10_000 },
  { key: "HORSESHOE", multiplier: 20, weight: 3_500 },
  { key: "DIAMOND", multiplier: 50, weight: 1_200 },
  { key: "SEVEN", multiplier: 100, weight: 400 },
  { key: "CROWN", multiplier: 1000, weight: 20 },
] as const;

export const PANELS = 9;

/** Exact return of a ticket: the sum of each prize times its chance. */
export function scratchRtp(): number {
  return SYMBOLS.reduce((s, x) => s + x.multiplier * x.weight, 0) / PRIZE_WEIGHT_TOTAL;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** The prize a ticket carries: a symbol index, or -1 for no win. */
export function scratchPrize(serverSeed: string, clientSeed: string, nonce: number): number {
  let pick = Math.floor(fairGameFloat(serverSeed, clientSeed, "scratch", nonce * 1000) * PRIZE_WEIGHT_TOTAL);
  for (let i = 0; i < SYMBOLS.length; i++) {
    if (pick < SYMBOLS[i].weight) return i;
    pick -= SYMBOLS[i].weight;
  }
  return -1;
}

function seededShuffle<T>(items: T[], serverSeed: string, clientSeed: string, nonce: number, base: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(fairGameFloat(serverSeed, clientSeed, "scratch", nonce * 1000 + base + i) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** The nine panels (symbol indices, left to right, top to bottom) for a ticket with this prize. */
export function scratchPanels(serverSeed: string, clientSeed: string, nonce: number, prize: number): number[] {
  // Two of every other symbol, shuffled; the first ones dealt fill the panels the prize doesn't.
  const pool: number[] = [];
  SYMBOLS.forEach((_, i) => {
    if (i !== prize) pool.push(i, i);
  });
  const fillers = seededShuffle(pool, serverSeed, clientSeed, nonce, 1).slice(0, prize >= 0 ? PANELS - 3 : PANELS);
  const panels = prize >= 0 ? [prize, prize, prize, ...fillers] : fillers;
  return seededShuffle(panels, serverSeed, clientSeed, nonce, 100);
}

type TicketRow = Prisma.ScratchTicketGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicTicket(ticket: TicketRow) {
  const { serverSeed: _hidden, ...rest } = ticket;
  return rest;
}

export function getScratchConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(scratchRtp() * 10000) / 100,
    panels: PANELS,
    symbols: SYMBOLS.map((s) => ({ key: s.key, multiplier: s.multiplier, chance: s.weight / PRIZE_WEIGHT_TOTAL })),
  };
}

/** Buys one ticket: debits the stake, deals the panels from the player's seeds and pays the prize, all in one transaction. */
export async function buyScratchTicket(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const prize = scratchPrize(serverSeed, clientSeed, nonce);
  const panels = scratchPanels(serverSeed, clientSeed, nonce, prize);
  const multiplier = prize >= 0 ? SYMBOLS[prize].multiplier : 0;
  // Rounded down, so rounding never pays more than the ticket says.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const ticket = await prisma.$transaction(async (tx) => {
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

    return tx.scratchTicket.create({ data: { userId, stake, panels, prize, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicTicket(ticket);
}

export async function getMyScratchHistory(userId: string, limit = 30) {
  const tickets = await prisma.scratchTicket.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return tickets.map(toPublicTicket);
}
