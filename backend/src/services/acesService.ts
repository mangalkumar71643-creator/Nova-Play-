import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import {
  BASE_MULTIPLIERS,
  FREE_GAMES,
  FREE_MULTIPLIERS,
  FREE_RETRIGGER,
  MEASURED_RTP,
  PAYTABLE,
  SCATTERS_TO_TRIGGER,
  Rng,
  playSpin,
} from "./acesEngine";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

/**
 * The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:aces:
 * <nonce>:<block>") for block 0, 1, 2…, each digest read as eight 32-bit
 * numbers. A spin can need thousands of draws, so it gets its own message
 * namespace instead of the nonce * 1000 + i slices the other games use,
 * which would run into the next nonces.
 */
export function acesRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:aces:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export function replayAcesSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(acesRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.AcesSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(spin: SpinRow) {
  const { serverSeed: _hidden, ...rest } = spin;
  return rest;
}

export function getAcesConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: round2(MEASURED_RTP * 100),
    paytable: PAYTABLE,
    baseMultipliers: BASE_MULTIPLIERS,
    freeMultipliers: FREE_MULTIPLIERS,
    freeGames: FREE_GAMES,
    freeRetrigger: FREE_RETRIGGER,
    scattersToTrigger: SCATTERS_TO_TRIGGER,
  };
}

/** Spins once (and plays any Free Games it triggers): debits the stake,
 * plays the cascades from the player's provably-fair seeds and pays the
 * whole result, all in one transaction. */
export async function spinAces(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayAcesSpin(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);
  const cascades = outcome.base.steps.length + outcome.freeGames.reduce((s, g) => s + g.steps.length, 0);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({
      where: { userId, balance: { gte: stake } },
      data: { balance: { decrement: stake } },
    });
    if (debited.count === 0) throw new ApiError(400, "Insufficient balance");

    const data: Prisma.WalletUpdateInput = {};
    if (payout > 0) data.balance = { increment: payout };
    // Same locked-bonus wagering-progress mechanic as the other games.
    if (Number(wallet.lockedBonus) > 0) {
      const progress = Number(wallet.wageringProgress) + stake;
      if (progress >= Number(wallet.wageringRequired)) {
        data.lockedBonus = 0;
        data.wageringRequired = 0;
        data.wageringProgress = 0;
      } else {
        data.wageringProgress = { increment: stake };
      }
    }
    if (Object.keys(data).length > 0) await tx.wallet.update({ where: { userId }, data });

    await tx.transaction.create({ data: { userId, type: "GAME_STAKE", amount: stake, status: "COMPLETED" } });
    if (payout > 0) {
      await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });
    }

    return tx.acesSpin.create({
      data: {
        userId,
        stake,
        totalWin: outcome.totalWin,
        payout,
        cascades,
        freeGames: outcome.freeGames.length,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
      },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyAcesHistory(userId: string, limit = 30) {
  const spins = await prisma.acesSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return spins.map(toPublicSpin);
}
