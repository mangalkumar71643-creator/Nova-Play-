import { createHash, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prismaClient";
import { ApiError } from "../middleware/errorHandler";
import { comparePassword, hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";
import { toIndianE164 } from "../utils/phone";
import { alertAdmins } from "./adminAlertService";
import { consumeOtp, issueAdminCode, verifyOtp as verifyOtpCode } from "./otpService";
import { findInviter, linkInvitee } from "./agentService";

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

/** Email sign-up is closed: players sign up with their mobile number and a
 * password (registerWithPhonePassword). Kept so older builds get a clear answer. */
export async function registerUser(_input: RegisterInput): Promise<never> {
  throw new ApiError(403, "Sign up with your mobile number in the app.");
}

function assertNotBanned(user: { isBanned: boolean; banReason: string | null }) {
  if (user.isBanned) {
    throw new ApiError(403, user.banReason ? `Your account has been suspended: ${user.banReason}` : "Your account has been suspended.");
  }
}

/** Notes a sign-in (and so a visit) — shown to the admin with the player's problems. */
async function markSignedIn(userId: string) {
  const now = new Date();
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: now, lastSeenAt: now } });
}

export async function loginUser(email: string, password: string) {
  // Case-insensitive, so a phone keyboard's capital first letter still logs in.
  const user = await prisma.user.findFirst({ where: { email: { equals: email.trim(), mode: "insensitive" } } });
  if (!user || !user.passwordHash || !(await comparePassword(password, user.passwordHash))) {
    throw new ApiError(401, "Invalid email or password");
  }
  // Email and password are for the admin panel only; players log in with their mobile number.
  if (user.role !== "ADMIN") throw new ApiError(403, "Log in with your mobile number in the app.");
  assertNotBanned(user);
  await markSignedIn(user.id);
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

/** India-only: a real-looking Indian mobile number, as +91XXXXXXXXXX (utils/phone.ts). */
const toE164 = toIndianE164;

// --- Phone + password, owner's choice 2026-11-10: there is no SMS code anywhere ---
//
// Sign-up takes a number and a password (and an invite code); login takes
// the same. An account made earlier by SMS code has no password: registering
// with its number sets one; a forgotten password is set by the admin
// (adminSetPlayerPassword) after the player asks customer service. A signed-in player changes their own with
// changePlayerPassword.

export const MIN_PASSWORD_LENGTH = 6;
const MAX_FAILED_LOGINS = 8;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function assertPasswordOk(password: string) {
  if (!password.trim()) throw new ApiError(400, "A password can't be only spaces.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new ApiError(400, `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password.length > 72) throw new ApiError(400, "That password is too long (72 characters at most).");
}

export async function registerWithPhonePassword(phoneInput: string, password: string, inviteCode?: string) {
  const phone = toE164(phoneInput);
  assertPasswordOk(password);
  const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true, passwordHash: true, role: true, isBanned: true, banReason: true } });
  if (existing) {
    if (existing.passwordHash || existing.role !== "USER") throw new ApiError(409, "This number already has an account. Please log in.");
    // An account from before passwords has no valid login any more (owner's choice, 2026-11-10):
    // registering with its number sets the password and takes it over, whatever it holds.
    assertNotBanned(existing);
    const claimed = await prisma.user.updateMany({
      where: { id: existing.id, passwordHash: null },
      data: { passwordHash: await hashPassword(password), failedLogins: 0, loginLockedUntil: null },
    });
    if (claimed.count === 0) throw new ApiError(409, "This number already has an account. Please log in.");
    const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id } });
    await markSignedIn(user.id);
    return { user: sanitizeUser(user), token: signToken({ userId: user.id, role: user.role }), isNewUser: false };
  }
  // Checked before the account exists, so a mistyped invite code can be fixed.
  const inviterId = inviteCode ? await findInviter(inviteCode) : null;
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await createUserWithUniqueUid((uid) =>
      prisma.user.create({
        data: { uid, phone, passwordHash, firstName: "Player", lastName: phone.slice(-4), country: "IN", wallet: { create: { balance: 0 } } },
      })
    );
  } catch (err) {
    // Two sign-ups for one number at once: the unique phone lets one through.
    if ((err as { code?: string })?.code === "P2002") throw new ApiError(409, "This number already has an account. Please log in.");
    throw err;
  }
  if (inviterId) await linkInvitee(inviterId, user.id);
  await markSignedIn(user.id);
  return { user: sanitizeUser(user), token: signToken({ userId: user.id, role: user.role }), isNewUser: true };
}

export async function loginWithPhonePassword(phoneInput: string, password: string) {
  const phone = toE164(phoneInput);
  const user = await prisma.user.findUnique({ where: { phone } });
  const wrong = () => new ApiError(401, "Wrong mobile number or password.");
  if (!user) throw wrong();
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    const mins = Math.ceil((user.loginLockedUntil.getTime() - Date.now()) / 60000);
    throw new ApiError(429, `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask customer service.`);
  }
  if (!user.passwordHash) {
    // An account from before passwords: customer service sets one (admin panel → Players).
    throw new ApiError(403, "PASSWORD_NOT_SET");
  }
  if (!(await comparePassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) } : { failedLogins: failed },
    });
    throw wrong();
  }
  assertNotBanned(user);
  if (user.failedLogins || user.loginLockedUntil) await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, loginLockedUntil: null } });
  await markSignedIn(user.id);
  return { user: sanitizeUser(user), token: signToken({ userId: user.id, role: user.role }), isNewUser: false };
}

const RESET_REQUESTS_PER_DAY = 6; // codes made per number a day (the admin's own count too): a stranger can't keep asking for fresh codes to guess at
const RESET_REQUESTS_PER_IP_PER_DAY = 10;

/**
 * Forgot password, step 1: the player taps Ask code. A one-time code (15 minutes, 5 tries) is made at once and
 * shown to the admin only: in an alert on the admin's phone and in Players → "Password reset requests".
 * The admin checks it is the owner and tells them the code; no SMS is sent and the asker never sees it.
 * Asking again while the code still works changes nothing; after it runs out a fresh one is made.
 */
export async function askAdminForResetCode(phoneInput: string, ip: string | null = null) {
  const phone = toE164(phoneInput);
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, uid: true, role: true } });
  if (!user) throw new ApiError(404, "No account with this number. Please register.");
  if (user.role !== "USER") throw new ApiError(403, "This account can't be reset here.");
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const open = await prisma.passwordResetRequest.findFirst({ where: { userId: user.id, handledAt: null, createdAt: { gte: dayAgo } }, orderBy: { createdAt: "desc" } });
  if (open?.codeExpiresAt && open.codeExpiresAt > now) return { ok: true as const };
  const [byUser, byIp] = await Promise.all([
    prisma.phoneOtp.count({ where: { phone, createdAt: { gte: dayAgo } } }),
    ip ? prisma.passwordResetRequest.count({ where: { ip, createdAt: { gte: dayAgo } } }) : Promise.resolve(0),
  ]);
  if (byUser >= RESET_REQUESTS_PER_DAY || byIp >= RESET_REQUESTS_PER_IP_PER_DAY) throw new ApiError(429, "Too many requests today. Please try again tomorrow.");
  const { code, expiresAt } = await issueAdminCode(phone);
  if (open) await prisma.passwordResetRequest.update({ where: { id: open.id }, data: { code, codeExpiresAt: expiresAt, ip } });
  else await prisma.passwordResetRequest.create({ data: { userId: user.id, phone, ip, code, codeExpiresAt: expiresAt } });
  await alertAdmins({
    title: "Password reset asked",
    body: `UID ${user.uid ?? "—"} · ${phone}\nCode: ${code} (15 min). Check it is them, then tell them the code.`,
    tag: `pwreset-${user.id}`,
    page: "users",
  });
  return { ok: true as const };
}

/** Admin: the player's open reset requests with the code that works now (newest first). */
export async function listPasswordResetRequests() {
  const now = new Date();
  const rows = await prisma.passwordResetRequest.findMany({ where: { handledAt: null, createdAt: { gte: new Date(now.getTime() - 3 * 24 * 3600 * 1000) } }, orderBy: { createdAt: "desc" }, take: 50 });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, uid: true, firstName: true, lastName: true } });
  return rows.map((r) => {
    const u = users.find((x) => x.id === r.userId);
    const live = r.code && r.codeExpiresAt && r.codeExpiresAt > now;
    return { id: r.id, uid: u?.uid ?? null, name: u ? `${u.firstName} ${u.lastName}`.trim() : null, phone: r.phone, createdAt: r.createdAt, code: live ? r.code : null, codeExpiresAt: live ? r.codeExpiresAt : null };
  });
}

/** Admin: a fresh one-time code for a player (15 minutes, 5 tries); an open request of theirs shows it too. */
export async function adminIssueResetCode(uid: number) {
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, phone: true, role: true } });
  if (!user || user.role !== "USER") throw new ApiError(404, "No player with that UID.");
  if (!user.phone) throw new ApiError(400, "This player has no mobile number.");
  const { code, expiresAt } = await issueAdminCode(user.phone);
  await prisma.passwordResetRequest.updateMany({ where: { userId: user.id, handledAt: null }, data: { code, codeExpiresAt: expiresAt } });
  return { code, phone: user.phone, expiresAt };
}

/** Checks the code the admin gave, sets the new password and signs the player in. */
export async function resetPasswordWithCode(phoneInput: string, code: string, password: string) {
  const phone = toE164(phoneInput);
  assertPasswordOk(password);
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) throw new ApiError(404, "No account with this number. Please register.");
  if (user.role !== "USER") throw new ApiError(403, "This account can't be reset here.");
  await verifyOtpCode(phone, code);
  assertNotBanned(user);
  await consumeOtp(phone);
  await prisma.passwordResetRequest.updateMany({ where: { userId: user.id, handledAt: null }, data: { handledAt: new Date() } });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, loginLockedUntil: null } });
  await markSignedIn(user.id);
  return { user: sanitizeUser(updated), token: signToken({ userId: user.id, role: user.role }), isNewUser: false };
}

/** A signed-in player changes their own password; the current one is needed. */
export async function changePlayerPassword(userId: string, currentPassword: string, newPassword: string) {
  assertPasswordOk(newPassword);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new ApiError(404, "Account not found.");
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    throw new ApiError(429, "Too many wrong passwords. Try again in a few minutes.");
  }
  if (!user.passwordHash || !(await comparePassword(currentPassword, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, loginLockedUntil: new Date(Date.now() + LOGIN_LOCK_MS) } : { failedLogins: failed },
    });
    throw new ApiError(400, "Your current password is wrong.");
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword), failedLogins: 0, loginLockedUntil: null } });
  return { ok: true as const };
}

/** The admin sets a player's password (forgotten, or an old account that has none). */
export async function adminSetPlayerPassword(uid: number, password: string) {
  assertPasswordOk(password);
  const user = await prisma.user.findUnique({ where: { uid }, select: { id: true, role: true } });
  if (!user || user.role === "ADMIN") throw new ApiError(404, "No player with that UID.");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), failedLogins: 0, loginLockedUntil: null } });
  return { ok: true };
}
