import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Book of Pharaoh: a five-reel, three-row Egyptian slot with ten fixed
 * lines. The stake is spread evenly over the lines; line wins pay left to
 * right from the first reel, in line bets. The high symbols (ankh, scarab,
 * eye, pharaoh) pay from two of a kind, the card ranks from three.
 *
 * The BOOK is both wild (it stands in for any symbol on a line) and
 * scatter: 3, 4 or 5 anywhere pay 2x, 20x or 200x the stake and start 10
 * free spins. Before they begin one symbol is drawn as the special symbol;
 * on every free spin where it shows on enough reels (two for the high
 * symbols, three for the rest), it expands to fill those reels and pays on
 * all ten lines, whether or not the reels are next to each other. Three
 * more books during free spins add another 10.
 *
 * STATS is exact: line wins are counted over every symbol combination, the
 * books and the special symbol over every stop of every reel, and the
 * retriggers as the geometric series they are.
 */
export const SYMBOLS = ["TEN", "JACK", "QUEEN", "KING", "ACE", "ANKH", "SCARAB", "EYE", "PHARAOH", "BOOK"] as const;
export type PharaohSymbol = (typeof SYMBOLS)[number];
const TE = 0, JA = 1, QU = 2, KI = 3, AC = 4, AN = 5, SC = 6, EY = 7, PH = 8, BK = 9;

/** Reel strips, top to bottom and wrapping round (the same reels in free spins). */
export const STRIPS: number[][] = [
  [AC, AN, SC, KI, AC, TE, SC, TE, KI, PH, KI, TE, AN, JA, TE, AC, AN, BK, JA, TE, PH, QU, SC, KI, QU, AC, QU, KI, TE, JA, TE, QU, SC, JA, AN, AC, TE, QU, BK, KI, AC, KI, TE, QU, AC, AN, EY, KI, QU, AN, JA, KI, JA, EY, JA, AC, JA, QU, SC, JA, PH, JA, EY, TE, EY, QU],
  [QU, AC, JA, TE, AC, KI, BK, AN, KI, AC, QU, SC, KI, QU, AC, JA, QU, SC, QU, AN, PH, TE, AN, JA, TE, AN, TE, AC, EY, TE, KI, EY, TE, PH, KI, EY, KI, TE, JA, KI, JA, TE, AN, JA, QU, JA, QU, SC, AC, EY, AC, TE, QU, JA, AC, KI, SC, TE, PH, AN, JA, SC, QU, BK, JA, KI],
  [EY, QU, SC, QU, AC, BK, PH, QU, KI, AC, SC, TE, JA, TE, QU, JA, SC, KI, AN, TE, AN, EY, AC, JA, EY, AN, JA, TE, QU, KI, AC, AN, KI, TE, KI, QU, JA, SC, KI, SC, TE, KI, AN, QU, PH, TE, KI, AC, JA, AC, JA, TE, QU, JA, AN, QU, AC, TE, EY, BK, JA, AC, TE, PH, KI, JA],
  [JA, AC, EY, QU, TE, JA, AN, AC, KI, QU, AN, TE, KI, PH, JA, AC, SC, KI, AN, BK, AC, TE, QU, JA, EY, KI, AN, EY, SC, AC, PH, QU, KI, SC, JA, TE, JA, EY, TE, JA, TE, KI, TE, AC, QU, BK, TE, SC, QU, SC, TE, QU, PH, JA, KI, TE, KI, QU, AN, JA, AN, KI, AC, QU, JA, AC],
  [QU, KI, SC, JA, AN, QU, TE, JA, TE, SC, QU, AC, TE, KI, JA, TE, JA, KI, AC, EY, BK, QU, AN, SC, PH, KI, JA, QU, TE, KI, AC, TE, JA, BK, TE, SC, JA, QU, PH, AC, TE, AN, KI, PH, JA, AN, EY, TE, AC, TE, SC, KI, EY, JA, AC, QU, JA, EY, KI, QU, AC, QU, AN, KI, AN, AC],
];

/** Two, three, four and five of a kind, in line bets (0 where two don't pay). */
export const PAYS: Record<Exclude<PharaohSymbol, "BOOK">, [number, number, number, number]> = {
  PHARAOH: [8, 80, 800, 4000],
  EYE: [4, 32, 320, 1600],
  SCARAB: [4, 20, 80, 500],
  ANKH: [4, 20, 80, 500],
  ACE: [0, 4, 25, 100],
  KING: [0, 4, 25, 100],
  QUEEN: [0, 4, 18, 70],
  JACK: [0, 4, 18, 70],
  TEN: [0, 4, 18, 70],
};
/** Books anywhere, in stakes. */
export const SCATTER_PAYS: Record<number, number> = { 3: 2, 4: 20, 5: 200 };
export const LINE_COUNT = 10;
export const FREE_SPINS = 10;
/** Free spins stop here however many retriggers land (reached far less than once in a billion features). */
const MAX_FREE_SPINS = 300;

/** Rows (0 top, 1 middle, 2 bottom) read on each reel, per line. */
export const LINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 1, 2, 1],
];

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function paysFor(symbol: number): [number, number, number, number] {
  return PAYS[SYMBOLS[symbol] as Exclude<PharaohSymbol, "BOOK">];
}

/** How many reels a symbol must show on before it pays (two for the high symbols, three for the rest). */
export function minCount(symbol: number): number {
  return paysFor(symbol)[0] > 0 ? 2 : 3;
}

/** The three visible symbols of each reel (top, middle, bottom) for the given stops; the stop is the middle row. */
export function windowFor(stops: number[]): number[][] {
  return stops.map((stop, reel) => {
    const s = STRIPS[reel];
    return [-1, 0, 1].map((d) => s[(((stop + d) % s.length) + s.length) % s.length]);
  });
}

/** What one line pays (in line bets), the symbol it pays for and how many reels it covers. A line of only books pays nothing. */
export function linePay(seq: number[]): { pays: number; symbol: number; count: number } {
  let w = 0;
  while (w < 5 && seq[w] === BK) w++;
  if (w === 5) return { pays: 0, symbol: -1, count: 0 };
  const x = seq[w];
  let n = w;
  while (n < 5 && (seq[n] === x || seq[n] === BK)) n++;
  const pays = n >= 2 ? paysFor(x)[n - 2] : 0;
  return pays > 0 ? { pays, symbol: x, count: n } : { pays: 0, symbol: -1, count: 0 };
}

export type LineWin = { line: number; symbol: PharaohSymbol; count: number; pays: number };

/** Line wins, book scatter pay and (in free spins) the expanding special symbol for one window. Amounts in stakes. */
export function evaluateWindow(win: number[][], special: number | null) {
  const lines: LineWin[] = [];
  let lineSum = 0;
  LINES.forEach((rows, line) => {
    const r = linePay(rows.map((row, reel) => win[reel][row]));
    if (r.pays > 0) {
      lines.push({ line, symbol: SYMBOLS[r.symbol], count: r.count, pays: r.pays });
      lineSum += r.pays;
    }
  });
  const books = win.filter((reel) => reel.includes(BK)).length;
  const scatter = SCATTER_PAYS[books] ?? 0;
  let expandReels: number[] = [];
  let expand = 0;
  if (special !== null) {
    const reels = win.map((reel, i) => (reel.includes(special) ? i : -1)).filter((i) => i >= 0);
    if (reels.length >= minCount(special)) {
      expandReels = reels;
      // Fills its reels and pays on all ten lines: LINE_COUNT x pays x (stake / LINE_COUNT).
      expand = paysFor(special)[reels.length - 2];
    }
  }
  return { lines, lineTotal: lineSum / LINE_COUNT, books, scatter, expandReels, expand };
}

/** Chance that a reel shows `symbol` somewhere in its window. */
function showChance(strip: number[], symbol: number): number {
  let n = 0;
  for (let i = 0; i < strip.length; i++) if ([-1, 0, 1].some((d) => strip[(((i + d) % strip.length) + strip.length) % strip.length] === symbol)) n++;
  return n / strip.length;
}

/** Distribution of how many reels show `symbol`. */
function reelCountDist(symbol: number): number[] {
  let dist = [1];
  for (const strip of STRIPS) {
    const p = showChance(strip, symbol);
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/** Exact expected line win (in stakes): every line reads one uniform stop per reel. */
function lineEv(): number {
  const freq = STRIPS.map((s) => {
    const m = new Map<number, number>();
    s.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1 / s.length));
    return [...m.entries()];
  });
  let ev = 0;
  const seq = [0, 0, 0, 0, 0];
  const walk = (reel: number, p: number) => {
    if (reel === 5) {
      ev += p * linePay(seq).pays;
      return;
    }
    for (const [x, q] of freq[reel]) {
      seq[reel] = x;
      walk(reel + 1, p * q);
    }
  };
  walk(0, 1);
  return ev;
}

let statsCache: { rtp: number; baseRtp: number; featureChance: number; averageFeature: number; averageFreeSpins: number } | null = null;
export function getStats() {
  if (statsCache) return statsCache;
  const line = lineEv();
  const books = reelCountDist(BK);
  const scatter = books.reduce((s, q, k) => s + q * (SCATTER_PAYS[k] ?? 0), 0);
  const trigger = books.reduce((s, q, k) => s + (k >= 3 ? q : 0), 0);
  // Each free spin retriggers with chance `trigger`, so the expected spins are 10 / (1 - 10 x trigger).
  const averageFreeSpins = FREE_SPINS / (1 - FREE_SPINS * trigger);
  let perSpin = 0;
  for (let s = 0; s < BK; s++) {
    const dist = reelCountDist(s);
    const expand = dist.reduce((sum, q, k) => sum + (k >= minCount(s) ? q * paysFor(s)[k - 2] : 0), 0);
    perSpin += (line + scatter + expand) / BK;
  }
  const averageFeature = averageFreeSpins * perSpin;
  statsCache = { rtp: line + scatter + trigger * averageFeature, baseRtp: line + scatter, featureChance: trigger, averageFeature, averageFreeSpins };
  return statsCache;
}

export type Rng = () => number;

/** The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:bookofpharaoh:<nonce>:<block>"), read as 32-bit numbers. */
export function pharaohRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:bookofpharaoh:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export type FreeSpin = {
  stops: number[];
  lines: LineWin[];
  books: number;
  /** Reels the special symbol filled (empty when it didn't pay). */
  expandReels: number[];
  /** Expanding special symbol's pay, in stakes. */
  expand: number;
  /** This spin's lines, books and expansion, in stakes. */
  win: number;
  /** Free spins added by this spin (0 or 10). */
  retrigger: number;
  spinsLeft: number;
};

export type PharaohOutcome = {
  stops: number[];
  lines: LineWin[];
  books: number;
  /** Base lines plus book scatter, in stakes. */
  baseWin: number;
  /** The free spins' special symbol, or null when they didn't start. */
  special: PharaohSymbol | null;
  freeSpins: FreeSpin[];
  /** What the whole spin pays, in stakes. */
  totalWin: number;
};

export function playSpin(rng: Rng): PharaohOutcome {
  const stops = STRIPS.map((s) => Math.floor(rng() * s.length));
  const base = evaluateWindow(windowFor(stops), null);
  const baseWin = base.lineTotal + base.scatter;
  const freeSpins: FreeSpin[] = [];
  let special: number | null = null;
  if (base.books >= 3) {
    special = Math.floor(rng() * BK);
    let spinsLeft = FREE_SPINS;
    let played = 0;
    while (spinsLeft > 0 && played < MAX_FREE_SPINS) {
      spinsLeft--;
      played++;
      const fStops = STRIPS.map((s) => Math.floor(rng() * s.length));
      const r = evaluateWindow(windowFor(fStops), special);
      const retrigger = r.books >= 3 ? FREE_SPINS : 0;
      spinsLeft += retrigger;
      freeSpins.push({
        stops: fStops,
        lines: r.lines,
        books: r.books,
        expandReels: r.expandReels,
        expand: r.expand,
        win: Number((r.lineTotal + r.scatter + r.expand).toFixed(4)),
        retrigger,
        spinsLeft,
      });
    }
  }
  const totalWin = Number((baseWin + freeSpins.reduce((s, f) => s + f.win, 0)).toFixed(4));
  return {
    stops,
    lines: base.lines,
    books: base.books,
    baseWin: Number(baseWin.toFixed(4)),
    special: special === null ? null : SYMBOLS[special],
    freeSpins,
    totalWin,
  };
}

export function replayPharaohSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(pharaohRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.BookOfPharaohSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(row: SpinRow) {
  const { serverSeed: _hidden, ...rest } = row;
  return rest;
}

export function getBookOfPharaohConfig() {
  const stats = getStats();
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    symbols: SYMBOLS,
    strips: STRIPS.map((s) => s.map((i) => SYMBOLS[i])),
    lines: LINES,
    lineCount: LINE_COUNT,
    pays: PAYS,
    scatterPays: SCATTER_PAYS,
    freeSpins: FREE_SPINS,
    featureChancePercent: round2(stats.featureChance * 100),
    rtpPercent: Math.floor(stats.rtp * 10000) / 100,
  };
}

/** Spins once (free spins included): debits the stake, plays from the player's provably-fair seeds and pays, in one transaction. */
export async function spinBookOfPharaoh(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayPharaohSpin(serverSeed, clientSeed, nonce);
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

    return tx.bookOfPharaohSpin.create({
      data: {
        userId,
        stake,
        totalWin: outcome.totalWin,
        payout,
        freeSpins: outcome.freeSpins.length,
        special: outcome.special,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyBookOfPharaohHistory(userId: string, limit = 30) {
  const rows = await prisma.bookOfPharaohSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return rows.map(toPublicSpin);
}
