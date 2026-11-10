import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";

/**
 * Texts are sent from the admin's own phone, with its SIM card (the admin-app Android app), not by an SMS
 * company. The server puts a text in SmsOutbox (enqueueSms); the app, while it is running and has turned
 * "send SMS from this phone" on, asks for waiting texts every few seconds (claimSmsForGateway), sends each
 * and reports back (reportSmsResult). Asking is also how the server knows the phone is there
 * (smsGatewayStatus): with no phone in the last two minutes a text is not queued, and the caller falls back
 * to the admin giving the code by hand.
 */
const GATEWAY_SEEN_KEY = "smsGatewaySeenAt";
const ONLINE_WITHIN_MS = 2 * 60 * 1000;
/** A text is useful only while the code in it works. */
const QUEUE_LIFETIME_MS = 15 * 60 * 1000;
/** A text lent to the phone that is never confirmed is lent again after this. */
const LEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;
const BATCH = 5;

async function markSeen() {
  const value = String(Date.now());
  await prisma.setting.upsert({ where: { key: GATEWAY_SEEN_KEY }, update: { value }, create: { key: GATEWAY_SEEN_KEY, value } });
}

export async function smsGatewayStatus() {
  const row = await prisma.setting.findUnique({ where: { key: GATEWAY_SEEN_KEY } });
  const seenAt = row ? Number(row.value) : null;
  const online = seenAt != null && Date.now() - seenAt < ONLINE_WITHIN_MS;
  const waiting = await prisma.smsOutbox.count({ where: { sentAt: null, error: null, createdAt: { gte: new Date(Date.now() - QUEUE_LIFETIME_MS) } } });
  return { online, lastSeenAt: seenAt ? new Date(seenAt).toISOString() : null, waiting };
}

/** Puts a text in the queue. False (nothing queued) when no phone is connected, so the caller can say so. */
export async function enqueueSms(phone: string, body: string): Promise<boolean> {
  if (!(await smsGatewayStatus()).online) return false;
  await prisma.smsOutbox.create({ data: { phone, body } });
  return true;
}

/** The phone's poll: lends it the waiting texts (oldest first), and records that it is there. */
export async function claimSmsForGateway() {
  await markSeen();
  const now = new Date();
  const rows = await prisma.smsOutbox.findMany({
    where: {
      sentAt: null,
      error: null,
      createdAt: { gte: new Date(now.getTime() - QUEUE_LIFETIME_MS) },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - LEND_MS) } }],
    },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  const out: { id: string; phone: string; body: string }[] = [];
  for (const r of rows) {
    // Only one poll can lend a given text.
    const got = await prisma.smsOutbox.updateMany({ where: { id: r.id, sentAt: null, claimedAt: r.claimedAt }, data: { claimedAt: now, attempts: { increment: 1 } } });
    if (got.count === 1) out.push({ id: r.id, phone: r.phone, body: r.body });
  }
  return out;
}

/** The phone says it sent the text (the code in it is blanked) or could not. */
export async function reportSmsResult(id: string, ok: boolean, error?: string) {
  const row = await prisma.smsOutbox.findUnique({ where: { id } });
  if (!row) throw new ApiError(404, "No such text.");
  if (ok) await prisma.smsOutbox.update({ where: { id }, data: { sentAt: new Date(), body: "", error: null } });
  else await prisma.smsOutbox.update({ where: { id }, data: { error: error ?? "The phone could not send it.", body: "" } });
}

/** Old rows are not kept (they hold phone numbers). */
export async function purgeOldSms() {
  await prisma.smsOutbox.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
}
