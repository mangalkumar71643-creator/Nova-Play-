import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * "Royal Gems": three reels showing three rows each, five fixed paylines,
 * and a fourth reel of multipliers that scales the whole spin's win. A line
 * pays when its three symbols match, WILD standing in for any symbol.
 */
export const SYMBOLS = ["J", "Q", "K", "A", "EMERALD", "SAPPHIRE", "RUBY", "WILD"] as const;
export type SlotSymbol = (typeof SYMBOLS)[number];

/** Line pay for three of a kind, in multiples of the total stake. */
export const PAYTABLE: Record<SlotSymbol, number> = {
  J: 0.4,
  Q: 0.5,
  K: 0.7,
  A: 0.9,
  EMERALD: 1.5,
  SAPPHIRE: 2.5,
  RUBY: 4,
  WILD: 8,
};

const J = "J", Q = "Q", K = "K", A = "A", EM = "EMERALD", SA = "SAPPHIRE", RU = "RUBY", W = "WILD";

/** Reel strips (29 stops each). No symbol sits next to itself and WILDs
 * are never two apart, so a reel can't show a column of one symbol. */
export const REELS: SlotSymbol[][] = [
  [Q, W, Q, J, EM, RU, K, W, A, K, Q, SA, EM, A, Q, K, RU, Q, EM, K, J, SA, J, A, J, W, SA, A, J],
  [RU, EM, J, EM, A, SA, W, RU, J, Q, K, J, K, J, W, SA, Q, SA, EM, Q, A, Q, K, A, Q, W, J, A, K],
  [EM, Q, K, J, Q, K, RU, EM, SA, J, EM, J, RU, K, J, Q, A, SA, A, Q, W, A, Q, A, SA, W, K, J, W],
];

/** Paylines as the row (0 = top) used on each reel. */
export const PAYLINES: [number, number, number][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

/** Multiplier reel: value and its weight out of 100. It is drawn
 * independently of the reels, so RTP = E[line win] x E[multiplier]. */
export const MULTIPLIERS: { value: number; weight: number }[] = [
  { value: 1, weight: 77 },
  { value: 2, weight: 9 },
  { value: 3, weight: 5 },
  { value: 5, weight: 4 },
  { value: 10, weight: 3 },
  { value: 15, weight: 2 },
];
const MULTIPLIER_TOTAL = MULTIPLIERS.reduce((s, m) => s + m.weight, 0);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/** The 3x3 window (row by row) for the given top-row stop of each reel. */
export function gridFor(stops: number[]): SlotSymbol[] {
  const grid: SlotSymbol[] = [];
  for (let row = 0; row < 3; row++) {
    for (let reel = 0; reel < 3; reel++) {
      const strip = REELS[reel];
      grid.push(strip[(stops[reel] + row) % strip.length]);
    }
  }
  return grid;
}

function linePay(a: SlotSymbol, b: SlotSymbol, c: SlotSymbol): number {
  const plain = [a, b, c].filter((s) => s !== "WILD");
  if (plain.length === 0) return PAYTABLE.WILD;
  return plain.every((s) => s === plain[0]) ? PAYTABLE[plain[0]] : 0;
}

/** Which paylines pay and their total, in multiples of the stake. */
export function evaluate(grid: SlotSymbol[]): { winLines: number[]; baseWin: number } {
  const winLines: number[] = [];
  let baseWin = 0;
  PAYLINES.forEach(([r0, r1, r2], i) => {
    const pay = linePay(grid[r0 * 3], grid[r1 * 3 + 1], grid[r2 * 3 + 2]);
    if (pay > 0) {
      winLines.push(i);
      baseWin += pay;
    }
  });
  return { winLines, baseWin: round2(baseWin) };
}

function multiplierFor(r: number): number {
  let x = r * MULTIPLIER_TOTAL;
  for (const m of MULTIPLIERS) {
    if (x < m.weight) return m.value;
    x -= m.weight;
  }
  return MULTIPLIERS[MULTIPLIERS.length - 1].value;
}

/** One HMAC draw per reel plus one for the multiplier reel; nonce * 1000 + i
 * keeps each spin's draws in their own slice of the nonce space. */
export function spinFor(serverSeed: string, clientSeed: string, nonce: number) {
  const draw = (i: number) => fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + i);
  const stops = REELS.map((strip, i) => Math.floor(draw(i) * strip.length));
  const multiplier = multiplierFor(draw(3));
  const grid = gridFor(stops);
  return { stops, grid, multiplier, ...evaluate(grid) };
}

/** Exact return to player, from every combination of reel stops
 * (29^3 = 24,389 windows) times the multiplier reel's average. */
export const RTP = (() => {
  let total = 0;
  let n = 0;
  for (let a = 0; a < REELS[0].length; a++)
    for (let b = 0; b < REELS[1].length; b++)
      for (let c = 0; c < REELS[2].length; c++) {
        total += evaluate(gridFor([a, b, c])).baseWin;
        n++;
      }
  const meanMultiplier = MULTIPLIERS.reduce((s, m) => s + m.value * m.weight, 0) / MULTIPLIER_TOTAL;
  return (total / n) * meanMultiplier;
})();

type SpinRow = Prisma.SlotSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(spin: SpinRow) {
  const { serverSeed: _hidden, ...rest } = spin;
  return rest;
}

export function getSlotConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: round2(RTP * 100),
    symbols: SYMBOLS,
    paytable: PAYTABLE,
    reels: REELS,
    paylines: PAYLINES,
    multipliers: MULTIPLIERS.map((m) => m.value),
  };
}

/** Spins once: debits the stake, decides the reels from the player's
 * provably-fair seeds and pays the win, all in one transaction. */
export async function spinSlot(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const result = spinFor(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * result.baseWin * result.multiplier), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
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

    return tx.slotSpin.create({
      data: {
        userId,
        stake,
        stops: result.stops,
        grid: result.grid,
        winLines: result.winLines,
        baseWin: result.baseWin,
        multiplier: result.multiplier,
        payout,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return toPublicSpin(spin);
}

export async function getMySlotHistory(userId: string, limit = 30) {
  const spins = await prisma.slotSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return spins.map(toPublicSpin);
}
