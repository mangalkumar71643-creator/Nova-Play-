import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";

// Mirrors mobile/src/data/mockData.ts's `dailyRewardTrack` so the UI's
// 7-day track always matches what's actually credited. Tune both together —
// these are real-money amounts once PAYMENT_PROVIDER_MODE=live.
const DAILY_REWARD_TABLE = [100, 150, 200, 250, 350, 500, 1000];

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

/** Server-authoritative daily login bonus — fixed reward table, streak
 * tracked on the user record so the client cannot claim more than once a
 * day or dictate the amount. */
export async function claimDailyBonus(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = new Date();

  if (user.lastDailyClaimAt && isSameCalendarDay(user.lastDailyClaimAt, now)) {
    throw new ApiError(409, "Daily reward already claimed today.");
  }

  const missedADay =
    user.lastDailyClaimAt !== null &&
    now.getTime() - user.lastDailyClaimAt.getTime() > 1000 * 60 * 60 * 48;
  const nextStreak = missedADay || !user.lastDailyClaimAt ? 1 : user.dailyStreak + 1;
  const amount = DAILY_REWARD_TABLE[(nextStreak - 1) % DAILY_REWARD_TABLE.length];

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { dailyStreak: nextStreak, lastDailyClaimAt: now },
    }),
    prisma.wallet.update({ where: { userId }, data: { balance: { increment: amount } } }),
    prisma.transaction.create({
      data: { userId, type: "BONUS", amount, status: "COMPLETED" },
    }),
  ]);

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return { streak: nextStreak, amount, newBalance: wallet.balance };
}
