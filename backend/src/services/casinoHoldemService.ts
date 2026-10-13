import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { Card, HAND_CLASSES, HandClass, best5, qualifies, settle } from "./holdemEngine";

/**
 * Casino Hold'em paytables. ANTE_PAYS is the ante's winnings (x to 1) by the
 * player's final hand; CALL_PAYS is the call's winnings when the player beats
 * a qualifying dealer. With these the return under the best possible play is
 * OPTIMAL_RTP_PERCENT of everything staked (ante plus calls), measured by
 * sampling hands and, for each, counting every turn, river and dealer hand to
 * make the best call-or-fold decision.
 */
export const ANTE_PAYS: Record<HandClass, number> = {
  HIGH_CARD: 0.75,
  PAIR: 0.75,
  TWO_PAIR: 0.75,
  THREE_OF_A_KIND: 0.75,
  STRAIGHT: 0.75,
  FLUSH: 2,
  FULL_HOUSE: 3,
  FOUR_OF_A_KIND: 10,
  STRAIGHT_FLUSH: 20,
  ROYAL_FLUSH: 100,
};
export const CALL_PAYS = 0.75;
export const OPTIMAL_RTP_PERCENT = 89.5;
export const ACTIONS = ["CALL", "FOLD"] as const;
export type HoldemAction = (typeof ACTIONS)[number];
const ROUND_CHANGED = "This hand changed in the meantime — please refresh.";

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/**
 * The nine cards a hand uses, from a partial Fisher-Yates shuffle where swap i
 * uses HMAC(serverSeed, "<clientSeed>:holdem:<nonce>:<i>"): the player's two,
 * the flop, the turn, the river and the dealer's two.
 */
export function deckFor(serverSeed: string, clientSeed: string, nonce: number): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 9; i++) {
    const j = i + Math.floor(fairGameFloat(serverSeed, clientSeed, `holdem:${nonce}`, i) * (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 9);
}

type HandRow = Prisma.CasinoHoldemHandGetPayload<Record<string, never>>;

/** While the hand is open only the player's cards and the flop are shown. */
function toPublicHand(row: HandRow) {
  const { serverSeed: _hidden, cards, version: _version, ...rest } = row;
  const live = row.status === "ACTIVE";
  const base = { ...rest, playerCards: cards.slice(0, 2), board: live ? cards.slice(2, 5) : cards.slice(2, 7), dealerCards: live ? [] : cards.slice(7, 9) };
  if (live) return { ...base, player: null, dealer: null };
  const player = best5([...cards.slice(0, 2), ...cards.slice(2, 7)]);
  const dealer = best5([...cards.slice(7, 9), ...cards.slice(2, 7)]);
  return {
    ...base,
    player: { hand: player.cls, best: player.best },
    dealer: { hand: dealer.cls, best: dealer.best, qualifies: qualifies(dealer) },
  };
}

export function getCasinoHoldemConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    // Best hand first.
    antePays: [...HAND_CLASSES].reverse().map((hand) => ({ hand, pays: ANTE_PAYS[hand] })),
    callPays: CALL_PAYS,
    rtpPercent: OPTIMAL_RTP_PERCENT,
  };
}

/** Debits `amount` and books it as a stake, counting it towards any bonus wagering. */
async function takeStake(tx: Prisma.TransactionClient, userId: string, amount: number) {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  // Conditional debit so parallel requests can't overdraw the wallet.
  const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
  if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
  // Same locked-bonus wagering-progress mechanic as the other games.
  if (Number(wallet.lockedBonus) > 0) {
    const progress = Number(wallet.wageringProgress) + amount;
    await tx.wallet.update({
      where: { userId },
      data: progress >= Number(wallet.wageringRequired) ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 } : { wageringProgress: { increment: amount } },
    });
  }
  await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount, status: "COMPLETED" } });
}

/** Takes the ante and deals the player's two cards and the flop. */
export async function dealCasinoHoldem(userId: string, ante: number) {
  if (ante < env.games.minStake || ante > env.games.maxStake) {
    throw new ApiError(400, `Ante must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const cards = deckFor(serverSeed, clientSeed, nonce);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two deals can't both pass the one-hand-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.casinoHoldemHand.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current hand before dealing a new one.");
    await takeStake(tx, userId, ante);
    return tx.casinoHoldemHand.create({
      data: { userId, ante, staked: ante, status: "ACTIVE", cards, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicHand(row);
}

/** Calls (twice the ante, then the hand is played out) or folds (the ante is lost). */
export async function actCasinoHoldem(userId: string, handId: string, action: HoldemAction) {
  if (!ACTIONS.includes(action)) throw new ApiError(400, "Call or fold.");

  const row = await prisma.$transaction(async (tx) => {
    const hand = await tx.casinoHoldemHand.findUnique({ where: { id: handId } });
    if (!hand) throw new ApiError(404, "Hand not found.");
    if (hand.userId !== userId) throw new ApiError(403, "Not your hand.");
    if (hand.status !== "ACTIVE") throw new ApiError(400, "This hand is already over.");

    const ante = Number(hand.ante);
    let data: Prisma.CasinoHoldemHandUpdateManyMutationInput;
    let payout = 0;
    if (action === "FOLD") {
      data = { status: "LOST", action, outcome: "FOLD", payout: 0 };
    } else {
      const player = best5([...hand.cards.slice(0, 2), ...hand.cards.slice(2, 7)]);
      const dealer = best5([...hand.cards.slice(7, 9), ...hand.cards.slice(2, 7)]);
      const { outcome, returnAntes } = settle(player, dealer, ANTE_PAYS, CALL_PAYS);
      payout = Math.min(floor2(ante * returnAntes), env.games.maxPayout);
      data = { status: payout > 0 ? "WON" : "LOST", action, outcome, playerHand: player.cls, dealerHand: dealer.cls, staked: ante * 3, payout };
    }

    // Only one request can move a hand on from a given version.
    const moved = await tx.casinoHoldemHand.updateMany({ where: { id: hand.id, status: "ACTIVE", version: hand.version }, data: { ...data, version: { increment: 1 } } });
    if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
    if (action === "CALL") await takeStake(tx, userId, ante * 2);
    if (payout > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }
    return tx.casinoHoldemHand.findUniqueOrThrow({ where: { id: hand.id } });
  });
  return toPublicHand(row);
}

/** The player's open hand, if any. */
export async function getActiveCasinoHoldemHand(userId: string) {
  const row = await prisma.casinoHoldemHand.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicHand(row) : null;
}

export async function getMyCasinoHoldemHistory(userId: string, limit = 30) {
  const rows = await prisma.casinoHoldemHand.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicHand);
}

