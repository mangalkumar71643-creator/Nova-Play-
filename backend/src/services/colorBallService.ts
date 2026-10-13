import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Color Ball: a glass drum holds 20 numbered balls — 9 red, 7 blue, 3 green
 * and 1 gold. The player backs a colour, one ball is drawn (ball floor(r * 20)
 * with r from the player's provably-fair seeds) and a matching colour pays
 * floor2(0.88 / its chance), so every colour returns 88% or a hair under (a
 * 12% house edge; rounding down never favours the player).
 */

export type BallColor = "RED" | "BLUE" | "GREEN" | "GOLD";
export const COLORS: BallColor[] = ["RED", "BLUE", "GREEN", "GOLD"];
export const TARGET_RTP = 0.88;
export const BALLS = 20;

/** Ball n (1-20) is the colour at index n-1: balls 1-9 red, 10-16 blue, 17-19 green, 20 gold. */
export const BALL_COLORS: BallColor[] = [
  ...Array<BallColor>(9).fill("RED"),
  ...Array<BallColor>(7).fill("BLUE"),
  ...Array<BallColor>(3).fill("GREEN"),
  "GOLD",
];

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

export const COUNTS = Object.fromEntries(COLORS.map((c) => [c, BALL_COLORS.filter((b) => b === c).length])) as Record<BallColor, number>;

/** What a winning colour pays, stake included. */
export const PAYS = Object.fromEntries(COLORS.map((c) => [c, floor2((TARGET_RTP * BALLS) / COUNTS[c])])) as Record<BallColor, number>;

/** Exact return of backing a colour. */
export function colorRtp(color: BallColor): number {
  return (COUNTS[color] * PAYS[color]) / BALLS;
}

/** The ball drawn (1-20). */
export function drawBall(serverSeed: string, clientSeed: string, nonce: number): number {
  return Math.floor(fairGameFloat(serverSeed, clientSeed, "colorball", nonce) * BALLS) + 1;
}

type BetRow = Prisma.ColorBallBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: BetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getColorBallConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    balls: BALL_COLORS,
    colors: COLORS.map((color) => ({ color, balls: COUNTS[color], multiplier: PAYS[color], rtpPercent: Math.round(colorRtp(color) * 10000) / 100 })),
  };
}

/** One draw: debits the stake, draws the ball from the player's seeds and pays a matching colour, all in one transaction. */
export async function playColorBall(userId: string, stake: number, pick: BallColor) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!COLORS.includes(pick)) throw new ApiError(400, "Pick RED, BLUE, GREEN or GOLD.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const ball = drawBall(serverSeed, clientSeed, nonce);
  const color = BALL_COLORS[ball - 1];
  const multiplier = color === pick ? PAYS[pick] : 0;
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel draws can't overdraw the wallet.
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

    return tx.colorBallBet.create({ data: { userId, stake, pick, ball, color, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicBet(bet);
}

export async function getMyColorBallHistory(userId: string, limit = 30) {
  const bets = await prisma.colorBallBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
