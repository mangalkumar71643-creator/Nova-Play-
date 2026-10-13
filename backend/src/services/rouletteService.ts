import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * European roulette: one ball, a single-zero wheel of 37 pockets (0-36).
 * Shared rounds on fixed wall-clock slots, same shape as Andar Bahar: bets
 * for BET_SECONDS, then the wheel spins and the winning number is revealed.
 */
export const ROUND_SECONDS = 35;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 20;
/** The winning number is revealed this far into the round; the client
 * launches the ball at betting close and lands it after the reveal. */
export const RESULT_AT_SECONDS = 21;

export const POCKETS = 37;
export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export function colorOf(n: number): "RED" | "BLACK" | "GREEN" {
  return n === 0 ? "GREEN" : RED_NUMBERS.includes(n) ? "RED" : "BLACK";
}

/**
 * Every bet on the table, by key -> the numbers it covers. The layout is the
 * usual three columns (1,4..34 / 2,5..35 / 3,6..36) with 0 at the head.
 *   S:n        straight            SP:a-b  split (neighbours on the layout)
 *   ST:n       street n..n+2       TR:0-1-2 / TR:0-2-3  trios with zero
 *   CO:n       corner n,n+1,n+3,n+4 (CO:0 = 0,1,2,3, the "first four")
 *   LN:n       six line n..n+5
 *   DZ1-3, COL1-3, RED, BLACK, ODD, EVEN, LOW (1-18), HIGH (19-36)
 */
function buildSpots(): Map<string, number[]> {
  const m = new Map<string, number[]>();
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  for (let n = 0; n <= 36; n++) m.set(`S:${n}`, [n]);
  for (let n = 1; n <= 33; n++) m.set(`SP:${n}-${n + 3}`, [n, n + 3]);
  for (let n = 1; n <= 35; n++) if (n % 3 !== 0) m.set(`SP:${n}-${n + 1}`, [n, n + 1]);
  for (const n of [1, 2, 3]) m.set(`SP:0-${n}`, [0, n]);
  for (let n = 1; n <= 34; n += 3) m.set(`ST:${n}`, [n, n + 1, n + 2]);
  m.set("TR:0-1-2", [0, 1, 2]);
  m.set("TR:0-2-3", [0, 2, 3]);
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) m.set(`CO:${n}`, [n, n + 1, n + 3, n + 4]);
  m.set("CO:0", [0, 1, 2, 3]);
  for (let n = 1; n <= 31; n += 3) m.set(`LN:${n}`, range(n, n + 5));
  for (let d = 1; d <= 3; d++) m.set(`DZ${d}`, range(12 * d - 11, 12 * d));
  for (let c = 1; c <= 3; c++) m.set(`COL${c}`, range(1, 36).filter((n) => n % 3 === c % 3));
  m.set("RED", RED_NUMBERS);
  m.set("BLACK", range(1, 36).filter((n) => !RED_NUMBERS.includes(n)));
  m.set("ODD", range(1, 36).filter((n) => n % 2 === 1));
  m.set("EVEN", range(1, 36).filter((n) => n % 2 === 0));
  m.set("LOW", range(1, 18));
  m.set("HIGH", range(19, 36));
  return m;
}

export const SPOTS = buildSpots();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/** Total return per unit staked (stake included) for a bet covering
 * `count` of the 37 pockets: multiplier * P(win) = the shared rtp, rounded
 * down so the edge is never smaller than advertised. */
export function multiplierForCount(count: number): number {
  return floor2((env.games.rtp * POCKETS) / count);
}

export function multiplierFor(key: string): number {
  return multiplierForCount(SPOTS.get(key)!.length);
}

export function spotWins(key: string, result: number): boolean {
  return SPOTS.get(key)!.includes(result);
}

/** The winning number, fixed the moment the round is created from its
 * server seed (commit-reveal: only the seed hash is public until reveal). */
export function resultFor(serverSeed: string, periodNumber: string): number {
  return Math.floor(fairRandomFloat(serverSeed, periodNumber, 0) * POCKETS);
}

/** IST has no DST, so a fixed offset is exact. Period = IST date + the
 * slot's 1-based index within that day. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function periodNumberFor(startTime: Date): string {
  const ist = new Date(startTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const secondsSinceMidnight = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  return `${y}${m}${d}${String(Math.floor(secondsSinceMidnight / ROUND_SECONDS) + 1).padStart(5, "0")}`;
}

type Phase = "BETTING" | "SPINNING" | "RESULT";

type RoundRow = Prisma.RouletteRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "SPINNING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.rouletteRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const result = resultFor(serverSeed, periodNumber);
  try {
    return await prisma.rouletteRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        result,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.rouletteRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a revealed round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST update, so two requests
 * settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "RouletteRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.rouletteBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const won = spotWins(bet.area, round.result);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.rouletteBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", payout },
      });
      if (claimed.count === 0) return;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: Prisma.WalletUpdateInput = {};
      if (won) data.balance = { increment: payout };
      // Wagering counts once the bet is decided (not when placed), so
      // placing and cancelling bets can't clear a bonus requirement.
      if (Number(wallet.lockedBonus) > 0) {
        const progress = Number(wallet.wageringProgress) + Number(bet.amount);
        if (progress >= Number(wallet.wageringRequired)) {
          data.lockedBonus = 0;
          data.wageringRequired = 0;
          data.wageringProgress = 0;
        } else {
          data.wageringProgress = { increment: Number(bet.amount) };
        }
      }
      if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId: bet.userId }, data });
      if (won) {
        await tx.transaction.create({
          data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
        });
      }
    });
  }

  await prisma.rouletteRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose number is already out — there is no
 * always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.rouletteRound.findMany({
    where: { settled: false, resultTime: { lte: now } },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  for (const round of due) await settleRound(round);
}

function toView(round: RoundRow, now: Date) {
  const phase = phaseFor(round, now);
  const revealed = phase === "RESULT";
  return {
    periodNumber: round.periodNumber,
    startTime: round.startTime,
    betEndTime: round.betEndTime,
    resultTime: round.resultTime,
    endTime: round.endTime,
    serverTime: now,
    phase,
    serverSeedHash: round.serverSeedHash,
    // The number (and the seed that produced it) stays hidden until reveal.
    result: revealed ? round.result : null,
    color: revealed ? colorOf(round.result) : null,
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getRouletteConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    roundSeconds: ROUND_SECONDS,
    betSeconds: BET_SECONDS,
    resultAtSeconds: RESULT_AT_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    redNumbers: RED_NUMBERS,
    // Total return per unit staked, by how many numbers the bet covers.
    multipliers: Object.fromEntries([1, 2, 3, 4, 6, 12, 18].map((c) => [c, multiplierForCount(c)])),
  };
}

export type BetInput = { area: string; amount: number };

/** Places one or more chips on the current round in one transaction. The
 * total on each bet spot must stay within maxStake, and its win within
 * maxPayout (so a straight-up number takes at most maxPayout / 33.3). */
export async function placeRouletteBets(userId: string, bets: BetInput[]) {
  if (bets.length === 0) throw new ApiError(400, "No bets given.");
  for (const b of bets) {
    if (!SPOTS.has(b.area)) throw new ApiError(400, "Unknown bet.");
    if (b.amount < env.games.minStake) throw new ApiError(400, `Minimum bet is ${env.games.minStake}.`);
  }

  await assertCanTransact(userId);

  const now = new Date();
  const round = await getOrCreateRound(now);
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }

  const total = round2(bets.reduce((sum, b) => sum + b.amount, 0));

  const created = await prisma.$transaction(async (tx) => {
    // Serialise this player's bet changes so parallel taps can't slip past
    // the per-box limits between the read below and the insert.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "RouletteRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.rouletteBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING" },
      select: { area: true, amount: true },
    });
    const perArea = new Map<string, number>();
    for (const b of mine) perArea.set(b.area, (perArea.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perArea.set(b.area, round2((perArea.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const areaTotal = perArea.get(b.area)!;
      if (areaTotal > env.games.maxStake) throw new ApiError(400, `Max bet per spot is ${env.games.maxStake}.`);
      if (areaTotal * multiplierFor(b.area) > env.games.maxPayout) {
        throw new ApiError(400, `Max win per spot is ${env.games.maxPayout}.`);
      }
    }

    // Conditional debit so simultaneous requests can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: total } },
      data: { balance: { decrement: total } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: total, status: "COMPLETED" } });

    const rows = [];
    for (const b of bets) {
      rows.push(
        await tx.rouletteBet.create({
          data: { roundId: round.id, userId, area: b.area, amount: b.amount, multiplier: multiplierFor(b.area) },
        })
      );
    }
    return rows;
  });

  return { periodNumber: round.periodNumber, bets: created };
}

/** Takes chips back off the current round while betting is still open
 * (undo = one bet id, clear = all of them). */
export async function cancelRouletteBets(userId: string, betIds?: string[]) {
  const now = new Date();
  const round = await getOrCreateRound(now);
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed — bets can no longer be removed.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    // Hold the round open until this commits (settlement waits on this
    // lock), and re-check the clock now that we have it, so a bet can
    // never land on a round that is already being settled.
    await tx.$queryRaw`SELECT id FROM "RouletteRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.rouletteBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.rouletteBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: "VOID" },
      });
      if (claimed.count === 0) continue;
      refund = round2(refund + Number(bet.amount));
      cancelled.push(bet.id);
    }
    if (refund > 0) {
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: refund } } });
      await tx.transaction.create({ data: { userId, type: "BET_REFUND", amount: refund, status: "COMPLETED" } });
    }
    return { cancelled, refund };
  });
}

/** The player's bets on one round (defaults to the current one). */
export async function getMyRoundBets(userId: string, periodNumber?: string) {
  const now = new Date();
  const round = periodNumber
    ? await prisma.rouletteRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.rouletteBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getRouletteHistory(limit = 100) {
  const rounds = await prisma.rouletteRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, result: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({
    periodNumber: r.periodNumber,
    result: r.result,
    color: colorOf(r.result),
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
  }));
}

export async function getMyRouletteBets(userId: string, limit = 50) {
  const bets = await prisma.rouletteBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, result: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    result: round.settled ? round.result : null,
  }));
}
