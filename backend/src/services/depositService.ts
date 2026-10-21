import { prisma } from "../db/prismaClient";
import { env } from "../config/env";
import { ApiError } from "../middleware/errorHandler";

/**
 * Records a completed real-money deposit and credits it, with the first- or
 * second-deposit bonus when it is one of those. Used by the app's own
 * deposit (after the payment provider confirms) and by the admin's manual
 * deposit (after the admin has received the money). The DEPOSIT row also
 * marks the money as unplayed (database trigger, see prisma/seed.ts) so it
 * must be played before it can be withdrawn.
 *
 * With `pendingTransactionId` (a UPI deposit recorded as PENDING when its
 * payment page was opened), that row is claimed -> COMPLETED instead of a new
 * row being written; if it was already claimed, nothing is credited again
 * (alreadyCompleted). A FAILED row is claimable too: the caller has just
 * confirmed with the payment company that it was paid (a late payment).
 * A row the admin reversed, or one older than CLAIM_WINDOW_MS, is never
 * credited (refused): no payment company pays that late, and an old order
 * reporting "paid" again must not bring money back.
 */
/**
 * A deposit's own number, shown with it to the player and searchable in the
 * admin panel: the order id we gave the payment company (RupayEx "NP…",
 * StockPay "ord_…"), else "NP-" and the start of the row's id.
 */
export function depositNumberOf(t: { id: string; provider: string | null; providerReferenceId: string | null }): string {
  if ((t.provider === "rupayex" || t.provider === "stockpay" || t.provider === "stockpay_live") && t.providerReferenceId) return t.providerReferenceId;
  return `NP-${t.id.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

/** The bank reference of a deposit: what the payment company gave, or the UTR the admin typed for one received by hand. */
export function depositUtrOf(t: { provider: string | null; providerReferenceId: string | null; paymentUtr?: string | null }): string | null {
  return t.paymentUtr ?? (t.provider === "admin-manual" ? t.providerReferenceId : null);
}

export const CLAIM_WINDOW_MS = 3 * 24 * 3600 * 1000;

export async function completeDeposit(
  userId: string,
  amount: number,
  provider: string,
  providerReferenceId: string | null,
  pendingTransactionId?: string,
  // allowOld: the admin has just confirmed this very order with the payment
  // company (rupayexService.adminRecheckDeposit), so its age doesn't matter.
  opts: { allowOld?: boolean; paymentUtr?: string | null } = {}
) {
  return prisma.$transaction(async (tx) => {
    // Lock the wallet so two deposits at once can't both count as the
    // first (or second) and both take that bonus.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const previousDeposits = await tx.transaction.count({ where: { userId, type: "DEPOSIT", status: "COMPLETED" } });
    // First deposit firstDepositBonusPercent, second secondDepositBonusPercent,
    // none after: min(amount * percent, cap), credited into balance
    // (immediately playable) and locked from withdrawal until
    // wageringMultiplier x the bonus has been staked in games — each game
    // service (e.g. vortexService.ts, andarBaharService.ts) advances
    // wageringProgress and releases the lock.
    const percent = previousDeposits === 0 ? env.wallet.firstDepositBonusPercent : previousDeposits === 1 ? env.wallet.secondDepositBonusPercent : 0;
    const granted = Math.round(Math.min(amount * percent, env.wallet.firstDepositBonusCap) * 100) / 100;

    let depositId: string;
    if (pendingTransactionId) {
      const row = await tx.transaction.findUnique({ where: { id: pendingTransactionId }, select: { reversedAt: true, createdAt: true } });
      if (!row || row.reversedAt || (!opts.allowOld && Date.now() - row.createdAt.getTime() > CLAIM_WINDOW_MS)) {
        return { depositId: pendingTransactionId, bonus: 0, alreadyCompleted: false, refused: true };
      }
      const claimed = await tx.transaction.updateMany({
        where: { id: pendingTransactionId, userId, status: { in: ["PENDING", "FAILED"] }, reversedAt: null },
        data: { status: "COMPLETED", ...(opts.paymentUtr ? { paymentUtr: opts.paymentUtr } : {}) },
      });
      if (claimed.count === 0) {
        // Already credited: still keep the UTR if this answer is the first to carry one.
        if (opts.paymentUtr) await tx.transaction.updateMany({ where: { id: pendingTransactionId, paymentUtr: null }, data: { paymentUtr: opts.paymentUtr } });
        return { depositId: pendingTransactionId, bonus: 0, alreadyCompleted: true, refused: false };
      }
      depositId = pendingTransactionId;
    } else {
      depositId = (await tx.transaction.create({ data: { userId, type: "DEPOSIT", amount, status: "COMPLETED", provider, providerReferenceId } })).id;
    }
    await tx.wallet.update({ where: { userId }, data: { balance: { increment: amount } } });

    if (granted > 0) {
      await tx.transaction.create({
        data: { userId, type: "DEPOSIT_BONUS", amount: granted, status: "COMPLETED", provider: "novaplay-promo" },
      });
      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { increment: granted },
          lockedBonus: { increment: granted },
          wageringRequired: { increment: granted * env.wallet.wageringMultiplier },
        },
      });
    }
    if (previousDeposits === 0) await tx.user.update({ where: { id: userId }, data: { firstDepositBonusClaimed: true } });
    return { depositId, bonus: granted, alreadyCompleted: false, refused: false };
  });
}

/**
 * The admin takes a deposit back (e.g. test money that must not stay). Under
 * a lock on the player's wallet: a credited deposit is marked reversed and
 * its amount taken back — as much as the balance still holds — with a
 * DEPOSIT_REVERSAL row; one not credited yet is voided. Either way the row is
 * stamped reversedAt, so no webhook, sweep or confirm can ever credit it
 * again (completeDeposit refuses it). A bonus it earned is not touched.
 */
export async function reverseDeposit(depositId: string) {
  return prisma.$transaction(async (tx) => {
    const dep = await tx.transaction.findUnique({ where: { id: depositId } });
    if (!dep || dep.type !== "DEPOSIT") throw new ApiError(404, "No such deposit.");
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${dep.userId} FOR UPDATE`;
    const marked = await tx.transaction.updateMany({ where: { id: dep.id, reversedAt: null }, data: { reversedAt: new Date() } });
    if (marked.count === 0) throw new ApiError(400, "This deposit was already reversed.");
    if (dep.status !== "COMPLETED") {
      await tx.transaction.update({ where: { id: dep.id }, data: { status: "FAILED" } });
      return { depositId: dep.id, voided: true, takenBack: 0, shortfall: 0 };
    }
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: dep.userId } });
    const amount = Number(dep.amount);
    const takenBack = Math.round(Math.min(amount, Math.max(0, Number(wallet.balance))) * 100) / 100;
    if (takenBack > 0) {
      await tx.wallet.update({ where: { userId: dep.userId }, data: { balance: { decrement: takenBack } } });
      await tx.transaction.create({
        data: { userId: dep.userId, type: "DEPOSIT_REVERSAL", amount: takenBack, status: "COMPLETED", provider: "admin-reversal", providerReferenceId: dep.id },
      });
    }
    return { depositId: dep.id, voided: false, takenBack, shortfall: Math.round((amount - takenBack) * 100) / 100 };
  });
}
