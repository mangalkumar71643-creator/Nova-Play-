import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Lucky Cups: find the ball under one of three cups, up to five times in a
 * row, cashing out after any find.
 *
 * With 1 ball the chance of a find is 1/3; with 2 balls it is 2/3. For each
 * round the cups hiding the balls are a uniformly random set drawn from the
 * round's seeds before the player picks, so no cup is better than another.
 * The shuffle the app shows is only decoration: the ball is never shown
 * before the pick, so there is nothing to follow.
 */

export const CUPS = 3;
export const ROUNDS = 5;
/** 12% house edge: the expected return of every cash-out point is 88%. */
export const RTP = 0.88;
export const BALL_OPTIONS = [1, 2] as const;

export type CupPick = { cup: number; ballCups: number[]; won: boolean };

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Multiplier after `wins` finds: RTP / P(find)^wins, rounded down to the cent. */
export function multiplierAt(balls: number, wins: number): number {
  if (wins <= 0) return 1;
  return floor2(RTP / Math.pow(balls / CUPS, wins));
}

/** The cups hiding the balls in round `index` (0-based): a seeded shuffle of the 3 cups, keeping the first `balls`. */
export function ballCupsFor(serverSeed: string, clientSeed: string, nonce: number, index: number, balls: number): number[] {
  const cups = [0, 1, 2];
  for (let i = CUPS - 1; i > 0; i--) {
    const r = fairGameFloat(serverSeed, clientSeed, "cups", nonce * 1000 + index * 10 + i);
    const j = Math.floor(r * (i + 1));
    [cups[i], cups[j]] = [cups[j], cups[i]];
  }
  return cups.slice(0, balls).sort((a, b) => a - b);
}

export function getCupsConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: RTP * 100,
    cups: CUPS,
    rounds: ROUNDS,
    modes: BALL_OPTIONS.map((balls) => ({ balls, multipliers: Array.from({ length: ROUNDS + 1 }, (_, w) => multiplierAt(balls, w)) })),
  };
}

type CupsRoundRow = Awaited<ReturnType<typeof prisma.cupsRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed, so it never leaves the server here. */
function toPublicRound(round: CupsRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

export async function startCupsRound(userId: string, stake: number, balls: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!(BALL_OPTIONS as readonly number[]).includes(balls)) throw new ApiError(400, "Play with 1 or 2 balls.");

  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.cupsRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current game before starting a new one.");

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
    return tx.cupsRound.create({ data: { userId, balls, stake, serverSeed, serverSeedHash, clientSeed, nonce } });
  });
  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.cupsRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This game has already ended.");
  return round;
}

/** Updates the round only if it is still exactly as read (PENDING, same win
 * count), so parallel picks or cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: CupsRoundRow, data: Prisma.CupsRoundUpdateManyMutationInput) {
  const claimed = await tx.cupsRound.updateMany({ where: { id: round.id, status: "PENDING", wins: round.wins }, data });
  if (claimed.count === 0) throw new ApiError(409, "This round was updated by another request. Please refresh and try again.");
  return tx.cupsRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function pickCup(userId: string, roundId: string, cup: number) {
  if (!Number.isInteger(cup) || cup < 0 || cup >= CUPS) throw new ApiError(400, "Pick one of the cups.");
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const ballCups = ballCupsFor(round.serverSeed, round.clientSeed, round.nonce, round.wins, round.balls);
    const won = ballCups.includes(cup);
    const pick: CupPick = { cup, ballCups, won };
    const picks = [...((round.picks as CupPick[] | null) ?? []), pick];

    if (!won) {
      const updated = await claimRound(tx, round, { status: "LOST", multiplier: 0, payout: 0, picks, settledAt: new Date() });
      return { round: toPublicRound(updated), pick };
    }

    const wins = round.wins + 1;
    const multiplier = multiplierAt(round.balls, wins);
    // The last round, or the payout cap reached: nothing more to gain, so it settles as a win.
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (wins >= ROUNDS || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, { wins, multiplier, payout, picks, status: "WON", settledAt: new Date() });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), pick };
    }

    const updated = await claimRound(tx, round, { wins, multiplier, picks });
    return { round: toPublicRound(updated), pick };
  });
}

export async function cashOutCups(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.wins <= 0) throw new ApiError(400, "Find the ball at least once before cashing out.");
    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentCupsRound(userId: string) {
  const round = await prisma.cupsRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyCupsHistory(userId: string, limit = 30) {
  const rounds = await prisma.cupsRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
