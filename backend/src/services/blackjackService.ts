import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import {
  Action,
  BLACKJACK_PAYS,
  BjState,
  EXACT_RTP,
  INSURANCE_PAYS,
  WIN_PAYS,
  allowedActions,
  applyAction,
  deal,
  extraStake,
  handTotal,
  totalPayout,
  totalStaked,
} from "./blackjackEngine";

export const ACTIONS: Action[] = ["hit", "stand", "double", "split", "insurance", "noInsurance"];
const HAND_CHANGED = "This hand changed in the meantime — please refresh.";
const ACTION_WORDS: Record<Action, string> = { hit: "hit", stand: "stand", double: "double", split: "split", insurance: "take insurance", noInsurance: "decline insurance" };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Card i of a hand: HMAC-SHA256(serverSeed, "<clientSeed>:blackjack:<nonce>:<i>")
 * read as a float, times 52. Cards are drawn in stream order as the hand
 * needs them, so the stored `drawn` list replays card by card.
 */
export function cardStream(serverSeed: string, clientSeed: string, nonce: number) {
  return (i: number) => Math.floor(fairGameFloat(serverSeed, clientSeed, `blackjack:${nonce}`, i) * 52);
}

type HandRow = Prisma.BlackjackHandGetPayload<Record<string, never>>;

/** What the player may see: the hole card and the server seed stay hidden until the hand is over. */
function toPublicHand(row: HandRow) {
  const { serverSeed: _hidden, state: rawState, version: _version, ...rest } = row;
  const state = rawState as unknown as BjState;
  const done = state.phase === "DONE";
  const dealer = done ? state.dealer : [state.dealer[0]];
  return {
    ...rest,
    phase: state.phase,
    dealer,
    dealerHidden: !done,
    dealerTotal: handTotal(dealer).total,
    dealerBlackjack: done ? state.dealerBlackjack : null,
    hands: state.hands.map((h) => ({ ...h, total: handTotal(h.cards).total, soft: handTotal(h.cards).soft })),
    active: state.active,
    insurance: state.insurance,
    actions: allowedActions(state),
  };
}

export function getBlackjackConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    winPays: WIN_PAYS,
    blackjackPays: BLACKJACK_PAYS,
    insurancePays: INSURANCE_PAYS,
    rtpPercent: round2(EXACT_RTP * 100),
  };
}

/** Debits `amount` and books it as a stake, counting it towards any bonus wagering. */
async function takeStake(tx: Prisma.TransactionClient, userId: string, amount: number) {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  // Conditional debit so parallel requests can't overdraw the wallet.
  const debited = await tx.wallet.updateMany({
    where: { userId, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
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

async function payOut(tx: Prisma.TransactionClient, userId: string, amount: number) {
  if (amount <= 0) return;
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount, status: "COMPLETED" } });
}

/** Starts a hand: takes the bet and deals. A blackjack on either side settles it at once. */
export async function dealBlackjack(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-6) {
    throw new ApiError(400, "Stake can have at most 2 decimals.");
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const state = deal(stake, cardStream(serverSeed, clientSeed, nonce));
  const done = state.phase === "DONE";

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two deals can't both pass the one-hand-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.blackjackHand.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current hand before dealing a new one.");
    await takeStake(tx, userId, stake);
    const payout = done ? Math.min(totalPayout(state), env.games.maxPayout) : 0;
    await payOut(tx, userId, payout);
    return tx.blackjackHand.create({
      data: {
        userId,
        stake,
        totalStake: totalStaked(state),
        payout,
        status: done ? "SETTLED" : "ACTIVE",
        state: state as unknown as Prisma.InputJsonValue,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });
  return toPublicHand(row);
}

/** Plays one action on the player's open hand. */
export async function actBlackjack(userId: string, handId: string, action: Action) {
  if (!ACTIONS.includes(action)) throw new ApiError(400, "Unknown action.");

  const row = await prisma.$transaction(async (tx) => {
    const hand = await tx.blackjackHand.findUnique({ where: { id: handId } });
    if (!hand) throw new ApiError(404, "Hand not found.");
    if (hand.userId !== userId) throw new ApiError(403, "Not your hand.");
    if (hand.status !== "ACTIVE") throw new ApiError(400, "This hand has already ended.");

    const state = hand.state as unknown as BjState;
    if (!allowedActions(state).includes(action)) throw new ApiError(400, `You can't ${ACTION_WORDS[action]} now.`);
    const extra = extraStake(state, action);
    applyAction(state, action, cardStream(hand.serverSeed, hand.clientSeed, hand.nonce));
    const done = state.phase === "DONE";
    const payout = done ? Math.min(totalPayout(state), env.games.maxPayout) : 0;

    // Only one request can move a hand on from a given version.
    const moved = await tx.blackjackHand.updateMany({
      where: { id: hand.id, status: "ACTIVE", version: hand.version },
      data: {
        state: state as unknown as Prisma.InputJsonValue,
        totalStake: totalStaked(state),
        payout,
        status: done ? "SETTLED" : "ACTIVE",
        version: { increment: 1 },
      },
    });
    if (moved.count === 0) throw new ApiError(409, HAND_CHANGED);
    if (extra > 0) await takeStake(tx, userId, extra);
    await payOut(tx, userId, payout);
    return tx.blackjackHand.findUniqueOrThrow({ where: { id: hand.id } });
  });
  return toPublicHand(row);
}

/** The player's unfinished hand, if any, so the table can pick up where it left off. */
export async function getActiveBlackjackHand(userId: string) {
  const row = await prisma.blackjackHand.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicHand(row) : null;
}

export async function getMyBlackjackHistory(userId: string, limit = 30) {
  const rows = await prisma.blackjackHand.findMany({ where: { userId, status: "SETTLED" }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicHand);
}
