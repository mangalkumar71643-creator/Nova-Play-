import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { paymentProvider } from "../services/paymentService";
import { assertCanTransact, assertWithinDepositLimits } from "../services/responsibleGamblingService";
import { completeDeposit } from "../services/depositService";
import { confirmUpiDeposits as confirmStockpayDeposits, sweepStaleUpiDeposits, STOCKPAY_PROVIDERS } from "../services/stockpayService";
import * as rupayex from "../services/rupayexService";
import { env } from "../config/env";
import { istDayStart, vipTermsFor, WITHDRAWAL_FEE, withdrawalFee } from "../services/vipService";

const router = Router();

/** Shared response shape for GET/deposit/withdraw so the mobile app always
 * sees the same fields: raw wallet columns plus the derived numbers it
 * actually needs (how much is really free to withdraw right now, how much
 * of today's withdrawal limit is left, and how many fee-free withdrawals). */
async function buildWalletView(userId: string, db: Prisma.TransactionClient = prisma) {
  const [wallet, user, todaysWithdrawals, vip] = await Promise.all([
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
      // A rejected (refunded) one counts for neither the limit nor the free ones.
      where: { userId, type: "WITHDRAWAL", status: { in: ["PENDING", "COMPLETED"] }, createdAt: { gte: istDayStart() } },
      _sum: { amount: true },
      _count: true,
    }),
    vipTermsFor(userId, db),
  ]);

  const withdrawnToday = Number(todaysWithdrawals._sum.amount ?? 0);
  const remainingWithdrawalLimit = Math.max(0, vip.dailyWithdrawalLimit - withdrawnToday);
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
    vipLevel: vip.level,
    dailyWithdrawalLimit: vip.dailyWithdrawalLimit,
    remainingWithdrawalLimit: Math.min(remainingWithdrawalLimit, withdrawable),
    freeWithdrawalsPerDay: vip.freeWithdrawals,
    freeWithdrawalsLeft: Math.max(0, vip.freeWithdrawals - todaysWithdrawals._count),
    withdrawalFee: WITHDRAWAL_FEE,
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

// --- UPI deposits through RupayEx (see rupayexService.ts). New deposits go to
// RupayEx only; StockPay deposits opened before the switch still settle. ---

router.get(
  "/upi/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    // StockPay deposits opened before the switch to RupayEx: a missed webhook
    // must not leave them hanging (throttled). RupayEx deposits are re-checked
    // by the player's own confirm and by the sweep (rupayexService.ts).
    await sweepStaleUpiDeposits();
    res.json(await rupayex.upiDepositStatus(req.user!.userId));
  })
);

router.post(
  "/upi/checkout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { amount } = amountSchema.parse(req.body);
    const userId = req.user!.userId;
    await assertCanTransact(userId);
    await assertWithinDepositLimits(userId, amount);
    // RupayEx sends the player back here (https on Vercel, behind its proxy),
    // keeping the /api prefix when served under one (Replit).
    const proto = req.get("x-forwarded-proto") ?? req.protocol;
    const apiPrefix = req.originalUrl.startsWith("/api/") ? "/api" : "";
    res.json(await rupayex.createUpiCheckout(userId, amount, `${proto}://${req.get("host")}${apiPrefix}`));
  })
);

const confirmSchema = z.object({ sessionId: z.string().min(1).max(200).optional() });
router.post(
  "/upi/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = confirmSchema.parse(req.body ?? {});
    const userId = req.user!.userId;
    let results;
    if (sessionId) {
      // One payment page = one deposit row; settle it with the company that opened it.
      const row = await prisma.transaction.findFirst({ where: { userId, type: "DEPOSIT", providerReferenceId: sessionId }, select: { provider: true } });
      results = (STOCKPAY_PROVIDERS.includes(row?.provider ?? "") ? await confirmStockpayDeposits(userId, sessionId) : await rupayex.confirmUpiDeposits(userId, sessionId)).results;
    } else {
      const [rx, sp] = await Promise.all([rupayex.confirmUpiDeposits(userId), confirmStockpayDeposits(userId)]);
      results = [...rx.results, ...sp.results];
    }
    res.json({ results, wallet: await buildWalletView(userId) });
  })
);

/** RupayEx's redirect_url: its JSON callback (POST) and the player's browser (GET). */
router.post(
  "/rupayex/return",
  asyncHandler(async (req, res) => {
    const orderId = typeof req.body?.order_id === "string" ? req.body.order_id : typeof req.query.order_id === "string" ? req.query.order_id : undefined;
    await rupayex.handleReturn(orderId);
    res.json({ received: true });
  })
);
router.get(
  "/rupayex/return",
  asyncHandler(async (req, res) => {
    const orderId = typeof req.query.order_id === "string" ? req.query.order_id : undefined;
    const { status } = await rupayex.handleReturn(orderId);
    upiReturnPage(res, status === "COMPLETED");
  })
);

/** Where StockPay's UPI page sends the player after checkout. */
router.get("/upi/return", (req, res) => upiReturnPage(res, req.query.status === "paid"));

function upiReturnPage(res: import("express").Response, paid: boolean) {
  const title = paid ? "UPI payment received" : "Back to NovaPlay";
  const text = paid
    ? "Go back to the NovaPlay app — your balance updates in a few seconds."
    : "Go back to the NovaPlay app. If you paid, your balance updates as soon as the payment is confirmed; otherwise no money was taken.";
  res.type("html").send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>` +
      `<body style="margin:0;font-family:system-ui,sans-serif;background:#120a1f;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">` +
      `<div style="padding:24px"><div style="font-size:56px">${paid ? "✅" : "↩️"}</div><h1 style="font-size:22px">${title}</h1><p style="opacity:.8;line-height:1.5">${text}</p></div></body></html>`
  );
}

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
    const fee = await prisma.$transaction(async (tx) => {
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
        throw new ApiError(
          400,
          `This would exceed today's withdrawal limit for VIP ${view.vipLevel} (₹${view.dailyWithdrawalLimit.toLocaleString("en-IN")}). Remaining today: ₹${view.remainingWithdrawalLimit.toFixed(2)}.`
        );
      }
      // The day's first few withdrawals are free; after that the fee comes out of the payout.
      const fee = view.freeWithdrawalsLeft > 0 ? 0 : withdrawalFee(amount);
      if (fee >= amount) {
        throw new ApiError(400, `The withdrawal fee would be ₹${fee.toFixed(2)} (₹${WITHDRAWAL_FEE.flat} + ${WITHDRAWAL_FEE.percent}%), so withdraw more than that.`);
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
        data: { userId, type: "WITHDRAWAL", amount, status: "PENDING", fee: fee > 0 ? fee : null },
      });
      return fee;
    });

    res.json({ ...(await buildWalletView(userId)), fee, payout: Math.round((amount - fee) * 100) / 100 });
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
        select: { id: true, amount: true, fee: true, providerFee: true, status: true, createdAt: true },
      }),
      prisma.transaction.aggregate({ where: { userId, type, status: "COMPLETED" }, _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: { userId, type, status: "PENDING" }, _sum: { amount: true } }),
    ]);
    res.json({
      kind,
      total: Number(completed._sum.amount ?? 0),
      count: completed._count,
      pending: Number(pending._sum.amount ?? 0),
      items: items.map((t) => ({ ...t, amount: Number(t.amount), fee: Number(t.fee ?? 0), providerFee: t.providerFee == null ? null : Number(t.providerFee) })),
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
