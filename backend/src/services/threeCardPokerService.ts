import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { Card, HAND_CLASSES, HandClass, pairPlusReturn, qualifies, score3, settle } from "./threeCardPokerEngine";

/**
 * Three Card Poker paytables (winnings, x to 1). ANTE_PAYS is paid on the ante
 * when the dealer doesn't qualify or the player wins; PLAY_PAYS on the play
 * bet when the player wins; ANTE_BONUS on the ante for a straight or better
 * whenever the player plays. With best play (play queen-six-five or better)
 * the ante and play bets return ANTE_RTP_PERCENT of what they stake, and Pair
 * Plus returns PAIR_PLUS_RTP_PERCENT; both are exact, from counting every
 * player hand against every dealer hand.
 */
export const ANTE_PAYS = 0.8;
export const PLAY_PAYS = 0.8;
export const ANTE_BONUS: Record<HandClass, number> = {
  HIGH_CARD: 0,
  PAIR: 0,
  FLUSH: 0,
  STRAIGHT: 1,
  THREE_OF_A_KIND: 4,
  STRAIGHT_FLUSH: 5,
};
export const PAIR_PLUS_PAYS: Record<HandClass, number> = {
  HIGH_CARD: 0,
  PAIR: 1,
  FLUSH: 3,
  STRAIGHT: 5,
  THREE_OF_A_KIND: 30,
  STRAIGHT_FLUSH: 40,
};
export const ANTE_RTP_PERCENT = 89.67;
export const PAIR_PLUS_RTP_PERCENT = 89.46;
export const ACTIONS = ["PLAY", "FOLD"] as const;
export type ThreeCardAction = (typeof ACTIONS)[number];
const ROUND_CHANGED = "This hand changed in the meantime — please refresh.";

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/**
 * The six cards a hand uses, from a partial Fisher-Yates shuffle where swap i
 * uses HMAC(serverSeed, "<clientSeed>:threecard:<nonce>:<i>"): the player's
 * three, then the dealer's three.
 */
export function deckFor(serverSeed: string, clientSeed: string, nonce: number): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 6; i++) {
    const j = i + Math.floor(fairGameFloat(serverSeed, clientSeed, `threecard:${nonce}`, i) * (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 6);
}

type HandRow = Prisma.ThreeCardPokerHandGetPayload<Record<string, never>>;

/** While the hand is open only the player's cards are shown. */
function toPublicHand(row: HandRow) {
  const { serverSeed: _hidden, cards, version: _version, ...rest } = row;
  const live = row.status === "ACTIVE";
  const base = { ...rest, playerCards: cards.slice(0, 3), dealerCards: live ? [] : cards.slice(3, 6) };
  const player = score3(cards.slice(0, 3));
  if (live) return { ...base, player: { hand: player.cls }, dealer: null };
  const dealer = score3(cards.slice(3, 6));
  return { ...base, player: { hand: player.cls }, dealer: { hand: dealer.cls, qualifies: qualifies(dealer) } };
}

export function getThreeCardPokerConfig() {
  // Best hand first.
  const classes = [...HAND_CLASSES].reverse();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    antePays: ANTE_PAYS,
    playPays: PLAY_PAYS,
    anteBonus: classes.filter((hand) => ANTE_BONUS[hand] > 0).map((hand) => ({ hand, pays: ANTE_BONUS[hand] })),
    pairPlus: classes.filter((hand) => PAIR_PLUS_PAYS[hand] > 0).map((hand) => ({ hand, pays: PAIR_PLUS_PAYS[hand] })),
    rtpPercent: ANTE_RTP_PERCENT,
    pairPlusRtpPercent: PAIR_PLUS_RTP_PERCENT,
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

/** Takes the ante and any Pair Plus bet and deals the player's three cards. */
export async function dealThreeCardPoker(userId: string, ante: number, pairPlus = 0) {
  const { minStake, maxStake } = env.games;
  if (ante < minStake || ante > maxStake) throw new ApiError(400, `Ante must be between ${minStake} and ${maxStake}.`);
  if (pairPlus !== 0 && (pairPlus < minStake || pairPlus > maxStake)) {
    throw new ApiError(400, `Pair Plus must be 0 or between ${minStake} and ${maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const cards = deckFor(serverSeed, clientSeed, nonce);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two deals can't both pass the one-hand-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.threeCardPokerHand.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current hand before dealing a new one.");
    await takeStake(tx, userId, ante + pairPlus);
    return tx.threeCardPokerHand.create({
      data: { userId, ante, pairPlus, staked: ante + pairPlus, status: "ACTIVE", cards, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicHand(row);
}

/** Plays (a play bet equal to the ante, then the dealer shows) or folds (the ante is lost). Pair Plus is paid either way. */
export async function actThreeCardPoker(userId: string, handId: string, action: ThreeCardAction) {
  if (!ACTIONS.includes(action)) throw new ApiError(400, "Play or fold.");

  const row = await prisma.$transaction(async (tx) => {
    const hand = await tx.threeCardPokerHand.findUnique({ where: { id: handId } });
    if (!hand) throw new ApiError(404, "Hand not found.");
    if (hand.userId !== userId) throw new ApiError(403, "Not your hand.");
    if (hand.status !== "ACTIVE") throw new ApiError(400, "This hand is already over.");

    const ante = Number(hand.ante);
    const pairPlus = Number(hand.pairPlus);
    const player = score3(hand.cards.slice(0, 3));
    const dealer = score3(hand.cards.slice(3, 6));
    const pairPlusPayout = pairPlus > 0 ? floor2(pairPlus * pairPlusReturn(player, PAIR_PLUS_PAYS)) : 0;
    let outcome: string = "FOLD";
    let main = 0;
    if (action === "PLAY") {
      const settled = settle(player, dealer, ANTE_PAYS, PLAY_PAYS, ANTE_BONUS);
      outcome = settled.outcome;
      main = floor2(ante * settled.returnAntes);
    }
    const payout = Math.min(floor2(main + pairPlusPayout), env.games.maxPayout);
    const staked = Number(hand.staked) + (action === "PLAY" ? ante : 0);

    // Only one request can move a hand on from a given version.
    const moved = await tx.threeCardPokerHand.updateMany({
      where: { id: hand.id, status: "ACTIVE", version: hand.version },
      data: { status: payout > 0 ? "WON" : "LOST", action, outcome, playerHand: player.cls, dealerHand: dealer.cls, staked, pairPlusPayout, payout, version: { increment: 1 } },
    });
    if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
    if (action === "PLAY") await takeStake(tx, userId, ante);
    if (payout > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }
    return tx.threeCardPokerHand.findUniqueOrThrow({ where: { id: hand.id } });
  });
  return toPublicHand(row);
}

/** The player's open hand, if any. */
export async function getActiveThreeCardPokerHand(userId: string) {
  const row = await prisma.threeCardPokerHand.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicHand(row) : null;
}

export async function getMyThreeCardPokerHistory(userId: string, limit = 30) {
  const rows = await prisma.threeCardPokerHand.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicHand);
}
