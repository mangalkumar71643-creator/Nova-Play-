import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Neon 777: a classic three-reel, one-line fruit machine in the style of
 * Crazy 777, with a Special Reel on the right. Only the middle row pays:
 *   three red 7s 100x, three blue 7s 50x, any three 7s 20x, three triple BARs
 *   15x, three double BARs 10x, three single BARs 5x, any three BARs 3x.
 * When the line wins, the Special Reel's symbol applies: a multiplier (x2,
 * x5, x10), a bonus paid on top (5x, 10x, 20x the bet), or a RESPIN — the
 * win is paid and all reels spin again for free, up to MAX_RESPINS in a row.
 *
 * The RTP is exact: the line-win distribution is counted over every stop
 * combination, and the respin chain is a finite geometric sum.
 */
export const SYMBOLS = ["BLANK", "BAR1", "BAR2", "BAR3", "BLUE7", "RED7"] as const;
export type ReelSymbol = (typeof SYMBOLS)[number];
const BL = 0, B1 = 1, B2 = 2, B3 = 3, S7 = 4, R7 = 5;

/** Reel strips, top to bottom and wrapping round (23 stops each, the same symbols in different orders). */
export const STRIPS: number[][] = [
  [B1, BL, B3, B1, BL, B2, S7, BL, B1, B3, BL, B2, B1, BL, R7, B1, BL, B3, B2, BL, B1, BL, BL],
  [B2, BL, B1, R7, BL, B3, B1, BL, B2, B1, BL, S7, B3, BL, B1, B2, BL, B1, B3, BL, B1, BL, BL],
  [B3, BL, B1, B2, BL, B1, R7, BL, B3, B1, BL, B2, S7, BL, B1, B3, BL, B2, B1, BL, B1, BL, BL],
];

export const LINE_PAYS = { RED7: 100, BLUE7: 50, ANY7: 20, BAR3: 15, BAR2: 10, BAR1: 5, ANYBAR: 3 } as const;
export type LineResult = keyof typeof LINE_PAYS | "NONE";

export type Special = { kind: "NONE" | "MULT" | "BONUS" | "RESPIN"; value: number; weight: number };
/** Special Reel symbols and their weights out of 110. */
export const SPECIAL: Special[] = [
  { kind: "NONE", value: 0, weight: 70 },
  { kind: "MULT", value: 2, weight: 16 },
  { kind: "MULT", value: 5, weight: 5 },
  { kind: "MULT", value: 10, weight: 2 },
  { kind: "BONUS", value: 5, weight: 6 },
  { kind: "BONUS", value: 10, weight: 3 },
  { kind: "BONUS", value: 20, weight: 1 },
  { kind: "RESPIN", value: 0, weight: 7 },
];
export const MAX_RESPINS = 5;

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** What the middle row pays. */
export function evaluateLine(line: number[]): { result: LineResult; pays: number } {
  const [a, b, c] = line;
  if (a === R7 && b === R7 && c === R7) return { result: "RED7", pays: LINE_PAYS.RED7 };
  if (a === S7 && b === S7 && c === S7) return { result: "BLUE7", pays: LINE_PAYS.BLUE7 };
  if (line.every((s) => s === R7 || s === S7)) return { result: "ANY7", pays: LINE_PAYS.ANY7 };
  if (a === B3 && b === B3 && c === B3) return { result: "BAR3", pays: LINE_PAYS.BAR3 };
  if (a === B2 && b === B2 && c === B2) return { result: "BAR2", pays: LINE_PAYS.BAR2 };
  if (a === B1 && b === B1 && c === B1) return { result: "BAR1", pays: LINE_PAYS.BAR1 };
  if (line.every((s) => s === B1 || s === B2 || s === B3)) return { result: "ANYBAR", pays: LINE_PAYS.ANYBAR };
  return { result: "NONE", pays: 0 };
}

/** The three visible symbols of each reel (top, middle, bottom) for the given stops; the stop is the middle row. */
export function windowFor(stops: number[]): number[][] {
  return stops.map((stop, reel) => {
    const s = STRIPS[reel];
    return [-1, 0, 1].map((d) => s[(stop + d + s.length) % s.length]);
  });
}

/** Exact line statistics over every stop combination, and the RTP they give with the Special Reel and respins. */
export const STATS = (() => {
  const [la, lb, lc] = STRIPS.map((s) => s.length);
  let sum = 0;
  let wins = 0;
  for (let i = 0; i < la; i++)
    for (let j = 0; j < lb; j++)
      for (let k = 0; k < lc; k++) {
        const pays = evaluateLine([STRIPS[0][i], STRIPS[1][j], STRIPS[2][k]]).pays;
        sum += pays;
        if (pays > 0) wins++;
      }
  const n = la * lb * lc;
  const meanLine = sum / n;
  const hitRate = wins / n;
  const total = SPECIAL.reduce((s, x) => s + x.weight, 0);
  let perSpin = 0;
  let respinChance = 0;
  for (const x of SPECIAL) {
    const q = x.weight / total;
    if (x.kind === "MULT") perSpin += q * meanLine * x.value;
    else if (x.kind === "BONUS") perSpin += q * (meanLine + hitRate * x.value);
    else perSpin += q * meanLine;
    if (x.kind === "RESPIN") respinChance += q * hitRate;
  }
  // The first spin plus up to MAX_RESPINS respins, each reached with probability respinChance^k.
  const rtp = (perSpin * (1 - respinChance ** (MAX_RESPINS + 1))) / (1 - respinChance);
  return { meanLine, hitRate, respinChance, rtp };
})();

export type Rng = () => number;

/**
 * The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:neon777:
 * <nonce>:<block>") for block 0, 1, 2…, each digest read as eight 32-bit
 * numbers (respins need more draws than one message gives).
 */
export function neonRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:neon777:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export type NeonRound = {
  stops: number[];
  /** Index into SPECIAL. */
  special: number;
  result: LineResult;
  linePays: number;
  /** What this round pays, in bets. */
  win: number;
};

export function playSpin(rng: Rng): { rounds: NeonRound[]; totalWin: number } {
  const specialTotal = SPECIAL.reduce((s, x) => s + x.weight, 0);
  const rounds: NeonRound[] = [];
  for (;;) {
    const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
    let roll = rng() * specialTotal;
    let special = 0;
    while (special < SPECIAL.length - 1 && roll >= SPECIAL[special].weight) roll -= SPECIAL[special++].weight;
    const { result, pays } = evaluateLine(stops.map((stop, reel) => STRIPS[reel][stop]));
    const sp = SPECIAL[special];
    let win = 0;
    if (pays > 0) win = sp.kind === "MULT" ? pays * sp.value : sp.kind === "BONUS" ? pays + sp.value : pays;
    rounds.push({ stops, special, result, linePays: pays, win });
    // A winning RESPIN earns another free spin, up to MAX_RESPINS in a row.
    if (!(pays > 0 && sp.kind === "RESPIN") || rounds.length > MAX_RESPINS) break;
  }
  const totalWin = Number(rounds.reduce((s, r) => s + r.win, 0).toFixed(4));
  return { rounds, totalWin };
}

export function replayNeonSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(neonRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.Neon777SpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getNeon777Config() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    strips: STRIPS.map((s) => s.map((i) => SYMBOLS[i])),
    linePays: LINE_PAYS,
    special: SPECIAL.map(({ kind, value, weight }) => ({ kind, value, chancePercent: round2((weight / SPECIAL.reduce((s, x) => s + x.weight, 0)) * 100) })),
    maxRespins: MAX_RESPINS,
    hitRatePercent: round2(STATS.hitRate * 100),
    rtpPercent: Math.floor(STATS.rtp * 10000) / 100,
  };
}

/** Spins once (with any respins): debits the stake, spins from the player's provably-fair seeds and pays, in one transaction. */
export async function spinNeon777(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayNeonSpin(serverSeed, clientSeed, nonce);
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

    return tx.neon777Spin.create({
      data: { userId, stake, totalWin: outcome.totalWin, payout, respins: outcome.rounds.length - 1, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyNeon777History(userId: string, limit = 30) {
  const rows = await prisma.neon777Spin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
