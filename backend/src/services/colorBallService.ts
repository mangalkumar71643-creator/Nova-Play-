import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { INSTANT_HOUSE_CHANCE, isInstantHouse } from "./lotteryHouse";

/**
 * Color Ball: a glass drum holds 20 numbered balls — 9 red, 7 blue, 3 green
 * and 1 gold. The player backs a colour, one ball is drawn (ball floor(r * 20)
 * with r from the player's provably-fair seeds) and a matching colour pays.
 *
 * One draw in five is a ⭐ House result (lotteryHouse.ts, drawn from the same
 * seeds): the app shows a ⭐ ball dropping (its drum holds 5 ⭐ balls beside
 * the 20, so 5 in 25 is the real chance) and the bet loses whatever ball was
 * drawn. Every other draw pays fair odds, floor2(20 / the colour's balls):
 * red 2.22x, blue 2.85x, green 6.66x, gold 20x. With the House draws each
 * colour returns 80% or a hair under (79.8%-80%: a 20% house edge; rounding
 * down never favours the player).
 */

export type BallColor = "RED" | "BLUE" | "GREEN" | "GOLD";
export const COLORS: BallColor[] = ["RED", "BLUE", "GREEN", "GOLD"];
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

/** What a winning colour pays, stake included: fair odds on a draw that is not House. */
export const PAYS = Object.fromEntries(COLORS.map((c) => [c, floor2(BALLS / COUNTS[c])])) as Record<BallColor, number>;

/** Chance a colour wins: the draw is not House and the ball is that colour. */
export function colorChance(color: BallColor): number {
  return ((1 - INSTANT_HOUSE_CHANCE) * COUNTS[color]) / BALLS;
}

/** Exact return of backing a colour, House draws included. */
export function colorRtp(color: BallColor): number {
  return colorChance(color) * PAYS[color];
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
    // The colour that returns least (each colour's own return is in `colors`).
    rtpPercent: Math.min(...COLORS.map((color) => Math.round(colorRtp(color) * 10000) / 100)),
    houseChancePercent: Math.round(INSTANT_HOUSE_CHANCE * 10000) / 100,
    // `chance` is the real chance a colour wins (House draws lose), so `rtpPercent` = chance x multiplier.
    colors: COLORS.map((color) => ({ color, balls: COUNTS[color], multiplier: PAYS[color], chance: colorChance(color), rtpPercent: Math.round(colorRtp(color) * 10000) / 100 })),
  };
}

/** One draw: debits the stake, draws the ball (and whether it is House) from the player's seeds and pays a matching colour on a draw that is not House, all in one transaction. */
export async function playColorBall(userId: string, stake: number, pick: BallColor) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!COLORS.includes(pick)) throw new ApiError(400, "Pick RED, BLUE, GREEN or GOLD.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const ball = drawBall(serverSeed, clientSeed, nonce);
  const color = BALL_COLORS[ball - 1];
  // Fixed (and stored) with the draw, from the same seeds. The ball is still
  // drawn and kept, so the seeds can be checked against it.
  const house = isInstantHouse(serverSeed, clientSeed, "color-ball", nonce);
  const multiplier = !house && color === pick ? PAYS[pick] : 0;
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

    return tx.colorBallBet.create({ data: { userId, stake, pick, ball, color, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce } });
  });

  return toPublicBet(bet);
}

export async function getMyColorBallHistory(userId: string, limit = 30) {
  const bets = await prisma.colorBallBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
