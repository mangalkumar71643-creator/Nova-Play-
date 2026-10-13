import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { generateClientSeed, generateServerSeed, hashServerSeed } from "../utils/rng";

export interface FairnessStatus {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

/** Lazily mints a fresh server/client seed pair the first time a user
 * touches anything fairness-related (fetching status or playing a game). */
export async function ensureFairnessSeed(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.fairnessServerSeed && user.fairnessServerSeedHash && user.fairnessClientSeed) {
    return user;
  }
  const serverSeed = generateServerSeed();
  return prisma.user.update({
    where: { id: userId },
    data: {
      fairnessServerSeed: serverSeed,
      fairnessServerSeedHash: hashServerSeed(serverSeed),
      fairnessClientSeed: user.fairnessClientSeed ?? generateClientSeed(),
      fairnessNonce: 0,
    },
  });
}

export async function getFairnessStatus(userId: string): Promise<FairnessStatus> {
  const user = await ensureFairnessSeed(userId);
  return {
    serverSeedHash: user.fairnessServerSeedHash!,
    clientSeed: user.fairnessClientSeed!,
    nonce: user.fairnessNonce,
  };
}

/** Changes the client seed. The nonce carries on (it only goes back to 0 with
 * a new server seed), so no (server seed, client seed, nonce) is ever used
 * twice: resetting it here would let a player set an old client seed again
 * and replay rounds whose outcomes they have already seen. */
export async function setClientSeed(userId: string, clientSeed: string): Promise<FairnessStatus> {
  await ensureFairnessSeed(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { fairnessClientSeed: clientSeed },
  });
  return getFairnessStatus(userId);
}

/** How soon after a round takes a nonce the seed may be rotated: covers a round still being created. */
const ROTATE_AFTER_USE_MS = 30 * 1000;

/** Multi-step rounds play on with the live server seed until they end, so
 * revealing that seed while one is open would expose its hidden outcome. */
async function hasOpenRound(userId: string): Promise<boolean> {
  const pending = { userId, status: "PENDING" as const };
  const active = { userId, status: "ACTIVE" as const };
  const counts = await Promise.all([
    prisma.minesRound.count({ where: pending }),
    prisma.chickenRoadRound.count({ where: pending }),
    prisma.penaltyRound.count({ where: pending }),
    prisma.cupsRound.count({ where: pending }),
    prisma.bombRound.count({ where: pending }),
    prisma.vaultRound.count({ where: pending }),
    prisma.treasureRound.count({ where: pending }),
    prisma.vortexRound.count({ where: pending }),
    prisma.dragonTowerRound.count({ where: active }),
    prisma.pumpRound.count({ where: active }),
    prisma.coinFlipRound.count({ where: active }),
    prisma.blackjackHand.count({ where: active }),
    prisma.hiloRound.count({ where: active }),
    prisma.videoPokerRound.count({ where: active }),
    prisma.casinoHoldemHand.count({ where: active }),
    prisma.threeCardPokerHand.count({ where: active }),
  ]);
  return counts.some((c) => c > 0);
}

/** Reveals the current server seed (so past rounds played under its hash
 * can be independently verified) and replaces it with a fresh one. */
export async function rotateServerSeed(userId: string) {
  const user = await ensureFairnessSeed(userId);
  if (await hasOpenRound(userId)) {
    throw new ApiError(409, "Finish your open game first — the seed can be changed once no round is in progress.");
  }
  if (user.fairnessNonceUsedAt && Date.now() - user.fairnessNonceUsedAt.getTime() < ROTATE_AFTER_USE_MS) {
    throw new ApiError(429, "Please wait a few seconds after playing before changing the seed.");
  }
  const revealedServerSeed = user.fairnessServerSeed!;
  const revealedServerSeedHash = user.fairnessServerSeedHash!;

  const nextServerSeed = generateServerSeed();
  // Only if no round took a nonce meanwhile (the nonce and seed are unchanged since the checks above).
  const swapped = await prisma.user.updateMany({
    where: { id: userId, fairnessServerSeed: revealedServerSeed, fairnessNonce: user.fairnessNonce },
    data: {
      fairnessServerSeed: nextServerSeed,
      fairnessServerSeedHash: hashServerSeed(nextServerSeed),
      fairnessNonce: 0,
    },
  });
  if (swapped.count === 0) throw new ApiError(409, "A round started while changing the seed. Please try again.");
  await prisma.revealedServerSeed.create({
    data: { userId, serverSeed: revealedServerSeed, serverSeedHash: revealedServerSeedHash },
  });

  return {
    revealedServerSeed,
    revealedServerSeedHash,
    newServerSeedHash: hashServerSeed(nextServerSeed),
  };
}

export function listRevealedSeeds(userId: string) {
  return prisma.revealedServerSeed.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Consumes the next nonce for a round, returning everything needed to
 * both compute and later independently verify the outcome. */
export async function nextRoundSeedMaterial(userId: string) {
  await ensureFairnessSeed(userId);
  // One atomic UPDATE ... RETURNING: two rounds started at once each get their
  // own nonce (a read followed by a separate increment could hand both the same
  // one), and the seeds returned are the ones that nonce belongs to.
  const user = await prisma.user.update({
    where: { id: userId },
    data: { fairnessNonce: { increment: 1 }, fairnessNonceUsedAt: new Date() },
  });
  return {
    serverSeed: user.fairnessServerSeed!,
    serverSeedHash: user.fairnessServerSeedHash!,
    clientSeed: user.fairnessClientSeed!,
    nonce: user.fairnessNonce - 1,
  };
}
