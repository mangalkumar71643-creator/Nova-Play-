import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

export const MIN_ROWS = 8;
export const MAX_ROWS = 16;
export const RISKS = ["LOW", "MEDIUM", "HIGH"] as const;
export type PlinkoRisk = (typeof RISKS)[number];

/**
 * Shape of each risk's payout table: the centre slot pays `floor` and the
 * payout grows towards the edges as (distance from centre)^curve. The
 * curves are tuned so 16 rows tops out around 16x / 110x / 1000x.
 */
const RISK_SHAPES: Record<PlinkoRisk, { floor: number; curve: number }> = {
  LOW: { floor: 0.5, curve: 2.94 },
  MEDIUM: { floor: 0.3, curve: 5.08 },
  HIGH: { floor: 0.2, curve: 9.47 },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Rounded down to a readable precision (2 decimals under 10x, 1 under
 * 100x, whole numbers above), so rounding only ever lowers the RTP. */
function displayFloor(v: number): number {
  if (v >= 100) return Math.floor(v);
  if (v >= 10) return Math.floor(v * 10 + 1e-9) / 10;
  return Math.floor(v * 100 + 1e-9) / 100;
}

/**
 * Multiplier for every landing slot (0..rows). Slot k is reached by k
 * right-bounces out of `rows`, probability C(rows, k) / 2^rows. With the
 * shape m(x) = floor + (edge - floor) * x^curve, x = |k - rows/2| / (rows/2),
 * the edge value is solved so sum(P(k) * m(k)) = rtp exactly, then each
 * value is rounded down.
 */
function buildTable(rows: number, risk: PlinkoRisk): number[] {
  const { floor, curve } = RISK_SHAPES[risk];
  const half = rows / 2;
  const probs = Array.from({ length: rows + 1 }, (_, k) => binomial(rows, k) / 2 ** rows);
  const xs = Array.from({ length: rows + 1 }, (_, k) => Math.abs(k - half) / half);
  const s = probs.reduce((sum, p, k) => sum + p * xs[k] ** curve, 0);
  const edge = (env.games.rtp - floor * (1 - s)) / s;
  return xs.map((x) => displayFloor(floor + (edge - floor) * x ** curve));
}

const TABLES: Record<string, number[]> = {};
for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
  for (const risk of RISKS) TABLES[`${rows}:${risk}`] = buildTable(rows, risk);
}

export function multipliersFor(rows: number, risk: PlinkoRisk): number[] {
  return TABLES[`${rows}:${risk}`];
}

/** One HMAC draw per row: < 0.5 bounces left (0), otherwise right (1).
 * nonce * 1000 + row keeps each drop's draws in their own slice of the
 * nonce space, like Mines and Chicken Road. */
export function pathFor(serverSeed: string, clientSeed: string, nonce: number, rows: number): number[] {
  return Array.from({ length: rows }, (_, i) => (fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + i) < 0.5 ? 0 : 1));
}

type PlinkoBetRow = Prisma.PlinkoBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: PlinkoBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getPlinkoConfig() {
  const tables: Record<string, Record<string, number[]>> = {};
  for (const risk of RISKS) {
    tables[risk] = {};
    for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) tables[risk][rows] = multipliersFor(rows, risk);
  }
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    minRows: MIN_ROWS,
    maxRows: MAX_ROWS,
    risks: RISKS,
    rtpPercent: round2(env.games.rtp * 100),
    multipliers: tables,
  };
}

/** Drops one ball: debits the stake, decides the path from the player's
 * provably-fair seeds and pays the landing slot, all in one transaction. */
export async function dropPlinkoBall(userId: string, stake: number, rows: number, risk: PlinkoRisk) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new ApiError(400, `Rows must be a whole number between ${MIN_ROWS} and ${MAX_ROWS}.`);
  }
  if (!RISKS.includes(risk)) throw new ApiError(400, "Risk must be LOW, MEDIUM or HIGH.");

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const path = pathFor(serverSeed, clientSeed, nonce, rows);
  const slot = path.reduce((sum, step) => sum + step, 0);
  const multiplier = multipliersFor(rows, risk)[slot];
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel drops can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
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
    if (payout > 0) {
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }

    return tx.plinkoBet.create({
      data: { userId, stake, rows, risk, path, slot, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyPlinkoHistory(userId: string, limit = 30) {
  const bets = await prisma.plinkoBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
