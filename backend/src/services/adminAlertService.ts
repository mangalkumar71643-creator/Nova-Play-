import webpush from "web-push";
import { prisma } from "../db/prismaClient";
import * as rupayex from "./rupayexService";

/**
 * Alerts on the admin's phone (Web Push), like a calendar reminder: a new
 * withdrawal request, a player writing to support, and a UPI deposit still
 * open STUCK_ALERT_MINUTES after its payment page was opened. Ordinary
 * deposits send nothing. Turned on per phone/browser from the panel's
 * Settings page; tapping an alert opens the panel's Problems page.
 *
 * The VAPID key pair is made on first use and kept in Setting "vapidKeys",
 * so there is nothing to set up in Vercel.
 */
const VAPID_KEY = "vapidKeys";
const STUCK_ALERT_MINUTES = 35;
const SEND_TIMEOUT_MS = 4000;

let keys: { publicKey: string; privateKey: string } | null = null;

async function vapidKeys() {
  if (keys) return keys;
  let row = await prisma.setting.findUnique({ where: { key: VAPID_KEY } });
  if (!row) {
    const made = webpush.generateVAPIDKeys();
    // Two servers at once: the first one's keys win, the other reads them back.
    await prisma.setting.upsert({ where: { key: VAPID_KEY }, update: {}, create: { key: VAPID_KEY, value: JSON.stringify(made) } });
    row = await prisma.setting.findUniqueOrThrow({ where: { key: VAPID_KEY } });
  }
  keys = JSON.parse(row.value) as { publicKey: string; privateKey: string };
  return keys;
}

export async function getVapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

export async function saveSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent: string | null) {
  await prisma.adminPushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent },
  });
  return { devices: await prisma.adminPushSubscription.count() };
}

export async function removeSubscription(endpoint: string) {
  await prisma.adminPushSubscription.deleteMany({ where: { endpoint } });
  return { devices: await prisma.adminPushSubscription.count() };
}

export async function countSubscriptions() {
  return prisma.adminPushSubscription.count();
}

type Alert = { title: string; body: string; tag: string; page?: string };

/** Sends an alert to every phone/browser that turned alerts on; ones the push service no longer knows are dropped. */
export async function notifyAdmins(alert: Alert) {
  const subs = await prisma.adminPushSubscription.findMany();
  if (!subs.length) return { sent: 0 };
  const k = await vapidKeys();
  const payload = JSON.stringify({ title: alert.title, body: alert.body, tag: alert.tag, url: `/admin.html#${alert.page ?? "problems"}` });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject: "mailto:alerts@novaplay.app", publicKey: k.publicKey, privateKey: k.privateKey },
          TTL: 24 * 3600,
          urgency: "high",
          timeout: SEND_TIMEOUT_MS,
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.adminPushSubscription.deleteMany({ where: { id: s.id } });
        else console.error("[alerts] push failed:", status ?? (err as Error).message);
      }
    })
  );
  return { sent };
}

/** notifyAdmins for a request handler: never throws, never holds the request up for long. */
export async function alertAdmins(alert: Alert) {
  try {
    await Promise.race([notifyAdmins(alert), new Promise((r) => setTimeout(r, SEND_TIMEOUT_MS + 500))]);
  } catch (err) {
    console.error("[alerts] failed:", (err as Error).message);
  }
}

// Chat messages: one alert per conversation in a while, not one per message.
const lastChatAlert = new Map<string, number>();
const CHAT_ALERT_EVERY_MS = 10 * 60 * 1000;
export function shouldAlertChat(ticketId: string) {
  const last = lastChatAlert.get(ticketId) ?? 0;
  if (Date.now() - last < CHAT_ALERT_EVERY_MS) return false;
  lastChatAlert.set(ticketId, Date.now());
  return true;
}

let lastStuckCheck = 0;
/**
 * Alerts once about each UPI deposit still open STUCK_ALERT_MINUTES after it
 * was made (each row is claimed by adminAlertedAt, so two servers never both
 * alert). Cheap and throttled to every 2 minutes: called on any request.
 */
export async function checkStuckDeposits() {
  if (Date.now() - lastStuckCheck < 120_000) return;
  lastStuckCheck = Date.now();
  if (!(await countSubscriptions())) return;
  const before = new Date(Date.now() - STUCK_ALERT_MINUTES * 60 * 1000);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const rows = await prisma.transaction.findMany({
    where: { type: "DEPOSIT", status: "PENDING", provider: rupayex.PROVIDER, reversedAt: null, adminAlertedAt: null, createdAt: { lt: before, gt: since } },
    select: { id: true, amount: true, user: { select: { uid: true, firstName: true, phone: true } } },
    take: 20,
  });
  const fresh = [];
  for (const r of rows) {
    const claimed = await prisma.transaction.updateMany({ where: { id: r.id, adminAlertedAt: null }, data: { adminAlertedAt: new Date() } });
    if (claimed.count) fresh.push(r);
  }
  if (!fresh.length) return;
  const first = fresh[0];
  await notifyAdmins({
    title: fresh.length === 1 ? `⚠️ Deposit stuck: ₹${Number(first.amount)}` : `⚠️ ${fresh.length} deposits stuck`,
    body:
      fresh.length === 1
        ? `UID ${first.user.uid ?? "—"} ${first.user.firstName ?? ""} · ${first.user.phone ?? ""} — not paid for ${STUCK_ALERT_MINUTES} min. Tap to check & fix.`
        : `${fresh.map((r) => `₹${Number(r.amount)} (UID ${r.user.uid ?? "—"})`).join(", ")} — tap to check & fix.`,
    tag: "stuck-deposit",
  });
}
