import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { normalizeCode } from "./giftCodeService";

/**
 * Messages to players, shown in the app's Notifications (Personal tab), as
 * a popup while the app is open and as a phone notification (the app's
 * NotificationWatcher and background check), until read:
 *   - written by the server when the admin adds money to a wallet, so the
 *     player knows where it came from;
 *   - written by the admin on the panel's Messages page, to one player (by
 *     UID) or to every player (a Broadcast), optionally with a gift code.
 */
export type NotificationKind = "ADMIN_BONUS" | "ADMIN_DEPOSIT" | "WITHDRAWAL_REFUND" | "ADMIN_MESSAGE";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

async function balanceOf(userId: string) {
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return w ? Number(w.balance) : null;
}

/** Never throws: the money was already added, a missing message must not undo or fail that. */
async function notify(userId: string, kind: NotificationKind, title: string, body: string, amount: number | null, giftCode: string | null = null) {
  try {
    await prisma.playerNotification.create({ data: { userId, kind, title, body, amount, giftCode } });
  } catch (err) {
    console.error("[notify] could not write a player notification:", (err as Error).message);
  }
}

const newBalance = (b: number | null) => (b == null ? "" : ` New balance: ${inr(b)}.`);

export async function notifyBonus(userId: string, amount: number) {
  const b = await balanceOf(userId);
  return notify(userId, "ADMIN_BONUS", `💰 ${inr(amount)} added to your wallet!`, `NovaPlay has given you a bonus of ${inr(amount)}.${newBalance(b)} Play smart and good luck! 🍀`, amount);
}

export async function notifyDeposit(userId: string, amount: number, bonus = 0) {
  const b = await balanceOf(userId);
  const extra = bonus > 0 ? ` You also got a ${inr(bonus)} deposit bonus. 🎁` : "";
  return notify(userId, "ADMIN_DEPOSIT", `✅ ${inr(amount)} deposit added!`, `Your deposit of ${inr(amount)} is now in your wallet.${extra}${newBalance(b)} Have fun playing! 🎮`, amount);
}

export async function notifyWithdrawalRefund(userId: string, amount: number) {
  const b = await balanceOf(userId);
  return notify(
    userId,
    "WITHDRAWAL_REFUND",
    `↩️ ${inr(amount)} returned to your wallet`,
    `Your withdrawal of ${inr(amount)} could not be paid, so the full amount is back in your wallet.${newBalance(b)} Please check your bank details and try again, or contact Customer Service.`,
    amount
  );
}

// --- The admin's own messages (panel → Messages) ---

async function checkGiftCode(raw?: string | null) {
  if (!raw) return null;
  const code = normalizeCode(raw);
  const found = await prisma.giftCode.findFirst({ where: { code, deletedAt: null }, select: { active: true, usedCount: true, maxUses: true } });
  if (!found) throw new ApiError(400, `There is no gift code ${code}. Create it on the Gift codes page first.`);
  if (!found.active) throw new ApiError(400, `Gift code ${code} is switched off.`);
  if (found.usedCount >= found.maxUses) throw new ApiError(400, `Gift code ${code} is already used up.`);
  return code;
}

export type AdminMessage = { title: string; body: string; giftCode?: string };

/** To every player: one Broadcast row, read by each player in their own time. */
export async function sendBroadcast(msg: AdminMessage) {
  const giftCode = await checkGiftCode(msg.giftCode);
  const players = await prisma.user.count({ where: { role: "USER" } });
  const row = await prisma.broadcast.create({ data: { title: msg.title, body: msg.body, giftCode } });
  return { id: row.id, players };
}

/** To one player, by UID. */
export async function sendToPlayer(uid: number, msg: AdminMessage) {
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, role: true } });
  if (!user || user.role === "ADMIN") throw new ApiError(404, "No player with that UID.");
  const giftCode = await checkGiftCode(msg.giftCode);
  const row = await prisma.playerNotification.create({ data: { userId: user.id, kind: "ADMIN_MESSAGE", title: msg.title, body: msg.body, giftCode } });
  return { id: row.id, players: 1 };
}

/** What the admin has sent lately, newest first. */
export async function sentMessages() {
  const [broadcasts, direct] = await Promise.all([
    prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.playerNotification.findMany({
      where: { kind: "ADMIN_MESSAGE" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, title: true, body: true, giftCode: true, createdAt: true, readAt: true, user: { select: { uid: true } } },
    }),
  ]);
  return [
    ...broadcasts.map((b) => ({ id: b.id, to: "All players", title: b.title, body: b.body, giftCode: b.giftCode, createdAt: b.createdAt, readAt: null as Date | null })),
    ...direct.map((d) => ({ id: d.id, to: `UID ${d.user.uid ?? "—"}`, title: d.title, body: d.body, giftCode: d.giftCode, createdAt: d.createdAt, readAt: d.readAt })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 40);
}

// --- The player's side ---

const BROADCAST_PREFIX = "b:";

/** The player's own messages and the broadcasts sent since they joined, newest first. */
export async function listNotifications(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true, broadcastsSeenAt: true } });
  const seenUntil = user.broadcastsSeenAt ?? user.createdAt;
  const [own, broadcasts] = await Promise.all([
    prisma.playerNotification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.broadcast.findMany({ where: { createdAt: { gte: user.createdAt } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const items = [
    ...own.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, amount: n.amount == null ? null : Number(n.amount), giftCode: n.giftCode, readAt: n.readAt, createdAt: n.createdAt })),
    ...broadcasts.map((b) => ({
      id: BROADCAST_PREFIX + b.id,
      kind: "BROADCAST",
      title: b.title,
      body: b.body,
      amount: null,
      giftCode: b.giftCode,
      readAt: b.createdAt <= seenUntil ? seenUntil : null,
      createdAt: b.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
  return { unread: items.filter((i) => !i.readAt).length, items };
}

/** Marks the given messages read (everything when no ids). */
export async function markRead(userId: string, ids?: string[]) {
  const own = ids?.filter((i) => !i.startsWith(BROADCAST_PREFIX));
  const casts = ids?.filter((i) => i.startsWith(BROADCAST_PREFIX)).map((i) => i.slice(BROADCAST_PREFIX.length));
  await prisma.playerNotification.updateMany({ where: { userId, readAt: null, ...(own ? { id: { in: own } } : {}) }, data: { readAt: new Date() } });
  if (!ids || (casts && casts.length > 0)) {
    // Broadcasts are read up to the newest one named (or all of them).
    const newest = casts?.length
      ? await prisma.broadcast.findFirst({ where: { id: { in: casts } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
      : null;
    const until = newest?.createdAt ?? new Date();
    await prisma.user.updateMany({ where: { id: userId, OR: [{ broadcastsSeenAt: null }, { broadcastsSeenAt: { lt: until } }] }, data: { broadcastsSeenAt: until } });
  }
}
