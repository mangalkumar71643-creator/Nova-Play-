import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { INSTANT_HOUSE_CHANCE, isInstantHouse } from "./lotteryHouse";

/**
 * Scratch Card: an instant ticket with nine hidden panels. Three matching
 * symbols win that symbol's prize. The ticket's prize is drawn first, from
 * weights out of 1,000,000 whose expected return is exactly 1.00 (fair odds);
 * the nine panels are then dealt to show it: the prize symbol three times on
 * a win, and every other symbol at most twice, so a ticket never shows more
 * than one three-of-a-kind. Everything comes from the player's provably-fair
 * seeds.
 *
 * One ticket in five is a ⭐ House ticket (lotteryHouse.ts, drawn from the
 * same seeds), which loses whatever prize was drawn: its panels are dealt as
 * a ticket with no prize, and one of them (also from the seeds) holds a ⭐
 * instead of a symbol. With the House tickets a ticket returns 80% (a 20%
 * house edge), before the per-ticket payout cap.
 */

export const PRIZE_WEIGHT_TOTAL = 1_000_000;

/** The symbols, lowest prize first; `weight` is the chance of that prize in a million on a ticket that is not House. */
export const SYMBOLS = [
  { key: "COIN", multiplier: 1, weight: 235_000 },
  { key: "CHERRY", multiplier: 2, weight: 141_000 },
  { key: "BELL", multiplier: 4, weight: 35_000 },
  { key: "CLOVER", multiplier: 10, weight: 12_000 },
  { key: "HORSESHOE", multiplier: 20, weight: 4_100 },
  { key: "DIAMOND", multiplier: 50, weight: 1_400 },
  { key: "SEVEN", multiplier: 100, weight: 470 },
  { key: "CROWN", multiplier: 1000, weight: 24 },
] as const;

export const PANELS = 9;

/** The panel value that marks the ⭐ on a House ticket (symbols are 0 and up). */
export const HOUSE_PANEL = -1;

/** Exact return of a ticket that is not House: the sum of each prize times its chance (1.00). */
export function paytableReturn(): number {
  return SYMBOLS.reduce((s, x) => s + x.multiplier * x.weight, 0) / PRIZE_WEIGHT_TOTAL;
}

/** Exact return of a ticket, House tickets included (before the per-ticket payout cap). */
export function scratchRtp(): number {
  return (1 - INSTANT_HOUSE_CHANCE) * paytableReturn();
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

/** The nine panels of a ⭐ House ticket: dealt as a ticket with no prize (no
 * three of a kind), then one panel, picked from the seeds, shows the ⭐. */
export function scratchHousePanels(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const panels = scratchPanels(serverSeed, clientSeed, nonce, -1);
  const star = Math.floor(fairGameFloat(serverSeed, clientSeed, "scratch", nonce * 1000 + 200) * PANELS);
  panels[star] = HOUSE_PANEL;
  return panels;
}

type TicketRow = Prisma.ScratchTicketGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. A House
 * ticket is sent without the prize that was drawn for it (the row keeps it),
 * so older app builds that read only `prize` don't show it as a win. */
function toPublicTicket(ticket: TicketRow) {
  const { serverSeed: _hidden, ...rest } = ticket;
  return { ...rest, prize: ticket.house ? -1 : ticket.prize };
}

export function getScratchConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: Math.round(scratchRtp() * 10000) / 100,
    houseChancePercent: Math.round(INSTANT_HOUSE_CHANCE * 10000) / 100,
    panels: PANELS,
    // `chance` is the chance a ticket wins that prize: drawn and not House, so
    // the chances add up to the ticket's real win chance.
    symbols: SYMBOLS.map((s) => ({ key: s.key, multiplier: s.multiplier, chance: ((1 - INSTANT_HOUSE_CHANCE) * s.weight) / PRIZE_WEIGHT_TOTAL })),
  };
}

/** Buys one ticket: debits the stake, draws the prize (and whether it is House) and deals the panels from the player's seeds and pays the prize on a ticket that is not House, all in one transaction. */
export async function buyScratchTicket(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  // The prize is drawn on every ticket (and kept on the row, so the seeds can
  // be checked); whether the ticket is House is fixed and stored with it.
  const prize = scratchPrize(serverSeed, clientSeed, nonce);
  const house = isInstantHouse(serverSeed, clientSeed, "scratch-card", nonce);
  const panels = house ? scratchHousePanels(serverSeed, clientSeed, nonce) : scratchPanels(serverSeed, clientSeed, nonce, prize);
  const multiplier = !house && prize >= 0 ? SYMBOLS[prize].multiplier : 0;
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

    return tx.scratchTicket.create({ data: { userId, stake, panels, prize, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicTicket(ticket);
}

export async function getMyScratchHistory(userId: string, limit = 30) {
  const tickets = await prisma.scratchTicket.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return tickets.map(toPublicTicket);
}
