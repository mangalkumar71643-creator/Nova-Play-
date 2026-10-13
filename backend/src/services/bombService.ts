import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Bomb Squad: cut the wires of a bomb one at a time without setting it off.
 *
 * The bomb has 8 wires and `live` of them (2, 3 or 5) set it off. The live
 * wires are a uniformly random set drawn from the round's seeds when the round
 * starts, so every wire is equally likely to be live. Each safe cut raises the
 * multiplier; cut a live wire and the stake is lost. Cash out after any safe
 * cut; cutting the last safe wire defuses the bomb and settles the round.
 */

export const WIRES = 8;
export const LIVE_OPTIONS = [2, 3, 5] as const;
/** 12% house edge: the expected return of every cash-out point is 88%. */
export const RTP = 0.88;

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Chance of surviving `cuts` cuts with `live` live wires: C(8 - live, cuts) / C(8, cuts). */
export function surviveChance(live: number, cuts: number): number {
  let p = 1;
  for (let i = 0; i < cuts; i++) p *= (WIRES - live - i) / (WIRES - i);
  return p;
}

/** Multiplier after `cuts` safe cuts: RTP / P(survive), rounded down to the cent. */
export function multiplierAt(live: number, cuts: number): number {
  if (cuts <= 0) return 1;
  return floor2(RTP / surviveChance(live, cuts));
}

/** The live wires of a round: a seeded Fisher-Yates shuffle of the 8 wires, keeping the first `live`. */
export function liveWiresFor(serverSeed: string, clientSeed: string, nonce: number, live: number): number[] {
  const wires = Array.from({ length: WIRES }, (_, i) => i);
  for (let i = WIRES - 1; i > 0; i--) {
    const r = fairGameFloat(serverSeed, clientSeed, "bomb", nonce * 1000 + i);
    const j = Math.floor(r * (i + 1));
    [wires[i], wires[j]] = [wires[j], wires[i]];
  }
  return wires.slice(0, live).sort((a, b) => a - b);
}

export function getBombConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: RTP * 100,
    wires: WIRES,
    modes: LIVE_OPTIONS.map((live) => ({ live, multipliers: Array.from({ length: WIRES - live + 1 }, (_, k) => multiplierAt(live, k)) })),
  };
}

type BombRoundRow = Awaited<ReturnType<typeof prisma.bombRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed, so it never leaves the
 * server here. The live wires are shown only once the round is over. */
function toPublicRound(round: BombRoundRow) {
  const { serverSeed, ...rest } = round;
  return round.status === "PENDING" ? rest : { ...rest, liveWires: liveWiresFor(serverSeed, round.clientSeed, round.nonce, round.live) };
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

export async function startBombRound(userId: string, stake: number, live: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!(LIVE_OPTIONS as readonly number[]).includes(live)) throw new ApiError(400, "Pick 2, 3 or 5 live wires.");

  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.bombRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current bomb before starting a new one.");

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so two simultaneous starts can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    if (Number(wallet.lockedBonus) > 0) {
      const newProgress = Number(wallet.wageringProgress) + stake;
      await tx.wallet.update({
        where: { userId },
        data:
          newProgress >= Number(wallet.wageringRequired)
            ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 }
            : { wageringProgress: { increment: stake } },
      });
    }

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    return tx.bombRound.create({ data: { userId, live, stake, serverSeed, serverSeedHash, clientSeed, nonce } });
  });
  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.bombRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This bomb has already been dealt with.");
  return round;
}

/** Updates the round only if it is still exactly as read (PENDING, same number
 * of safe cuts), so parallel cuts or cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: BombRoundRow, data: Prisma.BombRoundUpdateManyMutationInput) {
  const claimed = await tx.bombRound.updateMany({ where: { id: round.id, status: "PENDING", safeCuts: round.safeCuts }, data });
  if (claimed.count === 0) throw new ApiError(409, "This round was updated by another request. Please refresh and try again.");
  return tx.bombRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function cutWire(userId: string, roundId: string, wire: number) {
  if (!Number.isInteger(wire) || wire < 0 || wire >= WIRES) throw new ApiError(400, "Pick one of the wires.");
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const cuts = (round.cuts as number[] | null) ?? [];
    if (cuts.includes(wire)) throw new ApiError(400, "That wire is already cut.");
    const liveWires = liveWiresFor(round.serverSeed, round.clientSeed, round.nonce, round.live);
    const boom = liveWires.includes(wire);
    const nextCuts = [...cuts, wire];

    if (boom) {
      const updated = await claimRound(tx, round, { cuts: nextCuts, status: "LOST", multiplier: 0, payout: 0, settledAt: new Date() });
      return { round: toPublicRound(updated), boom: true };
    }

    const safeCuts = round.safeCuts + 1;
    const multiplier = multiplierAt(round.live, safeCuts);
    // Every safe wire cut (defused), or the payout cap reached: nothing more to gain, so it settles as a win.
    const defused = safeCuts >= WIRES - round.live;
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (defused || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, { cuts: nextCuts, safeCuts, multiplier, payout, status: "WON", settledAt: new Date() });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), boom: false };
    }

    const updated = await claimRound(tx, round, { cuts: nextCuts, safeCuts, multiplier });
    return { round: toPublicRound(updated), boom: false };
  });
}

export async function cashOutBomb(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.safeCuts <= 0) throw new ApiError(400, "Cut at least one wire before cashing out.");
    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentBombRound(userId: string) {
  const round = await prisma.bombRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyBombHistory(userId: string, limit = 30) {
  const rounds = await prisma.bombRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
