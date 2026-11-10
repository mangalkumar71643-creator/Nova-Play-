import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth, requireChatAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { signChatToken } from "../utils/jwt";
import { alertAdmins, shouldAlertChat } from "../services/adminAlertService";
import { getAppVersionInfo, getSupportTelegramUrl } from "../services/settingsService";
import { checkWithdrawal, createRequest, findOrderKind, myRequests, recentOrders, REQUEST_CATEGORIES, verifyDeposit } from "../services/supportRequestService";

const router = Router();

const escalateSchema = z.object({
  topic: z.string().trim().min(1).max(200),
  message: z.string().trim().max(2000).optional(),
});

router.post(
  "/escalate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { topic, message } = escalateSchema.parse(req.body);
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: req.user!.userId,
        topic,
        message: message || null,
        messages: message ? { create: { sender: "USER", text: message } } : undefined,
      },
    });
    await alertSupport(req.user!.userId, ticket.id, `${topic}${message ? `: ${message}` : ""}`);
    res.status(201).json(ticket);
  })
);

// --- Live Support chat (see public/chat.html) ---

router.post(
  "/chat/session",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ chatToken: signChatToken(req.user!.userId) });
  })
);

/** A player wrote to support: alert the admin's phone (once per conversation every few minutes). */
async function alertSupport(userId: string, ticketId: string, text: string) {
  if (!shouldAlertChat(ticketId)) return;
  const who = await prisma.user.findUnique({ where: { id: userId }, select: { uid: true, firstName: true, phone: true } });
  await alertAdmins({
    title: `💬 Support message — UID ${who?.uid ?? "—"}`,
    body: `${who?.firstName ?? ""} · ${who?.phone ?? ""}: ${text.slice(0, 120)}`,
    tag: `support-${ticketId}`,
    page: "support",
  });
}

/**
 * The ticket the chat writes to: the player's latest one — the very ticket
 * GET /chat shows — reopened when staff had resolved it (a reply from the
 * player makes the conversation active again), or a new one when they have
 * none. Done under a per-player lock, so two messages sent at once (a double
 * Enter) land in one ticket instead of making two.
 */
async function chatTicketFor(userId: string, opts: { reopen?: boolean } = { reopen: true }) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"chat:" + userId}))`;
    const latest = await tx.supportTicket.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    if (!latest) return tx.supportTicket.create({ data: { userId, topic: "Live chat" } });
    if (latest.status === "RESOLVED" && opts.reopen !== false) {
      return tx.supportTicket.update({ where: { id: latest.id }, data: { status: "OPEN", resolvedAt: null } });
    }
    return latest;
  });
}

router.get(
  "/chat",
  requireChatAuth,
  asyncHandler(async (req, res) => {
    const ticket = await prisma.supportTicket.findFirst({
      where: { userId: req.chatUserId! },
      orderBy: { createdAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    res.json({ ticketId: ticket?.id ?? null, status: ticket?.status ?? null, messages: ticket?.messages ?? [] });
  })
);

const chatMessageSchema = z.object({ text: z.string().trim().min(1).max(2000) });

router.post(
  "/chat/message",
  requireChatAuth,
  asyncHandler(async (req, res) => {
    const { text } = chatMessageSchema.parse(req.body);
    const ticket = await chatTicketFor(req.chatUserId!);
    const created = await prisma.chatMessage.create({
      data: { ticketId: ticket.id, sender: "USER", text },
    });
    await alertSupport(req.chatUserId!, ticket.id, text);
    res.status(201).json(created);
  })
);

/**
 * The chat bot: the player types one of their order numbers and gets the
 * answer at once. It only checks and reports — nothing is credited or
 * refunded here: a deposit RupayEx confirms as paid is flagged to the admin
 * (verifyDeposit), a withdrawal's status is reported.
 * Both lines go into the conversation so the team sees what the bot said;
 * the team is alerted only when a person still has to look.
 */
const checkOrderSchema = z.object({ orderRef: z.string().trim().min(4).max(60), text: z.string().trim().max(2000).optional() });
router.post(
  "/chat/check-order",
  requireChatAuth,
  asyncHandler(async (req, res) => {
    const { orderRef, text } = checkOrderSchema.parse(req.body);
    const userId = req.chatUserId!;
    const kind = await findOrderKind(userId, orderRef);
    // More than a bare order number was typed ("my withdrawal NPW… is not
    // received for 3 days"): that is a question for a person, whatever the bot finds.
    const extraText = (text ?? "").replace(new RegExp(orderRef.replace(/[^A-Za-z0-9-]/g, ""), "i"), "").trim().length >= 15;
    let status: string;
    let message: string;
    if (!kind) {
      status = "NOT_FOUND";
      message = "I can't find this order number on your account. Copy it from Deposit history or Withdraw history in the app (it starts with NP), or type your question and our team will help.";
    } else {
      try {
        ({ status, message } = kind === "deposit" ? await verifyDeposit(userId, orderRef) : await checkWithdrawal(userId, orderRef));
      } catch (err) {
        // Checked again too soon: the typed text must still reach the team, so it is saved below like any other message.
        if (err instanceof ApiError && err.status === 429) {
          status = "WAIT";
          message = err.message;
        } else throw err;
      }
    }
    const needsPerson = !kind || extraText || (kind === "deposit" && status !== "COMPLETED");
    const ticket = await chatTicketFor(userId, { reopen: needsPerson });
    await prisma.chatMessage.create({ data: { ticketId: ticket.id, sender: "USER", text: text || `Check order ${orderRef.trim().toUpperCase()}` } });
    await prisma.chatMessage.create({ data: { ticketId: ticket.id, sender: "ADMIN", text: `🤖 Auto check: ${message}` } });
    // A confirmed payment was already alerted on its own (verifyDeposit).
    if (needsPerson && status !== "VERIFIED") await alertSupport(userId, ticket.id, `Order ${orderRef} — bot: ${status}`);
    res.json({ kind, status, message });
  })
);

// --- Customer Service page (supportRequestService.ts) ---

/** Links the page and the live chat's quick answers show. */
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    const { downloadUrl } = await getAppVersionInfo();
    res.json({ telegramUrl: await getSupportTelegramUrl(), appDownloadUrl: downloadUrl, websiteUrl: `https://${req.get("host")}` });
  })
);

router.get(
  "/orders",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await recentOrders(req.user!.userId));
  })
);

const verifySchema = z.object({ orderRef: z.string().trim().min(4).max(60) });
router.post(
  "/deposit-verify",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { orderRef } = verifySchema.parse(req.body);
    res.json(await verifyDeposit(req.user!.userId, orderRef));
  })
);

const requestSchema = z.object({
  category: z.enum(Object.keys(REQUEST_CATEGORIES) as [keyof typeof REQUEST_CATEGORIES]),
  orderRef: z.string().trim().min(4).max(60),
  utr: z.string().trim().max(40).optional(),
  message: z.string().trim().max(1000).optional(),
  image: z.object({ base64: z.string().min(1).max(3_000_000), type: z.string().max(40) }).optional(),
});
router.post(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = requestSchema.parse(req.body);
    const { ticketId, text } = await createRequest(req.user!.userId, body);
    await alertSupport(req.user!.userId, ticketId, text);
    res.status(201).json({ ticketId });
  })
);

router.get(
  "/requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await myRequests(req.user!.userId));
  })
);

export default router;
