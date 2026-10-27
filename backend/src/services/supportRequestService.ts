import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { depositNumberOf } from "./depositService";
import * as rupayex from "./rupayexService";

/**
 * The app's Customer Service page: self-service checks a player can run on
 * their own (re-check a deposit by its number) and requests that go to the
 * admin as a support ticket with the order, amount, UTR and a screenshot
 * attached. The admin answers in the ticket's chat; the player follows it
 * under "Progress query".
 */

export const REQUEST_CATEGORIES = {
  DEPOSIT_NOT_RECEIVED: "Deposit not received",
  WITHDRAWAL_PROBLEM: "Withdrawal problem",
} as const;
export type RequestCategory = keyof typeof REQUEST_CATEGORIES;

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** A withdrawal's own number, shown to the player: the payout id it is (or would be) sent to RupayEx under. */
export const withdrawalNumberOf = (id: string) => rupayex.payoutIdFor(id);

const normalize = (ref: string) => ref.trim().toUpperCase().replace(/\s+/g, "");

async function findDeposit(userId: string, ref: string) {
  const want = normalize(ref);
  const rows = await prisma.transaction.findMany({ where: { userId, type: "DEPOSIT" }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.find((t) => normalize(depositNumberOf(t)) === want) ?? null;
}

async function findWithdrawal(userId: string, ref: string) {
  const want = normalize(ref);
  const rows = await prisma.transaction.findMany({ where: { userId, type: "WITHDRAWAL" }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.find((t) => normalize(withdrawalNumberOf(t.id)) === want) ?? null;
}

const VERIFY_EVERY_MS = 10_000;
const lastVerify = new Map<string, number>();

/** Whether an order number is one of the player's deposits or withdrawals (null: neither). */
export async function findOrderKind(userId: string, ref: string): Promise<"deposit" | "withdraw" | null> {
  if (await findDeposit(userId, ref)) return "deposit";
  if (await findWithdrawal(userId, ref)) return "withdraw";
  return null;
}

/**
 * Self Deposit Verify: asks RupayEx again about one of the player's own
 * deposits, by its number, and credits it if it was paid (the same
 * settlement as the Deposit screen's check, so it can't credit twice).
 */
export async function verifyDeposit(userId: string, ref: string) {
  const tx = await findDeposit(userId, ref);
  if (!tx) throw new ApiError(404, "No deposit with this number on your account. Copy it from Deposit history.");
  const amount = Number(tx.amount);
  if (tx.reversedAt) return { status: "REVERSED", amount, message: "This deposit was cancelled. Contact customer service if you were charged." };
  if (tx.status === "COMPLETED") return { status: "COMPLETED", amount, message: `This deposit was already added to your wallet (₹${amount.toLocaleString("en-IN")}).` };
  if (tx.provider === rupayex.PROVIDER && tx.providerReferenceId) {
    // Each player can ask the payment company at most this often.
    const last = lastVerify.get(userId) ?? 0;
    if (Date.now() - last < VERIFY_EVERY_MS) throw new ApiError(429, "Please wait a few seconds before checking again.");
    lastVerify.set(userId, Date.now());
    let results: { status: string }[] = [];
    try {
      ({ results } = await rupayex.confirmUpiDeposits(userId, tx.providerReferenceId));
    } catch (err) {
      // e.g. RupayEx reports a different amount: never credited by a bot.
      if (err instanceof ApiError && err.status === 400)
        return { status: "REVIEW", amount, message: "This payment needs a check by our team (the paid amount does not match this deposit). They will contact you here." };
    }
    const now = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id }, select: { status: true } });
    if (now.status === "COMPLETED") return { status: "COMPLETED", amount, message: `Payment found — ₹${amount.toLocaleString("en-IN")} has been added to your wallet.` };
    if (now.status === "FAILED" || results[0]?.status === "FAILED")
      return { status: "FAILED", amount, message: "The payment company has no successful payment for this order. If money left your bank, use Deposit Not Receive with your UTR and a screenshot." };
  }
  return { status: "PENDING", amount, message: "The payment is not confirmed yet. Wait a few minutes and check again, or use Deposit Not Receive with your UTR and a screenshot." };
}

/**
 * The chat bot's answer about one of the player's own withdrawals. Only
 * ever reports: a withdrawal RupayEx paid is never given back (that would
 * pay it twice), and a refused one was already refunded by syncPayout.
 */
export async function checkWithdrawal(userId: string, ref: string) {
  let tx = await findWithdrawal(userId, ref);
  if (!tx) throw new ApiError(404, "No withdrawal with this number on your account.");
  if (tx.status === "PENDING" && tx.provider === rupayex.PROVIDER) {
    const last = lastVerify.get(userId) ?? 0;
    if (Date.now() - last < VERIFY_EVERY_MS) throw new ApiError(429, "Please wait a few seconds before checking again.");
    lastVerify.set(userId, Date.now());
    await rupayex.syncPayout(tx.id).catch(() => {});
    tx = await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } });
  }
  const amount = Number(tx.amount);
  const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  const sent = Math.round((amount - Number(tx.fee ?? 0) - Number(tx.providerFee ?? 0)) * 100) / 100;
  if (tx.status === "COMPLETED")
    return {
      status: "COMPLETED",
      amount,
      message: `This withdrawal is PAID ✅ — ${inr(sent)} was sent to your bank account (withdrawal of ${tx.createdAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}). Banks can take up to 24 hours to show it. If it is still not in your bank after 24 hours, send a screenshot of your bank statement through Withdrawal Problem.`,
    };
  if (tx.status === "FAILED")
    return { status: "FAILED", amount, message: `This withdrawal did not go through, and ${inr(amount)} was returned to your game wallet. Check your bank details (IFSC and name) and withdraw again.` };
  if (tx.provider === rupayex.PROVIDER)
    return { status: "PENDING", amount, message: `Your withdrawal of ${inr(amount)} is being transferred to your bank right now. It usually arrives within minutes; please check again a little later.` };
  return { status: "PENDING", amount, message: `Your withdrawal of ${inr(amount)} is waiting for a quick check by our team and is usually paid within 2 hours.` };
}

/** The player's recent deposits and withdrawals, to pick the one a request is about. */
export async function recentOrders(userId: string) {
  const rows = await prisma.transaction.findMany({
    where: { userId, type: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, type: true, amount: true, status: true, createdAt: true, provider: true, providerReferenceId: true, reversedAt: true },
  });
  return rows.map((t) => ({
    kind: t.type === "DEPOSIT" ? ("deposit" as const) : ("withdraw" as const),
    orderNo: t.type === "DEPOSIT" ? depositNumberOf(t) : withdrawalNumberOf(t.id),
    amount: Number(t.amount),
    status: t.reversedAt ? "CANCELLED" : t.status,
    createdAt: t.createdAt,
  }));
}

export type NewRequest = { category: RequestCategory; orderRef: string; utr?: string; message?: string; image?: { base64: string; type: string } };

export async function createRequest(userId: string, req: NewRequest) {
  const order = req.category === "DEPOSIT_NOT_RECEIVED" ? await findDeposit(userId, req.orderRef) : await findWithdrawal(userId, req.orderRef);
  if (!order) throw new ApiError(404, "No order with this number on your account. Pick it from the list.");
  const open = await prisma.supportTicket.findFirst({ where: { userId, category: req.category, orderRef: normalize(req.orderRef), status: "OPEN" }, select: { id: true } });
  if (open) throw new ApiError(400, "You already have an open request for this order. Follow it under Progress query.");

  let attachment: Buffer | undefined;
  if (req.image) {
    if (!IMAGE_TYPES.includes(req.image.type)) throw new ApiError(400, "The screenshot must be a JPG, PNG or WebP image.");
    attachment = Buffer.from(req.image.base64, "base64");
    if (attachment.length === 0 || attachment.length > MAX_IMAGE_BYTES) throw new ApiError(400, "The screenshot is too large (2 MB at most).");
  }

  const title = REQUEST_CATEGORIES[req.category];
  const amount = Number(order.amount);
  const lines = [
    `${title} — order ${normalize(req.orderRef)}, ₹${amount.toLocaleString("en-IN")} (${order.status.toLowerCase()})`,
    req.utr ? `UTR: ${req.utr}` : null,
    req.message ? req.message : null,
    attachment ? "Screenshot attached." : null,
  ].filter(Boolean);
  const text = lines.join("\n");
  const ticket = await prisma.supportTicket.create({
    data: {
      userId,
      topic: title,
      message: text,
      category: req.category,
      orderRef: normalize(req.orderRef),
      amount,
      utr: req.utr || null,
      attachment: attachment ?? null,
      attachmentType: attachment ? req.image!.type : null,
      messages: { create: { sender: "USER", text } },
    },
    select: { id: true },
  });
  return { ticketId: ticket.id, text };
}

/** "Progress query": the player's requests and chats, newest first, with the latest reply. */
export async function myRequests(userId: string) {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      topic: true,
      category: true,
      orderRef: true,
      amount: true,
      utr: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      messages: { orderBy: { createdAt: "asc" }, select: { sender: true, text: true, createdAt: true } },
    },
  });
  return tickets.map((t) => ({ ...t, amount: t.amount == null ? null : Number(t.amount) }));
}
