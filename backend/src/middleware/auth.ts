import { NextFunction, Request, Response } from "express";
import { verifyChatToken, verifyToken } from "../utils/jwt";
import { prisma } from "../db/prismaClient";
import { isRealIndianMobile } from "../utils/phone";

/**
 * Player sessions from before this moment are signed out once. Until then
 * the login code could be shown in the app (SMS_PROVIDER_MODE=mock), so
 * anyone could have signed in to any number; every login since was by a
 * code sent by SMS. Admin sessions are not affected.
 */
const PLAYER_SESSIONS_VALID_AFTER_MS = Date.parse("2026-10-21T21:25:00Z");

const SEEN_EVERY_MS = 5 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: "USER" | "ADMIN" };
      chatUserId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyToken(header.slice("Bearer ".length));
    // Checked on every request (not just at login) so an admin ban takes
    // effect immediately for an already-logged-in, still-valid token.
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isBanned: true, banReason: true, role: true, phone: true, lastSeenAt: true },
    });
    if (!user) return res.status(401).json({ error: "Please log in again." });
    if (user.role !== "ADMIN") {
      if ((payload.iat ?? 0) * 1000 < PLAYER_SESSIONS_VALID_AFTER_MS) {
        return res.status(401).json({ error: "Please log in again with your mobile number." });
      }
      // An account made with a number nobody owns (9999999999 and the like) can't be used.
      if (!isRealIndianMobile(user.phone)) {
        return res.status(403).json({ error: "This account isn't linked to a real mobile number. Please log in with your own number." });
      }
    }
    if (user?.isBanned) {
      return res.status(403).json({
        error: user.banReason
          ? `Your account has been suspended: ${user.banReason}`
          : "Your account has been suspended.",
      });
    }
    req.user = { userId: payload.userId, role: payload.role };
    // When the player was last in the app, for the admin's Problems page —
    // written at most every SEEN_EVERY_MS, and never holding up the request.
    if (user.role !== "ADMIN" && (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > SEEN_EVERY_MS)) {
      prisma.user.update({ where: { id: payload.userId }, data: { lastSeenAt: new Date() } }).catch(() => {});
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

/** Auth for the Live Support chat page (see support.routes.ts) — accepts
 * only the short-lived, chat-scoped token minted by POST
 * /support/chat/session, never a full session token. */
export function requireChatAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  try {
    const payload = verifyChatToken(header.slice("Bearer ".length));
    req.chatUserId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "This chat link has expired. Please reopen Live Support from the app." });
  }
}
