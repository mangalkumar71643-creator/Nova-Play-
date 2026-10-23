import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { depositNumberOf } from "./depositService";
import * as rupayex from "./rupayexService";
import { STOCKPAY_PROVIDERS } from "./stockpayService";

/**
 * The admin panel's Problems page: everything that needs the admin, in one
 * list (optionally for one player) — UPI deposits still open after
 * STUCK_DEPOSIT_MINUTES, withdrawals waiting, open support tickets and
 * balances that differ from their transactions — and the one-tap fixes.
 */
export const STUCK_DEPOSIT_MINUTES = 30;

const userSelect = { id: true, uid: true, firstName: true, lastName: true, phone: true } as const;
const nameOf = (u: { firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(" ") || null;

/**
 * Players whose wallet balance differs from what their transactions add up
 * to (the same sum the app's balance records use). A difference means the
 * balance was changed without a transaction — by hand in the database, for
 * instance.
 */
export async function balanceMismatches(userId?: string) {
  const rows = await prisma.$queryRaw<{ userId: string; uid: number | null; firstName: string | null; lastName: string | null; phone: string | null; balance: unknown; ledger: unknown }[]>`
    WITH ledger AS (
      SELECT "userId", SUM(
        CASE
          WHEN type IN ('DEPOSIT', 'BET_PAYOUT', 'GAME_PAYOUT', 'BONUS', 'BET_REFUND', 'DEPOSIT_BONUS', 'WITHDRAWAL_REVERSAL')
            THEN CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END
          ELSE -amount
        END) AS ledger
      FROM "Transaction" GROUP BY "userId"
    )
    SELECT w."userId", u.uid, u."firstName", u."lastName", u.phone, w.balance, COALESCE(l.ledger, 0) AS ledger
    FROM "Wallet" w JOIN "User" u ON u.id = w."userId" LEFT JOIN ledger l ON l."userId" = w."userId"
    WHERE ABS(w.balance - COALESCE(l.ledger, 0)) >= 0.01 AND (${userId ?? null}::text IS NULL OR w."userId" = ${userId ?? null})
    ORDER BY ABS(w.balance - COALESCE(l.ledger, 0)) DESC
    LIMIT 200`;
  return rows.map((r) => ({
    userId: r.userId,
    uid: r.uid,
    name: nameOf(r),
    phone: r.phone,
    balance: Number(r.balance),
    ledger: Number(r.ledger),
    difference: Math.round((Number(r.balance) - Number(r.ledger)) * 100) / 100,
  }));
}

/**
 * Everything the admin needs to sort out a player's problem, per player:
 * when they joined, last signed in and were last in the app (lastActivityAt:
 * their latest transaction, for accounts from before sign-ins were noted),
 * balance, what they deposited and withdrew, and KYC.
 */
async function playerDetails(userIds: string[]) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map<string, Record<string, unknown>>();
  const [users, deposited, withdrawn, last] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, createdAt: true, lastLoginAt: true, lastSeenAt: true, kycStatus: true, isBanned: true, wallet: { select: { balance: true } } },
    }),
    prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "DEPOSIT", status: "COMPLETED", reversedAt: null }, _sum: { amount: true }, _count: true }),
    prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "WITHDRAWAL", status: "COMPLETED" }, _sum: { amount: true } }),
    prisma.transaction.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const map = new Map<string, Record<string, unknown>>();
  for (const u of users) {
    const d = deposited.find((x) => x.userId === u.id);
    map.set(u.id, {
      joinedAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lastSeenAt: u.lastSeenAt,
      lastActivityAt: last.find((x) => x.userId === u.id)?._max.createdAt ?? null,
      balance: Number(u.wallet?.balance ?? 0),
      deposited: Number(d?._sum.amount ?? 0),
      deposits: d?._count ?? 0,
      withdrawn: Number(withdrawn.find((x) => x.userId === u.id)?._sum.amount ?? 0),
      kycStatus: u.kycStatus,
      isBanned: u.isBanned,
    });
  }
  return map;
}

export async function getProblems(uid?: number) {
  let userId: string | undefined;
  if (uid !== undefined) {
    const u = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
    if (!u) throw new ApiError(404, "No player with that UID.");
    userId = u.id;
  }
  const stuckBefore = new Date(Date.now() - STUCK_DEPOSIT_MINUTES * 60 * 1000);
  const [deposits, withdrawals, tickets, mismatches] = await Promise.all([
    prisma.transaction.findMany({
      where: { type: "DEPOSIT", status: "PENDING", reversedAt: null, createdAt: { lt: stuckBefore }, provider: { in: [rupayex.PROVIDER, ...STOCKPAY_PROVIDERS] }, userId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, amount: true, provider: true, providerReferenceId: true, createdAt: true, user: { select: userSelect } },
    }),
    prisma.transaction.findMany({
      where: { type: "WITHDRAWAL", status: "PENDING", userId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, amount: true, provider: true, createdAt: true, user: { select: userSelect } },
    }),
    prisma.supportTicket.findMany({
      where: { status: "OPEN", userId },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: { id: true, topic: true, createdAt: true, user: { select: userSelect } },
    }),
    balanceMismatches(userId),
  ]);
  const details = await playerDetails([...deposits, ...withdrawals, ...tickets].map((x) => x.user.id).concat(mismatches.map((m) => m.userId)));
  const who = (u: { id: string; uid: number | null; firstName: string | null; lastName: string | null; phone: string | null }) => ({
    userId: u.id,
    uid: u.uid,
    name: nameOf(u),
    phone: u.phone,
    player: details.get(u.id) ?? null,
  });
  return {
    stuckAfterMinutes: STUCK_DEPOSIT_MINUTES,
    stuckDeposits: deposits.map((d) => ({
      id: d.id,
      amount: Number(d.amount),
      depositNo: depositNumberOf(d),
      provider: d.provider,
      createdAt: d.createdAt,
      ...who(d.user),
    })),
    pendingWithdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: Number(w.amount),
      // null: waiting for the admin; anything else: sent to the payment company.
      sent: w.provider !== null,
      createdAt: w.createdAt,
      ...who(w.user),
    })),
    openTickets: tickets.map((t) => ({ id: t.id, topic: t.topic, createdAt: t.createdAt, ...who(t.user) })),
    balanceMismatches: mismatches.map((m) => ({ ...m, player: details.get(m.userId) ?? null })),
  };
}

/**
 * Settles one stuck UPI deposit: asks RupayEx and credits it if it was paid
 * (rupayexService.adminRecheckDeposit); if RupayEx answers that it was not
 * paid, it is closed (FAILED) so it leaves the list. A closed order paid
 * late is still credited by the sweep, so nothing is lost. A StockPay order
 * (switched off for good) is just closed.
 */
export async function resolveStuckDeposit(id: string) {
  const tx = await prisma.transaction.findUnique({ where: { id }, select: { type: true, status: true, provider: true, reversedAt: true } });
  if (!tx || tx.type !== "DEPOSIT") throw new ApiError(404, "No such deposit.");
  if (tx.status !== "PENDING" || tx.reversedAt) return { id, status: tx.status, result: "Already settled." };
  const close = async (why: string) => {
    const closed = await prisma.transaction.updateMany({ where: { id, status: "PENDING" }, data: { status: "FAILED" } });
    return { id, status: closed.count ? "FAILED" : "PENDING", result: closed.count ? why : "It changed while checking — refresh." };
  };
  if (tx.provider !== rupayex.PROVIDER) return close("StockPay is switched off for good: closed.");
  const check = await rupayex.adminRecheckDeposit(id);
  if (check.status !== "PENDING") return { id, status: check.status, result: check.note };
  if (!check.live.answered) return { id, status: "PENDING", result: "RupayEx did not answer — try again in a minute." };
  return close(`RupayEx says ${check.live.state ?? "not paid"}: the player did not pay. Closed (if they pay late it is still credited).`);
}

/** Sets a player's balance to what their transactions add up to (after the admin has looked at the difference). */
export async function fixBalanceToLedger(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const [row] = await tx.$queryRaw<{ ledger: unknown }[]>`
      SELECT COALESCE(SUM(CASE
        WHEN type IN ('DEPOSIT', 'BET_PAYOUT', 'GAME_PAYOUT', 'BONUS', 'BET_REFUND', 'DEPOSIT_BONUS', 'WITHDRAWAL_REVERSAL')
          THEN CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END
        ELSE -amount END), 0) AS ledger
      FROM "Transaction" WHERE "userId" = ${userId}`;
    const ledger = Math.round(Number(row.ledger) * 100) / 100;
    const before = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
    await tx.wallet.update({ where: { userId }, data: { balance: ledger } });
    return { before: Number(before.balance), after: ledger };
  });
}
