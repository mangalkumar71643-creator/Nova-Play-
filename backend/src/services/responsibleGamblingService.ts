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
        // PENDING too: open UPI payment pages, so several can't be opened
        // under the limit and then all paid.
        status: { in: ["COMPLETED", "PENDING"] },
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

// Periods in India time, like the rest of the app (the server's clock is UTC).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}

/** Monday 00:00 India time. */
function startOfWeek(): Date {
  const day = startOfDay();
  const weekday = new Date(day.getTime() + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return new Date(day.getTime() - ((weekday + 6) % 7) * DAY_MS);
}

function startOfMonth(): Date {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}
