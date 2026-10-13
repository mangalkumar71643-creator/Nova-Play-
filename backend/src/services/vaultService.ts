import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { fairGameFloat } from "../utils/rng";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";

/**
 * Vault Heist: crack the five locks of a vault, one dial at a time.
 *
 * Each lock has a dial of 10 digits (0-9), and `alarms` of them (2, 4 or 6)
 * trip the alarm. For each lock the alarm digits are a uniformly random set
 * drawn from the round's seeds before the player picks, so every digit is
 * equally likely and the pick never changes the odds. A safe digit cracks the
 * lock and the multiplier rises; an alarm digit loses the stake. The player
 * can cash out after any cracked lock; the fifth opens the vault and settles.
 */

export const ALARM_OPTIONS = [2, 4, 6] as const;

export const DIGITS = 10;
export const LOCKS = 5;
/** 12% house edge: the expected return of every cash-out point is 88%. */
export const RTP = 0.88;

export type VaultTry = { digit: number; alarmDigits: number[]; ok: boolean };

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/** Multiplier after `cracked` locks: RTP / P(safe digit)^cracked, rounded down to the cent. */
export function multiplierAt(alarms: number, cracked: number): number {
  if (cracked <= 0) return 1;
  return floor2(RTP / Math.pow((DIGITS - alarms) / DIGITS, cracked));
}

/** The alarm digits of lock `lock` (0-based): a seeded Fisher-Yates shuffle of 0-9, keeping the first `alarms`. */
export function alarmDigitsFor(serverSeed: string, clientSeed: string, nonce: number, lock: number, alarms: number): number[] {
  const digits = Array.from({ length: DIGITS }, (_, i) => i);
  for (let i = DIGITS - 1; i > 0; i--) {
    const r = fairGameFloat(serverSeed, clientSeed, "vault", nonce * 1000 + lock * 10 + i);
    const j = Math.floor(r * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, alarms).sort((a, b) => a - b);
}

export function getVaultConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: RTP * 100,
    digits: DIGITS,
    locks: LOCKS,
    modes: ALARM_OPTIONS.map((alarms) => ({ alarms, multipliers: Array.from({ length: LOCKS + 1 }, (_, c) => multiplierAt(alarms, c)) })),
  };
}

type VaultRoundRow = Awaited<ReturnType<typeof prisma.vaultRound.findUniqueOrThrow>>;

/** The serverSeed is the player's live fairness seed, so it never leaves the server here. */
function toPublicRound(round: VaultRoundRow) {
  const { serverSeed: _hidden, ...rest } = round;
  return rest;
}

function cappedPayout(stake: number, multiplier: number): number {
  return Math.min(floor2(stake * multiplier), env.games.maxPayout);
}

export async function startVaultRound(userId: string, stake: number, alarms: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }
  if (!(ALARM_OPTIONS as readonly number[]).includes(alarms)) throw new ApiError(400, "Pick 2, 4 or 6 alarm digits.");

  await assertCanTransact(userId);
  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);

  const round = await prisma.$transaction(async (tx) => {
    // Serialise starts per player so two parallel taps can't both pass the
    // "no open round" check below and open two rounds at once.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const existing = await tx.vaultRound.findFirst({ where: { userId, status: "PENDING" } });
    if (existing) throw new ApiError(400, "Finish your current heist before starting a new one.");

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
    return tx.vaultRound.create({ data: { userId, alarms, stake, serverSeed, serverSeedHash, clientSeed, nonce } });
  });
  return toPublicRound(round);
}

async function loadActiveRound(tx: Prisma.TransactionClient, userId: string, roundId: string) {
  const round = await tx.vaultRound.findUnique({ where: { id: roundId } });
  if (!round) throw new ApiError(404, "Round not found.");
  if (round.userId !== userId) throw new ApiError(403, "Not your round.");
  if (round.status !== "PENDING") throw new ApiError(400, "This heist has already ended.");
  return round;
}

/** Updates the round only if it is still exactly as read (PENDING, same
 * number of cracked locks), so parallel tries or cash-outs can't both act on it. */
async function claimRound(tx: Prisma.TransactionClient, round: VaultRoundRow, data: Prisma.VaultRoundUpdateManyMutationInput) {
  const claimed = await tx.vaultRound.updateMany({ where: { id: round.id, status: "PENDING", cracked: round.cracked }, data });
  if (claimed.count === 0) throw new ApiError(409, "This round was updated by another request. Please refresh and try again.");
  return tx.vaultRound.findUniqueOrThrow({ where: { id: round.id } });
}

async function creditPayout(tx: Prisma.TransactionClient, userId: string, payout: number) {
  await tx.wallet.update({ where: { userId }, data: { balance: { increment: payout } } });
  await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
}

export async function crackLock(userId: string, roundId: string, digit: number) {
  if (!Number.isInteger(digit) || digit < 0 || digit >= DIGITS) throw new ApiError(400, "Pick a digit from 0 to 9.");
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    const alarmDigits = alarmDigitsFor(round.serverSeed, round.clientSeed, round.nonce, round.cracked, round.alarms);
    const ok = !alarmDigits.includes(digit);
    const attempt: VaultTry = { digit, alarmDigits, ok };
    const tries = [...((round.tries as VaultTry[] | null) ?? []), attempt];

    if (!ok) {
      const updated = await claimRound(tx, round, { status: "LOST", multiplier: 0, payout: 0, tries, settledAt: new Date() });
      return { round: toPublicRound(updated), attempt };
    }

    const cracked = round.cracked + 1;
    const multiplier = multiplierAt(round.alarms, cracked);
    // The last lock, or the payout cap reached: nothing more to gain, so it settles as a win.
    const reachedCap = Number(round.stake) * multiplier >= env.games.maxPayout;
    if (cracked >= LOCKS || reachedCap) {
      const payout = cappedPayout(Number(round.stake), multiplier);
      const updated = await claimRound(tx, round, { cracked, multiplier, payout, tries, status: "WON", settledAt: new Date() });
      await creditPayout(tx, userId, payout);
      return { round: toPublicRound(updated), attempt };
    }

    const updated = await claimRound(tx, round, { cracked, multiplier, tries });
    return { round: toPublicRound(updated), attempt };
  });
}

export async function cashOutVault(userId: string, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await loadActiveRound(tx, userId, roundId);
    if (round.cracked <= 0) throw new ApiError(400, "Crack at least one lock before cashing out.");
    const payout = cappedPayout(Number(round.stake), Number(round.multiplier));
    const updated = await claimRound(tx, round, { payout, status: "WON", settledAt: new Date() });
    await creditPayout(tx, userId, payout);
    return toPublicRound(updated);
  });
}

export async function getMyCurrentVaultRound(userId: string) {
  const round = await prisma.vaultRound.findFirst({ where: { userId, status: "PENDING" } });
  return round ? toPublicRound(round) : null;
}

export async function getMyVaultHistory(userId: string, limit = 30) {
  const rounds = await prisma.vaultRound.findMany({
    where: { userId, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rounds.map(toPublicRound);
}
