import { Router } from "express";
import { z } from "zod";
import { asyncHandler, ApiError } from "../middleware/errorHandler";
import {
  completePhoneRegistration,
  loginUser,
  registerUser,
  sendPhoneOtp,
  verifyOtpAndAuth,
} from "../services/authService";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { changeAdminCredentials, resetAdminWithKey, sanitizeUser } from "../services/authService";

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
    newPassword: z.string().min(8, "New password must be at least 8 characters.").optional(),
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
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
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

const otpRequestSchema = z.object({ phone: z.string().min(10).max(20) });

router.post(
  "/otp/request",
  asyncHandler(async (req, res) => {
    const { phone } = otpRequestSchema.parse(req.body);
    // Vercel puts the caller's address first in X-Forwarded-For.
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
    const result = await sendPhoneOtp(phone, ip);
    res.json(result);
  })
);

const otpVerifySchema = z.object({ phone: z.string().min(10).max(20), code: z.string().length(6) });

router.post(
  "/otp/verify",
  asyncHandler(async (req, res) => {
    const { phone, code } = otpVerifySchema.parse(req.body);
    try {
      const result = await verifyOtpAndAuth(phone, code);
      res.json(result);
    } catch (err) {
      if (err instanceof ApiError && err.message === "profile_required") {
        return res.status(428).json({ error: "profile_required" });
      }
      throw err;
    }
  })
);

const completeProfileSchema = z.object({
  phone: z.string().min(10).max(20),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string(),
  country: z.string().min(2),
});

router.post(
  "/otp/complete-profile",
  asyncHandler(async (req, res) => {
    const input = completeProfileSchema.parse(req.body);
    const result = await completePhoneRegistration(input);
    res.json(result);
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
