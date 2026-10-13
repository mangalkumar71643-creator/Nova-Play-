/**
 * "Rocket": a JetX / Spaceman style crash game — the rocket lifts off, the
 * multiplier climbs while it flies, and the round ends when it explodes
 * (the crash point). Same provably fair crash-point formula, timing and
 * money-safety rules as aviatorService.ts, on its own tables so its rounds
 * and history stay separate. RTP is env.games.rtp (90%) for every
 * cash-out strategy.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat, generateServerSeed, hashServerSeed } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";

/** No new bets once the rocket has lifted off — same anti-abuse idea as
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
 * probability (1 - edge) / m, so every strategy returns the shared rtp. */
const HOUSE_EDGE = 1 - env.games.rtp;

const MIN_AUTO_CASHOUT = 1.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function cappedPayout(amount: number, multiplier: number): number {
  return Math.min(round2(amount * multiplier), env.games.maxPayout);
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
    return await db.rocketRound.create({
      data: { periodNumber, bettingStartTime, flyStartTime, crashTime, endTime, crashMultiplier, serverSeed, serverSeedHash },
    });
  } catch {
    // periodNumber is deterministic from bettingStartTime — a unique-
    // constraint failure just means a concurrent request beat us to it.
    return db.rocketRound.findUniqueOrThrow({ where: { periodNumber } });
  }
}

/** Resolves every still-PENDING bet in a round whose crash point is
 * already known (now >= crashTime): a bet with an autoCashoutAt at or
 * below the crash multiplier wins at that multiplier, everyone else
 * loses. Safe to call repeatedly — only touches PENDING bets, so it's a
 * no-op once a round has already been resolved. Deliberately not gated on
 * `settled` so `my-bets`/wallet reflect the result immediately once the
 * rocket explodes, without waiting for the trailing result-pause to end. */
async function resolvePendingBets(roundId: string) {
  const round = await prisma.rocketRound.findUniqueOrThrow({ where: { id: roundId } });
  const crashMultiplier = Number(round.crashMultiplier);
  const pendingBets = await prisma.rocketBet.findMany({ where: { roundId, status: "PENDING" } });

  for (const bet of pendingBets) {
    const auto = bet.autoCashoutAt !== null ? Number(bet.autoCashoutAt) : null;
    const won = auto !== null && auto <= crashMultiplier;
    const payout = won ? cappedPayout(Number(bet.amount), auto!) : 0;

    await prisma.$transaction(async (tx) => {
      // Claimed only while still PENDING, so a manual cash-out racing this
      // (or a second settle) can never pay the same bet twice.
      const claimed = await tx.rocketBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", cashoutMultiplier: won ? auto : null, payout },
      });
      if (claimed.count === 0 || !won) return;
      await tx.wallet.update({ where: { userId: bet.userId }, data: { balance: { increment: payout } } });
      await tx.transaction.create({
        data: { userId: bet.userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" },
      });
    });
  }
}

async function settleRound(roundId: string) {
  const round = await prisma.rocketRound.findUniqueOrThrow({ where: { id: roundId } });
  if (round.settled) return;
  await resolvePendingBets(roundId);
  await prisma.rocketRound.update({ where: { id: roundId }, data: { settled: true } });
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
  let round = await prisma.rocketRound.findFirst({ orderBy: { bettingStartTime: "desc" } });

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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rocket-round'))`;
      const latest = await tx.rocketRound.findFirst({ orderBy: { bettingStartTime: "desc" } });
      if (latest && latest.endTime > now) return latest;
      const bettingStartTime = latest && now.getTime() - latest.endTime.getTime() < IDLE_GAP_MS ? latest.endTime : now;
      return createNextRound(bettingStartTime, tx);
    });
    // Settle any older round left behind (e.g. one created before this lock existed).
    const stale = await prisma.rocketRound.findMany({ where: { settled: false, endTime: { lte: now } }, select: { id: true }, take: 10 });
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

export async function placeRocketBet(userId: string, amount: number, autoCashoutAt?: number) {
  if (amount < env.games.minStake || amount > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (autoCashoutAt !== undefined && autoCashoutAt < MIN_AUTO_CASHOUT) {
    throw new ApiError(400, `Auto cash-out must be at least ${MIN_AUTO_CASHOUT}x.`);
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
    const existingCount = await tx.rocketBet.count({ where: { roundId: round.id, userId, status: "PENDING" } });
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
    return tx.rocketBet.create({ data: { roundId: round.id, userId, amount, autoCashoutAt: autoCashoutAt ?? null } });
  });

  return bet;
}

export async function cashOutRocketBet(userId: string, betId: string) {
  const bet = await prisma.rocketBet.findUnique({ where: { id: betId }, include: { round: true } });
  if (!bet) throw new ApiError(404, "Bet not found.");
  if (bet.userId !== userId) throw new ApiError(403, "Not your bet.");
  if (bet.status !== "PENDING") throw new ApiError(400, "This bet has already been settled.");

  const now = new Date();
  const phase = phaseFor(bet.round, now);
  if (phase === "BETTING") throw new ApiError(400, "The rocket hasn't lifted off yet.");
  if (phase === "CRASHED") throw new ApiError(400, "Too late — the rocket exploded.");

  // A bet with an auto cash-out has already cashed out once the flight
  // passes that target, so a later manual tap pays the auto target, not
  // more — otherwise auto 1.01x + manual later is a free option.
  const live = liveMultiplier(bet.round, now);
  const auto = bet.autoCashoutAt !== null ? Number(bet.autoCashoutAt) : null;
  const multiplier = auto !== null && live >= auto ? auto : live;
  const payout = cappedPayout(Number(bet.amount), multiplier);

  await prisma.$transaction(async (tx) => {
    // Claimed only while still PENDING: a double tap (or a settle racing
    // it) can't pay the same bet twice.
    const claimed = await tx.rocketBet.updateMany({
      where: { id: bet.id, status: "PENDING" },
      data: { status: "WON", cashoutMultiplier: multiplier, payout },
    });
    if (claimed.count === 0) throw new ApiError(409, "This bet has already been settled.");
    await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
    await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
  });

  return { multiplier, payout };
}

export async function getMyCurrentBet(userId: string) {
  const round = await ensureCurrentRound();
  return prisma.rocketBet.findFirst({
    where: { roundId: round.id, userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHistory(limit = 30) {
  return prisma.rocketRound.findMany({
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
  const bets = await prisma.rocketBet.findMany({
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
  const round = await prisma.rocketRound.findUnique({ where: { periodNumber }, select: { id: true } });
  if (!round) return [];
  const bets = await prisma.rocketBet.findMany({
    where: { roundId: round.id },
    orderBy: { amount: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

/** Biggest recent wins across all players, for the "Top" tab. */
export async function getTopBets(limit = 50) {
  const bets = await prisma.rocketBet.findMany({
    where: { status: "WON" },
    orderBy: { payout: "desc" },
    take: limit,
    select: publicBetSelect,
  });
  return bets.map(toPublicBet);
}

export function getRocketConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    bettingDurationSeconds: BETTING_DURATION_SECONDS,
    resultPauseSeconds: RESULT_PAUSE_SECONDS,
    growthRate: GROWTH_RATE,
    houseEdgePercent: HOUSE_EDGE * 100,
    minAutoCashout: MIN_AUTO_CASHOUT,
  };
}
