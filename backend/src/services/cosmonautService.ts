/**
 * "Cosmonaut": the crash engine with a space theme — the cosmonaut lights
 * the jetpack, the multiplier climbs as they fly out past the planets, and
 * the round ends when the fuel runs out (the crash point). Same provably
 * fair crash-point formula, timing and money-safety rules as
 * goalRushService.ts, on its own tables. RTP is 88% (a 12% house edge) for
 * every cash-out strategy.
 *
 * Two half cash-outs: a manual one (take half the stake at the live
 * multiplier, once per bet, and leave the rest flying) and an automatic one
 * ("Auto ½": half is taken by itself the moment the flight reaches a
 * multiplier set with the bet). Each half pays (1 - edge) at whatever
 * multiplier it is taken, so neither changes the RTP.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/** No new bets once the jetpack has lit — same anti-abuse idea as
 * Win Go's LOCK_SECONDS, but here it's just "the betting window". */
const BETTING_DURATION_SECONDS = 6;

/** How long the crashed multiplier stays on screen before the next
 * round's betting window opens — a UI grace period, not a fairness
 * mechanism (crashMultiplier is already fixed the instant the round is
 * created; see periodNumberFor/createNextRound). */
const RESULT_PAUSE_SECONDS = 4;

/** multiplier(t) = e^(GROWTH_RATE * t), t in seconds since takeoff. Chosen
 * so the multiplier roughly doubles every ~5s — fast enough to feel
 * exciting, slow enough to bet on. */
const GROWTH_RATE = Math.log(2) / 5;

/** House edge baked into the crash-point distribution itself (see
 * crashMultiplierFromSeed): cashing out at any target m succeeds with
 * probability (1 - edge) / m, so every strategy returns 88%. */
const HOUSE_EDGE = 0.12;

const MIN_AUTO_CASHOUT = 1.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cappedPayout(amount: number, multiplier: number): number {
  return Math.min(round2(amount * multiplier), env.games.maxPayout);
}

type HalfState = { amount: unknown; halfCashoutMultiplier: unknown; halfPayout: unknown; autoHalfAt: unknown };

/**
 * Where a bet's half stands once the flight has reached `mult`: already
 * taken (by hand or earlier by Auto ½), due now because the flight has
 * passed its Auto ½ target (`newly`, paid at exactly that target), or not
 * taken. `rest` is the stake still flying.
 */
function halfAt(bet: HalfState, mult: number) {
  const amount = Number(bet.amount);
  if (bet.halfCashoutMultiplier !== null) {
    return { taken: true, newly: false, at: Number(bet.halfCashoutMultiplier), paid: Number(bet.halfPayout), rest: round2(amount / 2) };
  }
  const autoHalf = bet.autoHalfAt !== null ? Number(bet.autoHalfAt) : null;
  if (autoHalf !== null && mult >= autoHalf) {
    return { taken: true, newly: true, at: autoHalf, paid: cappedPayout(round2(amount / 2), autoHalf), rest: round2(amount / 2) };
  }
  return { taken: false, newly: false, at: null, paid: 0, rest: amount };
}

/** IST (UTC+5:30) has no DST — a fixed offset is exact. Used only to make
 * periodNumber human-readable (date + time of takeoff); it has no bearing
 * on the round's actual timing or crash result. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function periodNumberFor(bettingStartTime: Date): string {
  const ist = new Date(bettingStartTime.getTime() + IST_OFFSET_MS);
  const y = String(ist.getUTCFullYear()).slice(-2);
  const mo = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const h = String(ist.getUTCHours()).padStart(2, "0");
  const mi = String(ist.getUTCMinutes()).padStart(2, "0");
  const s = String(ist.getUTCSeconds()).padStart(2, "0");
  const ms = String(ist.getUTCMilliseconds()).padStart(3, "0");
  return `${y}${mo}${d}${h}${mi}${s}${ms}`;
}

/**
 * Standard provably-fair crash-point construction (the same one used by
 * every open-source "Bustabit-style" crash game): draw r uniformly from
 * [0, 1) via HMAC, then crash = max(1.00, (1 - houseEdge) / (1 - r)).
 * P(raw value < 1.00, i.e. an instant 1.00x crash) = P(r < houseEdge) =
 * houseEdge exactly, so the house edge is provable from the formula
 * itself, not hidden in a lookup table.
 */
function crashMultiplierFromSeed(serverSeed: string, periodNumber: string): number {
  const r = fairRandomFloat(serverSeed, periodNumber, 0);
  const raw = (1 - HOUSE_EDGE) / (1 - r);
  // Floored, never rounded up: rounding could lift the crash point (and
  // every auto cash-out at it) above the value the edge was proven for.
  return Math.max(1, Math.floor(raw * 100) / 100);
}

function secondsToReach(multiplier: number): number {
  return Math.log(multiplier) / GROWTH_RATE;
}

type Phase = "BETTING" | "FLYING" | "CRASHED";

function phaseFor(round: { flyStartTime: Date; crashTime: Date }, now: Date): Phase {
  if (now < round.flyStartTime) return "BETTING";
  if (now < round.crashTime) return "FLYING";
  return "CRASHED";
}

/** Multiplier at `now` — 1.00x before takeoff, growing exponentially
 * during flight, frozen at the crash value once crashed. */
function liveMultiplier(round: { flyStartTime: Date; crashTime: Date; crashMultiplier: unknown }, now: Date): number {
  if (now <= round.flyStartTime) return 1;
  const cappedNow = Math.min(now.getTime(), round.crashTime.getTime());
  const elapsed = (cappedNow - round.flyStartTime.getTime()) / 1000;
  return round2(Math.exp(GROWTH_RATE * elapsed));
}

async function createNextRound(bettingStartTime: Date, db: Prisma.TransactionClient = prisma) {
  const periodNumber = periodNumberFor(bettingStartTime);
  const flyStartTime = new Date(bettingStartTime.getTime() + BETTING_DURATION_SECONDS * 1000);
  const serverSeed = generateServerSeed();
  const serverSeedHash = hashServerSeed(serverSeed);
  const crashMultiplier = crashMultiplierFromSeed(serverSeed, periodNumber);
  const crashTime = new Date(flyStartTime.getTime() + secondsToReach(crashMultiplier) * 1000);
  const endTime = new Date(crashTime.getTime() + RESULT_PAUSE_SECONDS * 1000);

  try {
    return await db.cosmonautRound.create({
      data: { periodNumber, bettingStartTime, flyStartTime, crashTime, endTime, crashMultiplier, serverSeed, serverSeedHash },
    });
  } catch {
    // periodNumber is deterministic from bettingStartTime — a unique-
    // constraint failure just means a concurrent request beat us to it.
    return db.cosmonautRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Resolves every still-PENDING bet in a round whose crash point is
 * already known (now >= crashTime): a bet with an autoCashoutAt at or
 * below the crash multiplier wins at that multiplier, everyone else
 * loses. Safe to call repeatedly — only touches PENDING bets, so it's a
 * no-op once a round has already been resolved. Deliberately not gated on
 * `settled` so `my-bets`/wallet reflect the result immediately once the
 * fuel runs out, without waiting for the trailing result-pause to end. */
async function resolvePendingBets(roundId: string) {
  const round = await prisma.cosmonautRound.findUniqueOrThrow({ where: { id: roundId } });
  const crashMultiplier = Number(round.crashMultiplier);
  const pendingBets = await prisma.cosmonautBet.findMany({ where: { roundId, status: "PENDING" } });

  for (const first of pendingBets) {
    // A manual half that started just before the fuel ran out can commit
    // after the read above; the claim is conditioned on the half state, so
    // on a miss re-read the bet and settle it against what it holds now.
    let bet: typeof first | null = first;
    for (let attempt = 0; bet && bet.status === "PENDING" && attempt < 3; attempt++) {
      const b: typeof first = bet;
      const auto = b.autoCashoutAt !== null ? Number(b.autoCashoutAt) : null;
      const won = auto !== null && auto <= crashMultiplier;
      // The half (if any) is judged where the flight ended for this bet:
      // at its auto cash-out if it got there, else at the crash.
      const half = halfAt(b, won ? auto! : crashMultiplier);
      const rest = won ? cappedPayout(half.rest, auto!) : 0;
      const credit = round2((half.newly ? half.paid : 0) + rest);
      const payout = round2(half.paid + rest);

      const done = await prisma.$transaction(async (tx) => {
        // Claimed only while still PENDING, so a manual cash-out racing this
        // (or a second settle) can never pay the same bet twice.
        const claimed = await tx.cosmonautBet.updateMany({
          where: { id: b.id, status: "PENDING", halfCashoutMultiplier: b.halfCashoutMultiplier },
          data: {
            // LOST with a payout means only the half came home.
            status: won ? "WON" : "LOST",
            cashoutMultiplier: won ? auto : null,
            payout,
            ...(half.newly ? { halfCashoutMultiplier: half.at, halfPayout: half.paid } : {}),
          },
        });
        if (claimed.count === 0) return false;
        if (credit <= 0) return true;
        await tx.wallet.update({ where: { userId: b.userId }, data: { balance: { increment: credit } } });
        await tx.transaction.create({
          data: { userId: b.userId, type: "GAME_PAYOUT", amount: credit, status: "COMPLETED" },
        });
        return true;
      });
      bet = done ? null : await prisma.cosmonautBet.findUnique({ where: { id: b.id } });
    }
  }
}

async function settleRound(roundId: string) {
  const round = await prisma.cosmonautRound.findUniqueOrThrow({ where: { id: roundId } });
  if (round.settled) return;
  await resolvePendingBets(roundId);
  await prisma.cosmonautRound.update({ where: { id: roundId }, data: { settled: true } });
}

/** Returns the live round, settling and chaining past any that have
 * already ended. Same lazy catch-up pattern as Win Go's rounds —
 * there's no always-on process ticking rounds forward on this serverless
 * backend, so every read/write catches the chain up to "now" first.
 * Unlike Win Go, rounds aren't aligned to wall-clock slots — each one
 * starts the instant the previous one's result-pause ends. */
// No single round's flight can realistically take anywhere near this long
// (even a rare huge crash multiplier resolves in well under a minute), so
// a gap bigger than this can only mean the track sat unpolled — safe to
// treat as "nobody was around to bet" rather than "still mid-round".
const IDLE_GAP_MS = 5 * 60 * 1000;

export async function ensureCurrentRound() {
  let round = await prisma.cosmonautRound.findFirst({ orderBy: { bettingStartTime: "desc" } });

  const now = new Date();
  if (round && !round.settled && round.endTime <= now) {
    await settleRound(round.id);
  }

  if (!round || round.endTime <= now) {
    // Chain straight off the previous round when we're only a beat
    // behind (the normal case), or jump to `now` when the gap is large —
    // no round in that gap could have had a bet placed on it (this is
    // the only place a round ever gets created), so there's nothing to
    // settle for them and no need for their rows to exist at all.
    // One creator at a time: after an idle gap every concurrent caller
    // would otherwise pick its own `now` and open a parallel round.
    round = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cosmonaut-round'))`;
      const latest = await tx.cosmonautRound.findFirst({ orderBy: { bettingStartTime: "desc" } });
      if (latest && latest.endTime > now) return latest;
      const bettingStartTime = latest && now.getTime() - latest.endTime.getTime() < IDLE_GAP_MS ? latest.endTime : now;
      return createNextRound(bettingStartTime, tx);
    });
    // Settle any older round left behind (e.g. one created before this lock existed).
    const stale = await prisma.cosmonautRound.findMany({ where: { settled: false, endTime: { lte: now } }, select: { id: true }, take: 10 });
    for (const r of stale) await settleRound(r.id);
  }

  // The current round may already be past its crashTime (mid result-pause)
  // — resolve pending bets against the now-known result right away rather
  // than waiting for the round to fully end.
  if (now >= round.crashTime && !round.settled) {
    await resolvePendingBets(round.id);
  }

  return round;
}

export async function getCurrentRoundView() {
  const round = await ensureCurrentRound();
  const now = new Date();
  const phase = phaseFor(round, now);
  // crashTime/endTime are both derived from the secret crash multiplier
  // (see createNextRound) — exposing either before the round actually
  // reaches it would let a client back-solve the crash point early, the
  // same failure mode commit-reveal is meant to prevent. Only flyStartTime
  // (a fixed schedule, independent of the secret) is safe to reveal early.
  return {
    periodNumber: round.periodNumber,
    bettingStartTime: round.bettingStartTime,
    flyStartTime: round.flyStartTime,
    crashTime: phase === "CRASHED" ? round.crashTime : null,
    // Same reasoning: endTime = crashTime + a fixed pause, so it's exactly
    // as revealing as crashTime and safe on the same condition.
    endTime: phase === "CRASHED" ? round.endTime : null,
    serverSeedHash: round.serverSeedHash,
    phase,
    // Lets the app line its clock up with the server's for the countdown
    // and the live multiplier.
    serverTime: now,
    multiplier: liveMultiplier(round, now),
    // Only reveal the crash point once the round has actually reached it.
    crashMultiplier: phase === "CRASHED" ? Number(round.crashMultiplier) : null,
  };
}

export async function placeCosmonautBet(userId: string, amount: number, autoCashoutAt?: number, autoHalfAt?: number) {
  if (amount < env.games.minStake || amount > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (autoCashoutAt !== undefined && autoCashoutAt < MIN_AUTO_CASHOUT) {
    throw new ApiError(400, `Auto cash-out must be at least ${MIN_AUTO_CASHOUT}x.`);
  }

  if (autoHalfAt !== undefined && autoHalfAt < MIN_AUTO_CASHOUT) {
    throw new ApiError(400, `Auto ½ must be at least ${MIN_AUTO_CASHOUT}x.`);
  }
  if (autoHalfAt !== undefined && autoCashoutAt !== undefined && autoHalfAt >= autoCashoutAt) {
    throw new ApiError(400, "Auto ½ must be below the auto cash-out.");
  }

  await assertCanTransact(userId);

  const round = await ensureCurrentRound();
  const now = new Date();
  if (phaseFor(round, now) !== "BETTING") {
    throw new ApiError(400, "Betting is closed for this round — wait for the next one.");
  }

  // Up to two concurrent bets per round (matches the mobile UI's two
  // independent bet panels — crash games let a player run a manual bet
  // and a second auto-cashout bet side by side).
  const bet = await prisma.$transaction(async (tx) => {
    // Serialise this player's bets so parallel taps can't pass the
    // two-bet limit or overdraw the wallet between the checks and writes.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existingCount = await tx.cosmonautBet.count({ where: { roundId: round.id, userId, status: "PENDING" } });
    if (existingCount >= 2) {
      throw new ApiError(400, "You already have the maximum of two bets placed on this round.");
    }

    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    // Same locked-bonus wagering-progress mechanic as vortexService.ts.
    if (Number(wallet.lockedBonus) > 0) {
      const newProgress = Number(wallet.wageringProgress) + amount;
      await tx.wallet.update({
        where: { userId },
        data:
          newProgress >= Number(wallet.wageringRequired)
            ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 }
            : { wageringProgress: { increment: amount } },
      });
    }

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount, status: "COMPLETED" } });
    return tx.cosmonautBet.create({ data: { roundId: round.id, userId, amount, autoCashoutAt: autoCashoutAt ?? null, autoHalfAt: autoHalfAt ?? null } });
  });

  return bet;
}

export async function cashOutCosmonautBet(userId: string, betId: string, half = false) {
  const bet = await prisma.cosmonautBet.findUnique({ where: { id: betId }, include: { round: true } });
  if (!bet) throw new ApiError(404, "Bet not found.");
  if (bet.userId !== userId) throw new ApiError(403, "Not your bet.");
  if (bet.status !== "PENDING") throw new ApiError(400, "This bet has already been settled.");

  const now = new Date();
  const phase = phaseFor(bet.round, now);
  if (phase === "BETTING") throw new ApiError(400, "The cosmonaut hasn't taken off yet.");
  if (phase === "CRASHED") throw new ApiError(400, "Too late — the fuel ran out.");

  // A bet with an auto cash-out has already cashed out once the flight
  // passes that target, so a later manual tap pays the auto target, not
  // more — otherwise auto 1.01x + manual later is a free option. The same
  // holds for Auto ½: past its target the half has already gone, at it.
  const live = liveMultiplier(bet.round, now);
  const auto = bet.autoCashoutAt !== null ? Number(bet.autoCashoutAt) : null;
  const autoReached = auto !== null && live >= auto;
  const multiplier = autoReached ? auto! : live;
  const state = halfAt(bet, multiplier);

  if (half && !autoReached) {
    if (state.taken && !state.newly) throw new ApiError(400, "You have already taken half of this bet.");
    const at = state.newly ? state.at! : multiplier;
    const halfPayout = state.newly ? state.paid : cappedPayout(round2(Number(bet.amount) / 2), multiplier);
    await prisma.$transaction(async (tx) => {
      // Claimed only while still PENDING with no half taken: a double tap
      // or a settle racing it can't pay the half twice.
      const claimed = await tx.cosmonautBet.updateMany({
        where: { id: bet.id, status: "PENDING", halfCashoutMultiplier: null },
        data: { halfCashoutMultiplier: at, halfPayout },
      });
      if (claimed.count === 0) throw new ApiError(409, "This bet has already been settled.");
      await tx.wallet.update({ where: { userId }, data: { balance: { increment: halfPayout } } });
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: halfPayout, status: "COMPLETED" } });
    });
    return { multiplier: at, payout: halfPayout, half: true };
  }

  const rest = cappedPayout(state.rest, multiplier);
  const credit = round2((state.newly ? state.paid : 0) + rest);
  const payout = round2(state.paid + rest);
  await prisma.$transaction(async (tx) => {
    // Claimed only while still PENDING (and in the same half state as read
    // above): a double tap or a settle racing it can't pay the bet twice.
    const claimed = await tx.cosmonautBet.updateMany({
      where: { id: bet.id, status: "PENDING", halfCashoutMultiplier: bet.halfCashoutMultiplier },
      data: {
        status: "WON",
        cashoutMultiplier: multiplier,
        payout,
        ...(state.newly ? { halfCashoutMultiplier: state.at, halfPayout: state.paid } : {}),
      },
    });
    if (claimed.count === 0) throw new ApiError(409, "This bet has already been settled.");
    await tx.wallet.update({ where: { userId }, data: { balance: { increment: credit } } });
    await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: credit, status: "COMPLETED" } });
  });

  return { multiplier, payout: credit, half: false, halfAt: state.newly ? state.at : null, halfPaid: state.newly ? state.paid : 0 };
}

export async function getMyCurrentBet(userId: string) {
  const round = await ensureCurrentRound();
  return prisma.cosmonautBet.findFirst({
    where: { roundId: round.id, userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHistory(limit = 30) {
  return prisma.cosmonautRound.findMany({
    where: { settled: true },
    orderBy: { bettingStartTime: "desc" },
    take: limit,
    select: {
      periodNumber: true,
      bettingStartTime: true,
      crashMultiplier: true,
      serverSeed: true,
      serverSeedHash: true,
    },
  });
}

export async function getMyBets(userId: string, limit = 50) {
  const bets = await prisma.cosmonautBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      round: { select: { periodNumber: true, crashMultiplier: true, settled: true, crashTime: true } },
    },
  });
  // The crash point is fixed when the round is created; never show it before the round has crashed.
  const now = Date.now();
  return bets.map(({ round: { crashTime, ...round }, ...bet }) => ({
    ...bet,
    round: { ...round, crashMultiplier: round.settled || crashTime.getTime() <= now ? round.crashMultiplier : null },
  }));
}

/** Shows other players' activity without exposing who they are — just the
 * first and last character of their first name, everything else starred
 * out (e.g. "Mangal" -> "m***l"). Never sends phone/email/uid to other
 * players. */
function maskPlayerName(firstName: string): string {
  const name = firstName.trim();
  if (name.length <= 1) return `${name.toLowerCase()}***`;
  return `${name[0].toLowerCase()}***${name[name.length - 1].toLowerCase()}`;
}

const publicBetSelect = {
  id: true,
  amount: true,
  cashoutMultiplier: true,
  halfCashoutMultiplier: true,
  payout: true,
  status: true,
  createdAt: true,
  user: { select: { firstName: true } },
} as const;

function toPublicBet<T extends { user: { firstName: string } }>(bet: T) {
  const { user, ...rest } = bet;
  return { ...rest, player: maskPlayerName(user.firstName) };
}

/** Every bet placed on a given round (current or already-settled), most
 * staked first — powers the "All Bets" / "Previous" public bet lists. */
export async function getRoundBets(periodNumber: string, limit = 100) {
  const round = await prisma.cosmonautRound.findUnique({ where: { periodNumber }, select: { id: true } });
  if (!round) return [];
  const bets = await prisma.cosmonautBet.findMany({
    where: { roundId: round.id },
    orderBy: { amount: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

/** Biggest recent wins across all players, for the "Top" tab. */
export async function getTopBets(limit = 50) {
  const bets = await prisma.cosmonautBet.findMany({
    where: { status: "WON" },
    orderBy: { payout: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

export function getCosmonautConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    bettingDurationSeconds: BETTING_DURATION_SECONDS,
    resultPauseSeconds: RESULT_PAUSE_SECONDS,
    growthRate: GROWTH_RATE,
    houseEdgePercent: HOUSE_EDGE * 100,
    minAutoCashout: MIN_AUTO_CASHOUT,
    halfCashout: true,
    autoHalf: true,
  };
}
