import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Pump: the player pumps a balloon one pump at a time and cashes out before it
 * pops. Each round hides `pops` popping pumps among SLOTS; the balloon pops at
 * the first of them. The chance of surviving n pumps is
 * C(SLOTS - pops, n) / C(SLOTS, n), and the multiplier after n pumps is
 * rtp / that chance: the house edge is taken once, so cashing out after any
 * number of pumps returns exactly the rtp (before rounding down and the
 * payout cap). Pumping through every safe slot cashes out automatically.
 */
export const SLOTS = 25;
export const DIFFICULTIES = {
  EASY: { pops: 1 },
  MEDIUM: { pops: 3 },
  HARD: { pops: 5 },
  EXPERT: { pops: 10 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[];
const ROUND_CHANGED = "This round changed in the meantime — please refresh.";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Rounds down after trimming float noise to 12 significant digits, so an exact
// value such as 0.9 x 53130 = 47817 isn't shown as 47816.9999.
function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function floor4(n: number): number {
  return Math.floor(Number((n * 10000).toPrecision(12))) / 10000;
}

export function maxPumps(difficulty: Difficulty): number {
  return SLOTS - DIFFICULTIES[difficulty].pops;
}

/** Chance of surviving `pumps` pumps. */
export function surviveChance(difficulty: Difficulty, pumps: number): number {
  const safe = maxPumps(difficulty);
  let p = 1;
  for (let i = 0; i < pumps; i++) p *= (safe - i) / (SLOTS - i);
  return p;
}

export function multiplierAt(difficulty: Difficulty, pumps: number): number {
  return pumps <= 0 ? 0 : floor4(env.games.rtp / surviveChance(difficulty, pumps));
}

function cashValue(stake: number, difficulty: Difficulty, pumps: number): number {
  return Math.min(floor2((stake * env.games.rtp) / surviveChance(difficulty, pumps)), env.games.maxPayout);
}

/**
 * The pump the balloon pops on (1-based): `pops` distinct slots are taken with
 * a partial Fisher-Yates shuffle driven by
 * HMAC(serverSeed, "<clientSeed>:pump:<nonce>:<i>"), and the earliest one pops.
 */
export function popAtFor(serverSeed: string, clientSeed: string, nonce: number, difficulty: Difficulty): number {
  const { pops } = DIFFICULTIES[difficulty];
  const pool = Array.from({ length: SLOTS }, (_, i) => i);
  for (let i = 0; i < pops; i++) {
    const j = i + Math.floor(fairGameFloat(serverSeed, clientSeed, `pump:${nonce}`, i) * (SLOTS - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Math.min(...pool.slice(0, pops)) + 1;
}

type RoundRow = Prisma.PumpRoundGetPayload<Record<string, never>>;

/** Where the balloon pops is only shown once the round is over; the server seed never is. */
function toPublicRound(row: RoundRow) {
  const { serverSeed: _hidden, popAt, version: _version, ...rest } = row;
  const difficulty = row.difficulty as Difficulty;
  const live = row.status === "ACTIVE";
  const top = maxPumps(difficulty);
  return {
    ...rest,
    popAt: live ? null : popAt,
    maxPumps: top,
    currentMultiplier: multiplierAt(difficulty, row.pumps),
    nextMultiplier: live && row.pumps < top ? multiplierAt(difficulty, row.pumps + 1) : 0,
    // Chance the next pump doesn't pop, in percent.
    nextChance: live && row.pumps < top ? round2(((top - row.pumps) / (SLOTS - row.pumps)) * 100) : 0,
    cashOut: live && row.pumps > 0 ? cashValue(Number(row.stake), difficulty, row.pumps) : 0,
  };
}

export function getPumpConfig() {
  const multipliers: Record<string, number[]> = {};
  const difficulties: Record<string, { pops: number; maxPumps: number }> = {};
  for (const d of DIFFICULTY_NAMES) {
    difficulties[d] = { pops: DIFFICULTIES[d].pops, maxPumps: maxPumps(d) };
    multipliers[d] = Array.from({ length: maxPumps(d) }, (_, i) => multiplierAt(d, i + 1));
  }
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    slots: SLOTS,
    difficulties,
    // multipliers[difficulty][pumps - 1]
    multipliers,
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** Starts a round: takes the bet and fixes where the balloon pops from the player's seeds. */
export async function startPump(userId: string, stake: number, difficulty: Difficulty) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!DIFFICULTY_NAMES.includes(difficulty)) throw new ApiError(400, `Difficulty must be one of ${DIFFICULTY_NAMES.join(", ")}.`);

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const popAt = popAtFor(serverSeed, clientSeed, nonce, difficulty);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two starts can't both pass the one-round-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.pumpRound.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current balloon before starting a new one.");

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
    return tx.pumpRound.create({
      data: { userId, stake, difficulty, status: "ACTIVE", pumps: 0, popAt, multiplier: 0, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicRound(row);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.pumpRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "ACTIVE") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** Moves a round on from the version it was read at; only one request can win. */
async function commit(tx: Prisma.TransactionClient, round: RoundRow, data: Prisma.PumpRoundUpdateManyMutationInput) {
  const moved = await tx.pumpRound.updateMany({ where: { id: round.id, status: "ACTIVE", version: round.version }, data: { ...data, version: { increment: 1 } } });
  if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
  const payout = Number(data.payout ?? 0);
  if (payout > 0) {
    await tx.wallet.update({ where: { userId: round.userId }, data: { balance: { increment: payout } } });
    await tx.transaction.create({ data: { userId: round.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
  }
  return tx.pumpRound.findUniqueOrThrow({ where: { id: round.id } });
}

/** One pump. */
export async function pumpBalloon(userId: string, roundId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const difficulty = round.difficulty as Difficulty;
    const pumps = round.pumps + 1;
    if (pumps >= round.popAt) return commit(tx, round, { pumps, status: "LOST", multiplier: 0, payout: 0 });
    const stake = Number(round.stake);
    // The last safe pump, or the max payout, cashes out automatically.
    if (pumps >= maxPumps(difficulty) || cashValue(stake, difficulty, pumps) >= env.games.maxPayout) {
      return commit(tx, round, { pumps, status: "WON", multiplier: multiplierAt(difficulty, pumps), payout: cashValue(stake, difficulty, pumps) });
    }
    return commit(tx, round, { pumps });
  });
  return toPublicRound(row);
}

export async function cashOutPump(userId: string, roundId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.pumps === 0) throw new ApiError(400, "Pump at least once before cashing out.");
    const difficulty = round.difficulty as Difficulty;
    return commit(tx, round, { status: "WON", multiplier: multiplierAt(difficulty, round.pumps), payout: cashValue(Number(round.stake), difficulty, round.pumps) });
  });
  return toPublicRound(row);
}

export async function getActivePumpRound(userId: string) {
  const row = await prisma.pumpRound.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicRound(row) : null;
}

export async function getMyPumpHistory(userId: string, limit = 30) {
  const rows = await prisma.pumpRound.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicRound);
}
