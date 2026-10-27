import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth, requireChatAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { signChatToken } from "../utils/jwt";
import { alertAdmins, shouldAlertChat } from "../services/adminAlertService";
import { getAppVersionInfo, getSupportTelegramUrl } from "../services/settingsService";
import { createRequest, myRequests, recentOrders, REQUEST_CATEGORIES, verifyDeposit } from "../services/supportRequestService";

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

async function findOrCreateOpenTicket(userId: string) {
  const existing = await prisma.supportTicket.findFirst({
    where: { userId, status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.supportTicket.create({ data: { userId, topic: "Live chat" } });
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
    const ticket = await findOrCreateOpenTicket(req.chatUserId!);
    // A reply from the customer means the conversation is active again,
    // even if staff had marked it resolved.
    if (ticket.status === "RESOLVED") {
      await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN", resolvedAt: null } });
    }
    const created = await prisma.chatMessage.create({
      data: { ticketId: ticket.id, sender: "USER", text },
    });
    await alertSupport(req.chatUserId!, ticket.id, text);
    res.status(201).json(created);
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
