import { createHash, randomInt } from "crypto";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { getSmsProvider } from "./smsService";
import { env } from "../config/env";

const OTP_TTL_MS = 5 * 60 * 1000;
const VERIFIED_GRACE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
// Real SMS costs money: cap how many codes one number, and one IP address,
// can ask for in 24 hours, so a bot can't burn the SMS wallet ("SMS pumping").
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_PHONE_PER_DAY = 5;
const MAX_PER_IP_PER_DAY = 10;

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000));
}

/** Requests a fresh OTP for `phone`. Returns the raw code only in mock
 * mode (SMS_PROVIDER_MODE=mock) so the mobile app can display it for
 * local testing — in live mode it's sent via SMS and never returned. */
export async function requestOtp(phone: string, ip: string | null = null): Promise<{ devCode: string | null }> {
  const recent = await prisma.phoneOtp.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "Please wait before requesting another code.");
  }
  if (env.smsProviderMode === "live") {
    const since = new Date(Date.now() - DAY_MS);
    const [byPhone, byIp] = await Promise.all([
      prisma.phoneOtp.count({ where: { phone, createdAt: { gte: since } } }),
      ip ? prisma.phoneOtp.count({ where: { ip, createdAt: { gte: since } } }) : Promise.resolve(0),
    ]);
    if (byPhone >= MAX_PER_PHONE_PER_DAY || byIp >= MAX_PER_IP_PER_DAY) {
      throw new ApiError(429, "Too many codes requested today. Please try again tomorrow or contact support.");
    }
  }

  const code = generateCode();
  await prisma.phoneOtp.create({
    data: {
      phone,
      ip,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  await getSmsProvider().sendOtp(phone, code);
  return { devCode: env.smsProviderMode === "mock" ? code : null };
}

/** Verifies `code` against the latest unconsumed OTP for `phone`. On
 * success, marks it verified (but doesn't delete it yet — see
 * `isRecentlyVerified`, used by the complete-profile step for a
 * brand-new phone number) and returns. Throws on mismatch/expiry/too
 * many attempts. */
export async function verifyOtp(phone: string, code: string): Promise<void> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new ApiError(400, "No code was requested for this number.");
  if (otp.expiresAt < new Date()) throw new ApiError(400, "Code expired. Please request a new one.");
  if (otp.attempts >= MAX_ATTEMPTS) throw new ApiError(429, "Too many attempts. Please request a new code.");

  if (otp.codeHash !== hashCode(code)) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new ApiError(400, "Incorrect code. Please try again.");
  }

  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { verifiedAt: new Date() } });
}

/** Used by the complete-profile step: was this phone number verified
 * recently enough to trust it without asking for the code again? */
export async function isRecentlyVerified(phone: string): Promise<boolean> {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, verifiedAt: { not: null } },
    orderBy: { verifiedAt: "desc" },
  });
  if (!otp || !otp.verifiedAt) return false;
  return Date.now() - otp.verifiedAt.getTime() < VERIFIED_GRACE_MS;
}

/** Call after a login/registration completes so the same code/verified
 * session can't be reused. */
export async function consumeOtp(phone: string): Promise<void> {
  await prisma.phoneOtp.deleteMany({ where: { phone } });
}
