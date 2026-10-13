import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { assertCanTransact } from "./responsibleGamblingService";

/**
 * VIP tiers. XP is the total a player has staked in games (₹1 = 1 XP).
 * upgradeBonus is paid once when a level is reached; weeklyBonus once per
 * week for the player's current level.
 */
export const VIP_LEVELS: { level: number; xpRequired: number; weeklyBonus?: number; upgradeBonus?: number }[] = [
  { level: 0, xpRequired: 0 },
  { level: 1, xpRequired: 100 },
  { level: 2, xpRequired: 1000, weeklyBonus: 3, upgradeBonus: 7 },
  { level: 3, xpRequired: 5000, weeklyBonus: 5, upgradeBonus: 11 },
  { level: 4, xpRequired: 10000, weeklyBonus: 7, upgradeBonus: 17 },
  { level: 5, xpRequired: 20000, weeklyBonus: 11, upgradeBonus: 37 },
  { level: 6, xpRequired: 50000, weeklyBonus: 17, upgradeBonus: 77 },
  { level: 7, xpRequired: 100000, weeklyBonus: 27, upgradeBonus: 177 },
  { level: 8, xpRequired: 200000, weeklyBonus: 37, upgradeBonus: 377 },
  { level: 9, xpRequired: 500000, weeklyBonus: 77, upgradeBonus: 1777 },
  { level: 10, xpRequired: 1000000, weeklyBonus: 117, upgradeBonus: 3777 },
  { level: 11, xpRequired: 5000000, weeklyBonus: 177, upgradeBonus: 17777 },
  { level: 12, xpRequired: 10000000, weeklyBonus: 1777, upgradeBonus: 77777 },
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Monday of the current week (India time) as YYYY-MM-DD; weekly bonuses reset then. */
function currentWeekKey(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const daysSinceMonday = (ist.getUTCDay() + 6) % 7;
  ist.setUTCDate(ist.getUTCDate() - daysSinceMonday);
  return ist.toISOString().slice(0, 10);
}

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

export async function getVipStatus(userId: string) {
  const [xp, claims] = await Promise.all([
    xpFor(userId),
    prisma.vipBonusClaim.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { claimKey: true, amount: true, createdAt: true } }),
  ]);
  const level = levelForXp(xp);
  const weekKey = currentWeekKey();
  return {
    xp,
    level,
    weekKey,
    levels: VIP_LEVELS,
    claimedUpgrades: claims.filter((c) => c.claimKey.startsWith("upgrade-")).map((c) => Number(c.claimKey.split("-")[1])),
    weeklyClaimedLevels: claims.filter((c) => c.claimKey.startsWith("weekly-") && c.claimKey.endsWith(`-${weekKey}`)).map((c) => Number(c.claimKey.split("-")[1])),
    history: claims.map((c) => ({
      kind: c.claimKey.startsWith("upgrade-") ? ("upgrade" as const) : ("weekly" as const),
      level: Number(c.claimKey.split("-")[1]),
      amount: Number(c.amount),
      createdAt: c.createdAt,
    })),
  };
}

/**
 * Pays a VIP bonus into the balance. Upgrade bonuses for any level reached,
 * once each; the weekly bonus for the current level, once per week. Recorded
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
    if (kind === "upgrade" && current < level) throw new ApiError(403, `Reach VIP ${level} to claim this bonus.`);
    if (kind === "weekly" && current !== level) throw new ApiError(403, "The weekly bonus is for your current VIP level.");

    const claimKey = kind === "upgrade" ? `upgrade-${level}` : `weekly-${level}-${currentWeekKey()}`;
    const exists = await tx.vipBonusClaim.findUnique({ where: { userId_claimKey: { userId, claimKey } }, select: { id: true } });
    if (exists) throw new ApiError(409, kind === "upgrade" ? "You have already claimed this bonus." : "You have already claimed this week's bonus.");

    await tx.vipBonusClaim.create({ data: { userId, claimKey, amount } });
    const wallet = await tx.wallet.upsert({ where: { userId }, update: { balance: { increment: amount } }, create: { userId, balance: amount } });
    await tx.transaction.create({
      data: { userId, type: "BONUS", amount, status: "COMPLETED", provider: kind === "upgrade" ? "vip-upgrade" : "vip-weekly" },
    });
    return { amount, balance: Number(wallet.balance) };
  });
}
