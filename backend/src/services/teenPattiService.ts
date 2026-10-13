import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "Teen Patti 20-20": three cards each to Player A and Player B from one
 * deck; the better Teen Patti hand wins. Hand order: Trail > Pure Sequence
 * > Sequence > Color > Pair > High Card. An exact tie (same ranks, same
 * hand type) pays the Tie bet and loses A / B bets. Shared rounds on fixed
 * wall-clock slots, same engine as Dragon Tiger / Andar Bahar.
 */
export const ROUND_SECONDS = 25;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 15;
/** The six cards are revealed this far into the round. */
export const RESULT_AT_SECONDS = 16;

export const AREAS = ["PLAYER_A", "PLAYER_B", "TIE"] as const;
export type Area = (typeof AREAS)[number];

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

export const HAND_NAMES = ["", "High Card", "Pair", "Color", "Sequence", "Pure Sequence", "Trail"] as const;

/** Teen Patti hand strength as one comparable number: category first, then
 * the tie-breaks. Aces are high (14); A-K-Q is the top sequence and A-2-3
 * the next, above K-Q-J. */
export function handScore(cards: number[]): { score: number; category: number } {
  const ranks = cards.map((c) => (c % 13) + 1).map((r) => (r === 1 ? 14 : r)).sort((x, y) => y - x);
  const suits = cards.map((c) => Math.floor(c / 13));
  const flush = suits[0] === suits[1] && suits[1] === suits[2];
  const [a, b, c] = ranks;
  const isA23 = a === 14 && b === 3 && c === 2;
  const straight = (a - 1 === b && b - 1 === c) || isA23;
  const seqValue = a === 14 && b === 13 ? 100 : isA23 ? 99 : a;
  let category: number;
  let tie: number;
  if (a === b && b === c) {
    category = 6;
    tie = a;
  } else if (straight && flush) {
    category = 5;
    tie = seqValue;
  } else if (straight) {
    category = 4;
    tie = seqValue;
  } else if (flush) {
    category = 3;
    tie = a * 10000 + b * 100 + c;
  } else if (a === b || b === c) {
    category = 2;
    const pair = b;
    const kicker = a === b ? c : a;
    tie = pair * 100 + kicker;
  } else {
    category = 1;
    tie = a * 10000 + b * 100 + c;
  }
  return { score: category * 1e7 + tie, category };
}

/** Exact chance of a tie: over every way to deal 3 cards to A and 3 to B
 * from one deck, the share where both hands score the same. Hands are
 * grouped by score so only same-score pairs are checked (a few hundred
 * thousand pair checks, done once). */
function computeTieChance(): number {
  const groups = new Map<number, number[]>();
  for (let x = 0; x < 52; x++)
    for (let y = x + 1; y < 52; y++)
      for (let z = y + 1; z < 52; z++) {
        const { score } = handScore([x, y, z]);
        const mask = 2 ** x + 2 ** y + 2 ** z;
        const g = groups.get(score);
        if (g) g.push(mask);
        else groups.set(score, [mask]);
      }
  // Disjointness via bit masks; 52 bits exceeds 32-bit ops, so split.
  const lo = (m: number) => m % 2 ** 26;
  const hi = (m: number) => Math.floor(m / 2 ** 26);
  let tiePairs = 0;
  for (const masks of groups.values()) {
    for (const m1 of masks) {
      const l1 = lo(m1);
      const h1 = hi(m1);
      for (const m2 of masks) if ((l1 & lo(m2)) === 0 && (h1 & hi(m2)) === 0) tiePairs++;
    }
  }
  const total = 22100 * 18424; // C(52,3) * C(49,3) ordered deals
  return tiePairs / total;
}

let tieChanceCache: number | null = null;
function tieChance(): number {
  if (tieChanceCache === null) tieChanceCache = computeTieChance();
  return tieChanceCache;
}

/** A and B are symmetric, so each wins (1 - P(tie)) / 2 of the time. */
function winChance(area: Area): number {
  const t = tieChance();
  return area === "TIE" ? t : (1 - t) / 2;
}

/** Total return per unit staked (stake included): multiplier * P(win) =
 * the shared rtp on every bet, rounded down so the edge is never smaller
 * than advertised. */
export function multiplierFor(area: Area): number {
  return floor2(env.games.rtp / winChance(area));
}

export type Winner = "PLAYER_A" | "PLAYER_B" | "TIE";

export function winnerOf(cards: number[]): Winner {
  const a = handScore([cards[0], cards[2], cards[4]]).score;
  const b = handScore([cards[1], cards[3], cards[5]]).score;
  return a === b ? "TIE" : a > b ? "PLAYER_A" : "PLAYER_B";
}

export function areaWins(area: Area, cards: number[]): boolean {
  return area === winnerOf(cards);
}

/** Dealt A, B, A, B, A, B; each draw picks uniformly from the cards left,
 * fixed the moment the round is created from its server seed. */
export function dealFor(serverSeed: string, periodNumber: string): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const cards: number[] = [];
  for (let i = 0; i < 6; i++) {
    const j = Math.floor(fairRandomFloat(serverSeed, periodNumber, i) * deck.length);
    cards.push(deck.splice(j, 1)[0]);
  }
  return cards;
}

function handsView(cards: number[]) {
  const a = [cards[0], cards[2], cards[4]];
  const b = [cards[1], cards[3], cards[5]];
  return {
    playerA: a.map(cardOf),
    playerB: b.map(cardOf),
    handA: HAND_NAMES[handScore(a).category],
    handB: HAND_NAMES[handScore(b).category],
    winner: winnerOf(cards),
  };
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

type RoundRow = Prisma.TeenPattiRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "DEALING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.teenPattiRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const cards = dealFor(serverSeed, periodNumber);
  try {
    return await prisma.teenPattiRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        cards,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.teenPattiRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a revealed round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST update, so two requests
 * settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "TeenPattiRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.teenPattiBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const won = areaWins(bet.area as Area, round.cards);
    const payout = won ? Math.min(floor2(Number(bet.amount) * Number(bet.multiplier)), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.teenPattiBet.updateMany({
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

  await prisma.teenPattiRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose cards are already out — there is no
 * always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.teenPattiRound.findMany({
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
    ...(revealed ? handsView(round.cards) : { playerA: null, playerB: null, handA: null, handB: null, winner: null }),
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getTeenPattiConfig() {
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
export async function placeTeenPattiBets(userId: string, bets: BetInput[]) {
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
    await tx.$queryRaw`SELECT id FROM "TeenPattiRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.teenPattiBet.findMany({
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
        await tx.teenPattiBet.create({
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
export async function cancelTeenPattiBets(userId: string, betIds?: string[]) {
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
    await tx.$queryRaw`SELECT id FROM "TeenPattiRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.teenPattiBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.teenPattiBet.updateMany({
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
    ? await prisma.teenPattiRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.teenPattiBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getTeenPattiHistory(limit = 100) {
  const rounds = await prisma.teenPattiRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, cards: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({
    periodNumber: r.periodNumber,
    ...handsView(r.cards),
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
  }));
}

export async function getMyTeenPattiBets(userId: string, limit = 50) {
  const bets = await prisma.teenPattiBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, cards: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    winner: round.settled ? winnerOf(round.cards) : null,
  }));
}
