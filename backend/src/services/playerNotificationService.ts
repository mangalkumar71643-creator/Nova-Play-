import { prisma } from "../db/prismaClient";

/**
 * Messages to one player: shown in the app's Notifications (Personal tab)
 * and as a popup the next time the app is open, until read. Written when
 * the admin adds money to their wallet, so they know where it came from.
 */
export type NotificationKind = "ADMIN_BONUS" | "ADMIN_DEPOSIT" | "WITHDRAWAL_REFUND";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Never throws: the money was already added, a missing message must not undo or fail that. */
async function notify(userId: string, kind: NotificationKind, title: string, body: string, amount: number) {
  try {
    await prisma.playerNotification.create({ data: { userId, kind, title, body, amount } });
  } catch (err) {
    console.error("[notify] could not write a player notification:", (err as Error).message);
  }
}

export function notifyBonus(userId: string, amount: number) {
  return notify(userId, "ADMIN_BONUS", "🎁 Bonus from NovaPlay", `NovaPlay has given you a bonus of ${inr(amount)}. It is in your wallet now — good luck!`, amount);
}

export function notifyDeposit(userId: string, amount: number, bonus = 0) {
  const extra = bonus > 0 ? ` You also got a deposit bonus of ${inr(bonus)}.` : "";
  return notify(userId, "ADMIN_DEPOSIT", "✅ Deposit added", `Your deposit of ${inr(amount)} has been added to your wallet by NovaPlay.${extra}`, amount);
}

export function notifyWithdrawalRefund(userId: string, amount: number) {
  return notify(
    userId,
    "WITHDRAWAL_REFUND",
    "↩️ Withdrawal returned",
    `Your withdrawal of ${inr(amount)} could not be paid, so NovaPlay has returned it to your wallet. Check your bank details and try again, or contact Customer Service.`,
    amount
  );
}

export async function listNotifications(userId: string) {
  const [items, unread] = await Promise.all([
    prisma.playerNotification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.playerNotification.count({ where: { userId, readAt: null } }),
  ]);
  return { unread, items: items.map((n) => ({ ...n, amount: n.amount == null ? null : Number(n.amount) })) };
}

/** Marks the given messages read (all of the player's unread ones when no ids). */
export async function markRead(userId: string, ids?: string[]) {
  await prisma.playerNotification.updateMany({ where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
}
