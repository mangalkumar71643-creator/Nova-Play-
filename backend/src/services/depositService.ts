import { prisma } from "../db/prismaClient";
import { env } from "../config/env";

/**
 * Records a completed real-money deposit and credits it, with the first- or
 * second-deposit bonus when it is one of those. Used by the app's own
 * deposit (after the payment provider confirms) and by the admin's manual
 * deposit (after the admin has received the money). The DEPOSIT row also
 * marks the money as unplayed (database trigger, see prisma/seed.ts) so it
 * must be played before it can be withdrawn.
 */
export async function completeDeposit(userId: string, amount: number, provider: string, providerReferenceId: string | null) {
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

    const deposit = await tx.transaction.create({ data: { userId, type: "DEPOSIT", amount, status: "COMPLETED", provider, providerReferenceId } });
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
    return { depositId: deposit.id, bonus: granted };
  });
}
