import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairRandomFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import {
  CURRENT_PAYTABLE,
  MAX_PART_CASHOUTS,
  RING_KEYS,
  RingKey,
  SegmentInfo,
  multiplierAfter,
  paytableOf,
  playRing,
  ringShape,
  ringSteps,
  ringTable,
  wheelAdd,
  wheelSegments,
} from "./ringGauntletEngine";

/**
 * Ring Gauntlet: one private round per play. The player picks a ring (outer
 * square, middle triangle, inner circle), pays the stake, and every PLAY press
 * tries the next segment of that ring. Each survived segment raises the
 * cash-out value; a failed one loses the round. The odds are in
 * ringGauntletEngine.ts (every segment of every ring returns `rtp` on average).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

const ROUND_CHANGED = "This round was updated by another request. Please refresh and try again.";

function isRing(value: string): value is RingKey {
  return (RING_KEYS as string[]).includes(value);
}

/** A segment as the apps get it. */
function publicSegment(seg: SegmentInfo) {
  return {
    step: seg.step,
    kind: seg.kind,
    label: seg.label,
    multiplier: round2(seg.multiplier),
    // Chance of surviving this segment once the round is on it, and of getting this far from the start.
    chance: Math.round(seg.survive * 10_000) / 10_000,
    reach: Math.round(seg.reach * 1_000_000) / 1_000_000,
  };
}

/** The game as new rounds play it (the current odds table). */
export function getRingGauntletConfig() {
  const rtp = env.games.rtp;
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtp,
    maxPartCashouts: MAX_PART_CASHOUTS,
    paytable: CURRENT_PAYTABLE,
    rings: RING_KEYS.map((ring) => ({
      ring,
      shape: ringShape(ring),
      steps: ringTable(ring, rtp).map(publicSegment),
      wheel: wheelSegments(ring),
    })),
  };
}

type RoundRow = Awaited<ReturnType<typeof prisma.ringGauntletRound.findUniqueOrThrow>>;

/** What the round is worth right now to a full cash-out (the payout cap applied). */
function valueOf(round: RoundRow): number {
  if (round.status !== "PENDING") return 0;
  return cappedPayout(Number(round.stake) * Number(round.share), Number(round.multiplier));
}

function canPartCashout(round: RoundRow): boolean {
  return (
    round.status === "PENDING" &&
    round.currentStep > 0 &&
    round.partCashouts < MAX_PART_CASHOUTS &&
    floor2(valueOf(round) / 2) >= 0.01
  );
}

/** The round as the app gets it. The serverSeed never leaves: it is the player's live fairness seed, shared by every
 * round until they rotate it, and showing it would let them compute every segment ahead of time. */
function toPublicRound(round: RoundRow) {
  const rtp = env.games.rtp;
  const paytable = paytableOf(round.paytable);
  const table = ringTable(round.ring as RingKey, rtp, paytable);
  const next = round.status === "PENDING" ? table[round.currentStep] : undefined;
  return {
    id: round.id,
    ring: round.ring as RingKey,
    stake: Number(round.stake),
    currentStep: round.currentStep,
    steps: table.length,
    multiplier: Number(round.multiplier),
    share: Number(round.share),
    banked: Number(round.banked),
    partCashouts: round.partCashouts,
    payout: Number(round.payout),
    bonus: Number(round.bonus),
    auto: round.auto,
    status: round.status,
    /** What a cash-out would pay right now (0 once the round has ended). */
    value: valueOf(round),
    canPartCashout: canPartCashout(round),
    /** The segment a press of PLAY would try next, and its chance. */
    next: next ? { step: next.step, label: next.label, multiplier: round2(next.multiplier), chance: Math.round(next.survive * 10_000) / 10_000 } : null,
    paytable,
    /** A round on an older odds table than the game's (it was started before the table changed): its own segments, so
     * the app can show the numbers that round is played on (the game's config has the current ones). */
    ...(paytable !== CURRENT_PAYTABLE ? { table: table.map(publicSegment) } : {}),
    serverSeedHash: round.serverSeedHash,
    clientSeed: round.clientSeed,
    nonce: round.nonce,
    createdAt: round.createdAt,
    settledAt: round.settledAt,
  };
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

/** Provably-fair draw for one segment of a round: the round's own serverSeed/clientSeed/nonce (fixed at the start)
 * with the segment number. nonce*1000 keeps every round in its own slice of the nonce space; the bonus wheel is 900. */
function segmentRoll(serverSeed: string, clientSeed: string, nonce: number, step: number): number {
  return fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + step);
}

function bonusRoll(serverSeed: string, clientSeed: string, nonce: number): number {
  return fairRandomFloat(serverSeed, clientSeed, nonce * 1000 + 900);
}

/** Debits the stake inside the transaction (one open round per player; same locked-bonus wagering as the other games). */
async function takeStake(tx: Prisma.TransactionClient, userId: string, stake: number) {
  // Serialise starts per player so two parallel taps can't both pass the "no open round" check and open two rounds.
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  const existing = await tx.ringGauntletRound.findFirst({ where: { userId, status: "PENDING" } });
  if (existing) throw new ApiError(400, "Finish your current round before starting a new one.");

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
  // Conditional debit so two simultaneous starts can't overdraw the wallet.
  const debited = await tx.wallet.updateMany({
    where: { userId, balance: { gte: stake } },
    data: { balance: { decrement: stake } },
  });
  if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

  if (Number(wallet.lockedBonus) > 0) {
    const newProgress = Number(wallet.wageringProgress) + stake;
    await tx.wallet.update({
      where: { userId },
      data:
        newProgress >= Number(wallet.wageringRequired)
          ? { lockedBonus: 0, wageringRequired: 0, wageringProgress: 0 }
          : { wageringProgress: { increment: stake } },
    });
  }
  await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  if (payout <= 0) return;
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

function checkStake(stake: number) {
  if (!Number.isFinite(stake) || stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  // Whole paise only: the wallet works in two decimals.
  if (Math.abs(stake * 100 - Math.round(stake * 100)) > 1e-9) throw new ApiError(400, "The stake can have two decimals at most.");
}

/** Where a round stands after the segments tried so far: what to write on it and what to pay. */
interface Settlement {
  data: Prisma.RingGauntletRoundUpdateManyMutationInput;
  /** New money paid into the wallet by this action. */
  credit: number;
}

/**
 * PLAY on a round that has survived `round.currentStep` segments: tries the next one.
 * Pure of the database: the caller claims the round with the result.
 */
function tryNextSegment(round: RoundRow): Settlement {
  const ring = round.ring as RingKey;
  // The round's own odds table: a round started on an older table finishes on it.
  const paytable = paytableOf(round.paytable);
  const table = ringTable(ring, env.games.rtp, paytable);
  const step = round.currentStep + 1;
  const stake = Number(round.stake);
  const share = Number(round.share);
  const banked = Number(round.banked);

  if (segmentRoll(round.serverSeed, round.clientSeed, round.nonce, step) >= table[step - 1].survive) {
    // Failed: what part cash-outs already paid is all the player gets.
    return { data: { status: "LOST", multiplier: 0, payout: round2(banked), settledAt: new Date() }, credit: 0 };
  }

  if (step === table.length) {
    // The last segment: the bonus is added to the last plain multiplier and the round is paid in full.
    const add = wheelAdd(ring, bonusRoll(round.serverSeed, round.clientSeed, round.nonce), paytable);
    const multiplier = multiplierAfter(ring, step, add, paytable);
    const credit = cappedPayout(stake * share, multiplier);
    return {
      data: { currentStep: step, multiplier, bonus: add, payout: round2(banked + credit), status: "WON", settledAt: new Date() },
      credit,
    };
  }

  const multiplier = multiplierAfter(ring, step, 0, paytable);
  // The payout cap is reached: nothing is left to gain by risking another segment, so it settles as a win.
  if (stake * share * multiplier >= env.games.maxPayout) {
    const credit = cappedPayout(stake * share, multiplier);
    return {
      data: { currentStep: step, multiplier, payout: round2(banked + credit), status: "WON", settledAt: new Date() },
      credit,
    };
  }
  return { data: { currentStep: step, multiplier }, credit: 0 };
}

/** Updates the round only if it is still exactly as it was read, so parallel requests can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: RoundRow, data: Prisma.RingGauntletRoundUpdateManyMutationInput) {
  const claimed = await tx.ringGauntletRound.updateMany({
    where: { id: round.id, status: "PENDING", currentStep: round.currentStep, partCashouts: round.partCashouts },
    data,
  });
  if (claimed.count === 0) throw new ApiError(409, ROUND_CHANGED);
  return tx.ringGauntletRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.ringGauntletRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This round has already ended.");
  return round;
}

/** Pays the stake and tries the first segment (one tap: the bet is placed and the first segment is revealed). */
export async function startRingGauntletRound(userId: string, stake: number, ring: string) {
  checkStake(stake);
  if (!isRing(ring)) throw new ApiError(400, "Invalid ring.");
  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  return prisma.$transaction(async (tx) => {
    await takeStake(tx, userId, stake);
    const created = await tx.ringGauntletRound.create({
      data: { userId, ring, stake, paytable: CURRENT_PAYTABLE, serverSeed, serverSeedHash, clientSeed, nonce },
    });
    const outcome = tryNextSegment(created);
    const updated = await claimRound(tx, created, outcome.data);
    await creditPayout(tx, userId, outcome.credit);
    return { round: toPublicRound(updated), survived: updated.status !== "LOST" };
  });
}

export async function advanceRingGauntletRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const outcome = tryNextSegment(round);
    const updated = await claimRound(tx, round, outcome.data);
    await creditPayout(tx, userId, outcome.credit);
    return { round: toPublicRound(updated), survived: updated.status !== "LOST" };
  });
}

export async function cashOutRingGauntletRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.currentStep <= 0) throw new ApiError(400, "Survive at least one segment before cashing out.");
    const credit = cappedPayout(Number(round.stake) * Number(round.share), Number(round.multiplier));
    const updated = await claimRound(tx, round, {
      payout: round2(Number(round.banked) + credit),
      status: "WON",
      settledAt: new Date(),
    });
    await creditPayout(tx, userId, credit);
    return toPublicRound(updated);
  });
}

/** Takes half of what the player has in play now and keeps climbing with the other half (half the stake at risk). */
export async function partCashOutRingGauntletRound(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.currentStep <= 0) throw new ApiError(400, "Survive at least one segment before cashing out.");
    if (round.partCashouts >= MAX_PART_CASHOUTS) throw new ApiError(400, "No part cash-outs left in this round.");
    const half = Math.min(floor2((Number(round.stake) * Number(round.share) * Number(round.multiplier)) / 2), env.games.maxPayout);
    if (half < 0.01) throw new ApiError(400, "Too small to part cash out.");
    const updated = await claimRound(tx, round, {
      share: Number(round.share) / 2,
      banked: round2(Number(round.banked) + half),
      partCashouts: round.partCashouts + 1,
    });
    await creditPayout(tx, userId, half);
    return toPublicRound(updated);
  });
}

/**
 * Autoplay: the whole round in one request. Segments 1..target are tried one after another and the round is cashed
 * out the moment `target` is survived (the last segment of a ring pays its bonus and ends the round by itself).
 * It is the same round as a hand-played one: same draws, same odds, same record.
 */
export async function autoRingGauntletRound(userId: string, stake: number, ring: string, target: number) {
  checkStake(stake);
  if (!isRing(ring)) throw new ApiError(400, "Invalid ring.");
  if (!Number.isInteger(target) || target < 1 || target > ringSteps(ring, CURRENT_PAYTABLE)) throw new ApiError(400, "Invalid target segment.");
  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = playRing(
    ring,
    env.games.rtp,
    target,
    (step) => segmentRoll(serverSeed, clientSeed, nonce, step),
    () => bonusRoll(serverSeed, clientSeed, nonce),
    CURRENT_PAYTABLE
  );

  let multiplier = 0;
  let status: "WON" | "LOST" = "LOST";
  let credit = 0;
  if (!outcome.eliminated) {
    multiplier = multiplierAfter(ring, outcome.survived, outcome.bonus, CURRENT_PAYTABLE);
    credit = cappedPayout(stake, multiplier);
    status = "WON";
  }

  return prisma.$transaction(async (tx) => {
    await takeStake(tx, userId, stake);
    const created = await tx.ringGauntletRound.create({
      data: {
        userId,
        ring,
        stake,
        currentStep: outcome.survived,
        multiplier,
        payout: credit,
        bonus: outcome.bonus,
        auto: true,
        paytable: CURRENT_PAYTABLE,
        status,
        settledAt: new Date(),
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
    await creditPayout(tx, userId, credit);
    return { round: toPublicRound(created), survived: status === "WON" };
  });
}

export async function getMyCurrentRingGauntletRound(userId: string) {
  const round = await prisma.ringGauntletRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyRingGauntletHistory(userId: string, limit = 30) {
  const rounds = await prisma.ringGauntletRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
