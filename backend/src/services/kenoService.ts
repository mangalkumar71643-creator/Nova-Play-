import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Keno: the player picks 1-10 numbers from 1-40, ten numbers are drawn
 * without replacement, and the bet pays the multiplier for the number of
 * picks that were drawn ("hits"), from the table for the chosen risk.
 */
export const BOARD = 40;
export const DRAWN = 10;
export const MAX_PICKS = 10;
export const RISKS = ["CLASSIC", "LOW", "MEDIUM", "HIGH"] as const;
export type KenoRisk = (typeof RISKS)[number];

/**
 * Shape of each table (index = hits), the common online layout: Classic pays
 * small wins often, Low/Medium move value to bigger hits, High pays only on
 * the top hits. Each row is scaled to the rtp and rounded down below.
 */
const SHAPES: Record<KenoRisk, number[][]> = {
  CLASSIC: [
    [0, 3.96],
    [0, 1.9, 4.5],
    [0, 1, 3.1, 10.4],
    [0, 0.8, 1.8, 5, 22.5],
    [0, 0.25, 1.4, 4.1, 16.5, 36],
    [0, 0, 1, 3.68, 7, 16.5, 40],
    [0, 0, 0.47, 3, 4.5, 14, 31, 60],
    [0, 0, 0, 2.2, 4, 13, 22, 55, 70],
    [0, 0, 0, 1.55, 3, 8, 15, 44, 60, 85],
    [0, 0, 0, 1.4, 2.25, 4.5, 8, 17, 50, 80, 100],
  ],
  LOW: [
    [0.7, 1.85],
    [0, 2, 3.8],
    [0, 1.1, 1.38, 26],
    [0, 0, 2.2, 7.9, 90],
    [0, 0, 1.5, 4.2, 13, 300],
    [0, 0, 1.1, 2, 6.2, 100, 700],
    [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  ],
  MEDIUM: [
    [0.4, 2.75],
    [0, 1.8, 5.1],
    [0, 0, 2.8, 50],
    [0, 0, 1.7, 10, 100],
    [0, 0, 1.4, 4, 14, 390],
    [0, 0, 0, 3, 9, 180, 710],
    [0, 0, 0, 2, 7, 30, 400, 800],
    [0, 0, 0, 2, 4, 11, 67, 400, 900],
    [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    [0, 0, 0, 1.6, 2, 4, 7, 26, 100, 500, 1000],
  ],
  HIGH: [
    [0, 3.96],
    [0, 0, 17.1],
    [0, 0, 0, 81.5],
    [0, 0, 0, 10, 259],
    [0, 0, 0, 4.5, 48, 450],
    [0, 0, 0, 0, 11, 350, 710],
    [0, 0, 0, 0, 7, 90, 400, 800],
    [0, 0, 0, 0, 5, 20, 270, 600, 900],
    [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  ],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance of `hits` hits with `picks` numbers picked (hypergeometric). */
export function hitChance(picks: number, hits: number): number {
  return (choose(DRAWN, hits) * choose(BOARD - DRAWN, picks - hits)) / choose(BOARD, picks);
}

/** Rounded down to a readable precision, so rounding only ever lowers the RTP. */
function displayFloor(v: number): number {
  if (v >= 100) return Math.floor(v);
  if (v >= 10) return Math.floor(v * 10 + 1e-9) / 10;
  return Math.floor(v * 100 + 1e-9) / 100;
}

export function rowRtp(row: number[]): number {
  const picks = row.length - 1;
  return row.reduce((s, m, h) => s + m * hitChance(picks, h), 0);
}

/** Each shape row scaled so its return is exactly the rtp, then rounded down. */
function buildTables(): Record<KenoRisk, number[][]> {
  const out = {} as Record<KenoRisk, number[][]>;
  for (const risk of RISKS) {
    out[risk] = SHAPES[risk].map((row) => {
      const k = env.games.rtp / rowRtp(row);
      return row.map((m) => displayFloor(m * k));
    });
  }
  return out;
}

const TABLES = buildTables();

export function multiplierFor(risk: KenoRisk, picks: number, hits: number): number {
  return TABLES[risk][picks - 1][hits];
}

/**
 * The ten drawn numbers: draw i picks index floor(f_i x remaining) from the
 * numbers not drawn yet, f_i = HMAC(serverSeed, "<clientSeed>:keno:<nonce>:<i>").
 */
export function drawFor(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const pool = Array.from({ length: BOARD }, (_, i) => i + 1);
  const drawn: number[] = [];
  for (let i = 0; i < DRAWN; i++) {
    const j = Math.floor(fairGameFloat(serverSeed, clientSeed, `keno:${nonce}`, i) * pool.length);
    drawn.push(pool.splice(j, 1)[0]);
  }
  return drawn;
}

type KenoBetRow = Prisma.KenoBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicBet(bet: KenoBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getKenoConfig() {
  let lo = Infinity;
  let hi = 0;
  for (const risk of RISKS) {
    for (const row of TABLES[risk]) {
      const r = rowRtp(row);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
  }
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    board: BOARD,
    drawn: DRAWN,
    maxPicks: MAX_PICKS,
    risks: RISKS,
    tables: TABLES,
    rtpPercent: round2(hi * 100),
    rtpRange: [round2(lo * 100), round2(hi * 100)],
  };
}

/** One draw: debits the stake, draws from the player's provably-fair seeds
 * and pays the table multiplier for the hits (capped), in one transaction. */
export async function playKeno(userId: string, stake: number, picks: number[], risk: KenoRisk) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!RISKS.includes(risk)) throw new ApiError(400, "Risk must be CLASSIC, LOW, MEDIUM or HIGH.");
  if (picks.length < 1 || picks.length > MAX_PICKS) throw new ApiError(400, `Pick between 1 and ${MAX_PICKS} numbers.`);
  if (new Set(picks).size !== picks.length || picks.some((p) => !Number.isInteger(p) || p < 1 || p > BOARD)) {
    throw new ApiError(400, `Picks must be different whole numbers from 1 to ${BOARD}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const drawn = drawFor(serverSeed, clientSeed, nonce);
  const hits = picks.filter((p) => drawn.includes(p)).length;
  const multiplier = multiplierFor(risk, picks.length, hits);
  // Rounded down, and never more than the max payout.
  const payout = Math.min(floor2(stake * multiplier), env.games.maxPayout);
  const sortedPicks = [...picks].sort((a, b) => a - b);

  const bet = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel bets can't overdraw the wallet.
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

    return tx.kenoBet.create({
      data: { userId, stake, picks: sortedPicks, risk, drawn, hits, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyKenoHistory(userId: string, limit = 30) {
  const bets = await prisma.kenoBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
