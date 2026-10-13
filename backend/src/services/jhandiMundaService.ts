import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "Jhandi Munda": six dice, each with the same six symbols, are shaken and
 * thrown. A bet on a symbol wins when it shows on two or more dice, and pays
 * more the more dice show it. Shared rounds on fixed wall-clock slots, same
 * shape as Andar Bahar.
 */
export const ROUND_SECONDS = 25;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 15;
/** The dice are revealed this far into the round; before that the client
 * shows the shake, after it the throw and the result. */
export const RESULT_AT_SECONDS = 16;

/** Die faces, in face-index order 0..5. */
export const AREAS = ["HEART", "SPADE", "DIAMOND", "CLUB", "FLAG", "CROWN"] as const;
export type Area = (typeof AREAS)[number];

export const DICE = 6;

/**
 * Total return per unit staked (stake included) by how many of the six dice
 * show the symbol; 0 or 1 loses. Matches follow Binomial(6, 1/6), so out of
 * 6^6 = 46656 equally likely throws: 2 -> 9375, 3 -> 2500, 4 -> 375,
 * 5 -> 30, 6 -> 1. Expected return =
 * (9375*3 + 2500*4.5 + 375*6 + 30*10 + 1*20) / 46656 = 41945 / 46656
 * = 89.90% — never above the shared 90% rtp. The top pays 20x, so a full
 * box (maxStake) can never win more than maxPayout.
 */
export const PAYTABLE: Record<number, number> = { 2: 3, 3: 4.5, 4: 6, 5: 10, 6: 20 };
const TOP_MULTIPLIER = 20;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

function choose(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Chance that exactly k of the six dice show a given symbol. */
function matchChance(k: number): number {
  return (choose(DICE, k) * 5 ** (DICE - k)) / 6 ** DICE;
}

export function rtp(): number {
  let r = 0;
  for (const [k, m] of Object.entries(PAYTABLE)) r += matchChance(Number(k)) * m;
  return r;
}

export function matchesFor(area: Area, dice: number[]): number {
  const face = AREAS.indexOf(area);
  return dice.filter((d) => d === face).length;
}

export function multiplierFor(matches: number): number {
  return PAYTABLE[matches] ?? 0;
}

/** Each die lands on a face picked independently and uniformly from the
 * round's server seed (commit-reveal: only the seed hash is public until
 * the dice are revealed). */
export function diceFor(serverSeed: string, periodNumber: string): number[] {
  return Array.from({ length: DICE }, (_, i) => Math.floor(fairRandomFloat(serverSeed, periodNumber, i) * 6));
}

/** How many dice show each symbol. */
export function countsOf(dice: number[]): Record<Area, number> {
  return Object.fromEntries(AREAS.map((a, i) => [a, dice.filter((d) => d === i).length])) as Record<Area, number>;
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

type Phase = "BETTING" | "ROLLING" | "RESULT";

type RoundRow = Prisma.JhandiMundaRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "ROLLING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.jhandiMundaRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const dice = diceFor(serverSeed, periodNumber);
  try {
    return await prisma.jhandiMundaRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        dice,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.jhandiMundaRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a revealed round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST update, so two requests
 * settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "JhandiMundaRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.jhandiMundaBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const matches = matchesFor(bet.area as Area, round.dice);
    const won = multiplierFor(matches) > 0;
    const payout = won ? Math.min(floor2(Number(bet.amount) * multiplierFor(matches)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.jhandiMundaBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", payout, matches },
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

  await prisma.jhandiMundaRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose dice are already out — there is no
 * always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.jhandiMundaRound.findMany({
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
    // The dice (and the seed that produced them) stay hidden until reveal.
    dice: revealed ? round.dice.map((d) => AREAS[d]) : null,
    counts: revealed ? countsOf(round.dice) : null,
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getJhandiMundaConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    roundSeconds: ROUND_SECONDS,
    betSeconds: BET_SECONDS,
    resultAtSeconds: RESULT_AT_SECONDS,
    rtpPercent: round2(rtp() * 100),
    symbols: AREAS,
    paytable: PAYTABLE,
  };
}

export type BetInput = { area: Area; amount: number };

/** Places one or more chips on the current round in one transaction. The
 * total on each symbol must stay within maxStake, and its top possible win
 * within maxPayout. */
export async function placeJhandiMundaBets(userId: string, bets: BetInput[]) {
  if (bets.length === 0) throw new ApiError(400, "No bets given.");
  for (const b of bets) {
    if (!AREAS.includes(b.area)) throw new ApiError(400, "Unknown symbol.");
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
    await tx.$queryRaw`SELECT id FROM "JhandiMundaRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.jhandiMundaBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING" },
      select: { area: true, amount: true },
    });
    const perArea = new Map<string, number>();
    for (const b of mine) perArea.set(b.area, (perArea.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perArea.set(b.area, round2((perArea.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const areaTotal = perArea.get(b.area)!;
      if (areaTotal > env.games.maxStake) throw new ApiError(400, `Max bet per box is ${env.games.maxStake}.`);
      if (areaTotal * TOP_MULTIPLIER > env.games.maxPayout) {
        throw new ApiError(400, `Max win per box is ${env.games.maxPayout}.`);
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
        await tx.jhandiMundaBet.create({
          data: { roundId: round.id, userId, area: b.area, amount: b.amount },
        })
      );
    }
    return rows;
  });

  return { periodNumber: round.periodNumber, bets: created };
}

/** Takes chips back off the current round while betting is still open
 * (undo = one bet id, clear = all of them). */
export async function cancelJhandiMundaBets(userId: string, betIds?: string[]) {
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
    await tx.$queryRaw`SELECT id FROM "JhandiMundaRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.jhandiMundaBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.jhandiMundaBet.updateMany({
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
    ? await prisma.jhandiMundaRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.jhandiMundaBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getJhandiMundaHistory(limit = 100) {
  const rounds = await prisma.jhandiMundaRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, dice: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({
    periodNumber: r.periodNumber,
    dice: r.dice.map((d) => AREAS[d]),
    counts: countsOf(r.dice),
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
  }));
}

export async function getMyJhandiMundaBets(userId: string, limit = 50) {
  const bets = await prisma.jhandiMundaBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, dice: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    dice: round.settled ? round.dice.map((d) => AREAS[d]) : null,
  }));
}
