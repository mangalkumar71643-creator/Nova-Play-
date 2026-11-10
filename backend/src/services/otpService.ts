import { createHash, randomInt } from "crypto";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";

/**
 * One-time codes for resetting a forgotten password (PhoneOtp rows). The code is made by the server
 * (authService.askAdminForResetCode, or by the admin), reaches the player through the admin's phone
 * (smsGatewayService) or from the admin by hand, and is checked here: 15 minutes, once, 5 tries.
 * Only a hash of the code is stored.
 */
const MAX_ATTEMPTS = 5;
const CODE_TTL_MS = 15 * 60 * 1000;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Makes a fresh code for `phone`; the newest unverified code is the one that counts. */
export async function issueAdminCode(phone: string, ttlMs = CODE_TTL_MS): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.phoneOtp.create({ data: { phone, ip: null, codeHash: hashCode(code), expiresAt } });
  return { code, expiresAt };
}

/** Checks `code` against the newest unused code for `phone`; throws on a wrong, expired or used-up one. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const otp = await prisma.phoneOtp.findFirst({ where: { phone, verifiedAt: null }, orderBy: { createdAt: "desc" } });
  if (!otp) throw new ApiError(400, "No code was requested for this number.");
  if (otp.expiresAt < new Date()) throw new ApiError(400, "Code expired. Please ask for a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "Too many attempts. Please ask for a new code.");

  if (otp.codeHash !== hashCode(code)) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, "Incorrect code. Please try again.");
  }

  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}

/** Call once the code has been used, so it can't be used again. */
export async function consumeOtp(phone: string): Promise<void> {
  await prisma.phoneOtp.deleteMany({ where: { phone } });
}
