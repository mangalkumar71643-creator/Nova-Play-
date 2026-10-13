import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { requireAuth, requireChatAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { signChatToken } from "../utils/jwt";

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
    res.status(201).json(created);
  })
);

export default router;
