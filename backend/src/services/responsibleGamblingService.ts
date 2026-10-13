import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";

export async function assertCanTransact(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.isSelfExcluded) {
    if (!user.selfExclusionUntil || user.selfExclusionUntil > new Date()) {
      throw new ApiError(403, "Account is self-excluded. Betting and deposits are blocked.");
    }
  }
  // KYC gate disabled for now while the app is still being tested — no
  // real money is live yet. Re-enable this before going live:
  // if (user.kycStatus !== "APPROVED") {
  //   throw new ApiError(403, "KYC verification must be approved before you can transact.");
  // }
}

export async function assertWithinDepositLimits(userId: string, amount: number) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const checks: Array<{ label: string; limit: number | null; windowStart: Date }> = [
    { label: "daily", limit: user.depositLimitDaily ? Number(user.depositLimitDaily) : null, windowStart: startOfDay() },
    { label: "weekly", limit: user.depositLimitWeekly ? Number(user.depositLimitWeekly) : null, windowStart: startOfWeek() },
    { label: "monthly", limit: user.depositLimitMonthly ? Number(user.depositLimitMonthly) : null, windowStart: startOfMonth() },
  ];

  for (const check of checks) {
    if (check.limit === null) continue;
    const alreadyDeposited = await prisma.transaction.aggregate({
      where: {
        userId,
        type: "DEPOSIT",
        status: "COMPLETED",
        createdAt: { gte: check.windowStart },
      },
      _sum: { amount: true },
    });
    const total = Number(alreadyDeposited._sum.amount ?? 0) + amount;
    if (total > check.limit) {
      throw new ApiError(
        403,
        `This deposit would exceed your self-set ${check.label} deposit limit of ${check.limit}.`
      );
    }
  }
}

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = startOfDay();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(): Date {
  const d = startOfDay();
  d.setDate(1);
  return d;
}
