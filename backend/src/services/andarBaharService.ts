import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "Andar Bahar": a Joker card is turned up, then cards are dealt one at a
 * time, Andar first, then Bahar, alternately, until one matches the
 * Joker's rank — that side wins. Side bets are on how many cards get dealt.
 * Shared rounds on fixed wall-clock slots, same shape as Dragon Tiger.
 */
export const ROUND_SECONDS = 30;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 15;
/** Joker and the dealt cards are revealed this far into the round; the rest
 * of the round is the deal animation and the result. */
export const RESULT_AT_SECONDS = 16;

export const AREAS = ["ANDAR", "BAHAR", "C1_5", "C6_10", "C11_15", "C16_25", "C26_35", "C36_49"] as const;
export type Area = (typeof AREAS)[number];

/** Card-count side bets: inclusive ranges of the total cards dealt. */
const RANGES: Partial<Record<Area, [number, number]>> = {
  C1_5: [1, 5],
  C6_10: [6, 10],
  C11_15: [11, 15],
  C16_25: [16, 25],
  C26_35: [26, 35],
  C36_49: [36, 49],
};

const SUITS = ["S", "H", "C", "D"] as const; // spades, hearts, clubs, diamonds

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/** Card index 0..51 -> rank 1 (A) .. 13 (K) and suit. */
export function cardOf(index: number) {
  return { rank: (index % 13) + 1, suit: SUITS[Math.floor(index / 13)] };
}

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** After the Joker, 51 cards remain and 3 of them match its rank. The
 * first match lands on card k (1-based) with probability
 * C(51-k, 2) / C(51, 3). Odd k is Andar's card (Andar is dealt first). */
function firstMatchChance(k: number): number {
  return choose(51 - k, 2) / choose(51, 3);
}

function winChance(area: Area): number {
  let p = 0;
  for (let k = 1; k <= 49; k++) {
    const range = RANGES[area];
    const hit = area === "ANDAR" ? k % 2 === 1 : area === "BAHAR" ? k % 2 === 0 : k >= range![0] && k <= range![1];
    if (hit) p += firstMatchChance(k);
  }
  return p;
}

/** Total return per unit staked (stake included): multiplier * P(win) =
 * the shared rtp on every bet, rounded down so the edge is never smaller
 * than advertised. */
export function multiplierFor(area: Area): number {
  return floor2(env.games.rtp / winChance(area));
}

export type Winner = "ANDAR" | "BAHAR";

export function winnerOf(cards: number[]): Winner {
  return cards.length % 2 === 1 ? "ANDAR" : "BAHAR";
}

export function areaWins(area: Area, cards: number[]): boolean {
  if (area === "ANDAR" || area === "BAHAR") return area === winnerOf(cards);
  const [lo, hi] = RANGES[area]!;
  return cards.length >= lo && cards.length <= hi;
}

/** The Joker and the deal, fixed the moment the round is created from its
 * server seed (commit-reveal: only the seed hash is public until reveal).
 * Draw i picks uniformly from the cards still in the deck, so the deal is a
 * fair shuffle; dealing stops at the first card of the Joker's rank. */
export function dealFor(serverSeed: string, periodNumber: string): { joker: number; cards: number[] } {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const pick = (nonce: number) => {
    const j = Math.floor(fairRandomFloat(serverSeed, periodNumber, nonce) * deck.length);
    return deck.splice(j, 1)[0];
  };
  const joker = pick(0);
  const jokerRank = cardOf(joker).rank;
  const cards: number[] = [];
  for (let i = 1; deck.length > 0; i++) {
    const card = pick(i);
    cards.push(card);
    if (cardOf(card).rank === jokerRank) break;
  }
  return { joker, cards };
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

type Phase = "BETTING" | "DEALING" | "RESULT";

type RoundRow = Prisma.AndarBaharRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "DEALING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.andarBaharRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const { joker, cards } = dealFor(serverSeed, periodNumber);
  try {
    return await prisma.andarBaharRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        joker,
        cards,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.andarBaharRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a revealed round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST update, so two requests
 * settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "AndarBaharRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.andarBaharBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const won = areaWins(bet.area as Area, round.cards);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.andarBaharBet.updateMany({
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

  await prisma.andarBaharRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose cards are already out — there is no
 * always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.andarBaharRound.findMany({
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
    // The cards (and the seed that produced them) stay hidden until reveal.
    joker: revealed ? cardOf(round.joker) : null,
    cards: revealed ? round.cards.map(cardOf) : null,
    winner: revealed ? winnerOf(round.cards) : null,
    totalCards: revealed ? round.cards.length : null,
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getAndarBaharConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    roundSeconds: ROUND_SECONDS,
    betSeconds: BET_SECONDS,
    resultAtSeconds: RESULT_AT_SECONDS,
    rtpPercent: round2(env.games.rtp * 100),
    multipliers: Object.fromEntries(AREAS.map((a) => [a, multiplierFor(a)])),
  };
}

export type BetInput = { area: Area; amount: number };

/** Places one or more chips on the current round in one transaction. The
 * total on each area must stay within maxStake, and its potential win
 * within maxPayout. */
export async function placeAndarBaharBets(userId: string, bets: BetInput[]) {
  if (bets.length === 0) throw new ApiError(400, "No bets given.");
  for (const b of bets) {
    if (!AREAS.includes(b.area)) throw new ApiError(400, "Unknown bet area.");
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
    await tx.$queryRaw`SELECT id FROM "AndarBaharRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.andarBaharBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING" },
      select: { area: true, amount: true },
    });
    const perArea = new Map<string, number>();
    for (const b of mine) perArea.set(b.area, (perArea.get(b.area) ?? 0) + Number(b.amount));
    for (const b of bets) perArea.set(b.area, round2((perArea.get(b.area) ?? 0) + b.amount));
    for (const b of bets) {
      const areaTotal = perArea.get(b.area)!;
      if (areaTotal > env.games.maxStake) throw new ApiError(400, `Max bet per box is ${env.games.maxStake}.`);
      if (areaTotal * multiplierFor(b.area) > env.games.maxPayout) {
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
        await tx.andarBaharBet.create({
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
export async function cancelAndarBaharBets(userId: string, betIds?: string[]) {
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
    await tx.$queryRaw`SELECT id FROM "AndarBaharRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.andarBaharBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.andarBaharBet.updateMany({
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
    ? await prisma.andarBaharRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.andarBaharBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getAndarBaharHistory(limit = 100) {
  const rounds = await prisma.andarBaharRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, joker: true, cards: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({
    periodNumber: r.periodNumber,
    joker: cardOf(r.joker),
    winner: winnerOf(r.cards),
    totalCards: r.cards.length,
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
  }));
}

export async function getMyAndarBaharBets(userId: string, limit = 50) {
  const bets = await prisma.andarBaharBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, joker: true, cards: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    joker: round.settled ? cardOf(round.joker) : null,
    winner: round.settled ? winnerOf(round.cards) : null,
    totalCards: round.settled ? round.cards.length : null,
  }));
}
