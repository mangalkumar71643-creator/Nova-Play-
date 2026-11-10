import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import { changePlayerPassword, loginUser, registerUser, askAdminForResetCode, resetPasswordWithCode } from "../services/authService";
import { getSupportTelegramUrl } from "../services/settingsService";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { changeAdminCredentials, loginWithPhonePassword, registerWithPhonePassword, resetAdminWithKey, sanitizeUser } from "../services/authService";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string(),
  country: z.string().min(2),
});

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const result = await registerUser(input);
    res.status(201).json(result);
  })
);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string(),
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUser(email, password);
    res.json(result);
  })
);

const credentialsSchema = z
  .object({
    currentPassword: z.string().min(1),
    email: z.string().trim().toLowerCase().email().optional(),
    newPassword: z.string().min(8, "New password must be at least 8 characters.").refine((p) => p.trim().length > 0, "A password can't be only spaces.").optional(),
  })
  .refine((v) => v.email || v.newPassword, { message: "Nothing to change." });

/** The admin panel's own login: change its email and/or password (needs the current password). */
router.patch(
  "/me/credentials",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    res.json(await changeAdminCredentials(req.user!.userId, input));
  })
);

const adminResetSchema = z.object({
  key: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters.").refine((p) => p.trim().length > 0, "A password can't be only spaces."),
  email: z.string().trim().toLowerCase().email().optional(),
});

/** Forgotten admin password: reset it with the server's ADMIN_RESET_KEY (see resetAdminWithKey). */
router.post(
  "/admin-reset",
  asyncHandler(async (req, res) => {
    const input = adminResetSchema.parse(req.body);
    res.json(await resetAdminWithKey(input));
  })
);

// --- Phone + password (authService.registerWithPhonePassword etc.) ---

const phonePasswordSchema = z.object({
  phone: z.string().min(10).max(20),
  password: z.string().min(1).max(100),
  inviteCode: z.string().trim().max(12).optional().transform((v) => v || undefined),
});
router.post(
  "/phone/register",
  asyncHandler(async (req, res) => {
    const { phone, password, inviteCode } = phonePasswordSchema.parse(req.body);
    res.status(201).json(await registerWithPhonePassword(phone, password, inviteCode));
  })
);
router.post(
  "/phone/login",
  asyncHandler(async (req, res) => {
    const { phone, password } = phonePasswordSchema.parse(req.body);
    res.json(await loginWithPhonePassword(phone, password));
  })
);
const askSchema = z.object({ phone: z.string().min(10).max(20) });
/** Forgot password, step 1: ask customer service (the admin panel) for a reset code. */
router.post(
  "/password/ask-admin",
  asyncHandler(async (req, res) => {
    const { phone } = askSchema.parse(req.body);
    // Vercel puts the caller's address first in X-Forwarded-For.
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    res.json(await askAdminForResetCode(phone, ip));
  })
);

const resetPasswordSchema = z.object({ phone: z.string().min(10).max(20), code: z.string().length(6), password: z.string().min(1).max(100) });
/** Forgot password, step 2: the code the admin gave and the new password; signs the player in. */
router.post(
  "/password/reset",
  asyncHandler(async (req, res) => {
    const { phone, code, password } = resetPasswordSchema.parse(req.body);
    res.json(await resetPasswordWithCode(phone, code, password));
  })
);

const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(100), newPassword: z.string().min(1).max(100) });
/** A signed-in player changes their own password. */
router.post(
  "/phone/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    res.json(await changePlayerPassword(req.user!.userId, currentPassword, newPassword));
  })
);

/** Where a player who can't log in reaches customer service (no login needed). */
router.get(
  "/support-contact",
  asyncHandler(async (_req, res) => {
    res.json({ telegramUrl: await getSupportTelegramUrl() });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.userId } });
    res.json(sanitizeUser(user));
  })
);

export default router;
