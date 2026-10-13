import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import {
  pickCup,
  cashOutCups,
  getCupsConfig,
  getMyCupsHistory,
  getMyCurrentCupsRound,
  startCupsRound,
} from "../services/cupsService";

const router = Router();

router.get("/config", (_req, res) => {
  res.json(getCupsConfig());
});

router.get(
  "/current",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getMyCurrentCupsRound(req.user!.userId));
  })
);

router.get(
  "/my-history",
  requireAuth,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    res.json(await getMyCupsHistory(req.user!.userId, limit));
  })
);

const startSchema = z.object({
  stake: z.number().positive(),
  balls: z.union([z.literal(1), z.literal(2)]),
});

router.post(
  "/start",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { stake, balls } = startSchema.parse(req.body);
    const round = await startCupsRound(req.user!.userId, stake, balls);
    res.status(201).json(round);
  })
);

const roundIdSchema = z.object({ roundId: z.string().min(1) });
const pickSchema = z.object({ roundId: z.string().min(1), cup: z.number().int().min(0).max(2) });

router.post(
  "/pick",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId, cup } = pickSchema.parse(req.body);
    res.json(await pickCup(req.user!.userId, roundId, cup));
  })
);

router.post(
  "/cashout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { roundId } = roundIdSchema.parse(req.body);
    res.json(await cashOutCups(req.user!.userId, roundId));
  })
);

export default router;
