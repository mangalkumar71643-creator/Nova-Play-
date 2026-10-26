import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { depositNumberOf, depositUtrOf, withdrawableOf } from "./depositService";
import { getPlayerGames } from "./gameReportService";
import { balanceMismatches, STUCK_DEPOSIT_MINUTES } from "./problemsService";

/**
 * Everything about one player for the admin's Player Report page: who they
 * are and when they were last around, their wallet, money in and out by
 * kind, their play game by game, and their latest deposits, withdrawals and
 * bonuses.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function getPlayerReport(uid: number) {
  const user = await prisma.user.findUnique({
    where: { uid },
    select: {
      id: true,
      uid: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      createdAt: true,
      lastLoginAt: true,
      lastSeenAt: true,
      kycStatus: true,
      isBanned: true,
      banReason: true,
      isSelfExcluded: true,
      referrerId: true,
      payoutAccountHolderName: true,
      payoutAccountNumber: true,
      payoutIfsc: true,
      wallet: { select: { balance: true, lockedBonus: true, unplayedDeposit: true, wageringRequired: true, wageringProgress: true } },
    },
  });
  if (!user) throw new ApiError(404, "No player with that UID.");
  if (user.role === "ADMIN") throw new ApiError(400, "That is an admin account, not a player.");

  const stuckBefore = new Date(Date.now() - STUCK_DEPOSIT_MINUTES * 60 * 1000);
  const [byType, inviter, invited, games, history, mismatch, sameBank, stuckDeposits, waitingWithdrawals, openTickets] = await Promise.all([
    prisma.transaction.groupBy({ by: ["type", "status"], where: { userId: user.id }, _sum: { amount: true }, _count: true }),
    user.referrerId ? prisma.user.findUnique({ where: { id: user.referrerId }, select: { uid: true, firstName: true, lastName: true } }) : null,
    prisma.user.count({ where: { referrerId: user.id } }),
    getPlayerGames(user.id),
    prisma.transaction.findMany({
      where: { userId: user.id, type: { in: ["DEPOSIT", "WITHDRAWAL", "BONUS", "DEPOSIT_BONUS", "DEPOSIT_REVERSAL", "WITHDRAWAL_REVERSAL", "BALANCE_RESET"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, status: true, amount: true, provider: true, providerReferenceId: true, paymentUtr: true, reversedAt: true, createdAt: true },
    }),
    balanceMismatches(user.id),
    // Other accounts paid out to the same bank account: one person playing as several players.
    user.payoutAccountNumber
      ? prisma.user.findMany({
          where: { id: { not: user.id }, payoutAccountNumber: user.payoutAccountNumber },
          select: { uid: true, firstName: true, lastName: true, isBanned: true },
          take: 20,
        })
      : [],
    prisma.transaction.count({ where: { userId: user.id, type: "DEPOSIT", status: "PENDING", reversedAt: null, createdAt: { lt: stuckBefore } } }),
    prisma.transaction.count({ where: { userId: user.id, type: "WITHDRAWAL", status: "PENDING" } }),
    prisma.supportTicket.count({ where: { userId: user.id, status: "OPEN" } }),
  ]);
  const sum = (types: string[], status?: string) =>
    r2(byType.filter((r) => types.includes(r.type) && (!status || r.status === status)).reduce((t, r) => t + Number(r._sum.amount ?? 0), 0));
  const count = (types: string[], status?: string) => byType.filter((r) => types.includes(r.type) && (!status || r.status === status)).reduce((t, r) => t + r._count, 0);
  const reversedDeposits = history.filter((h) => h.type === "DEPOSIT" && h.reversedAt && h.status === "COMPLETED").reduce((t, h) => t + Number(h.amount), 0);
  const w = user.wallet;

  return {
    profile: {
      uid: user.uid,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      phone: user.phone,
      email: user.email,
      joinedAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastSeenAt: user.lastSeenAt,
      kycStatus: user.kycStatus,
      isBanned: user.isBanned,
      banReason: user.banReason,
      isSelfExcluded: user.isSelfExcluded,
      invitedBy: inviter ? { uid: inviter.uid, name: [inviter.firstName, inviter.lastName].filter(Boolean).join(" ") } : null,
      invited,
      bank: user.payoutAccountNumber
        ? { holder: user.payoutAccountHolderName, account: `•••• ${user.payoutAccountNumber.slice(-4)}`, ifsc: user.payoutIfsc }
        : null,
    },
    wallet: w
      ? {
          balance: Number(w.balance),
          withdrawable: withdrawableOf(w),
          unplayedDeposit: Number(w.unplayedDeposit),
          lockedBonus: Number(w.lockedBonus),
          bonusWageringLeft: r2(Math.max(0, Number(w.wageringRequired) - Number(w.wageringProgress))),
        }
      : null,
    money: {
      deposited: r2(sum(["DEPOSIT"], "COMPLETED") - reversedDeposits),
      deposits: count(["DEPOSIT"], "COMPLETED"),
      depositsOpen: count(["DEPOSIT"], "PENDING"),
      withdrawn: sum(["WITHDRAWAL"], "COMPLETED"),
      withdrawals: count(["WITHDRAWAL"], "COMPLETED"),
      withdrawalsWaiting: sum(["WITHDRAWAL"], "PENDING"),
      withdrawalsRejected: count(["WITHDRAWAL"], "FAILED"),
      bonuses: sum(["BONUS", "DEPOSIT_BONUS"], "COMPLETED"),
      takenBack: sum(["DEPOSIT_REVERSAL", "BALANCE_RESET"]),
    },
    games,
    // What the admin should look at on this account (the panel shows each as OK or a warning).
    checks: {
      // Balance minus what the transactions add up to: anything but 0 means it was changed by hand.
      balanceDifference: mismatch[0]?.difference ?? 0,
      sameBankAccount: sameBank.map((u) => ({ uid: u.uid, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null, isBanned: u.isBanned })),
      stuckDeposits,
      waitingWithdrawals,
      openTickets,
    },
    history: history.map((h) => ({
      id: h.id,
      type: h.type,
      status: h.reversedAt ? "REVERSED" : h.status,
      amount: Number(h.amount),
      at: h.createdAt,
      ref: h.type === "DEPOSIT" ? depositNumberOf(h) : h.providerReferenceId,
      // A withdrawal paid by hand carries the UTR the admin typed (as in the player's own history).
      utr: h.type === "DEPOSIT" ? depositUtrOf(h) : h.type === "WITHDRAWAL" && h.status === "COMPLETED" ? h.paymentUtr ?? (h.provider === "admin-manual" ? h.providerReferenceId : null) : null,
      provider: h.provider,
    })),
  };
}
