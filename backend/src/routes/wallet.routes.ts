import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { paymentProvider } from "../services/paymentService";
import { assertCanTransact, assertWithinDepositLimits } from "../services/responsibleGamblingService";
import { completeDeposit } from "../services/depositService";
import { env } from "../config/env";

const router = Router();

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Shared response shape for GET/deposit/withdraw so the mobile app always
 * sees the same fields: raw wallet columns plus the derived numbers it
 * actually needs (how much is really free to withdraw right now, and how
 * much of today's withdrawal limit is left). */
async function buildWalletView(userId: string, db: Prisma.TransactionClient = prisma) {
  const [wallet, user, todaysWithdrawals] = await Promise.all([
    db.wallet.findUniqueOrThrow({ where: { userId } }),
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        payoutAccountHolderName: true,
        payoutAccountNumber: true,
        payoutIfsc: true,
        firstDepositBonusClaimed: true,
      },
    }),
    db.transaction.aggregate({
      // PENDING counts too so a still-unapproved withdrawal already
      // earmarked against the daily limit — otherwise a user could
      // submit several pending requests to bypass it before any are
      // approved.
      where: { userId, type: "WITHDRAWAL", status: { in: ["PENDING", "COMPLETED"] }, createdAt: { gte: startOfDay() } },
      _sum: { amount: true },
    }),
  ]);

  const withdrawnToday = Number(todaysWithdrawals._sum.amount ?? 0);
  const remainingWithdrawalLimit = Math.max(0, env.wallet.dailyWithdrawalLimit - withdrawnToday);
  // Only winnings can leave: deposits must be played first, and a locked bonus waits for its wagering.
  const withdrawable = Math.max(0, Number(wallet.balance) - Number(wallet.lockedBonus) - Number(wallet.unplayedDeposit));

  return {
    ...wallet,
    payoutAccountHolderName: user.payoutAccountHolderName,
    payoutAccountNumber: user.payoutAccountNumber,
    payoutIfsc: user.payoutIfsc,
    hasPayoutAccount: Boolean(user.payoutAccountHolderName && user.payoutAccountNumber && user.payoutIfsc),
    firstDepositBonusClaimed: user.firstDepositBonusClaimed,
    withdrawable,
    dailyWithdrawalLimit: env.wallet.dailyWithdrawalLimit,
    remainingWithdrawalLimit: Math.min(remainingWithdrawalLimit, withdrawable),
  };
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await buildWalletView(req.user!.userId));
  })
);

const amountSchema = z.object({ amount: z.number().positive() });

router.post(
  "/deposit",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!env.wallet.depositsEnabled) throw new ApiError(403, "Deposits are not open yet.");
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;

    await assertCanTransact(userId);
    await assertWithinDepositLimits(userId, amount);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const result = await paymentProvider.deposit({ userId, amount, currency: wallet.currency });

    if (result.status !== "COMPLETED") {
      await prisma.transaction.create({
        data: {
          userId,
          type: "DEPOSIT",
          amount,
          status: result.status,
          provider: result.provider,
          providerReferenceId: result.providerReferenceId,
        },
      });
      throw new ApiError(402, "Deposit could not be completed by the payment provider.");
    }

    const { bonus } = await completeDeposit(userId, amount, result.provider, result.providerReferenceId ?? null);
    res.json({ ...(await buildWalletView(userId)), bonusGranted: bonus });
  })
);

const payoutAccountSchema = z.object({
  accountHolderName: z.string().trim().min(2, "Enter the account holder's name").max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, "Enter a valid account number"),
  ifsc: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, "Enter a valid 11-character IFSC code")
    .transform((v) => v.toUpperCase()),
});

router.put(
  "/payout-account",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { accountHolderName, accountNumber, ifsc } = payoutAccountSchema.parse(req.body);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { payoutAccountHolderName: accountHolderName, payoutAccountNumber: accountNumber, payoutIfsc: ifsc },
    });
    res.json(await buildWalletView(req.user!.userId));
  })
);

router.post(
  "/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;

    await assertCanTransact(userId);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { payoutAccountHolderName: true, payoutAccountNumber: true, payoutIfsc: true },
    });
    if (!user.payoutAccountHolderName || !user.payoutAccountNumber || !user.payoutIfsc) {
      throw new ApiError(400, "Add your bank account before withdrawing.");
    }

    // The checks and the debit run under a lock on the player's wallet row,
    // so parallel requests are handled one at a time: each one sees the
    // balance and daily total left by the one before, and none can withdraw
    // money (or limit) another has already taken.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
      const view = await buildWalletView(userId, tx);
      if (amount > view.withdrawable) {
        const lockedBonus = Number(view.lockedBonus);
        const unplayed = Number(view.unplayedDeposit);
        const reasons = [
          unplayed > 0 ? `₹${unplayed.toFixed(2)} deposited has not been played yet` : null,
          lockedBonus > 0 ? `₹${lockedBonus.toFixed(2)} bonus is still locked until its wagering requirement is met` : null,
        ].filter(Boolean);
        throw new ApiError(
          400,
          reasons.length > 0 ? `Only ₹${view.withdrawable.toFixed(2)} (your winnings) can be withdrawn right now — ${reasons.join(", and ")}.` : "Insufficient balance"
        );
      }
      if (amount > view.remainingWithdrawalLimit) {
        throw new ApiError(400, `This would exceed today's withdrawal limit. Remaining today: ₹${view.remainingWithdrawalLimit.toFixed(2)}.`);
      }

      // Withdrawals now require manual admin approval (see admin.routes.ts
      // PATCH /admin/withdrawals/:id/approve|reject) rather than completing
      // instantly — the amount is deducted right away so the funds are
      // earmarked and can't be double-spent while the request is pending.
      // Conditional debit as a last guard: the balance can never go negative.
      const debited = await tx.wallet.updateMany({
        where: { userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (debited.count === 0) throw new ApiError(400, "Insufficient balance");
      await tx.transaction.create({
        data: { userId, type: "WITHDRAWAL", amount, status: "PENDING" },
      });
    });

    res.json(await buildWalletView(userId));
  })
);

router.get(
  "/transactions",
  requireAuth,
  asyncHandler(async (req, res) => {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(transactions);
  })
);

// Deposit or withdrawal history on its own (the general list above can be
// crowded out by game rows), with all-time totals for the screen's header.
const historySchema = z.object({ kind: z.enum(["deposit", "withdraw"]) });
router.get(
  "/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { kind } = historySchema.parse(req.query);
    const userId = req.user!.userId;
    const type = kind === "deposit" ? "DEPOSIT" : "WITHDRAWAL";
    const [items, completed, pending] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, type },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, amount: true, status: true, createdAt: true },
      }),
      prisma.transaction.aggregate({ where: { userId, type, status: "COMPLETED" }, _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: { userId, type, status: "PENDING" }, _sum: { amount: true } }),
    ]);
    res.json({
      kind,
      total: Number(completed._sum.amount ?? 0),
      count: completed._count,
      pending: Number(pending._sum.amount ?? 0),
      items: items.map((t) => ({ ...t, amount: Number(t.amount) })),
    });
  })
);

// Every balance change, newest first, with the balance right after it.
// Only completed deposits and credits moved the balance; a withdrawal took
// the money when it was requested (a rejected one is paid back by its own
// WITHDRAWAL_REVERSAL row). balanceAfter is worked back from the current
// balance through the newer rows, so the filter never changes it. A game's
// stake and payout are written in one database transaction and share a
// timestamp, so within a timestamp money going out sorts before money in.
const recordsSchema = z.object({
  filter: z.enum(["all", "income", "expense"]).default("all"),
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
router.get(
  "/records",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { filter, before, limit } = recordsSchema.parse(req.query);
    const userId = req.user!.userId;
    const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
    const balance = wallet?.balance ?? new Prisma.Decimal(0);
    const filterSql =
      filter === "income" ? Prisma.sql`AND delta > 0` : filter === "expense" ? Prisma.sql`AND delta < 0` : Prisma.empty;
    const cursorSql = before
      ? Prisma.sql`AND ("createdAt", rnk, id) < (SELECT "createdAt", rnk, id FROM tx WHERE id = ${before})`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<
      { id: string; type: string; status: string; provider: string | null; amount: Prisma.Decimal; delta: Prisma.Decimal; createdAt: Date; balanceAfter: Prisma.Decimal }[]
    >`
      WITH tx AS (
        SELECT id, type::text AS type, status::text AS status, provider, amount, "createdAt",
          CASE
            WHEN type IN ('DEPOSIT', 'BET_PAYOUT', 'GAME_PAYOUT', 'BONUS', 'BET_REFUND', 'DEPOSIT_BONUS', 'WITHDRAWAL_REVERSAL')
              THEN CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END
            ELSE -amount
          END AS delta,
          CASE WHEN type IN ('GAME_STAKE', 'BET_STAKE', 'WITHDRAWAL') THEN 0 ELSE 1 END AS rnk
        FROM "Transaction" WHERE "userId" = ${userId}
      ), ordered AS (
        SELECT *, COALESCE(SUM(delta) OVER (ORDER BY "createdAt" DESC, rnk DESC, id DESC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS later
        FROM tx
      )
      SELECT id, type, status, provider, amount, delta, "createdAt", ${balance}::numeric - later AS "balanceAfter"
      FROM ordered
      WHERE TRUE ${filterSql} ${cursorSql}
      ORDER BY "createdAt" DESC, rnk DESC, id DESC
      LIMIT ${limit}`;
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        status: r.status,
        provider: r.provider,
        amount: Number(r.amount),
        change: Number(r.delta),
        balanceAfter: Number(r.balanceAfter),
        createdAt: r.createdAt,
      })),
      hasMore: rows.length === limit,
    });
  })
);

export default router;
