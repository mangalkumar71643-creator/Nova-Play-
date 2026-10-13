import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { env } from "../config/env";
import { assertCanTransact } from "./responsibleGamblingService";
import { nextRoundSeedMaterial } from "./fairnessService";
import {
  COLS,
  FREE_SPINS,
  JACKPOTS,
  LINES,
  MAX_WIN,
  MEASURED_RTP,
  MOONS_TO_TRIGGER,
  MOON_VALUES,
  PAYTABLE,
  PAYERS,
  RESPINS,
  ROWS,
  Rng,
  SCATTER_REELS,
  playSpin,
} from "./wolfEngine";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function floor2(n: number): number {
  return Math.floor(Number((n * 100).toPrecision(12))) / 100;
}

/**
 * The spin's random stream: HMAC-SHA256(serverSeed, "<clientSeed>:wolf:
 * <nonce>:<block>") for block 0, 1, 2…, each digest read as eight 32-bit
 * numbers. Free spins and the Money Respin can need hundreds of draws, so a spin gets
 * its own message namespace.
 */
export function wolfRng(serverSeed: string, clientSeed: string, nonce: number): Rng {
  let block = 0;
  let buf: Buffer | null = null;
  let offset = 32;
  return () => {
    if (offset >= 32) {
      buf = createHmac("sha256", serverSeed).update(`${clientSeed}:wolf:${nonce}:${block++}`).digest();
      offset = 0;
    }
    const v = buf!.readUInt32BE(offset);
    offset += 4;
    return v / 0x100000000;
  };
}

export function replayWolfSpin(serverSeed: string, clientSeed: string, nonce: number) {
  return playSpin(wolfRng(serverSeed, clientSeed, nonce));
}

type SpinRow = Prisma.WolfMoonSpinGetPayload<Record<string, never>>;

/** The player's live server seed is never sent — only its hash. */
function toPublicSpin(spin: SpinRow) {
  const { serverSeed: _hidden, ...rest } = spin;
  return rest;
}

/**
 * RTP: the Money Respin and its jackpots make an exact count impractical, so
 * it is measured by simulating wolfEngine with DEFAULT_PARAMS; see
 * MEASURED_RTP.
 */
export function getWolfMoonConfig() {
  return {
    minStake: env.games.minStake,
    maxStake: env.games.maxStake,
    maxPayout: env.games.maxPayout,
    rtpPercent: round2(MEASURED_RTP * 100),
    cols: COLS,
    rows: ROWS,
    lines: LINES,
    paytable: PAYERS.map((symbol) => ({ symbol, pays: PAYTABLE[symbol] })),
    freeSpins: FREE_SPINS,
    scatterReels: SCATTER_REELS,
    moonsToTrigger: MOONS_TO_TRIGGER,
    respins: RESPINS,
    moonValues: MOON_VALUES,
    jackpots: JACKPOTS,
    maxWinX: MAX_WIN,
  };
}

/** Spins once (and plays any free spins it triggers): debits the stake,
 * plays the reels from the player's provably-fair seeds and pays the whole
 * result, all in one transaction. */
export async function spinWolfMoon(userId: string, stake: number) {
  if (stake < env.games.minStake || stake > env.games.maxStake) {
    throw new ApiError(400, `Stake must be between ${env.games.minStake} and ${env.games.maxStake}.`);
  }

  await assertCanTransact(userId);

  const { serverSeed, serverSeedHash, clientSeed, nonce } = await nextRoundSeedMaterial(userId);
  const outcome = replayWolfSpin(serverSeed, clientSeed, nonce);
  // Rounded down, so rounding never pays more than the table says.
  const payout = Math.min(floor2(stake * outcome.totalWin), env.games.maxPayout);

  const spin = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    // Conditional debit so parallel spins can't overdraw the wallet.
    const debited = await tx.wallet.updateMany({ where: { userId, balance: { gte: stake } }, data: { balance: { decrement: stake } } });
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
    if (payout > 0) await tx.transaction.create({ data: { userId, type: "GAME_PAYOUT", amount: payout, status: "COMPLETED" } });

    return tx.wolfMoonSpin.create({
      data: { userId, stake, totalWin: outcome.totalWin, payout, freeSpins: outcome.freeSpins.length, moneyRespin: outcome.respin !== null, jackpot: outcome.respin ? (outcome.respin.mega ? "MEGA" : outcome.respin.majors ? "MAJOR" : outcome.respin.minis ? "MINI" : null) : null, serverSeed, serverSeedHash, clientSeed, nonce },
    });
  });

  return { spin: toPublicSpin(spin), outcome };
}

export async function getMyWolfMoonHistory(userId: string, limit = 30) {
  const spins = await prisma.wolfMoonSpin.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
  return spins.map(toPublicSpin);
}
