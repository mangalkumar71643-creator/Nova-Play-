import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Red Button: a retro control panel with four switches. The player turns one switch on (x2, x10, x100 or x250), sets the bet
 * and pushes the big red button. The push wins stake x the switch's multiplier when the fair draw lands under
 * rtp / multiplier, so every switch returns exactly rtp in the long run (the bigger the multiplier, the rarer the win);
 * a push that does not win pays nothing. The draw comes from the player's own provably-fair seeds, like Limbo.
 */
export const SWITCHES = [2, 10, 100, 250] as const;
export type SwitchMultiplier = (typeof SWITCHES)[number];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/** Chance that a push on this switch wins. */
export function winChance(multiplier: number): number {
  return env.games.rtp / multiplier;
}

/** The push's draw in [0, 1) for these seeds. */
export function drawFor(serverSeed: string, clientSeed: string, nonce: number): number {
  return fairGameFloat(serverSeed, clientSeed, "redbutton", nonce);
}

/** Whether this draw wins on this switch. */
export function isWin(draw: number, multiplier: number): boolean {
  return draw < winChance(multiplier);
}

/** The highest bet this switch allows: its win can never be more than the max payout. */
export function maxStakeFor(multiplier: number): number {
  return Math.min(env.games.maxStake, Math.floor(env.games.maxPayout / multiplier));
}

type PlayRow = Prisma.RedButtonPlayGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicPlay(row: PlayRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getRedButtonConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    switches: SWITCHES.map((multiplier) => ({
      multiplier,
      chancePercent: round2(winChance(multiplier) * 100),
      maxStake: maxStakeFor(multiplier),
    })),
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** One push: debits the stake, draws from the player's provably-fair seeds and pays stake x multiplier on a win, in one transaction. */
export async function playRedButton(userId: string, stake: number, multiplier: number) {
  if (!(SWITCHES as readonly number[]).includes(multiplier)) {
    throw new ApiError(400, `Switch must be one of ${SWITCHES.map((m) => `x${m}`).join(", ")}.`);
  }
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (floor2(stake * multiplier) > env.games.maxPayout) {
    throw new ApiError(400, `A single push can win at most ${env.games.maxPayout}. Lower the bet or pick a smaller switch.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const draw = drawFor(serverSeed, clientSeed, nonce);
  const won = isWin(draw, multiplier);
  const payout = won ? floor2(stake * multiplier) : 0;

  const play = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel pushes can't overdraw the wallet.
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

    return tx.redButtonPlay.create({
      data: { userId, stake, multiplier, draw, won, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicPlay(play);
}

export async function getMyRedButtonHistory(userId: string, limit = 30) {
  const rows = await prisma.redButtonPlay.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicPlay);
}
