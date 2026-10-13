import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { Choice, HiloState, MAX_SKIPS, chanceOf, choicesFor, current, play, start } from "./hiloEngine";

export const ACTIONS = ["HIGHER", "LOWER", "SAME", "SKIP", "CASHOUT"] as const;
export type HiloAction = (typeof ACTIONS)[number];
const ROUND_CHANGED = "This round changed in the meantime — please refresh.";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function floor4(n: number): number {
  return Math.floor(n * 10000 + 1e-9) / 10000;
}

/**
 * Card i of a round: HMAC-SHA256(serverSeed, "<clientSeed>:hilo:<nonce>:<i>")
 * read as a float, times 52. Cards are drawn in stream order, so the stored
 * steps replay card by card.
 */
export function cardStream(serverSeed: string, clientSeed: string, nonce: number) {
  return (i: number) => Math.floor(fairGameFloat(serverSeed, clientSeed, `hilo:${nonce}`, i) * 52);
}

/** Cash-out multiplier for a product of 1/chance (the house edge taken once). */
export function multiplierOf(raw: number): number {
  return floor4(env.games.rtp * raw);
}

function cashValue(stake: number, raw: number): number {
  return Math.min(floor2(stake * env.games.rtp * raw), env.games.maxPayout);
}

type RoundRow = Prisma.HiloRoundGetPayload<Record<string, never>>;

/** Every drawn card is public; the server seed stays hidden until it is rotated. */
function toPublicRound(row: RoundRow) {
  const { serverSeed: _hidden, state: rawState, version: _version, ...rest } = row;
  const state = rawState as unknown as HiloState;
  const stake = Number(row.stake);
  const live = row.status === "ACTIVE";
  const card = current(state);
  return {
    ...rest,
    steps: state.steps,
    wins: state.wins,
    skipsLeft: MAX_SKIPS - state.skips,
    currentMultiplier: state.wins > 0 ? multiplierOf(state.raw) : 0,
    cashOut: live && state.wins > 0 ? cashValue(stake, state.raw) : 0,
    options: live
      ? choicesFor(card).map((choice) => {
          const chance = chanceOf(card, choice);
          return { choice, chance: round2(chance * 100), multiplier: multiplierOf(state.raw / chance) };
        })
      : [],
  };
}

export function getHiloConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    maxSkips: MAX_SKIPS,
    rtpPercent: round2(env.games.rtp * 100),
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

/** Starts a round: takes the bet and turns the first card. */
export async function startHilo(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const state = start(cardStream(serverSeed, clientSeed, nonce));

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two starts can't both pass the one-round-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.hiloRound.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current round before starting a new one.");
    await takeStake(tx, userId, stake);
    return tx.hiloRound.create({
      data: { userId, stake, status: "ACTIVE", state: state as unknown as Prisma.InputJsonValue, multiplier: 0, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicRound(row);
}

/** A guess, a skip or a cash-out on the player's open round. */
export async function actHilo(userId: string, roundId: string, action: HiloAction) {
  if (!ACTIONS.includes(action)) throw new ApiError(400, "Unknown action.");

  const row = await prisma.$transaction(async (tx) => {
    const round = await tx.hiloRound.findUnique({ where: { id: roundId } });
    if (!round) throw new ApiError(404, "Round not found.");
    if (round.userId !== userId) throw new ApiError(403, "Not your round.");
    if (round.status !== "ACTIVE") throw new ApiError(400, "This round has already ended.");

    const state = round.state as unknown as HiloState;
    const stake = Number(round.stake);
    let status = "ACTIVE";
    let payout = 0;

    if (action === "CASHOUT") {
      if (state.wins === 0) throw new ApiError(400, "Make at least one right guess before cashing out.");
      status = "WON";
      payout = cashValue(stake, state.raw);
    } else {
      if (action === "SKIP" && state.skips >= MAX_SKIPS) throw new ApiError(400, "No skips left this round.");
      if (action !== "SKIP" && !choicesFor(current(state)).includes(action as Choice)) {
        throw new ApiError(400, "That choice isn't offered on this card.");
      }
      const right = play(state, action as Choice | "SKIP", cardStream(round.serverSeed, round.clientSeed, round.nonce));
      if (!right) status = "LOST";
      // Reaching the max payout cashes the round out automatically.
      else if (action !== "SKIP" && cashValue(stake, state.raw) >= env.games.maxPayout) {
        status = "WON";
        payout = env.games.maxPayout;
      }
    }

    // Only one request can move a round on from a given version.
    const moved = await tx.hiloRound.updateMany({
      where: { id: round.id, status: "ACTIVE", version: round.version },
      data: {
        state: state as unknown as Prisma.InputJsonValue,
        status,
        multiplier: status === "WON" ? multiplierOf(state.raw) : status === "LOST" ? 0 : undefined,
        payout,
        version: { increment: 1 },
      },
    });
    if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
    if (payout > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }
    return tx.hiloRound.findUniqueOrThrow({ where: { id: round.id } });
  });
  return toPublicRound(row);
}

/** The player's unfinished round, if any. */
export async function getActiveHiloRound(userId: string) {
  const row = await prisma.hiloRound.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicRound(row) : null;
}

export async function getMyHiloHistory(userId: string, limit = 30) {
  const rows = await prisma.hiloRound.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicRound);
}
