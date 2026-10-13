import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * "Baccarat" (punto banco): two cards each to Player and Banker, the
 * standard third-card tableau decides any third cards, and the hand whose
 * total (mod 10) is closer to 9 wins. Shared rounds on fixed wall-clock
 * slots, same shape as Dragon Tiger: betting, then dealing, then reveal.
 */
export const ROUND_SECONDS = 30;
/** Bets are accepted while less than this much of the round has passed. */
export const BET_SECONDS = 15;
/** The dealt cards are revealed this far into the round. */
export const RESULT_AT_SECONDS = 17;

export const AREAS = ["PLAYER", "BANKER", "TIE", "PLAYER_PAIR", "BANKER_PAIR"] as const;
export type Area = (typeof AREAS)[number];

const SUITS = ["S", "H", "C", "D"] as const; // spades, hearts, clubs, diamonds

/**
 * Exact outcome chances when every card is drawn independently from a full
 * 52-card deck (an infinite shoe), found by enumerating every card sequence
 * through the tableau below. A pair (first two cards of one hand share a
 * rank) is 1 in 13.
 */
const P_PLAYER = 0.4461465121159756;
const P_BANKER = 0.458427917906012;
const P_TIE = 0.0954255699780124;

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

/** Baccarat point value: A = 1, 2-9 face value, 10/J/Q/K = 0. */
function pointOf(index: number): number {
  const rank = (index % 13) + 1;
  return rank >= 10 ? 0 : rank;
}

export function handTotal(cards: number[]): number {
  return cards.reduce((sum, c) => sum + pointOf(c), 0) % 10;
}

/**
 * Total return per unit staked (stake included), so the expected return of
 * every bet is the shared rtp. A Player/Banker bet gets its stake back on a
 * tie, so its win multiplier m satisfies m * P(win) + 1 * P(tie) = rtp.
 * Rounded down so the edge is never smaller than advertised.
 */
export function multiplierFor(area: Area): number {
  const rtp = env.games.rtp;
  if (area === "PLAYER") return floor2((rtp - P_TIE) / P_PLAYER);
  if (area === "BANKER") return floor2((rtp - P_TIE) / P_BANKER);
  if (area === "TIE") return floor2(rtp / P_TIE);
  return floor2(rtp * 13);
}

/** Whether the Banker draws a third card, per the punto banco tableau.
 * playerThird is the point value of the Player's third card, or null if
 * the Player stood. */
function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThird !== 8;
  if (bankerTotal === 4) return playerThird >= 2 && playerThird <= 7;
  if (bankerTotal === 5) return playerThird >= 4 && playerThird <= 7;
  if (bankerTotal === 6) return playerThird === 6 || playerThird === 7;
  return false;
}

/** Deals a hand from the six pre-drawn cards (in shoe order: P, B, P, B,
 * then Player's third, then Banker's third). */
export function dealHand(draws: number[]): { player: number[]; banker: number[] } {
  const player = [draws[0], draws[2]];
  const banker = [draws[1], draws[3]];
  const pt = handTotal(player);
  const bt = handTotal(banker);
  // A natural (8 or 9) on either side ends the hand.
  if (pt >= 8 || bt >= 8) return { player, banker };

  let playerThird: number | null = null;
  if (pt <= 5) {
    player.push(draws[4]);
    playerThird = pointOf(draws[4]);
  }
  if (bankerDraws(bt, playerThird)) banker.push(draws[5]);
  return { player, banker };
}

export type Winner = "PLAYER" | "BANKER" | "TIE";

export function winnerOf(player: number[], banker: number[]): Winner {
  const pt = handTotal(player);
  const bt = handTotal(banker);
  if (pt === bt) return "TIE";
  return pt > bt ? "PLAYER" : "BANKER";
}

function isPair(cards: number[]): boolean {
  return cards[0] % 13 === cards[1] % 13;
}

/** The multiplier actually paid on a bet for this hand: its locked-in
 * multiplier on a win, 1 (stake back) for Player/Banker on a tie, else 0. */
export function paidMultiplierFor(area: Area, multiplier: number, player: number[], banker: number[]): number {
  const winner = winnerOf(player, banker);
  if (area === "PLAYER_PAIR") return isPair(player) ? multiplier : 0;
  if (area === "BANKER_PAIR") return isPair(banker) ? multiplier : 0;
  if (area === winner) return multiplier;
  if (winner === "TIE" && (area === "PLAYER" || area === "BANKER")) return 1;
  return 0;
}

/** Each of the six cards is its own HMAC draw on the round's server seed,
 * so the hand is fixed the moment the round is created (commit-reveal:
 * only the seed hash is public until the cards are shown). */
export function drawsFor(serverSeed: string, periodNumber: string): number[] {
  return Array.from({ length: 6 }, (_, i) => Math.floor(fairRandomFloat(serverSeed, periodNumber, i) * 52));
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

type RoundRow = Prisma.BaccaratRoundGetPayload<Record<string, never>>;

function phaseFor(round: RoundRow, now: Date): Phase {
  if (now < round.betEndTime) return "BETTING";
  if (now < round.resultTime) return "DEALING";
  return "RESULT";
}

async function getOrCreateRound(now: Date): Promise<RoundRow> {
  const slotMs = ROUND_SECONDS * 1000;
  const startTime = new Date(Math.floor(now.getTime() / slotMs) * slotMs);
  const periodNumber = periodNumberFor(startTime);
  const existing = await prisma.baccaratRound.findUnique({ where: { periodNumber } });
  if (existing) return existing;

  const serverSeed = generateServerSeed();
  const { player, banker } = dealHand(drawsFor(serverSeed, periodNumber));
  try {
    return await prisma.baccaratRound.create({
      data: {
        periodNumber,
        startTime,
        betEndTime: new Date(startTime.getTime() + BET_SECONDS * 1000),
        resultTime: new Date(startTime.getTime() + RESULT_AT_SECONDS * 1000),
        endTime: new Date(startTime.getTime() + slotMs),
        playerCards: player,
        bankerCards: banker,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
      },
    });
  } catch {
    // periodNumber is deterministic from the slot, so a unique-constraint
    // failure means a concurrent request created this round first.
    return prisma.baccaratRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Pays out every still-pending bet on a revealed round. Each bet is
 * claimed with a guarded PENDING -> WON/LOST update, so two requests
 * settling at once can never pay the same bet twice. */
async function settleRound(round: RoundRow) {
  // Wait for any bet still committing on this round (they hold FOR SHARE).
  await prisma.$queryRaw`SELECT id FROM "BaccaratRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.baccaratBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  for (const bet of pending) {
    const paid = paidMultiplierFor(bet.area as Area, Number(bet.multiplier), round.playerCards, round.bankerCards);
    const pushed = paid === 1;
    const payout = paid > 0 ? Math.min(floor2(Number(bet.amount) * paid), env.games.maxPayout) : 0;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.baccaratBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: paid > 0 ? "WON" : "LOST", paidMultiplier: paid, payout },
      });
      if (claimed.count === 0) return;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: Prisma.WalletUpdateInput = {};
      if (payout > 0) data.balance = { increment: payout };
      // Wagering counts once the bet is decided (not when placed), so
      // placing and cancelling bets can't clear a bonus requirement. A
      // stake handed back on a tie was never really wagered.
      if (Number(wallet.lockedBonus) > 0 && !pushed) {
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
      if (payout > 0) {
        await tx.transaction.create({
          data: { userId: bet.userId, type: pushed ? "BET_REFUND" : "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
        });
      }
    });
  }

  await prisma.baccaratRound.updateMany({ where: { id: round.id, settled: false }, data: { settled: true } });
}

/** Settles every round whose cards are already out — there is no
 * always-on worker on this serverless backend, so reads catch up. */
async function settleDueRounds(now: Date) {
  const due = await prisma.baccaratRound.findMany({
    where: { settled: false, resultTime: { lte: now } },
    orderBy: { startTime: "asc" },
    take: 20,
  });
  for (const round of due) await settleRound(round);
}

function handView(player: number[], banker: number[]) {
  return {
    player: player.map(cardOf),
    banker: banker.map(cardOf),
    playerTotal: handTotal(player),
    bankerTotal: handTotal(banker),
    winner: winnerOf(player, banker),
    playerPair: isPair(player),
    bankerPair: isPair(banker),
    natural: handTotal(player.slice(0, 2)) >= 8 || handTotal(banker.slice(0, 2)) >= 8,
  };
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
    hand: revealed ? handView(round.playerCards, round.bankerCards) : null,
    serverSeed: revealed ? round.serverSeed : null,
  };
}

export async function getCurrentRoundView() {
  const now = new Date();
  const round = await getOrCreateRound(now);
  await settleDueRounds(now);
  return toView(round, now);
}

export function getBaccaratConfig() {
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
export async function placeBaccaratBets(userId: string, bets: BetInput[]) {
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
    await tx.$queryRaw`SELECT id FROM "BaccaratRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const mine = await tx.baccaratBet.findMany({
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
        await tx.baccaratBet.create({
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
export async function cancelBaccaratBets(userId: string, betIds?: string[]) {
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
    await tx.$queryRaw`SELECT id FROM "BaccaratRound" WHERE id = ${round.id} FOR SHARE`;
    if (Date.now() >= round.betEndTime.getTime()) throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
    const targets = await tx.baccaratBet.findMany({
      where: { roundId: round.id, userId, status: "PENDING", ...(betIds ? { id: { in: betIds } } : {}) },
    });
    let refund = 0;
    const cancelled: string[] = [];
    for (const bet of targets) {
      const claimed = await tx.baccaratBet.updateMany({
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
    ? await prisma.baccaratRound.findUnique({ where: { periodNumber } })
    : await getOrCreateRound(now);
  if (!round) return { periodNumber: periodNumber ?? null, bets: [] };
  if (!round.settled && round.resultTime <= now) await settleRound(round);
  const bets = await prisma.baccaratBet.findMany({
    where: { roundId: round.id, userId, status: { not: "VOID" } },
    orderBy: { createdAt: "asc" },
  });
  return { periodNumber: round.periodNumber, bets };
}

export async function getBaccaratHistory(limit = 100) {
  const rounds = await prisma.baccaratRound.findMany({
    where: { settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
    select: { periodNumber: true, playerCards: true, bankerCards: true, serverSeed: true, serverSeedHash: true },
  });
  return rounds.map((r) => ({
    periodNumber: r.periodNumber,
    ...handView(r.playerCards, r.bankerCards),
    serverSeed: r.serverSeed,
    serverSeedHash: r.serverSeedHash,
  }));
}

export async function getMyBaccaratBets(userId: string, limit = 50) {
  const bets = await prisma.baccaratBet.findMany({
    where: { userId, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: { select: { periodNumber: true, playerCards: true, bankerCards: true, settled: true } } },
  });
  return bets.map(({ round, ...bet }) => ({
    ...bet,
    periodNumber: round.periodNumber,
    hand: round.settled ? handView(round.playerCards, round.bankerCards) : null,
  }));
}
