import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { isAtLeast18 } from "../utils/age";
import { consumeOtp, isRecentlyVerified, requestOtp as requestOtpCode, verifyOtp as verifyOtpCode } from "./otpService";

function randomFiveDigitUid(): number {
  return Math.floor(10000 + Math.random() * 90000);
}

/** Retries `createFn` with a fresh random 5-digit uid whenever it collides
 * with an existing one (Postgres unique violation on the `uid` column) —
 * the only reliable way to guarantee no two accounts ever share a uid
 * without a sequence, since `db push` (this repo's schema workflow, see
 * vercel.json) doesn't manage one. */
async function createUserWithUniqueUid<T>(createFn: (uid: number) => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 25;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await createFn(randomFiveDigitUid());
    } catch (err) {
      const isUidConflict =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("uid");
      if (!isUidConflict || attempt === MAX_ATTEMPTS) throw err;
    }
  }
  // Unreachable — the loop above always returns or throws.
  throw new ApiError(500, "Could not allocate a unique account number. Please try again.");
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}

export async function registerUser(input: RegisterInput) {
  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new ApiError(400, "Invalid date of birth");
  }
  if (!isAtLeast18(dob)) {
    throw new ApiError(403, "You must be at least 18 years old to register.");
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await createUserWithUniqueUid((uid) =>
    prisma.user.create({
      data: {
        uid,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: dob,
        country: input.country,
        wallet: { create: { balance: 0 } },
      },
    })
  );

  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token };
}

function assertNotBanned(user: { isBanned: boolean; banReason: string | null }) {
  if (user.isBanned) {
    throw new ApiError(403, user.banReason ? `Your account has been suspended: ${user.banReason}` : "Your account has been suspended.");
  }
}

export async function loginUser(email: string, password: string) {
  // Case-insensitive, so a phone keyboard's capital first letter still logs in.
  const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } } });
  if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  assertNotBanned(user);
  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token };
}

export async function changeAdminCredentials(userId: string, input: { currentPassword: string; email?: string; newPassword?: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "ADMIN") throw new ApiError(403, "Admins only");
  if (!user.passwordHash || !(await comparePassword(input.currentPassword, user.passwordHash))) {
    throw new ApiError(400, "Current password is wrong.");
  }
  if (input.email && input.email !== user.email?.toLowerCase()) {
    const taken = await prisma.user.findFirst({ where: { id: { not: userId }, email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw new ApiError(409, "Another account already uses that email.");
  }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.email ? { email: input.email } : {}),
      ...(input.newPassword ? { passwordHash: await hashPassword(input.newPassword) } : {}),
    },
  });
  return sanitizeUser(updated);
}

/**
 * Forgotten admin password: the owner puts a long secret in the server's
 * ADMIN_RESET_KEY environment variable (Vercel → Settings → Environment
 * Variables) and enters it on the admin login page with a new password. It
 * resets the first admin account and returns its login email. Each key works
 * once (its hash is remembered in the Setting table), wrong keys are
 * throttled, and with no key set the reset is switched off.
 */
const RESET_USED_KEY = "adminResetUsedKeyHash";
const resetFailures: number[] = [];

export async function resetAdminWithKey(input: { key: string; newPassword: string; email?: string }) {
  const expected = process.env.ADMIN_RESET_KEY ?? "";
  if (expected.length < 24) throw new ApiError(404, "Password reset is not switched on.");

  const now = Date.now();
  while (resetFailures.length && now - resetFailures[0] > 15 * 60 * 1000) resetFailures.shift();
  if (resetFailures.length >= 5) throw new ApiError(429, "Too many wrong keys. Try again in 15 minutes.");

  const digest = (v: string) => createHash("sha256").update(v).digest();
  if (!timingSafeEqual(digest(input.key), digest(expected))) {
    resetFailures.push(now);
    throw new ApiError(401, "Wrong reset key.");
  }
  const keyHash = digest(expected).toString("hex");
  const used = await prisma.setting.findUnique({ where: { key: RESET_USED_KEY } });
  if (used?.value === keyHash) throw new ApiError(410, "This reset key was already used. Set a new ADMIN_RESET_KEY to reset again.");

  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new ApiError(404, "No admin account found.");
  if (input.email && input.email !== admin.email?.toLowerCase()) {
    const taken = await prisma.user.findFirst({ where: { id: { not: admin.id }, email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw new ApiError(409, "Another account already uses that email.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key: RESET_USED_KEY }, create: { key: RESET_USED_KEY, value: keyHash }, update: { value: keyHash } });
    return tx.user.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(input.newPassword), ...(input.email ? { email: input.email } : {}) },
    });
  });
  return { email: updated.email };
}

export function sanitizeUser<T extends { passwordHash: string | null }>(user: T) {
  const { passwordHash, ...rest } = user;
  return rest;
}

/** India-only for now — mirrors the mobile app's 10-digit local input. */
function toE164(phone: string): string {
  return phone.startsWith("+") ? phone : `+91${phone}`;
}

/** Step 1: generates and sends (or, in mock mode, returns) an OTP for a
 * phone number. Same endpoint for both login and registration — which
 * one it turns into is decided in `verifyOtpAndAuth` once the code is
 * confirmed. */
export async function sendPhoneOtp(phone: string, ip: string | null = null) {
  return requestOtpCode(toE164(phone), ip);
}

/** Step 2: verifies the OTP. If the phone belongs to an existing user,
 * logs them in directly. If it's brand new, leaves the phone in a
 * "verified" state and asks the caller to complete registration —
 * see `completePhoneRegistration`. */
export async function verifyOtpAndAuth(phoneInput: string, code: string) {
  const phone = toE164(phoneInput);
  await verifyOtpCode(phone, code);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (!existing) {
    throw new ApiError(428, "profile_required");
  }
  assertNotBanned(existing);

  await consumeOtp(phone);
  const token = signToken({ userId: existing.id, role: existing.role });
  return { user: sanitizeUser(existing), token, isNewUser: false };
}

export interface CompleteProfileInput {
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}

/** Step 3 (new users only): creates the account once the phone has been
 * verified recently enough (see otpService.isRecentlyVerified) — the
 * mobile app doesn't need to re-collect the OTP code for this step. */
export async function completePhoneRegistration(input: CompleteProfileInput) {
  const phone = toE164(input.phone);
  if (!(await isRecentlyVerified(phone))) {
    throw new ApiError(401, "Phone verification expired. Please verify your number again.");
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    assertNotBanned(existing);
    await consumeOtp(phone);
    const token = signToken({ userId: existing.id, role: existing.role });
    return { user: sanitizeUser(existing), token, isNewUser: false };
  }

  const dob = new Date(input.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new ApiError(400, "Invalid date of birth");
  }
  if (!isAtLeast18(dob)) {
    throw new ApiError(403, "You must be at least 18 years old to register.");
  }

  const user = await createUserWithUniqueUid((uid) =>
    prisma.user.create({
      data: {
        uid,
        phone,
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: dob,
        country: input.country,
        wallet: { create: { balance: 0 } },
      },
    })
  );

  await consumeOtp(phone);
  const token = signToken({ userId: user.id, role: user.role });
  return { user: sanitizeUser(user), token, isNewUser: true };
}
