import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prismaClient";
import { claimDailyBonus } from "../services/gameEngineService";
import {
  getFairnessStatus,
  listRevealedSeeds,
  rotateServerSeed,
  setClientSeed,
} from "../services/fairnessService";

const router = Router();

router.get(
  "/fairness",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getFairnessStatus(req.user!.userId));
  })
);

const clientSeedSchema = z.object({ clientSeed: z.string().min(1).max(64) });
router.put(
  "/fairness/client-seed",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { clientSeed } = clientSeedSchema.parse(req.body);
    res.json(await setClientSeed(req.user!.userId, clientSeed));
  })
);

router.post(
  "/fairness/rotate",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await rotateServerSeed(req.user!.userId));
  })
);

router.get(
  "/fairness/history",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await listRevealedSeeds(req.user!.userId));
  })
);

router.get(
  "/daily-bonus/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: req.user!.userId },
      select: { dailyStreak: true, lastDailyClaimAt: true },
    });
    const claimedToday =
      !!user.lastDailyClaimAt && user.lastDailyClaimAt.toDateString() === new Date().toDateString();
    res.json({ ...user, claimedToday });
  })
);

router.post(
  "/daily-bonus/claim",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await claimDailyBonus(req.user!.userId);
    res.json(result);
  })
);

export default router;
