import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  userId: string;
  role: "USER" | "ADMIN";
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.jwtSecret) as JwtPayload;
}

// A separate, short-lived, scope-limited token for the browser-based Live
// Support chat page (see support.routes.ts) — deliberately not the same
// long-lived session token, since this one travels in a URL the app opens
// in the device browser (Linking.openURL) and shouldn't be a full-access
// credential if it leaks via browser history.
export interface ChatTokenPayload {
  userId: string;
  scope: "chat";
}

export function signChatToken(userId: string): string {
  return jwt.sign({ userId, scope: "chat" }, env.jwtSecret, { expiresIn: "2h" });
}

export function verifyChatToken(token: string): ChatTokenPayload {
  const payload = jwt.verify(token, env.jwtSecret) as ChatTokenPayload;
  if (payload.scope !== "chat") {
    throw new Error("Invalid token scope");
  }
  return payload;
}
