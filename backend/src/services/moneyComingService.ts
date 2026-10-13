import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Money Coming: a three-reel number slot with a Special Reel on the right, in
 * the style of JILI's Money Coming. Reel 1 shows 1, 5 or 10; reel 2 shows 0
 * or 00; reel 3 shows 0 (any reel can also stop on a blank). The middle row
 * is read left to right as one number, blanks skipped — e.g. 5 | 00 | 0 reads
 * "5000" — and pays that number ÷ 10 times the bet (5000 → 500x). At least
 * two symbols must land; 10 | 00 | 0 = 1000x is the top line win.
 * When the line wins, the Special Reel applies: a multiplier (x2, x5, x10),
 * the Lucky Wheel (multiplies the win by a wheel segment, 2x to 20x), or a
 * RESPIN — the win is paid and the reels spin again for free, up to
 * MAX_RESPINS in a row.
 *
 * The RTP is exact: the line distribution is counted over every stop
 * combination, and the respin chain is a finite geometric sum.
 */
export const REEL_SYMBOLS = [
  ["", "1", "5", "10"],
  ["", "0", "00"],
  ["", "0"],
] as const;

/** Lays `counts[i]` copies of symbol i around a strip of `length` stops, spread as evenly as possible. */
function spread(counts: number[]): number[] {
  const length = counts.reduce((a, b) => a + b, 0);
  const strip: number[] = new Array(length).fill(-1);
  // Rarest symbols first, so they get the evenest spacing; blanks (index 0) fill the gaps.
  const order = counts.map((c, i) => i).filter((i) => i !== 0).sort((a, b) => counts[a] - counts[b]);
  for (const sym of order) {
    for (let k = 0; k < counts[sym]; k++) {
      let pos = Math.floor(((k + 0.5) * length) / counts[sym] + sym * 7) % length;
      while (strip[pos] !== -1) pos = (pos + 1) % length;
      strip[pos] = sym;
    }
  }
  return strip.map((s) => (s === -1 ? 0 : s));
}

/** Symbol counts per reel, in REEL_SYMBOLS order (blank first). */
const COUNTS = [
  [31, 26, 2, 1],
  [47, 12, 1],
  [36, 4],
];
/** Reel strips as indexes into REEL_SYMBOLS[reel], top to bottom, wrapping round. */
export const STRIP_INDEXES: number[][] = COUNTS.map(spread);
export const STRIPS: string[][] = STRIP_INDEXES.map((s, reel) => s.map((i) => REEL_SYMBOLS[reel][i]));

export type Special = { kind: "NONE" | "MULT" | "WHEEL" | "RESPIN"; value: number; weight: number };
/** Special Reel symbols and their weights out of 108. */
export const SPECIAL: Special[] = [
  { kind: "NONE", value: 0, weight: 80 },
  { kind: "MULT", value: 2, weight: 12 },
  { kind: "MULT", value: 5, weight: 4 },
  { kind: "MULT", value: 10, weight: 1 },
  { kind: "WHEEL", value: 0, weight: 4 },
  { kind: "RESPIN", value: 0, weight: 7 },
];
/** The Lucky Wheel's 20 equal segments, clockwise from the top. */
export const WHEEL = [2, 5, 3, 2, 8, 3, 2, 5, 10, 3, 2, 5, 3, 20, 2, 5, 3, 2, 10, 8];
export const MAX_RESPINS = 5;

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What the middle row pays, in bets, and the number it reads. */
export function evaluateLine(line: string[]): { reads: number; pays: number } {
  const shown = line.filter((s) => s !== "");
  if (shown.length < 2) return { reads: 0, pays: 0 };
  const reads = Number(shown.join(""));
  return { reads, pays: reads / 10 };
}

/** The three visible symbols of each reel (top, middle, bottom) for the given stops; the stop is the middle row. */
export function windowFor(stops: number[]): string[][] {
  return stops.map((stop, reel) => {
    const s = STRIPS[reel];
    return [-1, 0, 1].map((d) => s[(stop + d + s.length) % s.length]);
  });
}

/** Exact line statistics over every stop combination, and the RTP they give with the Special Reel and respins. */
export const STATS = (() => {
  const [a, b, c] = STRIPS;
  let sum = 0;
  let wins = 0;
  for (const x of a)
    for (const y of b)
      for (const z of c) {
        const pays = evaluateLine([x, y, z]).pays;
        sum += pays;
        if (pays > 0) wins++;
      }
  const n = a.length * b.length * c.length;
  const meanLine = sum / n;
  const hitRate = wins / n;
  const total = SPECIAL.reduce((s, x) => s + x.weight, 0);
  const wheelMean = WHEEL.reduce((s, m) => s + m, 0) / WHEEL.length;
  let perSpin = 0;
  let respinChance = 0;
  for (const x of SPECIAL) {
    const q = x.weight / total;
    if (x.kind === "MULT") perSpin += q * meanLine * x.value;
    else if (x.kind === "WHEEL") perSpin += q * meanLine * wheelMean;
    else perSpin += q * meanLine;
    if (x.kind === "RESPIN") respinChance += q * hitRate;
  }
  // The first spin plus up to MAX_RESPINS respins, each reached with probability respinChance^k.
  const rtp = (perSpin * (1 - respinChance ** (MAX_RESPINS + 1))) / (1 - respinChance);
  return { meanLine, hitRate, respinChance, rtp };
})();

export type Rng = () => number;

/**
 * The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:moneycoming:
 * <nonce>:<block>") for block 0, 1, 2…, each digest read as eight 32-bit
 * numbers (respins need more draws than one message gives).
 */
export function moneyComingRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:moneycoming:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export type MoneyComingRound = {
  stops: number[];
  /** Index into SPECIAL. */
  special: number;
  /** Index into WHEEL when the Lucky Wheel spun, else null. */
  wheel: number | null;
  reads: number;
  linePays: number;
  /** What this round pays, in bets. */
  win: number;
};

export function playSpin(rng: Rng): { rounds: MoneyComingRound[]; totalWin: number } {
  const specialTotal = SPECIAL.reduce((s, x) => s + x.weight, 0);
  const rounds: MoneyComingRound[] = [];
  for (;;) {
    const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
    let roll = rng() * specialTotal;
    let special = 0;
    while (special < SPECIAL.length - 1 && roll >= SPECIAL[special].weight) roll -= SPECIAL[special++].weight;
    const { reads, pays } = evaluateLine(stops.map((stop, reel) => STRIPS[reel][stop]));
    const sp = SPECIAL[special];
    let win = 0;
    let wheel: number | null = null;
    if (pays > 0) {
      if (sp.kind === "MULT") win = pays * sp.value;
      else if (sp.kind === "WHEEL") {
        wheel = Math.floor(rng() * WHEEL.length);
        win = pays * WHEEL[wheel];
      } else win = pays;
    }
    rounds.push({ stops, special, wheel, reads, linePays: pays, win });
    // A winning RESPIN earns another free spin, up to MAX_RESPINS in a row.
    if (!(pays > 0 && sp.kind === "RESPIN") || rounds.length > MAX_RESPINS) break;
  }
  const totalWin = Number(rounds.reduce((s, r) => s + r.win, 0).toFixed(4));
  return { rounds, totalWin };
}

export function replayMoneyComingSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(moneyComingRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.MoneyComingSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getMoneyComingConfig() {
  const specialTotal = SPECIAL.reduce((s, x) => s + x.weight, 0);
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    strips: STRIPS,
    special: SPECIAL.map(({ kind, value, weight }) => ({ kind, value, chancePercent: round2((weight / specialTotal) * 100) })),
    wheel: WHEEL,
    maxRespins: MAX_RESPINS,
    hitRatePercent: round2(STATS.hitRate * 100),
    rtpPercent: Math.floor(STATS.rtp * 10000) / 100,
  };
}

/** Spins once (with any respins): debits the stake, spins from the player's provably-fair seeds and pays, in one transaction. */
export async function spinMoneyComing(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayMoneyComingSpin(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
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

    return tx.moneyComingSpin.create({
      data: { userId, stake, totalWin: outcome.totalWin, payout, respins: outcome.rounds.length - 1, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyMoneyComingHistory(userId: string, limit = 30) {
  const rows = await prisma.moneyComingSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
