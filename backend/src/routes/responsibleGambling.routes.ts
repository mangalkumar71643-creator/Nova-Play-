import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";

const router = Router();

const limitsSchema = z.object({
  depositLimitDaily: z.number().positive().nullable().optional(),
  depositLimitWeekly: z.number().positive().nullable().optional(),
  depositLimitMonthly: z.number().positive().nullable().optional(),
});

router.put(
  "/deposit-limits",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = limitsSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: input,
      select: {
        depositLimitDaily: true,
        depositLimitWeekly: true,
        depositLimitMonthly: true,
      },
    });
    res.json(user);
  })
);

const selfExclusionSchema = z.object({
  days: z.number().int().positive(),
});

router.post(
  "/self-exclude",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { days } = selfExclusionSchema.parse(req.body);
    const until = new Date();
    until.setDate(until.getDate() + days);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { isSelfExcluded: true, selfExclusionUntil: until },
      select: { isSelfExcluded: true, selfExclusionUntil: true },
    });
    res.json(user);
  })
);

export default router;
