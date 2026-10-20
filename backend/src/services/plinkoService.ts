import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import { INSTANT_HOUSE_CHANCE, isInstantHouse } from "./lotteryHouse";

/**
 * Plinko: the ball bounces left or right on each row of pins (one draw per
 * row from the player's provably-fair seeds) and pays the multiplier of the
 * slot it lands in, from the table for the chosen rows and risk.
 *
 * One drop in five is a ⭐ House result (lotteryHouse.ts, drawn from the same
 * seeds): the ball still falls along its path, so the seeds can be checked
 * against it, but the bet loses whatever slot it reaches. Every other drop
 * pays fair odds: each table returns as close to 100% as its rounded values
 * allow, never more (99.95%-100%), so with the House drops every table returns
 * 79.96%-80% (a 20% house edge; rounding down never favours the player). The
 * edge slots are the ones the per-bet maxPayout trims at bigger stakes.
 */

export const MIN_ROWS = 8;
export const MAX_ROWS = 16;
export const RISKS = ["LOW", "MEDIUM", "HIGH"] as const;
export type PlinkoRisk = (typeof RISKS)[number];

/** What each table returns on a drop that is not House: fair odds. */
const FAIR_RTP = 1;
/** Float slack for "at most FAIR_RTP": far below the smallest real step over it (0.01 / 2^16). */
const EPS = 1e-12;

/**
 * Shape of each risk's payout table: the centre slot pays `floor` and the
 * payout grows towards the edges as (distance from centre)^curve. At fair
 * odds 16 rows tops out around 20x / 128x / 1148x.
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

/** The next readable value at or above v (displayFloor's counterpart). */
function displayCeil(v: number): number {
  if (v >= 100) return Math.ceil(v - 1e-9);
  if (v >= 10) return Math.ceil(v * 10 - 1e-9) / 10;
  return Math.ceil(v * 100 - 1e-9) / 100;
}

function chanceOf(rows: number, k: number): number {
  return binomial(rows, k) / 2 ** rows;
}

/** Return of a table: slot k is reached with probability C(rows, k) / 2^rows. */
export function tableRtp(table: number[]): number {
  const rows = table.length - 1;
  return table.reduce((sum, m, k) => sum + chanceOf(rows, k) * m, 0);
}

/**
 * Multiplier for every landing slot (0..rows). Slot k is reached by k
 * right-bounces out of `rows`, probability C(rows, k) / 2^rows. With the
 * shape m(x) = floor + (edge - floor) * x^curve, x = |k - rows/2| / (rows/2),
 * the edge value solving sum(P(k) * m(k)) = 100% exactly is the starting
 * point; as each value is rounded down, the edge is then raised (by
 * bisection) as far as the rounded table still returns at most 100%.
 * Rounding down still leaves a little under 100%, so slots are then raised
 * to their next readable value (a slot and its mirror together, the biggest
 * gain first) while the table stays at most 100% and still rises from the
 * centre out.
 */
function buildTable(rows: number, risk: PlinkoRisk): number[] {
  const { floor, curve } = RISK_SHAPES[risk];
  const half = rows / 2;
  const probs = Array.from({ length: rows + 1 }, (_, k) => chanceOf(rows, k));
  const xs = Array.from({ length: rows + 1 }, (_, k) => Math.abs(k - half) / half);
  const s = probs.reduce((sum, p, k) => sum + p * xs[k] ** curve, 0);
  const exactFor = (edge: number) => xs.map((x) => floor + (edge - floor) * x ** curve);
  const tableFor = (edge: number) => exactFor(edge).map(displayFloor);
  let lo = (FAIR_RTP - floor * (1 - s)) / s;
  // 2 points of rtp before rounding is more than rounding down ever takes off.
  let hi = lo + 0.02 / s;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (tableRtp(tableFor(mid)) <= FAIR_RTP + EPS) lo = mid;
    else hi = mid;
  }

  const exact = exactFor(lo);
  let table = tableFor(lo);
  for (;;) {
    let best: number[] | null = null;
    let bestRtp = tableRtp(table);
    // The left half (slot 0 is the edge); slot `rows - k` mirrors slot k.
    for (let k = 0; k <= half; k++) {
      const up = displayCeil(exact[k]);
      if (up === table[k] || (k > 0 && up > table[k - 1])) continue;
      const trial = [...table];
      trial[k] = trial[rows - k] = up;
      const r = tableRtp(trial);
      if (r <= FAIR_RTP + EPS && r > bestRtp) {
        best = trial;
        bestRtp = r;
      }
    }
    if (!best) return table;
    table = best;
  }
}

const TABLES: Record<string, number[]> = {};
for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
  for (const risk of RISKS) TABLES[`${rows}:${risk}`] = buildTable(rows, risk);
}

export function multipliersFor(rows: number, risk: PlinkoRisk): number[] {
  return TABLES[`${rows}:${risk}`];
}

/** What a drop pays per unit staked: nothing on a House drop. */
export function payMultiplier(rows: number, risk: PlinkoRisk, slot: number, house: boolean): number {
  return house ? 0 : multipliersFor(rows, risk)[slot];
}

/** Exact return of a drop at these rows and risk, House drops included (before the per-bet payout cap). */
export function plinkoRtp(rows: number, risk: PlinkoRisk): number {
  return (1 - INSTANT_HOUSE_CHANCE) * tableRtp(multipliersFor(rows, risk));
}

/** One HMAC draw per row: < 0.5 bounces left (0), otherwise right (1).
 * nonce * 1000 + row keeps each drop's draws in their own slice of the
 * nonce space, like Mines and Chicken Road. */
export function pathFor(serverSeed: string, clientSeed: string, nonce: number, rows: number): number[] {
  return Array.from({ length: rows }, (_, i) => (fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + i) < 0.5 ? 0 : 1));
}

type PlinkoBetRow = Prisma.PlinkoBetGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. A House
 * drop keeps its real path and slot (for checking the seeds) and goes out
 * with multiplier 0, so older app builds show it as a 0x drop. */
function toPublicBet(bet: PlinkoBetRow) {
  const { serverSeed: _hidden, ...rest } = bet;
  return rest;
}

export function getPlinkoConfig() {
  const tables: Record<string, Record<string, number[]>> = {};
  let lo = Infinity;
  let hi = 0;
  for (const risk of RISKS) {
    tables[risk] = {};
    for (let rows = MIN_ROWS; rows <= MAX_ROWS; rows++) {
      tables[risk][rows] = multipliersFor(rows, risk);
      const r = plinkoRtp(rows, risk);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
  }
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    minRows: MIN_ROWS,
    maxRows: MAX_ROWS,
    risks: RISKS,
    // Returns with the House drops included; `multipliers` is what a drop
    // that is not House pays.
    rtpPercent: round2(hi * 100),
    rtpRange: [round2(lo * 100), round2(hi * 100)],
    houseChancePercent: round2(INSTANT_HOUSE_CHANCE * 100),
    multipliers: tables,
  };
}

/** Drops one ball: debits the stake, decides the path (and whether the drop
 * is House) from the player's provably-fair seeds and pays the landing slot
 * of a drop that is not House, all in one transaction. */
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
  // Fixed (and stored) with the drop, from the same seeds. The path is
  // still drawn and kept, so the seeds can be checked against it.
  const house = isInstantHouse(serverSeed, clientSeed, "plinko", nonce);
  const multiplier = payMultiplier(rows, risk, slot, house);
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
      data: { userId, stake, rows, risk, path, slot, house, multiplier, payout, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return toPublicBet(bet);
}

export async function getMyPlinkoHistory(userId: string, limit = 30) {
  const bets = await prisma.plinkoBet.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return bets.map(toPublicBet);
}
