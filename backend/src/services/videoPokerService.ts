import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { Card, HANDS, Hand, OPTIMAL_RTP_PERCENT, PAYTABLE, drawHand, evaluate } from "./videoPokerEngine";

const ROUND_CHANGED = "This round changed in the meantime — please refresh.";

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * The first ten cards of a shuffled deck: a partial Fisher-Yates shuffle where
 * swap i uses HMAC-SHA256(serverSeed, "<clientSeed>:videopoker:<nonce>:<i>").
 * Cards 0-4 are dealt; cards 5-9 replace the discards in order.
 */
export function deckFor(serverSeed: string, clientSeed: string, nonce: number): Card[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 0; i < 10; i++) {
    const j = i + Math.floor(fairGameFloat(serverSeed, clientSeed, `videopoker:${nonce}`, i) * (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 10);
}

type RoundRow = Prisma.VideoPokerRoundGetPayload<Record<string, never>>;

/** The undealt cards and the server seed stay hidden. */
function toPublicRound(row: RoundRow) {
  const { serverSeed: _hidden, cards: _cards, version: _version, ...rest } = row;
  return rest;
}

export function getVideoPokerConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    // Best hand first.
    paytable: [...HANDS]
      .reverse()
      .filter((h) => PAYTABLE[h] > 0)
      .map((hand) => ({ hand, multiplier: PAYTABLE[hand] })),
    rtpPercent: OPTIMAL_RTP_PERCENT,
  };
}

/** Takes the bet and deals five cards. */
export async function dealVideoPoker(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const cards = deckFor(serverSeed, clientSeed, nonce);
  const hand = cards.slice(0, 5);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two deals can't both pass the one-round-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.videoPokerRound.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current hand before dealing a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel requests can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: stake } }, data: { balance: { decrement: stake } } });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + stake;
      await tx.wallet.update({
        where: { userId },
        data: progress >= Number(wallet.wageringRequired) ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 } : { wageringProgress: { increment: stake } },
      });
    }
    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    return tx.videoPokerRound.create({
      data: { userId, stake, status: "ACTIVE", cards, hand, held: [], result: evaluate(hand), multiplier: 0, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicRound(row);
}

/** Keeps the held cards (indexes 0-4), replaces the rest and pays the final hand. */
export async function drawVideoPoker(userId: string, roundId: string, held: number[]) {
  const holds = [...new Set(held)].sort((a, b) => a - b);
  if (holds.length !== held.length || holds.some((i) => !Number.isInteger(i) || i < 0 || i > 4)) {
    throw new ApiError(400, "Held cards must be distinct positions from 0 to 4.");
  }

  const row = await prisma.$transaction(async (tx) => {
    const round = await tx.videoPokerRound.findUnique({ where: { id: roundId } });
    if (!round) throw new ApiError(404, "Round not found.");
    if (round.userId !== userId) throw new ApiError(403, "Not your round.");
    if (round.status !== "ACTIVE") throw new ApiError(400, "This hand has already been drawn.");

    const hand = drawHand(round.hand, holds, round.cards.slice(5));
    const result: Hand = evaluate(hand);
    const multiplier = PAYTABLE[result];
    const payout = Math.min(floor2(Number(round.stake) * multiplier), env.games.maxPayout);

    // Only one request can move a round on from a given version.
    const moved = await tx.videoPokerRound.updateMany({
      where: { id: round.id, status: "ACTIVE", version: round.version },
      data: { hand, held: holds, result, status: payout > 0 ? "WON" : "LOST", multiplier, payout, version: { increment: 1 } },
    });
    if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
    if (payout > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }
    return tx.videoPokerRound.findUniqueOrThrow({ where: { id: round.id } });
  });
  return toPublicRound(row);
}

/** The player's dealt-but-not-drawn hand, if any. */
export async function getActiveVideoPokerRound(userId: string) {
  const row = await prisma.videoPokerRound.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicRound(row) : null;
}

export async function getMyVideoPokerHistory(userId: string, limit = 30) {
  const rows = await prisma.videoPokerRound.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicRound);
}
