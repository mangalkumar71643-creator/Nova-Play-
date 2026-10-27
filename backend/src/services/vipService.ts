import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * VIP tiers. XP is the total a player has staked in games (₹1 = 1 XP).
 * Only the player's current level pays: upgradeBonus once for that level,
 * and weeklyBonus (shown as the monthly bonus; the name stays for older
 * apps) once per calendar month.
 *
 * Withdrawals: dailyWithdrawalLimit is the most a player can take out per
 * day (India time), and the first freeWithdrawals of the day carry no fee;
 * every one after that pays WITHDRAWAL_FEE. VIP 0 has VIP 1's terms.
 */
export const VIP_LEVELS: {
  level: number;
  xpRequired: number;
  weeklyBonus?: number;
  upgradeBonus?: number;
  dailyWithdrawalLimit: number;
  freeWithdrawals: number;
}[] = [
  { level: 0, xpRequired: 0, dailyWithdrawalLimit: 1000, freeWithdrawals: 4 },
  { level: 1, xpRequired: 100, dailyWithdrawalLimit: 1000, freeWithdrawals: 4 },
  { level: 2, xpRequired: 1000, weeklyBonus: 3, upgradeBonus: 7, dailyWithdrawalLimit: 5000, freeWithdrawals: 4 },
  { level: 3, xpRequired: 5000, weeklyBonus: 5, upgradeBonus: 11, dailyWithdrawalLimit: 10000, freeWithdrawals: 5 },
  { level: 4, xpRequired: 10000, weeklyBonus: 7, upgradeBonus: 17, dailyWithdrawalLimit: 20000, freeWithdrawals: 5 },
  { level: 5, xpRequired: 20000, weeklyBonus: 11, upgradeBonus: 37, dailyWithdrawalLimit: 50000, freeWithdrawals: 10 },
  { level: 6, xpRequired: 50000, weeklyBonus: 17, upgradeBonus: 77, dailyWithdrawalLimit: 100000, freeWithdrawals: 10 },
  { level: 7, xpRequired: 100000, weeklyBonus: 27, upgradeBonus: 177, dailyWithdrawalLimit: 200000, freeWithdrawals: 15 },
  { level: 8, xpRequired: 200000, weeklyBonus: 37, upgradeBonus: 377, dailyWithdrawalLimit: 500000, freeWithdrawals: 15 },
  { level: 9, xpRequired: 500000, weeklyBonus: 77, upgradeBonus: 1777, dailyWithdrawalLimit: 1000000, freeWithdrawals: 15 },
  { level: 10, xpRequired: 1000000, weeklyBonus: 117, upgradeBonus: 3777, dailyWithdrawalLimit: 5000000, freeWithdrawals: 99 },
  { level: 11, xpRequired: 5000000, weeklyBonus: 177, upgradeBonus: 17777, dailyWithdrawalLimit: 10000000, freeWithdrawals: 99 },
  { level: 12, xpRequired: 10000000, weeklyBonus: 1777, upgradeBonus: 77777, dailyWithdrawalLimit: 10000000, freeWithdrawals: 99 },
];

/** Fee on a withdrawal past the day's free ones: ₹flat + percent% of the amount, kept out of the payout. */
// Our own fee: a flat ₹6 (owner, 2026-10-27). The payout company's own ~3%
// is separate: it takes that out of what it sends.
export const WITHDRAWAL_FEE = { flat: 6, percent: 0 };

/** "₹6", or "₹6 + 3%" while there is a percentage part. */
export const feeLabel = (f: { flat: number; percent: number }) => (f.percent ? `₹${f.flat} + ${f.percent}%` : `₹${f.flat}`);

export function withdrawalFee(amount: number) {
  return Math.round((WITHDRAWAL_FEE.flat + (amount * WITHDRAWAL_FEE.percent) / 100) * 100) / 100;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Midnight today, India time: daily withdrawal limits and free withdrawals reset then. */
export function istDayStart(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

/** Start of the calendar month (India time) `offset` months from now; monthly bonuses reset then. */
function monthStart(offset = 0, now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + offset, 1) - IST_OFFSET_MS);
}

/** Current month (India time) as YYYY-MM. */
function currentMonthKey(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** Monthly claims are keyed "monthly-…"; ones from the old weekly bonus "weekly-…". */
const isPeriodicClaim = (claimKey: string) => !claimKey.startsWith("upgrade-");

function levelForXp(xp: number) {
  let level = 0;
  for (const l of VIP_LEVELS) if (xp >= l.xpRequired) level = l.level;
  return level;
}

async function xpFor(userId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const staked = await client.transaction.aggregate({
    where: { userId, type: { in: ["GAME_STAKE", "BET_STAKE"] }, status: "COMPLETED" },
    _sum: { amount: true },
  });
  return Math.floor(Number(staked._sum.amount ?? 0));
}

/** The player's VIP level and that level's terms. */
export async function vipTermsFor(userId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const level = levelForXp(await xpFor(userId, client));
  return VIP_LEVELS.find((l) => l.level === level) ?? VIP_LEVELS[0];
}

export async function getVipStatus(userId: string) {
  const [xp, claims] = await Promise.all([
    xpFor(userId),
    prisma.vipBonusClaim.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { claimKey: true, amount: true, createdAt: true } }),
  ]);
  const level = levelForXp(xp);
  const since = monthStart();
  const monthlyClaimed = claims.some((c) => isPeriodicClaim(c.claimKey) && c.createdAt >= since);
  return {
    xp,
    level,
    monthKey: currentMonthKey(),
    levels: VIP_LEVELS,
    withdrawalFee: WITHDRAWAL_FEE,
    claimedUpgrades: claims.filter((c) => c.claimKey.startsWith("upgrade-")).map((c) => Number(c.claimKey.split("-")[1])),
    /** True once this month's bonus is taken, whatever level it was taken at. */
    monthlyClaimed,
    /** When the next monthly bonus opens (1st of next month, India time). */
    nextMonthlyAt: monthStart(1).toISOString(),
    // Older apps read this: marking the current level makes them show "Received".
    weeklyClaimedLevels: monthlyClaimed ? [level] : [],
    history: claims.map((c) => ({
      kind: c.claimKey.startsWith("upgrade-") ? ("upgrade" as const) : ("weekly" as const),
      level: Number(c.claimKey.split("-")[1]),
      amount: Number(c.amount),
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Pays a VIP bonus into the balance, only for the player's current level: the
 * upgrade bonus once, the monthly bonus once per calendar month. Recorded
 * as a BONUS the unplayed-money trigger counts, so it must be played once
 * before it can be withdrawn.
 */
export async function claimVipBonus(userId: string, kind: "upgrade" | "weekly", level: number) {
  await assertCanTransact(userId);
  const def = VIP_LEVELS.find((l) => l.level === level);
  const amount = kind === "upgrade" ? def?.upgradeBonus : def?.weeklyBonus;
  if (!def || !amount) throw new ApiError(400, "This level has no such bonus.");

  return prisma.$transaction(async (tx) => {
    // One claim at a time per player, so the level check and the insert can't race.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const current = levelForXp(await xpFor(userId, tx));
    if (current < level) throw new ApiError(403, `Reach VIP ${level} to claim this bonus.`);
    if (current > level) throw new ApiError(403, `Only your current level's bonus can be claimed. You are VIP ${current}.`);

    if (kind === "weekly") {
      const thisMonth = await tx.vipBonusClaim.findMany({ where: { userId, createdAt: { gte: monthStart() } }, select: { claimKey: true } });
      if (thisMonth.some((c) => isPeriodicClaim(c.claimKey))) {
        throw new ApiError(409, "You have already claimed this month's bonus. The next one opens on the 1st.");
      }
    }
    const claimKey = kind === "upgrade" ? `upgrade-${level}` : `monthly-${level}-${currentMonthKey()}`;
    const exists = await tx.vipBonusClaim.findUnique({ where: { userId_claimKey: { userId, claimKey } }, select: { id: true } });
    if (exists) throw new ApiError(409, kind === "upgrade" ? "You have already claimed this bonus." : "You have already claimed this month's bonus.");

    await tx.vipBonusClaim.create({ data: { userId, claimKey, amount } });
    const wallet = await tx.wallet.upsert({ where: { userId }, update: { balance: { increment: amount } }, create: { userId, balance: amount } });
    await tx.transaction.create({
      data: { userId, type: "BONUS", amount, status: "COMPLETED", provider: kind === "upgrade" ? "vip-upgrade" : "vip-weekly" },
    });
    return { amount, balance: Number(wallet.balance) };
  });
}
