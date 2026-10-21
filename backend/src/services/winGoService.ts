import { PrismaClient, WingoRound, WingoBet } from '@prisma/client';
import { ApiError } from '../utils/ApiError';

const prisma = new PrismaClient();

// WINGO DURATIONS DEFINITION
const WINGO_DURATIONS =; // 30s, 1m, 3m, 5m
function assertValidDuration(duration: number): asserts duration is number {
  if (!WINGO_DURATIONS.includes(duration)) {
    throw new ApiError(400, 'Invalid duration. Choose one of: ' + WINGO_DURATIONS.join(', '));
  }
}

// IST OFFSET FOR PERIOD NUMBER GENERATION
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function periodNumberFor(durationSeconds: number, startTime: Date): string {
  const ist = new Date(startTime.getTime() + IST_OFFSET_MS);
  const y = ist.getUTCFullYear().toString().slice(-2);
  const m = (ist.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = ist.getUTCDate().toString().padStart(2, '0');
  const secondsSinceMidnight = ist.getUTCHours() * 3600 + ist.getUTCMinutes() * 60 + ist.getUTCSeconds();
  const periodNumber = Math.floor(secondsSinceMidnight / durationSeconds) + 1;
  return `${y}${m}${d}${String(periodNumber).padStart(4, '0')}`;
}

export async function getOrCreateRound(durationSeconds: number, now: Date): Promise<WingoRound> {
  const ms = durationSeconds * 1000;
  const startTime = new Date(Math.floor(now.getTime() / ms) * ms);
  const periodNumber = periodNumberFor(durationSeconds, startTime);
  const key = `${durationSeconds}_${periodNumber}`;

  const existing = await prisma.wingoRound.findUnique({ where: { key } });
  if (existing) return existing;

  // Fake / Default seed logic just to satisfy database model constraint
  const serverSeed = "default_seed_" + Math.random();
  const serverSeedHash = "default_hash_" + Math.random();

  try {
    return await prisma.wingoRound.create({
      data: {
        durationSeconds,
        periodNumber,
        startTime,
        endTime: new Date(startTime.getTime() + ms),
        result: 0, 
        house: false,
        serverSeed,
        serverSeedHash,
        key,
        settled: false
      }
    });
  } catch (e) {
    return await prisma.wingoRound.findUniqueOrThrow({ where: { key } });
  }
}

// Simple payout calculation helper based on typical Wingo rules
function payoutMultiplier(area: string, resultNum: number): number {
  const isBig = resultNum >= 5;
  if (area === 'BIG' && isBig) return 2;
  if (area === 'SMALL' && !isBig) return 2;
  
  if (area === 'GREEN' && [1, 3, 7, 9, 5].includes(resultNum)) return resultNum === 5 ? 1.5 : 2;
  if (area === 'RED' && [2, 4, 6, 8, 0].includes(resultNum)) return resultNum === 0 ? 1.5 : 2;
  if (area === 'VIOLET' && [0, 5].includes(resultNum)) return 4.5;

  if (area === `NUM:${resultNum}`) return 9;
  return 0;
}

export async function settleRound(round: WingoRound) {
  // Wait for any bets still committing on this round
  await prisma.\$queryRaw`SELECT 1 FROM "WingoRound" WHERE id = ${round.id} FOR UPDATE`;
  const pending = await prisma.wingoBet.findMany({ where: { roundId: round.id, status: "PENDING" } });

  // 🌟 यहाँ पर हमारा नया लो-बेट रिजल्ट नंबर कैलकुलेट होकर सेट होगा
  const lowestWingoNumber = calculateLowestWingoResult(pending);
  round.result = lowestWingoNumber;

  // 🌟 नए नंबर के हिसाब से BIG/SMALL और Color का नाम भी ठीक करें ताकि रिकॉर्ड सही दिखे
  if (lowestWingoNumber >= 5) {
    (round as any).size = "BIG";
  } else {
    (round as any).size = "SMALL";
  }
  
  if (lowestWingoNumber === 0) (round as any).color = "RED_VIOLET";
  else if (lowestWingoNumber === 5) (round as any).color = "GREEN_VIOLET";
  else (round as any).color = lowestWingoNumber % 2 === 0 ? "RED" : "GREEN";

  for (const bet of pending) {
    const rate = round.house ? 0 : payoutMultiplier(bet.area, lowestWingoNumber);
    const won = rate > 0;
    const payout = won ? Math.floor(Number(bet.amount) * rate) : 0;

    await prisma.\$transaction(async (tx) => {
      const claimed = await tx.wingoBet.updateMany({
        where: { id: bet.id, status: "PENDING" },
        data: { status: won ? "WON" : "LOST", payout, paidMultiplier: rate }
      });

      if (claimed.count === 0) return;

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: bet.userId } });
      const data: any = {};
      if (won) data.balance = { increment: payout };

      // Wagering process tracking
      const progress = Number(bet.amount);
      if (Number(wallet.lockedBonus) > 0) {
        const constProgress = Number(wallet.wageringProgress) + progress;
        if (constProgress >= Number(wallet.wageringRequired)) {
          data.lockedBonus = 0;
          data.wageringRequired = 0;
          data.wageringProgress = 0;
        } else {
          data.wageringProgress = { increment: progress };
        }
      } else {
        data.wageringProgress = { increment: progress };
      }

      if (Object.keys(data).length > 0) await tx.wallet.update({ where: { id: wallet.id }, data });
      if (won) await tx.transaction.create({ data: { userId: bet.userId, type: "GAME_STAKE", amount: payout, status: "SUCCESS" } });
    });
  }

  await prisma.wingoRound.updateMany({
    where: { id: round.id },
    data: { 
      result: round.result, 
      settled: true,
      color: (round as any).color,
      size: (round as any).size
    }
  });
}

export async function settleDueRounds(now: Date, durationSeconds: number) {
  const due = await prisma.wingoRound.findMany({
    where: { settled: false, endTime: { lte: now }, durationSeconds },
    orderBy: { startTime: "asc" },
    take: 20,
  });

  for (const round of due) {
    await settleRound(round);
  }
}

export async function getCurrentRoundView(durationSeconds: number) {
  assertValidDuration(durationSeconds);
  const now = new Date();
  const round = await getOrCreateRound(durationSeconds, now);
  await settleDueRounds(now, durationSeconds);

  return {
    periodNumber: round.periodNumber,
    durationSeconds,
    startTime: round.startTime,
    endTime: round.endTime,
    serverTime: now,
    serverSeedHash: round.serverSeedHash,
    locked: round.endTime.getTime() - now.getTime() <= 5000
  };
}

export function getWingoConfig() {
  return {
    durations: WINGO_DURATIONS,
    minStake: Number(process.env.WINGO_MIN_STAKE || 10),
    maxStake: Number(process.env.WINGO_MAX_STAKE || 100000),
    lockSeconds: 5,
    rtpPercent: 90
  };
}

export async function getWingoHistory(durationSeconds: number, limit = 100) {
  assertValidDuration(durationSeconds);
  const rounds = await prisma.wingoRound.findMany({
    where: { durationSeconds, settled: true },
    orderBy: { startTime: "desc" },
    take: limit,
  });
  return rounds;
}

export async function getMyWingoBets(userId: string, limit = 50) {
  const bets = await prisma.wingoBet.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { round: true }
  });
  return bets;
}

// 🌟 हमारा मुख्य नया दिमाग जो तय करेगा कि सबसे कम पैसे वाला अपोजिट नंबर कौन सा है
function calculateLowestWingoResult(activeBets: any[]) {
  const colorPool = { GREEN: 0, RED: 0, VIOLET: 0 };
  const sizePool = { BIG: 0, SMALL: 0 };
  const numberPool: { [key: string]: number } = {};
  for (let i = 0; i <= 9; i++) numberPool[`NUM:${i}`] = 0;

  // 1. सभी बेट्स का टोटल अमाउंट कैलकुलेट करना
  activeBets.forEach((bet) => {
    const amount = Number(bet.amount || 0);
    const key = bet.area; 

    if (key in colorPool) {
      colorPool[key as keyof typeof colorPool] += amount;
    } else if (key in sizePool) {
      sizePool[key as keyof typeof sizePool] += amount;
    } else if (key in numberPool) {
      numberPool[key] += amount;
    }
  });

  // 2. सबसे कम बेट वाला SIZE (BIG या SMALL) तय करना
  let winningSize = "BIG";
  if (sizePool["SMALL"] < sizePool["BIG"]) {
    winningSize = "SMALL";
  } else if (sizePool["BIG"] < sizePool["SMALL"]) {
    winningSize = "BIG";
  } else {
    winningSize = Math.random() > 0.5 ? "BIG" : "SMALL";
  }

  // 3. जो SIZE जीता है, उसी के नंबर्स में से सबसे कम बेट वाला नंबर चुनना
  const allowedNumbers = winningSize === "BIG" ? [5, 6, 7, 8, 9] :;
  
  let winningNumber = allowedNumbers[0];
  let minNumAmount = Infinity;

  allowedNumbers.forEach((num) => {
    const numKey = `NUM:${num}`;
    if (numberPool[numKey] < minNumAmount) {
      minNumAmount = numberPool[numKey];
      winningNumber = num;
    } else if (numberPool[numKey] === minNumAmount) {
      if (Math.random() > 0.5) winningNumber = num;
    }
  });

  return winningNumber;
}
