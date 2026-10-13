import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Dragon Tower: a tower of ROWS levels. Each level has `tiles` tiles, `eggs`
 * of which hide a dragon egg (safe) and the rest a skull. The player picks
 * one tile per level from the bottom up; an egg climbs a level, a skull ends
 * the round. They can cash out after any cleared level, and reaching the top
 * cashes out automatically.
 *
 * After k levels the multiplier is rtp x (tiles / eggs)^k: the chance of
 * clearing k levels is (eggs / tiles)^k, and the house edge is taken once,
 * so cashing out at any level returns exactly the rtp (before rounding down
 * and the payout cap).
 */
export const ROWS = 9;
export const DIFFICULTIES = {
  EASY: { tiles: 4, eggs: 3 },
  MEDIUM: { tiles: 3, eggs: 2 },
  HARD: { tiles: 2, eggs: 1 },
  EXPERT: { tiles: 3, eggs: 1 },
  MASTER: { tiles: 4, eggs: 1 },
} as const;
export type Difficulty = keyof typeof DIFFICULTIES;
export const DIFFICULTY_NAMES = Object.keys(DIFFICULTIES) as Difficulty[];
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

/** Product of 1/chance after `level` cleared levels. */
function rawAt(difficulty: Difficulty, level: number): number {
  const { tiles, eggs } = DIFFICULTIES[difficulty];
  return (tiles / eggs) ** level;
}

export function multiplierAt(difficulty: Difficulty, level: number): number {
  return level <= 0 ? 0 : floor4(env.games.rtp * rawAt(difficulty, level));
}

function cashValue(stake: number, difficulty: Difficulty, level: number): number {
  return Math.min(floor2(stake * env.games.rtp * rawAt(difficulty, level)), env.games.maxPayout);
}

/**
 * The egg tiles on every level, fixed when the round starts: level r takes
 * `eggs` tiles with a partial Fisher-Yates shuffle driven by
 * HMAC(serverSeed, "<clientSeed>:tower:<nonce>:<r * 10 + i>").
 */
export function layoutFor(serverSeed: string, clientSeed: string, nonce: number, difficulty: Difficulty): number[][] {
  const { tiles, eggs } = DIFFICULTIES[difficulty];
  return Array.from({ length: ROWS }, (_, r) => {
    const pool = Array.from({ length: tiles }, (_, i) => i);
    for (let i = 0; i < eggs; i++) {
      const j = i + Math.floor(fairGameFloat(serverSeed, clientSeed, `tower:${nonce}`, r * 10 + i) * (tiles - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, eggs).sort((a, b) => a - b);
  });
}

type RoundRow = Prisma.DragonTowerRoundGetPayload<Record<string, never>>;

/** The egg layout is only shown once the round is over; the server seed never is. */
function toPublicRound(row: RoundRow) {
  const { serverSeed: _hidden, layout, version: _version, ...rest } = row;
  const difficulty = row.difficulty as Difficulty;
  const live = row.status === "ACTIVE";
  return {
    ...rest,
    layout: live ? null : (layout as number[][]),
    tiles: DIFFICULTIES[difficulty].tiles,
    eggs: DIFFICULTIES[difficulty].eggs,
    currentMultiplier: multiplierAt(difficulty, row.level),
    nextMultiplier: live && row.level < ROWS ? multiplierAt(difficulty, row.level + 1) : 0,
    cashOut: live && row.level > 0 ? cashValue(Number(row.stake), difficulty, row.level) : 0,
  };
}

export function getDragonTowerConfig() {
  const multipliers: Record<string, number[]> = {};
  for (const d of DIFFICULTY_NAMES) multipliers[d] = Array.from({ length: ROWS }, (_, i) => multiplierAt(d, i + 1));
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rows: ROWS,
    difficulties: DIFFICULTIES,
    // multipliers[difficulty][level - 1]
    multipliers,
    rtpPercent: round2(env.games.rtp * 100),
  };
}

/** Starts a climb: takes the bet and fixes the egg layout from the player's seeds. */
export async function startDragonTower(userId: string, stake: number, difficulty: Difficulty) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!DIFFICULTY_NAMES.includes(difficulty)) throw new ApiError(400, `Difficulty must be one of ${DIFFICULTY_NAMES.join(", ")}.`);

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const layout = layoutFor(serverSeed, clientSeed, nonce, difficulty);

  const row = await prisma.$transaction(async (tx) => {
    // Lock the wallet so two starts can't both pass the one-round-at-a-time check.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const open = await tx.dragonTowerRound.findFirst({ where: { userId, status: "ACTIVE" }, select: { id: true } });
    if (open) throw new ApiError(400, "Finish your current climb before starting a new one.");

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
    return tx.dragonTowerRound.create({
      data: { userId, stake, difficulty, status: "ACTIVE", level: 0, picks: [], layout, multiplier: 0, payout: 0, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });
  return toPublicRound(row);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.dragonTowerRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "ACTIVE") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** Moves a round on from the version it was read at; only one request can win. */
async function commit(tx: Prisma.TransactionClient, round: RoundRow, data: Prisma.DragonTowerRoundUpdateManyMutationInput) {
  const moved = await tx.dragonTowerRound.updateMany({ where: { id: round.id, status: "ACTIVE", version: round.version }, data: { ...data, version: { increment: 1 } } });
  if (moved.count === 0) throw new ApiError(409, ROUND_CHANGED);
  const payout = Number(data.payout ?? 0);
  if (payout > 0) {
    await tx.wallet.update({ where: { userId: round.userId }, data: { balance: { increment: payout } } });
    await tx.transaction.create({ data: { userId: round.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
  }
  return tx.dragonTowerRound.findUniqueOrThrow({ where: { id: round.id } });
}

/** Picks a tile on the current level. */
export async function pickDragonTower(userId: string, roundId: string, tile: number) {
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const difficulty = round.difficulty as Difficulty;
    const { tiles } = DIFFICULTIES[difficulty];
    if (!Number.isInteger(tile) || tile < 0 || tile >= tiles) throw new ApiError(400, `Tile must be between 0 and ${tiles - 1}.`);
    const layout = round.layout as number[][];
    const picks = [...round.picks, tile];
    if (!layout[round.level].includes(tile)) {
      return commit(tx, round, { picks, status: "LOST", multiplier: 0, payout: 0 });
    }
    const level = round.level + 1;
    const stake = Number(round.stake);
    // The top of the tower, or the max payout, cashes out automatically.
    if (level >= ROWS || cashValue(stake, difficulty, level) >= env.games.maxPayout) {
      return commit(tx, round, { picks, level, status: "WON", multiplier: multiplierAt(difficulty, level), payout: cashValue(stake, difficulty, level) });
    }
    return commit(tx, round, { picks, level });
  });
  return toPublicRound(row);
}

export async function cashOutDragonTower(userId: string, roundId: string) {
  const row = await prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.level === 0) throw new ApiError(400, "Clear at least one level before cashing out.");
    const difficulty = round.difficulty as Difficulty;
    return commit(tx, round, { status: "WON", multiplier: multiplierAt(difficulty, round.level), payout: cashValue(Number(round.stake), difficulty, round.level) });
  });
  return toPublicRound(row);
}

export async function getActiveDragonTowerRound(userId: string) {
  const row = await prisma.dragonTowerRound.findFirst({ where: { userId, status: "ACTIVE" } });
  return row ? toPublicRound(row) : null;
}

export async function getMyDragonTowerHistory(userId: string, limit = 30) {
  const rows = await prisma.dragonTowerRound.findMany({ where: { userId, status: { not: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicRound);
}
